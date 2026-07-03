import {
    createShapeId,
    Editor,
    getIndices,
    getSnapshot,
    renderPlaintextFromRichText,
    TLShape,
    TLShapeId,
    TLStore,
    toRichText,
} from '@tldraw/tldraw';
import * as api from '@/api/api';
import { settingdata } from '@/index';
import { WhiteboardFileManager } from '../../whiteboard-file-manager';
import { createOrUpdateConnectorBinding } from '../../BezierConnectorShape';
import { getBestPortPair, getPortPagePosition } from '../../BezierConnectorShape/port-utils';
import { getCardCollapsedHeight } from '../../CardShape/card-collapse';
import type { ICardShape } from '../../CardShape/card-shape-types';
import { createMindMapNode } from '../../MindMapShape/mind-map-shape-types';
import { DEFAULT_SCRIPT } from '../../JsShape/static';
import { buildTldrawLink } from '../../utils/link-builder';
import { convertConnectorsToArrow, convertConnectorsToBezier } from '../../utils/connector-convert';
import { insertDocOutlineMindmapForAgent, type AgentDocOutlineBoardOptions } from '../documents/doc-to-board';
import { finiteNumberInRange, normalizeOptionalAgentColor } from '../core/schema';
import { getAgentCardDefaults, getAgentSingleBlockDefaults } from '../core/defaults';
import { createAgentBusinessShape } from '../shapes/shape-ops';
import { summarizeSnapshotObject } from '../summaries/snapshot-summary';
import { executeAgentPlan, type AgentPlanApplyOptions } from '../planning/plan-runner';
import type {
    AgentAlignOperation,
    AgentArrangeOperation,
    AgentBasicShapeCreateArgs,
    AgentBoardEditOperation,
    AgentBoardEditRequest,
    AgentBoardEditResult,
    AgentBoardLayoutIntent,
    AgentBoardLayoutStyle,
    AgentBoardNodeCreate,
    AgentBoardNodePatch,
    AgentBranchChildRef,
    AgentBranchCreateArgs,
    AgentCardCreateArgs,
    AgentConnectorCreateArgs,
    AgentCreateShapeArgs,
    AgentCreateShapeResult,
    AgentLinkedBlockContent,
    AgentResultMode,
    AgentShapeSummary,
    AgentSingleBlockCreateArgs,
    AgentShapeUpdatePatch,
} from '../core/types';

type AgentShapeBounds = { x: number; y: number; w: number; h: number };
type AgentCreateLayoutKind = AgentCreateShapeArgs['kind'] | AgentBasicShapeCreateArgs['kind'];
export type AgentSummaryOptions = { includeShapeSamples?: boolean; sampleLimit?: number };
export type AgentSummary = {
    id: string;
    title: string;
    isOpen: boolean;
    pageCount: number;
    shapeCount: number;
    assetCount: number;
    selectedShapeIds: string[];
    shapeTypeCounts: Record<string, number>;
    sampleShapes?: Array<{
        id: string;
        type: string;
        x: number;
        y: number;
        bounds: AgentShapeBounds;
        props: Record<string, unknown>;
    }>;
};

type AgentBoardEditState = {
    operationId: string;
    mode: 'commit' | 'preview';
    resultMode: 'minimal' | 'debug';
    selectedShapeIds: string[];
    created: Record<string, string[]>;
    lastShapeIds: string[];
    focusedShapeIds: string[];
    committedShapeIds: string[];
    externalCreatedBlockIds: string[];
    errors: string[];
    counts: {
        createdShapes: number;
        updatedShapes: number;
        connectors: number;
        branches: number;
    };
    saveRequested: boolean;
    saved: boolean;
    anyMutation: boolean;
};

type AgentBoardEditLayoutResult = {
    updatedShapeIds: string[];
    createdShapeIds: string[];
    alias?: string;
};

const AGENT_ENTITY_CREATE_SHAPES = new Set([
    'card',
    'single-block',
    'text',
    'frame',
    'note',
    'geo',
    'slide',
    'mind-map',
    'js-shape',
]);
const AGENT_CREATE_GAP = 160;
const AGENT_DEFAULT_CREATE_ORIGIN = { x: 0, y: 0 };
const AGENT_BLOCK_CONTENT_MAX_CHARS = 4000;
const AGENT_CARD_CHILD_MAX_COUNT = 80;
const AGENT_CARD_CHILD_CONTENT_MAX_CHARS = 1000;
const AGENT_CARD_CHILDREN_TEXT_MAX_CHARS = 6000;
const SIYUAN_BLOCK_ID_RE = /^\d{14}-[0-9a-z]{7}$/i;
const AGENT_BOARD_EDIT_NODE_LIMIT = 200;
const AGENT_BOARD_EDIT_CONNECT_LIMIT = 300;
const AGENT_BOARD_EDIT_UPDATE_LIMIT = 500;
const AGENT_BOARD_EDIT_ALLOWED_OPS = new Set(['createNodes', 'connect', 'layout', 'updateNodes', 'focus', 'save']);
const AGENT_BOARD_EDIT_NODE_KINDS = new Set(['card', 'single-block', 'text', 'frame']);
const AGENT_BOARD_EDIT_LAYOUT_STYLES = new Set(['nearSelection', 'rightOf', 'below', 'grid', 'tree', 'mindmap', 'frameAround']);

export type AgentManagerRuntime = {
    id: string;
    title: string;
    editor: Editor | null;
    store: TLStore;
    saveData: () => Promise<void>;
    triggerSave: () => void;
    findShapeByBlockId: (blockId: string) => TLShapeId | null;
};

function requireEditor(runtime: AgentManagerRuntime): Editor {
    if (!runtime.editor) {
        throw new Error('Tldraw editor is not initialized');
    }
    return runtime.editor;
}

export function getAgentSummary(runtime: AgentManagerRuntime, options: AgentSummaryOptions = {}): AgentSummary {
    const shapes = runtime.store.query.records('shape').get() || [];
    const assets = runtime.store.query.records('asset').get() || [];
    const pages = runtime.store.query.records('page').get() || [];
    const selectedShapeIds = runtime.editor ? runtime.editor.getSelectedShapeIds().map(String) : [];
    const shapeTypeCounts = shapes.reduce<Record<string, number>>((acc, shape: any) => {
        const type = String(shape.type || 'unknown');
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    const summary: AgentSummary = {
        id: runtime.id,
        title: runtime.title,
        isOpen: Boolean(runtime.editor),
        pageCount: pages.length,
        shapeCount: shapes.length,
        assetCount: assets.length,
        selectedShapeIds,
        shapeTypeCounts,
    };

    if (options.includeShapeSamples === true) {
        const sampleLimit = finiteNumberInRange(options.sampleLimit, 20, 0, 200);
        summary.sampleShapes = shapes.slice(0, sampleLimit).map((shape: any) => ({
            id: String(shape.id),
            type: String(shape.type),
            x: Number(shape.x || 0),
            y: Number(shape.y || 0),
            bounds: runtime.editor ? getAgentShapeBounds(runtime.editor, shape as TLShape) : getFallbackShapeBounds(shape as TLShape),
            props: summarizeShapeProps(shape.props, runtime.editor || undefined),
        }));
    }

    return summary;
}

function getAgentResultSummary(runtime: AgentManagerRuntime, resultMode?: AgentResultMode) {
    const summary = getAgentSummary(runtime, { includeShapeSamples: resultMode === 'full' });
    if (resultMode === 'full') return summary;
    return compactAgentSummary(summary);
}

function getAgentInternalResultSummary(runtime: AgentManagerRuntime, resultMode?: AgentResultMode) {
    return getAgentSummary(runtime, { includeShapeSamples: resultMode === 'full' });
}

function compactAgentSummary(summary: AgentSummary) {
    const compact = { ...summary } as Partial<AgentSummary> & { selectedShapeCount?: number };
    const selectedShapeCount = summary.selectedShapeIds.length;
    delete compact.selectedShapeIds;
    delete compact.sampleShapes;
    return {
        ...compact,
        selectedShapeCount,
    };
}

export async function createAgentShape(runtime: AgentManagerRuntime, options: AgentCreateShapeArgs) {
    const editor = requireEditor(runtime);
    await validateAgentCreateShapeBlockIds(options);
    const preparedOptions = await prepareAgentCreateShapeOptions(runtime, options);
    const layoutOptions = applyAgentCreateLayout(editor, preparedOptions);
    const result = createAgentBusinessShape(editor, layoutOptions);
    syncAgentCreatedBlockAttrs(runtime, result);
    runtime.triggerSave();
    return { ...result, ...buildCreatedBoundsResult(editor, result.createdShapeIds), summary: getAgentResultSummary(runtime, options.resultMode) };
}

export async function insertDocOutlineMindmap(runtime: AgentManagerRuntime, options: AgentDocOutlineBoardOptions) {
    const editor = requireEditor(runtime);
    const result = await insertDocOutlineMindmapForAgent(editor, options);
    runtime.triggerSave();
    return { ...result, summary: getAgentSummary(runtime) };
}

export function selectAgentShape(runtime: AgentManagerRuntime, shapeId: string, zoom = true) {
    const editor = requireEditor(runtime);
    const id = shapeId as TLShapeId;
    const shape = editor.getShape(id);
    if (!shape) throw new Error(`Shape not found: ${shapeId}`);
    editor.select(id);
    if (zoom) editor.zoomToSelection({ animation: { duration: 300 } });
    return { selectedShapeIds: editor.getSelectedShapeIds().map(String) };
}

export function navigateAgentToBlock(runtime: AgentManagerRuntime, options: {
    blockId: string;
    shapeId?: string;
    zoom?: boolean;
}) {
    const editor = requireEditor(runtime);
    const shapeId = (options.shapeId as TLShapeId | undefined) || runtime.findShapeByBlockId(options.blockId);
    if (!shapeId) {
        return { found: false, shapeId: null, selectedShapeIds: editor.getSelectedShapeIds().map(String) };
    }
    const shape = editor.getShape(shapeId);
    if (!shape) {
        return { found: false, shapeId: String(shapeId), selectedShapeIds: editor.getSelectedShapeIds().map(String) };
    }
    editor.select(shapeId);
    if (options.zoom !== false) editor.zoomToSelection({ animation: { duration: 300 } });
    return {
        found: true,
        shapeId: String(shapeId),
        selectedShapeIds: editor.getSelectedShapeIds().map(String),
    };
}

export function zoomAgentToShapes(runtime: AgentManagerRuntime, options: { shapeIds: string[] }) {
    const editor = requireEditor(runtime);
    const ids = Array.from(new Set(options.shapeIds)).slice(0, 50)
        .filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[];
    if (ids.length) {
        editor.setSelectedShapes(ids);
        editor.zoomToSelection({ animation: { duration: 300 } });
    }
    return { zoomedShapeIds: ids.map(String) };
}

export async function saveAgentWhiteboard(runtime: AgentManagerRuntime) {
    requireEditor(runtime);
    await runtime.saveData();
    return { success: true, summary: getAgentResultSummary(runtime) };
}

export async function applyAgentPlan(runtime: AgentManagerRuntime, options: AgentPlanApplyOptions) {
    requireEditor(runtime);
    return executeAgentPlan(options, {
        getSummary: () => getAgentInternalResultSummary(runtime, options.resultMode),
        createShape: (shapeOptions) => createAgentShape(runtime, shapeOptions),
        createBasicShape: (shapeOptions) => createAgentBasicShape(runtime, shapeOptions),
        createConnector: (connectorOptions) => createAgentConnector(runtime, connectorOptions),
        updateShapesBatch: (updateOptions) => updateAgentShapesBatch(runtime, updateOptions),
        getShapeDetails: (detailOptions) => getAgentShapeDetails(runtime, detailOptions),
        selectShape: (shapeId, zoom) => selectAgentShape(runtime, shapeId, zoom),
        zoomToShapes: (zoomOptions) => zoomAgentToShapes(runtime, zoomOptions),
        save: () => saveAgentWhiteboard(runtime),
    });
}

export async function editAgentBoard(runtime: AgentManagerRuntime, request: AgentBoardEditRequest): Promise<AgentBoardEditResult> {
    const editor = requireEditor(runtime);
    const state = createBoardEditState(editor, request);

    try {
        const operations = normalizeBoardEditOperations(request.operations);
        await validateBoardEditOperations(runtime, editor, operations, state);

        if (state.mode === 'preview') {
            return buildBoardEditResult(runtime, state, true);
        }

        for (const operation of operations) {
            await executeBoardEditOperation(runtime, editor, operation, state);
        }

        if (state.saveRequested) {
            await runtime.saveData();
            state.saved = true;
        } else if (state.anyMutation) {
            runtime.triggerSave();
        }

        return buildBoardEditResult(runtime, state, true);
    } catch (error) {
        state.errors.push(stringifyAgentError(error));
        if (state.anyMutation && !state.saved) runtime.triggerSave();
        return buildBoardEditResult(runtime, state, false);
    }
}

function createBoardEditState(editor: Editor, request: AgentBoardEditRequest): AgentBoardEditState {
    const selectedShapeIds = request.selection === undefined
        ? editor.getSelectedShapeIds().map(String)
        : resolveInitialBoardSelection(editor, request.selection);
    return {
        operationId: `agent-edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        mode: request.mode === 'preview' ? 'preview' : 'commit',
        resultMode: request.result === 'debug' ? 'debug' : 'minimal',
        selectedShapeIds,
        created: {},
        lastShapeIds: [],
        focusedShapeIds: [],
        committedShapeIds: [],
        externalCreatedBlockIds: [],
        errors: [],
        counts: {
            createdShapes: 0,
            updatedShapes: 0,
            connectors: 0,
            branches: 0,
        },
        saveRequested: request.save === true,
        saved: false,
        anyMutation: false,
    };
}

function normalizeBoardEditOperations(value: unknown): AgentBoardEditOperation[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('operations must be a non-empty array');
    }
    return value.map((operation, index) => {
        if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
            throw new Error(`operations[${index}] must be an object`);
        }
        const op = String((operation as any).op || '').trim();
        if (!AGENT_BOARD_EDIT_ALLOWED_OPS.has(op)) {
            throw new Error(`operations[${index}].op must be one of createNodes, connect, layout, updateNodes, focus, save`);
        }
        return operation as AgentBoardEditOperation;
    });
}

async function validateBoardEditOperations(
    _runtime: AgentManagerRuntime,
    editor: Editor,
    operations: AgentBoardEditOperation[],
    state: AgentBoardEditState
) {
    const plannedAliases = new Set<string>();
    let plannedLast = state.selectedShapeIds.length > 0;
    let nodeWrites = 0;
    let connectWrites = 0;
    let updateWrites = 0;

    for (let index = 0; index < operations.length; index++) {
        const operation = operations[index] as any;
        const op = String(operation.op);

        if (op === 'createNodes') {
            assertBoardEditKeys(operation, ['op', 'nodes', 'layout'], `operations[${index}]`);
            if (!Array.isArray(operation.nodes) || operation.nodes.length === 0) {
                throw new Error(`operations[${index}].nodes must be a non-empty array`);
            }
            nodeWrites += operation.nodes.length;
            if (nodeWrites > AGENT_BOARD_EDIT_NODE_LIMIT) {
                throw new Error(`createNodes writes exceed ${AGENT_BOARD_EDIT_NODE_LIMIT}; split this edit`);
            }
            for (let nodeIndex = 0; nodeIndex < operation.nodes.length; nodeIndex++) {
                await validateBoardNodeCreate(operation.nodes[nodeIndex], plannedAliases, `operations[${index}].nodes[${nodeIndex}]`);
            }
            if (operation.layout) {
                validateBoardLayoutIntent(operation.layout, `operations[${index}].layout`);
                if (operation.layout.anchor !== undefined) {
                    validateBoardEditRef(editor, operation.layout.anchor, state, plannedAliases, plannedLast, `operations[${index}].layout.anchor`);
                }
            }
            plannedLast = true;
            continue;
        }

        if (op === 'connect') {
            assertBoardEditKeys(operation, ['op', 'kind', 'from', 'to', 'text', 'color', 'strokeWidth', 'lineWidth', 'layout', 'as'], `operations[${index}]`);
            const kind = operation.kind === undefined ? 'relation' : String(operation.kind);
            if (kind !== 'branch' && kind !== 'relation') throw new Error(`operations[${index}].kind must be branch or relation`);
            validateBoardAlias(operation.as, `operations[${index}].as`, plannedAliases, true);
            validateBoardEditRef(editor, operation.from, state, plannedAliases, plannedLast, `operations[${index}].from`);
            const toCount = validateBoardEditRef(editor, operation.to, state, plannedAliases, plannedLast, `operations[${index}].to`);
            connectWrites += Math.max(1, toCount);
            if (connectWrites > AGENT_BOARD_EDIT_CONNECT_LIMIT) {
                throw new Error(`connect writes exceed ${AGENT_BOARD_EDIT_CONNECT_LIMIT}; split this edit`);
            }
            if (operation.layout) validateBoardLayoutIntent(operation.layout, `operations[${index}].layout`);
            if (operation.as) plannedAliases.add(operation.as);
            plannedLast = true;
            continue;
        }

        if (op === 'layout') {
            assertBoardEditKeys(operation, ['op', 'target', 'style', 'anchor', 'side', 'columns', 'gap', 'horizontalGap', 'verticalGap', 'x', 'y', 'w', 'h', 'as', 'name', 'color'], `operations[${index}]`);
            validateBoardLayoutIntent(operation, `operations[${index}]`);
            validateBoardAlias(operation.as, `operations[${index}].as`, plannedAliases, true);
            const targetCount = validateBoardEditRef(editor, operation.target ?? '$selection', state, plannedAliases, plannedLast, `operations[${index}].target`);
            if (operation.anchor !== undefined) validateBoardEditRef(editor, operation.anchor, state, plannedAliases, plannedLast, `operations[${index}].anchor`);
            if (stringValue(operation.style) === 'frameAround') {
                nodeWrites += 1;
                if (nodeWrites > AGENT_BOARD_EDIT_NODE_LIMIT) {
                    throw new Error(`created nodes exceed ${AGENT_BOARD_EDIT_NODE_LIMIT}; split this edit`);
                }
            } else {
                updateWrites += targetCount;
                if (updateWrites > AGENT_BOARD_EDIT_UPDATE_LIMIT) {
                    throw new Error(`layout/update writes exceed ${AGENT_BOARD_EDIT_UPDATE_LIMIT}; split this edit`);
                }
            }
            if (operation.as) plannedAliases.add(operation.as);
            plannedLast = true;
            continue;
        }

        if (op === 'updateNodes') {
            assertBoardEditKeys(operation, ['op', 'target', 'patches', 'nodes', 'x', 'y', 'w', 'h', 'color', 'isCollapsed', 'text', 'name'], `operations[${index}]`);
            const patches = normalizeBoardUpdatePatches(operation, state, plannedAliases, plannedLast, editor, `operations[${index}]`);
            updateWrites += patches.length;
            if (updateWrites > AGENT_BOARD_EDIT_UPDATE_LIMIT) {
                throw new Error(`updateNodes writes exceed ${AGENT_BOARD_EDIT_UPDATE_LIMIT}; split this edit`);
            }
            plannedLast = patches.length > 0 || plannedLast;
            continue;
        }

        if (op === 'focus') {
            assertBoardEditKeys(operation, ['op', 'target', 'zoom'], `operations[${index}]`);
            validateBoardEditRef(editor, operation.target ?? '$last', state, plannedAliases, plannedLast, `operations[${index}].target`);
            continue;
        }

        assertBoardEditKeys(operation, ['op'], `operations[${index}]`);
    }
}

async function validateBoardNodeCreate(
    value: unknown,
    plannedAliases: Set<string>,
    label: string
) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
    const node = value as AgentBoardNodeCreate;
    assertBoardEditKeys(node as any, ['as', 'kind', 'x', 'y', 'w', 'h', 'color', 'blockId', 'contentMarkdown', 'text', 'title', 'name', 'isMain', 'isCollapsed', 'showMask'], label);
    const kind = String(node.kind || '');
    if (!AGENT_BOARD_EDIT_NODE_KINDS.has(kind)) {
        throw new Error(`${label}.kind must be card, single-block, text, or frame`);
    }
    validateBoardAlias(node.as, `${label}.as`, plannedAliases, false);
    if (node.as) plannedAliases.add(node.as);
    const blockId = stringValue(node.blockId);
    const contentMarkdown = stringValue(node.contentMarkdown ?? node.text);
    const title = stringValue(node.title);
    if (kind === 'card') {
        if (blockId && contentMarkdown !== undefined) {
            throw new Error(`${label}: card cannot set both blockId and contentMarkdown/text`);
        }
        await validateAgentLinkedBlockId(blockId, 'card');
    }
    if (kind === 'single-block') {
        if (blockId && (contentMarkdown !== undefined || title !== undefined)) {
            throw new Error(`${label}: single-block cannot set blockId together with contentMarkdown/text/title`);
        }
        await validateAgentLinkedBlockId(blockId, 'single-block');
    }
}

function validateBoardLayoutIntent(value: unknown, label: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
    const layout = value as AgentBoardLayoutIntent;
    const style = stringValue(layout.style);
    if (style && !AGENT_BOARD_EDIT_LAYOUT_STYLES.has(style)) {
        throw new Error(`${label}.style must be nearSelection, rightOf, below, grid, tree, mindmap, or frameAround`);
    }
    if (layout.side !== undefined && layout.side !== 'left' && layout.side !== 'right') {
        throw new Error(`${label}.side must be left or right`);
    }
}

async function executeBoardEditOperation(
    runtime: AgentManagerRuntime,
    editor: Editor,
    operation: AgentBoardEditOperation,
    state: AgentBoardEditState
) {
    if (operation.op === 'createNodes') {
        await executeBoardCreateNodes(runtime, editor, operation.nodes, operation.layout, state);
        return;
    }
    if (operation.op === 'connect') {
        await executeBoardConnect(runtime, editor, operation, state);
        return;
    }
    if (operation.op === 'layout') {
        const target = resolveBoardEditRefs(editor, state, operation.target ?? '$selection', 'layout.target');
        const result = applyBoardEditLayout(editor, state, target, operation);
        applyBoardLayoutResult(state, result);
        return;
    }
    if (operation.op === 'updateNodes') {
        executeBoardUpdateNodes(editor, operation, state);
        return;
    }
    if (operation.op === 'focus') {
        executeBoardFocus(editor, operation.target ?? '$last', operation.zoom, state);
        return;
    }
    state.saveRequested = true;
}

async function executeBoardCreateNodes(
    runtime: AgentManagerRuntime,
    editor: Editor,
    nodes: AgentBoardNodeCreate[],
    layout: AgentBoardLayoutIntent | undefined,
    state: AgentBoardEditState
) {
    const createdIds: string[] = [];

    for (const node of nodes) {
        const originalBlockId = stringValue(node.blockId);
        const alias = optionalBoardAlias(node.as);
        const result = await createBoardEditNode(runtime, editor, node);
        const ids = result.createdShapeIds.map(String);
        createdIds.push(...ids);
        if (alias) state.created[alias] = ids;
        trackCommittedShapes(state, ids);
        state.counts.createdShapes += ids.length;
        for (const createdNode of result.createdNodes || []) {
            if (!originalBlockId && createdNode.blockId && (createdNode.kind === 'card' || createdNode.kind === 'single-block')) {
                state.externalCreatedBlockIds.push(createdNode.blockId);
            }
        }
    }

    state.lastShapeIds = createdIds;
    if (layout && createdIds.length) {
        const result = applyBoardEditLayout(editor, state, createdIds, layout);
        applyBoardLayoutResult(state, result);
    }
}

async function createBoardEditNode(
    runtime: AgentManagerRuntime,
    editor: Editor,
    node: AgentBoardNodeCreate
): Promise<AgentCreateShapeResult> {
    if (node.kind === 'card') {
        const prepared = await prepareAgentCardCreateArgs(runtime, {
            kind: 'card',
            x: node.x,
            y: node.y,
            w: node.w,
            h: node.h,
            color: boardColor(node.color),
            blockId: stringValue(node.blockId),
            contentMarkdown: stringValue(node.contentMarkdown ?? node.text),
            title: stringValue(node.title),
            isMain: node.isMain,
            isCollapsed: node.isCollapsed,
            showMask: node.showMask,
            select: false,
            zoom: false,
        });
        const result = createAgentBusinessShape(editor, applyAgentCreateLayout(editor, prepared));
        syncAgentCreatedBlockAttrs(runtime, result);
        return result;
    }

    if (node.kind === 'single-block') {
        const prepared = await prepareAgentSingleBlockCreateArgs(runtime, {
            kind: 'single-block',
            x: node.x,
            y: node.y,
            w: node.w,
            h: node.h,
            color: boardColor(node.color),
            blockId: stringValue(node.blockId),
            contentMarkdown: stringValue(node.contentMarkdown ?? node.text),
            title: stringValue(node.title),
            select: false,
            zoom: false,
        });
        const result = createAgentBusinessShape(editor, applyAgentCreateLayout(editor, prepared));
        syncAgentCreatedBlockAttrs(runtime, result);
        return result;
    }

    const id = createShapeId();
    const options: AgentBasicShapeCreateArgs = {
        kind: node.kind,
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        color: boardColor(node.color),
        text: stringValue(node.text ?? node.title ?? node.name),
        name: stringValue(node.name ?? node.title ?? node.text),
        select: false,
        zoom: false,
    };
    const size = getAgentCreateShapeSize(options.kind, options);
    const position = resolveAgentCreatePosition(editor, options.kind, {
        x: options.x,
        y: options.y,
        w: size.w,
        h: size.h,
    });
    const shape = buildAgentBasicShape(
        id,
        { ...options, w: size.w, h: size.h },
        position.x,
        position.y,
        boardColor(options.color) ?? 'black',
        clampAgentText(options.text || defaultAgentText(options.kind), 2000),
    );
    editor.createShape(shape as any);
    return {
        createdShapeIds: [String(id)],
        selectedShapeIds: [],
        focusedShapeId: String(id),
        createdNodes: [],
    };
}

async function executeBoardConnect(
    runtime: AgentManagerRuntime,
    editor: Editor,
    operation: Extract<AgentBoardEditOperation, { op: 'connect' }>,
    state: AgentBoardEditState
) {
    const from = resolveBoardEditRefs(editor, state, operation.from, 'connect.from')[0];
    const targets = resolveBoardEditRefs(editor, state, operation.to, 'connect.to');
    if (!from) throw new Error('connect.from resolved to no shapes');
    if (!targets.length) throw new Error('connect.to resolved to no shapes');

    const alias = optionalBoardAlias(operation.as);
    const createdIds: string[] = [];
    if ((operation.kind || 'relation') === 'branch') {
        const layout = operation.layout || {};
        const children = targets.map((shapeId, index) => ({
            shapeId,
            side: layout.style === 'mindmap' && !layout.side
                ? (index % 2 === 0 ? 'right' as const : 'left' as const)
                : layout.side,
        }));
        const result = createAgentBusinessShape(editor, {
            kind: 'branch',
            rootShapeId: from,
            children,
            direction: layout.side,
            horizontalGap: layout.horizontalGap,
            verticalGap: layout.verticalGap,
            color: boardColor(operation.color),
            lineWidth: operation.lineWidth ?? operation.strokeWidth,
            select: false,
            zoom: false,
        });
        syncAgentCreatedBlockAttrs(runtime, result);
        createdIds.push(...result.createdShapeIds.map(String));
        state.counts.branches += 1;
    } else {
        for (const target of targets) {
            const result = createAgentConnectorCore(editor, {
                kind: 'bezier-connector',
                startShapeId: from,
                endShapeId: target,
                text: stringValue(operation.text),
                color: boardColor(operation.color),
                strokeWidth: operation.strokeWidth ?? operation.lineWidth,
                select: false,
                zoom: false,
            });
            createdIds.push(...result.createdShapeIds);
            state.counts.connectors += 1;
        }
    }

    if (alias) state.created[alias] = createdIds;
    trackCommittedShapes(state, createdIds);
    state.counts.createdShapes += createdIds.length;
    state.lastShapeIds = createdIds;
}

function executeBoardUpdateNodes(
    editor: Editor,
    operation: Extract<AgentBoardEditOperation, { op: 'updateNodes' }>,
    state: AgentBoardEditState
) {
    const patches = normalizeBoardUpdatePatches(operation, state, new Set(Object.keys(state.created)), state.lastShapeIds.length > 0, editor, 'updateNodes');
    const updates: any[] = [];
    const updatedIds: string[] = [];

    for (const patch of patches) {
        const shape = editor.getShape(patch.shapeId as TLShapeId) as TLShape | undefined;
        if (!shape) throw new Error(`Shape not found: ${patch.shapeId}`);
        const update: any = { id: shape.id, type: shape.type };
        let hasUpdate = false;
        if (patch.x !== undefined) {
            update.x = finiteNumberInRange(patch.x, shape.x, -100000, 100000);
            hasUpdate = true;
        }
        if (patch.y !== undefined) {
            update.y = finiteNumberInRange(patch.y, shape.y, -100000, 100000);
            hasUpdate = true;
        }
        const props = {
            ...buildAgentShapePropsPatch(shape, patch),
            ...buildAgentTextPropsPatch(shape, patch),
        };
        if (Object.keys(props).length > 0) {
            update.props = props;
            hasUpdate = true;
        }
        if (!hasUpdate) continue;
        updates.push(update);
        updatedIds.push(String(shape.id));
    }

    if (updates.length) {
        assertBoardEditUpdateBudget(state, updatedIds.length, 'updateNodes');
        editor.updateShapes(updates);
        state.counts.updatedShapes += updatedIds.length;
        state.lastShapeIds = updatedIds;
        trackCommittedShapes(state, updatedIds);
    }
}

function executeBoardFocus(editor: Editor, target: unknown, zoom: boolean | undefined, state: AgentBoardEditState) {
    const ids = resolveBoardEditRefs(editor, state, target, 'focus.target');
    const existing = ids.filter((id) => editor.getShape(id as TLShapeId));
    if (!existing.length) {
        state.focusedShapeIds = [];
        state.lastShapeIds = [];
        return;
    }
    editor.setSelectedShapes(existing as TLShapeId[]);
    if (zoom !== false) {
        try { editor.zoomToSelection({ animation: { duration: 300 } }); } catch {}
    }
    state.focusedShapeIds = existing;
    state.selectedShapeIds = existing;
    state.lastShapeIds = existing;
}

function applyBoardEditLayout(
    editor: Editor,
    state: AgentBoardEditState,
    targetIds: string[],
    intent: AgentBoardLayoutIntent
): AgentBoardEditLayoutResult {
    const ids = uniqueStrings(targetIds).filter((id) => editor.getShape(id as TLShapeId));
    if (!ids.length) return { updatedShapeIds: [], createdShapeIds: [] };
    const style = normalizeBoardLayoutStyle(intent.style);
    if (style === 'frameAround') {
        const frameId = createBoardFrameAround(editor, ids, intent);
        return { updatedShapeIds: [], createdShapeIds: [String(frameId)], alias: optionalBoardAlias(intent.as) };
    }

    const updates = buildBoardLayoutUpdates(editor, state, ids, intent, style);
    if (updates.length) {
        assertBoardEditUpdateBudget(state, updates.length, 'layout');
        editor.updateShapes(updates as any);
    }
    return { updatedShapeIds: updates.map((update) => String(update.id)), createdShapeIds: [] };
}

function applyBoardLayoutResult(state: AgentBoardEditState, result: AgentBoardEditLayoutResult) {
    if (result.updatedShapeIds.length) {
        state.counts.updatedShapes += result.updatedShapeIds.length;
        state.lastShapeIds = result.updatedShapeIds;
        trackCommittedShapes(state, result.updatedShapeIds);
    }
    if (result.createdShapeIds.length) {
        state.counts.createdShapes += result.createdShapeIds.length;
        state.lastShapeIds = result.createdShapeIds;
        if (result.alias) state.created[result.alias] = result.createdShapeIds;
        trackCommittedShapes(state, result.createdShapeIds);
    }
}

function buildBoardLayoutUpdates(
    editor: Editor,
    state: AgentBoardEditState,
    ids: string[],
    intent: AgentBoardLayoutIntent,
    style: AgentBoardLayoutStyle
) {
    const boxes = ids.map((id) => {
        const shape = editor.getShape(id as TLShapeId);
        const bounds = getAgentShapeBoundsById(editor, id as TLShapeId) || { x: 0, y: 0, w: 240, h: 120 };
        return { id, type: String(shape?.type || ''), ...bounds };
    });
    const gap = finiteNumberInRange(intent.gap, 96, 0, 4000);
    const hGap = finiteNumberInRange(intent.horizontalGap, gap, 0, 4000);
    const vGap = finiteNumberInRange(intent.verticalGap, Math.max(40, gap / 2), 0, 4000);

    if (style === 'rightOf' || style === 'below' || style === 'nearSelection') {
        const anchor = getBoardLayoutAnchorBounds(editor, state, intent, style);
        const startX = intent.x ?? (style === 'below' ? anchor.x : anchor.x + anchor.w + hGap);
        const startY = intent.y ?? (style === 'below' ? anchor.y + anchor.h + vGap : anchor.y);
        return layoutBoardColumn(boxes, startX, startY, vGap);
    }

    if (style === 'tree' || style === 'mindmap') {
        return layoutBoardTree(boxes, intent.x, intent.y, hGap, vGap, style === 'mindmap');
    }

    return layoutBoardGrid(boxes, intent.x, intent.y, gap, intent.columns);
}

function layoutBoardGrid(
    boxes: Array<{ id: string; type: string; x: number; y: number; w: number; h: number }>,
    x: number | undefined,
    y: number | undefined,
    gap: number,
    columnsValue: number | undefined,
) {
    const columns = Math.max(1, Math.min(24, Math.floor(Number(columnsValue) || Math.ceil(Math.sqrt(boxes.length)))));
    const startX = x ?? Math.min(...boxes.map((box) => box.x));
    const startY = y ?? Math.min(...boxes.map((box) => box.y));
    const cellW = Math.max(...boxes.map((box) => box.w)) + gap;
    const cellH = Math.max(...boxes.map((box) => box.h)) + gap;
    return boxes.map((box, index) => ({
        id: box.id as TLShapeId,
        type: box.type,
        x: startX + (index % columns) * cellW,
        y: startY + Math.floor(index / columns) * cellH,
    }));
}

function layoutBoardColumn(
    boxes: Array<{ id: string; type: string; x: number; y: number; w: number; h: number }>,
    x: number,
    y: number,
    gap: number,
) {
    let cursor = y;
    return boxes.map((box) => {
        const update = {
            id: box.id as TLShapeId,
            type: box.type,
            x,
            y: cursor,
        };
        cursor += box.h + gap;
        return update;
    });
}

function layoutBoardTree(
    boxes: Array<{ id: string; type: string; x: number; y: number; w: number; h: number }>,
    x: number | undefined,
    y: number | undefined,
    horizontalGap: number,
    verticalGap: number,
    balanced: boolean,
) {
    if (boxes.length <= 1) {
        return boxes.map((box) => ({
            id: box.id as TLShapeId,
            type: box.type,
            x: x ?? box.x,
            y: y ?? box.y,
        }));
    }

    const root = boxes[0];
    const rootX = x ?? root.x;
    const rootY = y ?? root.y;
    const children = boxes.slice(1);
    const right = balanced ? children.filter((_, index) => index % 2 === 0) : children;
    const left = balanced ? children.filter((_, index) => index % 2 === 1) : [];
    return [
        { id: root.id as TLShapeId, type: root.type, x: rootX, y: rootY },
        ...layoutBoardSide(right, rootX + root.w + horizontalGap, rootY, verticalGap, 'right'),
        ...layoutBoardSide(left, rootX - horizontalGap, rootY, verticalGap, 'left'),
    ];
}

function layoutBoardSide(
    boxes: Array<{ id: string; type: string; x: number; y: number; w: number; h: number }>,
    anchorX: number,
    rootY: number,
    gap: number,
    side: 'left' | 'right',
) {
    if (!boxes.length) return [];
    const totalHeight = boxes.reduce((sum, box) => sum + box.h, 0) + gap * (boxes.length - 1);
    let cursor = rootY - totalHeight / 2;
    return boxes.map((box) => {
        const update = {
            id: box.id as TLShapeId,
            type: box.type,
            x: side === 'left' ? anchorX - box.w : anchorX,
            y: cursor + box.h / 2,
        };
        cursor += box.h + gap;
        return update;
    });
}

function getBoardLayoutAnchorBounds(
    editor: Editor,
    state: AgentBoardEditState,
    intent: AgentBoardLayoutIntent,
    style: AgentBoardLayoutStyle
): AgentShapeBounds {
    const anchorIds = intent.anchor
        ? resolveBoardEditRefs(editor, state, intent.anchor, 'layout.anchor')
        : state.selectedShapeIds;
    const bounds = unionShapeBounds(editor, anchorIds);
    if (bounds) return bounds;
    if (style === 'nearSelection') {
        const viewport = (editor as any).getViewportPageBounds?.();
        if (viewport) return { x: Number(viewport.x || 0) + 80, y: Number(viewport.y || 0) + 80, w: 1, h: 1 };
    }
    return { x: intent.x ?? 0, y: intent.y ?? 0, w: 1, h: 1 };
}

function createBoardFrameAround(editor: Editor, ids: string[], intent: AgentBoardLayoutIntent): TLShapeId {
    const bounds = unionShapeBounds(editor, ids);
    if (!bounds) throw new Error('frameAround target resolved to no visible bounds');
    const padding = finiteNumberInRange(intent.gap, 48, 0, 1000);
    const id = createShapeId();
    editor.createShape(buildAgentBasicShape(id, {
        kind: 'frame',
        x: bounds.x - padding,
        y: bounds.y - padding,
        w: intent.w ?? bounds.w + padding * 2,
        h: intent.h ?? bounds.h + padding * 2,
        name: intent.name || 'Frame',
        text: intent.name || 'Frame',
        color: boardColor(intent.color),
        select: false,
        zoom: false,
    }, bounds.x - padding, bounds.y - padding, boardColor(intent.color) ?? 'black', intent.name || 'Frame') as any);
    return id;
}

function unionShapeBounds(editor: Editor, ids: string[]): AgentShapeBounds | null {
    const boxes = ids
        .map((id) => getAgentShapeBoundsById(editor, id as TLShapeId))
        .filter(Boolean) as AgentShapeBounds[];
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.w));
    const bottom = Math.max(...boxes.map((box) => box.y + box.h));
    return { x: left, y: top, w: right - left, h: bottom - top };
}

function normalizeBoardUpdatePatches(
    operation: Extract<AgentBoardEditOperation, { op: 'updateNodes' }>,
    state: AgentBoardEditState,
    plannedAliases: Set<string>,
    plannedLast: boolean,
    editor: Editor,
    label: string,
): AgentShapeUpdatePatch[] {
    const rawPatches = Array.isArray(operation.patches)
        ? operation.patches
        : Array.isArray(operation.nodes)
            ? operation.nodes
            : [operationToBoardNodePatch(operation)];

    return rawPatches.flatMap((patch, index) => {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error(`${label}.patches[${index}] must be an object`);
        assertBoardEditKeys(patch as any, ['target', 'shapeId', 'shapeIds', 'x', 'y', 'w', 'h', 'color', 'isCollapsed', 'text', 'name'], `${label}.patches[${index}]`);
        const ids = resolveBoardEditRefsForValidation(editor, patch.target ?? patch.shapeIds ?? patch.shapeId ?? operation.target, state, plannedAliases, plannedLast, `${label}.patches[${index}].target`);
        return ids.map((shapeId) => ({
            shapeId,
            x: numberOrUndefined(patch.x ?? operation.x),
            y: numberOrUndefined(patch.y ?? operation.y),
            w: numberOrUndefined(patch.w ?? operation.w),
            h: numberOrUndefined(patch.h ?? operation.h),
            color: stringValue(patch.color ?? operation.color),
            isCollapsed: typeof (patch.isCollapsed ?? operation.isCollapsed) === 'boolean' ? (patch.isCollapsed ?? operation.isCollapsed) as boolean : undefined,
            text: stringValue(patch.text ?? operation.text),
            name: stringValue(patch.name ?? operation.name),
        }));
    });
}

function operationToBoardNodePatch(operation: Extract<AgentBoardEditOperation, { op: 'updateNodes' }>): AgentBoardNodePatch {
    const patch = { ...(operation as any) };
    delete patch.op;
    delete patch.patches;
    delete patch.nodes;
    return patch as AgentBoardNodePatch;
}

function resolveInitialBoardSelection(editor: Editor, value: unknown): string[] {
    if (Array.isArray(value)) return uniqueStrings(value.map(stringValue).filter(Boolean) as string[]);
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw || raw === '$selection') return editor.getSelectedShapeIds().map(String);
        return raw.split(',').map((item) => item.trim()).filter(Boolean);
    }
    if (value && typeof value === 'object') {
        const obj = value as any;
        if (Array.isArray(obj.shapeIds)) return uniqueStrings(obj.shapeIds.map(stringValue).filter(Boolean) as string[]);
        if (obj.shapeId) return [String(obj.shapeId)];
    }
    return [];
}

function resolveBoardEditRefs(editor: Editor, state: AgentBoardEditState, value: unknown, label: string): string[] {
    return resolveBoardEditRefsForValidation(editor, value, state, new Set(Object.keys(state.created)), state.lastShapeIds.length > 0, label)
        .filter((id) => !id.startsWith('$created.'));
}

function resolveBoardEditRefsForValidation(
    editor: Editor,
    value: unknown,
    state: AgentBoardEditState,
    plannedAliases: Set<string>,
    plannedLast: boolean,
    label: string
): string[] {
    if (Array.isArray(value)) {
        return uniqueStrings(value.flatMap((item, index) => resolveBoardEditRefsForValidation(editor, item, state, plannedAliases, plannedLast, `${label}[${index}]`)));
    }
    if (value && typeof value === 'object') {
        const obj = value as any;
        if (Array.isArray(obj.shapeIds)) return resolveBoardEditRefsForValidation(editor, obj.shapeIds, state, plannedAliases, plannedLast, `${label}.shapeIds`);
        if (obj.shapeId) return resolveBoardEditRefsForValidation(editor, obj.shapeId, state, plannedAliases, plannedLast, `${label}.shapeId`);
        if (obj.blockId) return findBoardShapesByBlockId(editor, String(obj.blockId), label);
        if (obj.kind) return findBoardShapesByKind(editor, String(obj.kind), label);
    }
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
    const raw = value.trim();
    if (raw === '$selection') return state.selectedShapeIds;
    if (raw === '$last') {
        if (!plannedLast && state.lastShapeIds.length === 0) throw new Error(`${label} references $last before any planned result`);
        return state.lastShapeIds.length ? state.lastShapeIds : ['$last'];
    }
    const selectionMatch = raw.match(/^\$selection\[(\d+)\]$/);
    if (selectionMatch) {
        const id = state.selectedShapeIds[Number(selectionMatch[1])];
        if (!id) throw new Error(`${label} selection index is out of range`);
        return [id];
    }
    const createdMatch = raw.match(/^\$created\.([A-Za-z][\w-]*)(?:\[(\d+)\])?$/);
    if (createdMatch) {
        const alias = createdMatch[1];
        const ids = state.created[alias] || (plannedAliases.has(alias) ? [`$created.${alias}`] : []);
        if (!ids.length) throw new Error(`${label} references unknown created alias: ${alias}`);
        if (createdMatch[2] !== undefined) {
            const id = ids[Number(createdMatch[2])];
            if (!id) throw new Error(`${label} created alias index is out of range`);
            return [id];
        }
        return ids;
    }
    const blockMatch = raw.match(/^\$block\.(.+)$/);
    if (blockMatch) return findBoardShapesByBlockId(editor, blockMatch[1], label);
    const kindMatch = raw.match(/^\$kind\.([A-Za-z0-9_-]+)$/);
    if (kindMatch) return findBoardShapesByKind(editor, kindMatch[1], label);
    if (!editor.getShape(raw as TLShapeId)) throw new Error(`${label} shape not found: ${raw}`);
    return [raw];
}

function validateBoardEditRef(
    editor: Editor,
    value: unknown,
    state: AgentBoardEditState,
    plannedAliases: Set<string>,
    plannedLast: boolean,
    label: string
) {
    const ids = resolveBoardEditRefsForValidation(editor, value, state, plannedAliases, plannedLast, label);
    if (!ids.length) throw new Error(`${label} resolved to no shapes`);
    return ids.length;
}

function findBoardShapesByBlockId(editor: Editor, blockId: string, label: string): string[] {
    const ids = editor.getCurrentPageShapes()
        .filter((shape) => String((shape as any).props?.blockId || '') === blockId)
        .map((shape) => String(shape.id));
    if (!ids.length) throw new Error(`${label} found no shape for block: ${blockId}`);
    return ids;
}

function findBoardShapesByKind(editor: Editor, kind: string, label: string): string[] {
    const ids = editor.getCurrentPageShapes()
        .filter((shape) => shape.type === kind)
        .map((shape) => String(shape.id));
    if (!ids.length) throw new Error(`${label} found no shapes of kind: ${kind}`);
    return ids;
}

function validateBoardAlias(value: unknown, label: string, existing: Set<string>, allowExisting: boolean) {
    if (value === undefined || value === null || value === '') return;
    const alias = String(value);
    if (!/^[A-Za-z][\w-]{0,63}$/.test(alias)) throw new Error(`${label} must start with a letter and contain only letters, numbers, underscore, or dash`);
    if (!allowExisting && existing.has(alias)) throw new Error(`${label} duplicates an earlier alias: ${alias}`);
}

function optionalBoardAlias(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    validateBoardAlias(value, 'alias', new Set(), true);
    return String(value);
}

function assertBoardEditKeys(value: Record<string, unknown>, allowedKeys: string[], label: string) {
    const allowed = new Set(allowedKeys);
    const unknown = Object.keys(value).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`${label} received unsupported field(s): ${unknown.join(', ')}`);
}

function normalizeBoardLayoutStyle(value: unknown): AgentBoardLayoutStyle {
    const raw = stringValue(value);
    return AGENT_BOARD_EDIT_LAYOUT_STYLES.has(raw || '') ? raw as AgentBoardLayoutStyle : 'grid';
}

function trackCommittedShapes(state: AgentBoardEditState, ids: string[]) {
    if (!ids.length) return;
    state.anyMutation = true;
    state.committedShapeIds = uniqueStrings([...state.committedShapeIds, ...ids]);
}

function assertBoardEditUpdateBudget(state: AgentBoardEditState, count: number, label: string) {
    if (count <= 0) return;
    if (state.counts.updatedShapes + count > AGENT_BOARD_EDIT_UPDATE_LIMIT) {
        throw new Error(`${label} writes exceed ${AGENT_BOARD_EDIT_UPDATE_LIMIT}; split this edit`);
    }
}

function buildBoardEditResult(runtime: AgentManagerRuntime, state: AgentBoardEditState, ok: boolean): AgentBoardEditResult {
    const result: AgentBoardEditResult = {
        ok,
        operationId: state.operationId,
        mode: state.mode,
        committed: state.anyMutation,
        created: state.created,
        counts: state.counts,
        focusedShapeIds: state.focusedShapeIds,
        selectedShapeIds: state.mode === 'preview'
            ? state.selectedShapeIds
            : (runtime.editor ? runtime.editor.getSelectedShapeIds().map(String) : state.selectedShapeIds),
        committedShapeIds: state.committedShapeIds,
        externalCreatedBlockIds: uniqueStrings(state.externalCreatedBlockIds),
        saved: state.saved,
        errors: state.errors,
    };
    if (state.resultMode === 'debug') result.summary = getAgentResultSummary(runtime);
    return result;
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.map(String).filter(Boolean)));
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boardColor(value: unknown) {
    return normalizeOptionalAgentColor(value);
}

export function updateAgentShape(runtime: AgentManagerRuntime, options: {
    shapeId: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    color?: string;
    isCollapsed?: boolean;
    select?: boolean;
    zoom?: boolean;
    resultMode?: AgentResultMode;
}) {
    const editor = requireEditor(runtime);
    const shape = editor.getShape(options.shapeId as TLShapeId) as TLShape | undefined;
    if (!shape) throw new Error(`Shape not found: ${options.shapeId}`);

    const patch: any = { id: shape.id, type: shape.type };
    if (options.x !== undefined) patch.x = finiteNumberInRange(options.x, shape.x, -100000, 100000);
    if (options.y !== undefined) patch.y = finiteNumberInRange(options.y, shape.y, -100000, 100000);

    const props = buildAgentShapePropsPatch(shape, options);
    if (Object.keys(props).length > 0) patch.props = props;

    editor.updateShape(patch);
    if (options.select !== false) editor.select(shape.id);
    if (options.zoom !== false) editor.zoomToSelection({ animation: { duration: 300 } });
    runtime.triggerSave();

    return { shapeId: String(shape.id), summary: getAgentResultSummary(runtime, options.resultMode) };
}

export async function getAgentShapeDetails(runtime: AgentManagerRuntime, options: {
    shapeIds?: string[];
    type?: string;
    limit?: number;
    includeBindings?: boolean;
    includeLinkedBlockContent?: boolean;
}): Promise<{ shapes: AgentShapeSummary[]; totalMatched: number; truncated: boolean }> {
    const editor = requireEditor(runtime);
    const ids = new Set((options.shapeIds || []).filter(Boolean));
    const limit = finiteNumberInRange(options.limit, 40, 1, 200);
    const shapes = editor.getCurrentPageShapes().filter((shape) => {
        if (ids.size && !ids.has(String(shape.id))) return false;
        if (options.type && shape.type !== options.type) return false;
        return true;
    });
    const returnedShapes = shapes.slice(0, limit);
    const blockContentById = options.includeLinkedBlockContent === false
        ? new Map<string, AgentLinkedBlockContent>()
        : await loadAgentLinkedBlockContent(returnedShapes);

    return {
        shapes: returnedShapes.map((shape) => summarizeAgentShape(
            editor,
            shape,
            options.includeBindings === true,
            getShapeLinkedBlockContent(shape, blockContentById),
        )),
        totalMatched: shapes.length,
        truncated: shapes.length > limit,
    };
}

export function createAgentBasicShape(runtime: AgentManagerRuntime, options: AgentBasicShapeCreateArgs) {
    const editor = requireEditor(runtime);
    const id = createShapeId();
    const defaultW = defaultAgentWidth(options.kind);
    const defaultH = defaultAgentHeight(options.kind);
    const w = finiteNumberInRange(options.w, defaultW, 1, 4000);
    const h = finiteNumberInRange(options.h, defaultH, 1, 4000);
    const position = resolveAgentCreatePosition(editor, options.kind, {
        x: options.x,
        y: options.y,
        w,
        h,
    });
    const color = options.color ?? 'black';
    const text = clampAgentText(options.text || defaultAgentText(options.kind), 2000);
    const shape = buildAgentBasicShape(id, { ...options, w, h }, position.x, position.y, color, text);

    editor.createShape(shape as any);
    finalizeAgentSelection(editor, id, options);
    runtime.triggerSave();

    return {
        createdShapeIds: [String(id)],
        selectedShapeIds: options.select === false ? [] : [String(id)],
        createdShapeBounds: buildCreatedShapeBoundsMap(editor, [String(id)]),
        focusedShapeBounds: getAgentShapeBoundsById(editor, id),
        summary: getAgentResultSummary(runtime, options.resultMode),
    };
}

export function createAgentConnector(runtime: AgentManagerRuntime, options: AgentConnectorCreateArgs) {
    if (options.kind === 'branch') {
        if (!options.startShapeId || !options.endShapeId) {
            throw new Error('branch connector requires startShapeId/endShapeId or shapeIds [root, child]');
        }
        return createAgentShape(runtime, {
            kind: 'branch',
            rootShapeId: options.startShapeId,
            children: [{ shapeId: options.endShapeId }],
            color: options.color,
            lineWidth: options.strokeWidth,
            select: options.select,
            zoom: options.zoom,
            resultMode: options.resultMode,
        });
    }

    const editor = requireEditor(runtime);
    const result = createAgentConnectorCore(editor, options);
    runtime.triggerSave();

    return {
        ...result,
        summary: getAgentResultSummary(runtime, options.resultMode),
    };
}

function createAgentConnectorCore(editor: Editor, options: AgentConnectorCreateArgs) {
    const connectorKind = options.kind || 'bezier-connector';
    const id = createShapeId();
    const endpoints = resolveAgentConnectorEndpoints(editor, options);
    const color = options.color ?? 'black';
    const richText = toRichText(clampAgentText(options.text || '', 500));

    if (connectorKind === 'arrow') {
        const origin = {
            x: Math.min(endpoints.start.x, endpoints.end.x),
            y: Math.min(endpoints.start.y, endpoints.end.y),
        };
        editor.createShape({
            id,
            type: 'arrow',
            x: origin.x,
            y: origin.y,
            props: {
                color,
                start: { x: endpoints.start.x - origin.x, y: endpoints.start.y - origin.y },
                end: { x: endpoints.end.x - origin.x, y: endpoints.end.y - origin.y },
                richText,
                arrowheadStart: 'none',
                arrowheadEnd: 'arrow',
            },
        } as any);
        const bindings = buildAgentArrowBindings(id, endpoints);
        if (bindings.length) editor.createBindings(bindings as any);
    } else {
        editor.createShape({
            id,
            type: 'bezier-connector',
            x: 0,
            y: 0,
            props: {
                start: endpoints.start,
                end: endpoints.end,
                color,
                strokeWidth: finiteNumberInRange(options.strokeWidth, 3, 1, 16),
                strokeStyle: 'solid',
                richText,
                labelPosition: 0.5,
                font: 'draw',
                size: 'm',
                scale: 1,
            },
        } as any);
        if (endpoints.startShapeId && endpoints.startPortId) {
            createOrUpdateConnectorBinding(editor, id, endpoints.startShapeId, {
                portId: endpoints.startPortId,
                terminal: 'start',
            });
        }
        if (endpoints.endShapeId && endpoints.endPortId) {
            createOrUpdateConnectorBinding(editor, id, endpoints.endShapeId, {
                portId: endpoints.endPortId,
                terminal: 'end',
            });
        }
    }

    finalizeAgentSelection(editor, id, options);
    try { editor.sendToBack([id]); } catch {}

    return {
        createdShapeIds: [String(id)],
        selectedShapeIds: options.select === false ? [] : [String(id)],
    };
}

export function updateAgentShapesBatch(runtime: AgentManagerRuntime, options: {
    patches: AgentShapeUpdatePatch[];
    select?: boolean;
    zoom?: boolean;
    resultMode?: AgentResultMode;
}) {
    const editor = requireEditor(runtime);
    const patches = options.patches.slice(0, 50);
    const updates: any[] = [];
    const updatedShapeIds: string[] = [];
    const skipped: Array<{ shapeId: string; reason: string }> = [];

    for (const item of patches) {
        const shape = editor.getShape(item.shapeId as TLShapeId) as TLShape | undefined;
        if (!shape) {
            skipped.push({ shapeId: item.shapeId, reason: 'shape not found' });
            continue;
        }
        const patch: any = { id: shape.id, type: shape.type };
        if (item.x !== undefined) patch.x = finiteNumberInRange(item.x, shape.x, -100000, 100000);
        if (item.y !== undefined) patch.y = finiteNumberInRange(item.y, shape.y, -100000, 100000);
        const props = buildAgentShapePropsPatch(shape, item);
        const extraProps = buildAgentTextPropsPatch(shape, item);
        patch.props = { ...props, ...extraProps };
        if (Object.keys(patch.props).length === 0) delete patch.props;
        updates.push(patch);
        updatedShapeIds.push(String(shape.id));
    }

    if (updates.length) editor.updateShapes(updates);
    if (options.select !== false && updatedShapeIds.length) editor.setSelectedShapes(updatedShapeIds as TLShapeId[]);
    if (options.zoom !== false && updatedShapeIds.length) editor.zoomToSelection({ animation: { duration: 300 } });
    runtime.triggerSave();
    return { updatedShapeIds, skipped, summary: getAgentResultSummary(runtime, options.resultMode) };
}

export async function deleteAgentShapes(runtime: AgentManagerRuntime, options: {
    shapeIds: string[];
    confirm?: boolean;
    allowLinkedBlockShapes?: boolean;
    resultMode?: AgentResultMode;
}) {
    const editor = requireEditor(runtime);
    const requestedIds = Array.from(new Set(options.shapeIds)).slice(0, 50);
    const deletable: TLShapeId[] = [];
    const blocked: Array<{ shapeId: string; reason: string }> = [];

    for (const shapeId of requestedIds) {
        const shape = editor.getShape(shapeId as TLShapeId) as TLShape | undefined;
        if (!shape) {
            blocked.push({ shapeId, reason: 'shape not found' });
            continue;
        }
        if (!options.allowLinkedBlockShapes && isLinkedBlockShape(shape)) {
            blocked.push({ shapeId, reason: 'linked SiYuan block shape requires allowLinkedBlockShapes=true' });
            continue;
        }
        deletable.push(shape.id);
    }

    if (options.confirm !== true) {
        return {
            dryRun: true,
            deletedShapeIds: deletable.map(String),
            blocked,
            summary: getAgentResultSummary(runtime, options.resultMode),
        };
    }

    let backup: Awaited<ReturnType<typeof backupAgentWhiteboard>> | null = null;
    if (deletable.length) {
        backup = await backupAgentWhiteboard(runtime, { reason: 'agent-delete-shapes' });
        editor.deleteShapes(deletable);
        runtime.triggerSave();
    }
    return {
        dryRun: false,
        deletedShapeIds: deletable.map(String),
        blocked,
        backup,
        summary: getAgentResultSummary(runtime, options.resultMode),
    };
}

export function convertAgentConnectors(runtime: AgentManagerRuntime, options: {
    shapeIds: string[];
    to: 'arrow' | 'bezier-connector';
}) {
    const editor = requireEditor(runtime);
    const ids = options.shapeIds.slice(0, 50).map((id) => id as TLShapeId);
    const converted = options.to === 'arrow'
        ? convertConnectorsToArrow(editor, ids)
        : convertConnectorsToBezier(editor, ids);
    if (converted.length) runtime.triggerSave();
    return {
        convertedShapeIds: converted.map(String),
        summary: getAgentSummary(runtime),
    };
}

export function getAgentBoardSnapshotSummary(runtime: AgentManagerRuntime) {
    const snapshot = getSnapshot(runtime.store);
    return {
        ...summarizeSnapshotObject(runtime.id, snapshot, 'open-editor'),
        isOpen: Boolean(runtime.editor),
    };
}

export async function backupAgentWhiteboard(runtime: AgentManagerRuntime, options: { reason?: string } = {}) {
    const snapshot = getSnapshot(runtime.store);
    const jsonData = JSON.stringify(snapshot);
    const result = await WhiteboardFileManager.backupWhiteboardData(runtime.id, jsonData, {
        reason: clampAgentText(options.reason || 'agent-backup', 80),
    } as any);
    return {
        ...result,
        snapshot: getAgentBoardSnapshotSummary(runtime),
    };
}

export function duplicateAgentShapes(runtime: AgentManagerRuntime, options: {
    shapeIds: string[];
    offsetX?: number;
    offsetY?: number;
    select?: boolean;
    zoom?: boolean;
    resultMode?: AgentResultMode;
}) {
    const editor = requireEditor(runtime);
    const ids = Array.from(new Set(options.shapeIds)).slice(0, 50);
    const existing = ids.filter((id) => editor.getShape(id as TLShapeId)).map((id) => id as TLShapeId);
    const blocked = ids
        .filter((id) => !editor.getShape(id as TLShapeId))
        .map((shapeId) => ({ shapeId, reason: 'shape not found' }));
    if (!existing.length) return { duplicatedShapeIds: [], blocked, summary: getAgentResultSummary(runtime, options.resultMode) };

    const dx = finiteNumberInRange(options.offsetX, 32, -4000, 4000);
    const dy = finiteNumberInRange(options.offsetY, 32, -4000, 4000);
    const beforeIds = new Set(editor.getCurrentPageShapes().map((shape) => String(shape.id)));
    const duplicate = (editor as any).duplicateShapes;
    let duplicated: TLShape[] = [];
    if (typeof duplicate === 'function') {
        duplicate.call(editor, existing);
        duplicated = editor
            .getCurrentPageShapes()
            .filter((shape) => !beforeIds.has(String(shape.id))) as TLShape[];
        if ((dx !== 0 || dy !== 0) && duplicated.length) {
            editor.updateShapes(duplicated.map((shape) => ({
                id: shape.id,
                type: shape.type,
                x: Number(shape.x || 0) + dx,
                y: Number(shape.y || 0) + dy,
            })) as any);
        }
    } else {
        const creates = existing
            .map((id) => editor.getShape(id))
            .filter(Boolean)
            .map((shape: any) => ({
                id: createShapeId(),
                type: shape.type,
                x: Number(shape.x || 0) + dx,
                y: Number(shape.y || 0) + dy,
                props: JSON.parse(JSON.stringify(shape.props || {})),
            }));
        editor.createShapes(creates as any);
        duplicated = creates.map((shape) => editor.getShape(shape.id)).filter(Boolean) as TLShape[];
    }
    const duplicatedShapeIds = duplicated.map((shape) => String(shape.id));
    if (options.select !== false && duplicatedShapeIds.length) editor.setSelectedShapes(duplicatedShapeIds as TLShapeId[]);
    if (options.zoom && duplicatedShapeIds.length) editor.zoomToSelection({ animation: { duration: 300 } });
    runtime.triggerSave();
    return { duplicatedShapeIds, blocked, summary: getAgentResultSummary(runtime, options.resultMode) };
}

export function arrangeAgentShapes(runtime: AgentManagerRuntime, options: {
    shapeIds: string[];
    operation: AgentArrangeOperation;
    resultMode?: AgentResultMode;
}) {
    const editor = requireEditor(runtime);
    const ids = Array.from(new Set(options.shapeIds)).slice(0, 50)
        .filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[];
    if (!ids.length) return { arrangedShapeIds: [], summary: getAgentResultSummary(runtime, options.resultMode) };
    const methodByOperation: Record<AgentArrangeOperation, string> = {
        front: 'bringToFront',
        back: 'sendToBack',
        forward: 'bringForward',
        backward: 'sendBackward',
    };
    const methodName = methodByOperation[options.operation];
    const method = (editor as any)[methodName];
    if (typeof method !== 'function') {
        throw new Error(`${methodName} API is unavailable in current tldraw editor`);
    }
    method.call(editor, ids);
    runtime.triggerSave();
    return { arrangedShapeIds: ids.map(String), summary: getAgentResultSummary(runtime, options.resultMode) };
}

export function alignAgentShapes(runtime: AgentManagerRuntime, options: {
    shapeIds: string[];
    operation: AgentAlignOperation;
    resultMode?: AgentResultMode;
}) {
    const editor = requireEditor(runtime);
    const shapes = Array.from(new Set(options.shapeIds)).slice(0, 50)
        .map((id) => editor.getShape(id as TLShapeId))
        .filter(Boolean) as TLShape[];
    if (shapes.length < 2) return { alignedShapeIds: shapes.map((shape) => String(shape.id)), summary: getAgentResultSummary(runtime, options.resultMode) };

    const boxes = shapes.map((shape) => {
        const bounds = editor.getShapePageBounds(shape.id);
        const w = bounds?.width || Number((shape as any).props?.w) || 1;
        const h = bounds?.height || Number((shape as any).props?.h) || 1;
        return {
            shape,
            x: bounds?.x ?? Number(shape.x || 0),
            y: bounds?.y ?? Number(shape.y || 0),
            w,
            h,
        };
    });
    const updates = buildAgentAlignUpdates(boxes, options.operation);
    if (updates.length) {
        editor.updateShapes(updates as any);
        runtime.triggerSave();
    }
    return { alignedShapeIds: shapes.map((shape) => String(shape.id)), summary: getAgentResultSummary(runtime, options.resultMode) };
}

export function groupAgentShapes(runtime: AgentManagerRuntime, options: {
    shapeIds: string[];
    ungroup?: boolean;
    select?: boolean;
    resultMode?: AgentResultMode;
}) {
    const editor = requireEditor(runtime);
    const ids = Array.from(new Set(options.shapeIds)).slice(0, 50)
        .filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[];
    if (!ids.length) return { shapeIds: [], summary: getAgentResultSummary(runtime, options.resultMode) };

    const methodName = options.ungroup ? 'ungroupShapes' : 'groupShapes';
    const method = (editor as any)[methodName];
    if (typeof method !== 'function') {
        throw new Error(`${methodName} API is unavailable in current tldraw editor`);
    }
    method.call(editor, ids);
    if (options.select !== false) editor.setSelectedShapes(ids);
    runtime.triggerSave();
    return { shapeIds: ids.map(String), summary: getAgentResultSummary(runtime, options.resultMode) };
}

export function lockAgentShapes(runtime: AgentManagerRuntime, options: {
    shapeIds: string[];
    locked: boolean;
    resultMode?: AgentResultMode;
}) {
    const editor = requireEditor(runtime);
    const ids = Array.from(new Set(options.shapeIds)).slice(0, 50)
        .filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[];
    if (!ids.length) return { shapeIds: [], locked: options.locked, summary: getAgentResultSummary(runtime, options.resultMode) };

    const methodName = options.locked ? 'lockShapes' : 'unlockShapes';
    const method = (editor as any)[methodName];
    if (typeof method === 'function') {
        method.call(editor, ids);
    } else {
        editor.updateShapes(ids.map((id) => {
            const shape = editor.getShape(id) as TLShape;
            return { id, type: shape.type, isLocked: options.locked } as any;
        }));
    }
    runtime.triggerSave();
    return { shapeIds: ids.map(String), locked: options.locked, summary: getAgentResultSummary(runtime, options.resultMode) };
}

async function prepareAgentCreateShapeOptions(
    runtime: AgentManagerRuntime,
    options: AgentCreateShapeArgs
): Promise<AgentCreateShapeArgs> {
    if (options.kind === 'card') return prepareAgentCardCreateArgs(runtime, options);
    if (options.kind === 'single-block') return prepareAgentSingleBlockCreateArgs(runtime, options);
    if (options.kind !== 'branch') return options;

    const prepareRefs = async (refs?: AgentBranchCreateArgs['children']) => {
        if (!Array.isArray(refs)) return refs;
        return Promise.all(refs.map(async (ref) => {
            if (!ref || typeof ref === 'string' || ref.shapeId) return ref;
            const kind = ref.kind || (ref.contentMarkdown !== undefined || ref.title !== undefined ? 'card' : undefined);
            if (kind === 'card') return prepareAgentCardCreateArgs(runtime, { ...ref, kind: 'card' as const });
            if (kind === 'single-block') return prepareAgentSingleBlockCreateArgs(runtime, { ...ref, kind: 'single-block' as const });
            return ref;
        }));
    };

    return {
        ...options,
        children: await prepareRefs(options.children),
        leftChildren: await prepareRefs(options.leftChildren),
        rightChildren: await prepareRefs(options.rightChildren),
    };
}

async function prepareAgentSingleBlockCreateArgs<T extends AgentSingleBlockCreateArgs | Extract<AgentBranchChildRef, object>>(
    runtime: AgentManagerRuntime,
    options: T
): Promise<T> {
    const contentMarkdown = typeof options.contentMarkdown === 'string' ? options.contentMarkdown : undefined;
    const title = typeof options.title === 'string' ? options.title : undefined;
    const blockId = typeof options.blockId === 'string' && options.blockId.trim() ? options.blockId.trim() : undefined;
    if (blockId && (contentMarkdown !== undefined || title !== undefined)) {
        throw new Error('single-block cannot set blockId together with contentMarkdown/title');
    }
    if (blockId) return { ...options, blockId, contentMarkdown: undefined, title: undefined } as T;

    const createdBlockId = await createAgentSingleBlockForContent(runtime, {
        title,
        contentMarkdown,
    });
    return { ...options, blockId: createdBlockId, contentMarkdown: undefined, title: undefined } as T;
}

async function prepareAgentCardCreateArgs<T extends AgentCardCreateArgs | Extract<AgentBranchChildRef, object>>(
    runtime: AgentManagerRuntime,
    options: T
): Promise<T> {
    const contentMarkdown = typeof options.contentMarkdown === 'string' ? options.contentMarkdown : undefined;
    const blockId = typeof options.blockId === 'string' && options.blockId.trim() ? options.blockId.trim() : undefined;
    if (blockId && contentMarkdown !== undefined) {
        throw new Error('card cannot set both blockId and contentMarkdown');
    }
    if (blockId) return { ...options, blockId, contentMarkdown: undefined } as T;

    const createdBlockId = await createAgentCardBlockForContent(runtime, {
        title: options.title,
        contentMarkdown,
    });
    return { ...options, blockId: createdBlockId, contentMarkdown: undefined } as T;
}

async function createAgentSingleBlockForContent(runtime: AgentManagerRuntime, options: {
    title?: string;
    contentMarkdown?: string;
}) {
    const blockId = await api.generateSiyuanID() as string;
    const link = buildTldrawLink(runtime.id, blockId, runtime.title);
    const body = renderAgentSingleBlockContent(options);
    const markdown = body
        ? `${body}\n{: id="${blockId}" custom-st-tldraw-single="1" custom-tldraw-link="${escapeBlockAttr(link)}" }\n`
        : `\n{: id="${blockId}" custom-st-tldraw-single="1" custom-tldraw-link="${escapeBlockAttr(link)}" }\n\n`;
    const appendResult = await api.appendBlock('markdown', markdown, runtime.id);
    return extractFirstOperationId(appendResult) || blockId;
}

function renderAgentSingleBlockContent(options: {
    title?: string;
    contentMarkdown?: string;
}) {
    const content = String(options.contentMarkdown || '').trim();
    if (content) return content;
    return String(options.title || '').trim();
}

async function createAgentCardBlockForContent(runtime: AgentManagerRuntime, options: {
    title?: string;
    contentMarkdown?: string;
}) {
    const blockId = await api.generateSiyuanID() as string;
    const content = normalizeAgentCardContent(options);
    const link = buildTldrawLink(runtime.id, blockId, runtime.title);
    const headingMarkdown = [
        `${'#'.repeat(content.headingLevel)} ${content.title}`,
        `{: id="${blockId}" custom-st-tldraw="1" custom-tldraw-link="${escapeBlockAttr(link)}" }`,
        '',
        '{: custom-st-tldraw-none="1" }',
        '',
    ].join('\n');

    const appendResult = await api.appendBlock('markdown', headingMarkdown, runtime.id);
    const appendedBlockId = extractFirstOperationId(appendResult) || blockId;
    if (content.bodyMarkdown) {
        await api.insertBlock('markdown', content.bodyMarkdown, undefined, appendedBlockId);
    }
    return appendedBlockId;
}

function normalizeAgentCardContent(options: {
    title?: string;
    contentMarkdown?: string;
}) {
    const explicitTitle = String(options.title || '').trim();
    const rawContent = String(options.contentMarkdown || '').trim();
    const leadingHeading = parseLeadingMarkdownHeading(rawContent);

    if (explicitTitle) {
        const bodyMarkdown = leadingHeading && normalizeHeadingText(leadingHeading.text) === normalizeHeadingText(explicitTitle)
            ? rawContent.slice(leadingHeading.raw.length).trimStart()
            : rawContent;
        return {
            title: explicitTitle,
            headingLevel: 6,
            bodyMarkdown,
        };
    }

    if (leadingHeading) {
        return {
            title: leadingHeading.text,
            headingLevel: leadingHeading.level,
            bodyMarkdown: rawContent.slice(leadingHeading.raw.length).trimStart(),
        };
    }

    return {
        title: renderAgentCardTitle(),
        headingLevel: 6,
        bodyMarkdown: rawContent,
    };
}

function parseLeadingMarkdownHeading(markdown: string): { raw: string; level: number; text: string } | null {
    const match = markdown.match(/^(#{1,6})[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?(?:\r?\n|$)/);
    if (!match) return null;
    return {
        raw: match[0],
        level: match[1].length,
        text: match[2].trim(),
    };
}

function normalizeHeadingText(value: string) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function renderAgentCardTitle(title?: string) {
    const explicit = String(title || '').trim();
    if (explicit) return explicit;
    const customTitleTemplate = String(settingdata?.['tldraw-custom-card-title'] || '${timestamp}');
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return customTitleTemplate
        ? customTitleTemplate.replace(/\$\{timestamp\}/g, timestamp)
        : timestamp;
}

function escapeBlockAttr(value: string) {
    return String(value || '').replace(/"/g, '&quot;');
}

function extractFirstOperationId(value: unknown): string | undefined {
    const first = Array.isArray(value) ? value[0] as any : undefined;
    const id = first?.doOperations?.[0]?.id;
    return typeof id === 'string' && id ? id : undefined;
}

function applyAgentCreateLayout<T extends AgentCreateShapeArgs>(editor: Editor, options: T): T {
    if (options.kind === 'branch') return options;
    const size = getAgentCreateShapeSize(options.kind, options);
    const position = resolveAgentCreatePosition(editor, options.kind, {
        x: options.x,
        y: options.y,
        w: size.w,
        h: size.h,
    });
    return { ...options, x: position.x, y: position.y } as T;
}

function getAgentCreateShapeSize(kind: AgentCreateLayoutKind, options: { w?: number; h?: number }): { w: number; h: number } {
    if (kind === 'card') {
        const defaults = getAgentCardDefaults();
        return {
            w: finiteNumberInRange(options.w, defaults.w, 1, 4000),
            h: finiteNumberInRange(options.h, defaults.h, 1, 4000),
        };
    }
    if (kind === 'single-block') {
        const defaults = getAgentSingleBlockDefaults();
        return {
            w: finiteNumberInRange(options.w, defaults.w, 1, 4000),
            h: finiteNumberInRange(options.h, defaults.h, 1, 4000),
        };
    }
    return {
        w: finiteNumberInRange(options.w, defaultAgentWidth(kind as AgentBasicShapeCreateArgs['kind']), 1, 4000),
        h: finiteNumberInRange(options.h, defaultAgentHeight(kind as AgentBasicShapeCreateArgs['kind']), 1, 4000),
    };
}

function resolveAgentCreatePosition(editor: Editor, kind: AgentCreateLayoutKind, draft: {
    x?: number;
    y?: number;
    w: number;
    h: number;
}): { x: number; y: number } {
    const fallback = getAgentDefaultCreateOrigin(editor);
    const x = finiteNumberInRange(draft.x, fallback.x, -100000, 100000);
    const y = finiteNumberInRange(draft.y, fallback.y, -100000, 100000);
    if (!AGENT_ENTITY_CREATE_SHAPES.has(kind)) return { x, y };

    const requested = { x, y, w: draft.w, h: draft.h };
    const existing = getCurrentEntityShapeBounds(editor);
    const hasExplicitPosition = draft.x !== undefined && draft.y !== undefined;
    if (hasExplicitPosition && !boundsCollides(requested, existing, AGENT_CREATE_GAP)) {
        return { x, y };
    }

    const found = findNearestFreeBounds(requested, existing, AGENT_CREATE_GAP);
    return { x: found.x, y: found.y };
}

function getAgentDefaultCreateOrigin(editor: Editor): { x: number; y: number } {
    try {
        const viewport = (editor as any).getViewportPageBounds?.();
        if (viewport) return { x: Number(viewport.x || 0) + 80, y: Number(viewport.y || 0) + 80 };
    } catch {}
    return AGENT_DEFAULT_CREATE_ORIGIN;
}

function getCurrentEntityShapeBounds(editor: Editor): AgentShapeBounds[] {
    return editor.getCurrentPageShapes()
        .filter((shape) => AGENT_ENTITY_CREATE_SHAPES.has(String(shape.type)))
        .map((shape) => getAgentShapeBounds(editor, shape));
}

function findNearestFreeBounds(
    requested: AgentShapeBounds,
    existing: AgentShapeBounds[],
    gap: number
): AgentShapeBounds {
    if (!boundsCollides(requested, existing, gap)) return requested;
    const stepX = Math.max(requested.w + gap, gap);
    const stepY = Math.max(requested.h + gap, gap);

    for (let radius = 1; radius <= 24; radius++) {
        let best: AgentShapeBounds | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let ix = -radius; ix <= radius; ix++) {
            for (let iy = -radius; iy <= radius; iy++) {
                if (Math.max(Math.abs(ix), Math.abs(iy)) !== radius) continue;
                const candidate = {
                    ...requested,
                    x: requested.x + ix * stepX,
                    y: requested.y + iy * stepY,
                };
                if (boundsCollides(candidate, existing, gap)) continue;
                const distance = Math.hypot(candidate.x - requested.x, candidate.y - requested.y);
                if (distance < bestDistance) {
                    best = candidate;
                    bestDistance = distance;
                }
            }
        }
        if (best) return best;
    }

    return {
        ...requested,
        x: requested.x + stepX * (existing.length + 1),
    };
}

function boundsCollides(bounds: AgentShapeBounds, existing: AgentShapeBounds[], gap: number) {
    return existing.some((item) => boundsIntersect(bounds, item, gap));
}

function boundsIntersect(a: AgentShapeBounds, b: AgentShapeBounds, gap: number) {
    return !(
        a.x + a.w + gap <= b.x ||
        b.x + b.w + gap <= a.x ||
        a.y + a.h + gap <= b.y ||
        b.y + b.h + gap <= a.y
    );
}

function buildCreatedBoundsResult(editor: Editor, shapeIds: string[]) {
    const createdShapeBounds = buildCreatedShapeBoundsMap(editor, shapeIds);
    const focusedShapeBounds = shapeIds.length ? getAgentShapeBoundsById(editor, shapeIds[0] as TLShapeId) : undefined;
    return { createdShapeBounds, focusedShapeBounds };
}

function buildCreatedShapeBoundsMap(editor: Editor, shapeIds: string[]) {
    return shapeIds.reduce<Record<string, AgentShapeBounds>>((acc, shapeId) => {
        const bounds = getAgentShapeBoundsById(editor, shapeId as TLShapeId);
        if (bounds) acc[shapeId] = bounds;
        return acc;
    }, {});
}

function getAgentShapeBoundsById(editor: Editor, shapeId: TLShapeId) {
    const shape = editor.getShape(shapeId);
    return shape ? getAgentShapeBounds(editor, shape) : undefined;
}

function getAgentShapeBounds(editor: Editor, shape: TLShape): AgentShapeBounds {
    const bounds = editor.getShapePageBounds(shape.id);
    if (bounds) {
        return {
            x: Number(bounds.x || 0),
            y: Number(bounds.y || 0),
            w: Number(bounds.width || 1),
            h: Number(bounds.height || 1),
        };
    }
    return getFallbackShapeBounds(shape);
}

function getFallbackShapeBounds(shape: TLShape): AgentShapeBounds {
    const props = (shape as any).props || {};
    const defaults = getFallbackShapeDefaultSize(shape.type);
    return {
        x: Number((shape as any).x || 0),
        y: Number((shape as any).y || 0),
        w: Number(props.w ?? props.width ?? defaults.w) || 1,
        h: Number(props.h ?? props.height ?? defaults.h) || 1,
    };
}

function getFallbackShapeDefaultSize(kind: string) {
    if (kind === 'card') {
        const defaults = getAgentCardDefaults();
        return { w: defaults.w, h: defaults.h };
    }
    if (kind === 'single-block') {
        const defaults = getAgentSingleBlockDefaults();
        return { w: defaults.w, h: defaults.h };
    }
    return {
        w: defaultAgentWidth(kind as AgentBasicShapeCreateArgs['kind']),
        h: defaultAgentHeight(kind as AgentBasicShapeCreateArgs['kind']),
    };
}

function syncAgentCreatedBlockAttrs(runtime: AgentManagerRuntime, result: AgentCreateShapeResult) {
    const nodes = result.createdNodes || [];
    const linkedNodes = nodes.filter((node) =>
        node.blockId && (node.kind === 'card' || node.kind === 'single-block')
    );
    if (linkedNodes.length === 0) return;

    void Promise.all(linkedNodes.map(async (node) => {
        const blockId = node.blockId as string;
        const link = buildTldrawLink(runtime.id, blockId, runtime.title, node.id);
        const attrs = node.kind === 'single-block'
            ? { 'custom-tldraw-link': link, 'custom-st-tldraw-single': '1' }
            : { 'custom-tldraw-link': link, 'custom-st-tldraw': '1' };
        await api.setBlockAttrs(blockId, attrs);
    })).catch((error) => {
        console.error('sync agent-created tldraw block attrs failed', error);
    });
}

async function validateAgentCreateShapeBlockIds(options: AgentCreateShapeArgs) {
    if (options.kind === 'card') {
        await validateAgentLinkedBlockId(options.blockId, 'card');
        return;
    }
    if (options.kind === 'single-block') {
        await validateAgentLinkedBlockId(options.blockId, 'single-block');
        return;
    }

    const refs = [
        ...(options.children || []),
        ...(options.leftChildren || []),
        ...(options.rightChildren || []),
    ];
    for (const shapeId of options.childIds || []) {
        refs.push({ shapeId });
    }
    for (const ref of refs) {
        if (!ref || typeof ref === 'string') continue;
        if (ref.shapeId) continue;
        await validateAgentLinkedBlockId(ref.blockId, ref.kind || 'single-block');
    }
}

async function validateAgentLinkedBlockId(blockId: string | undefined, kind: 'card' | 'single-block') {
    if (!blockId) return;
    if (!/^\d{14}-[0-9a-z]{7}$/.test(blockId)) {
        throw new Error(`${kind} blockId is not a valid SiYuan block id`);
    }

    const block = await api.getBlockByID(blockId);
    if (!block) {
        throw new Error(`${kind} blockId not found: ${blockId}`);
    }

    const type = String((block as any).type || '');
    if (kind === 'card') {
        if (type === 'd' || type === 'h') return;
        throw new Error(`card blockId must point to a document or heading block; got type "${type || 'unknown'}"`);
    }
    if (type !== 'p') {
        throw new Error(`single-block blockId must point to a paragraph block; got type "${type || 'unknown'}"`);
    }
}

function summarizeShapeProps(props: any, editor?: Editor, blockContent?: AgentLinkedBlockContent): Record<string, unknown> {
    if (!props || typeof props !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const key of ['w', 'h', 'color', 'geo', 'name', 'text', 'isMain', 'isCollapsed', 'showMask']) {
        if (props[key] !== undefined) out[key] = props[key];
    }
    if (props.blockId !== undefined) {
        out.blockId = props.blockId || null;
        out.isLinkedBlock = Boolean(props.blockId);
    }
    if (props.richText) {
        out.richText = '[richText]';
        const fallbackPlain = plainTextFromRichText(props.richText);
        if (editor) {
            try {
                out.richTextPlain = clampAgentText(renderPlaintextFromRichText(editor, props.richText) || fallbackPlain, 500);
            } catch {
                if (fallbackPlain) out.richTextPlain = clampAgentText(fallbackPlain, 500);
            }
        } else if (fallbackPlain) {
            out.richTextPlain = clampAgentText(fallbackPlain, 500);
        }
    }
    if (blockContent) out.blockContent = blockContent;
    return out;
}

function buildAgentShapePropsPatch(shape: TLShape, options: {
    w?: number;
    h?: number;
    color?: string;
    isCollapsed?: boolean;
}): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const supportsPropWidth = ['card', 'single-block', 'branch', 'geo', 'text', 'frame', 'slide', 'mind-map', 'js-shape'].includes(shape.type);
    const supportsPropHeight = ['card', 'single-block', 'branch', 'geo', 'frame', 'slide', 'mind-map', 'js-shape'].includes(shape.type);
    const supportsColor = ['card', 'single-block', 'branch', 'geo', 'note', 'text', 'frame', 'draw', 'highlight', 'slide', 'mind-map', 'js-shape', 'arrow', 'line', 'bezier-connector'].includes(shape.type);

    if (supportsPropWidth && options.w !== undefined) {
        props.w = finiteNumberInRange(options.w, Number((shape as any).props?.w) || 300, 1, 4000);
    }
    if (supportsPropHeight && options.h !== undefined) {
        props.h = finiteNumberInRange(options.h, Number((shape as any).props?.h) || 300, 1, 4000);
    }
    if (supportsColor && options.color !== undefined) {
        const color = normalizeOptionalAgentColor(options.color);
        if (color) props.color = color;
    }
    if (options.isCollapsed !== undefined) {
        if (shape.type !== 'card') {
            throw new Error('isCollapsed is only supported for card shapes');
        }
        applyAgentCardCollapseProps(shape as ICardShape, props, options.isCollapsed);
    }

    return props;
}

function applyAgentCardCollapseProps(shape: ICardShape, props: Record<string, unknown>, nextCollapsed: boolean) {
    const currentProps = shape.props;
    const currentlyCollapsed = Boolean(currentProps.isCollapsed);
    const requestedHeight = typeof props.h === 'number' ? props.h : undefined;
    props.isCollapsed = nextCollapsed;

    if (nextCollapsed) {
        if (!currentlyCollapsed || requestedHeight !== undefined || !currentProps.preCollapseHeight) {
            props.preCollapseHeight = requestedHeight ?? currentProps.h;
        }
        props.h = getCardCollapsedHeight(shape);
        return;
    }

    props.preCollapseHeight = undefined;
    if (currentlyCollapsed && requestedHeight === undefined && currentProps.preCollapseHeight && currentProps.preCollapseHeight > 0) {
        props.h = finiteNumberInRange(currentProps.preCollapseHeight, currentProps.h, 1, 4000);
    }
}

function buildAgentTextPropsPatch(shape: TLShape, options: { text?: string; name?: string }): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    if (options.text !== undefined) {
        const text = clampAgentText(options.text, 2000);
        if (shape.type === 'text' || shape.type === 'note' || shape.type === 'arrow' || shape.type === 'bezier-connector') {
            props.richText = toRichText(text);
        } else if (shape.type === 'mind-map') {
            props.rootNode = {
                ...((shape as any).props?.rootNode || createMindMapNode()),
                text,
            };
        }
    }
    if (options.name !== undefined && shape.type === 'slide') {
        props.name = clampAgentText(options.name, 120) || 'New Slide';
    }
    return props;
}

function summarizeAgentShape(
    editor: Editor,
    shape: TLShape,
    includeBindings = false,
    blockContent?: AgentLinkedBlockContent,
): AgentShapeSummary {
    const summary: AgentShapeSummary = {
        id: String(shape.id),
        type: String(shape.type),
        x: Number(shape.x || 0),
        y: Number(shape.y || 0),
        bounds: getAgentShapeBounds(editor, shape),
        rotation: Number((shape as any).rotation || 0),
        parentId: String((shape as any).parentId || ''),
        index: String((shape as any).index || ''),
        props: summarizeShapeProps((shape as any).props, editor, blockContent),
    };
    if (includeBindings) {
        summary.bindings = [
            ...((editor as any).getBindingsFromShape?.(shape.id, 'arrow') || []),
            ...((editor as any).getBindingsFromShape?.(shape.id, 'bezier-connector') || []),
        ].map(summarizeAgentBinding);
    }
    return summary;
}

async function loadAgentLinkedBlockContent(shapes: TLShape[]): Promise<Map<string, AgentLinkedBlockContent>> {
    const includeChildrenByBlockId = new Map<string, boolean>();
    for (const shape of shapes) {
        if (!shouldAttachLinkedBlockContent(shape)) continue;
        const blockId = String((shape as any).props?.blockId || '').trim();
        if (!blockId) continue;
        includeChildrenByBlockId.set(blockId, includeChildrenByBlockId.get(blockId) || shape.type === 'card');
    }
    if (!includeChildrenByBlockId.size) return new Map();

    const entries = await Promise.all(Array.from(includeChildrenByBlockId.entries()).map(async ([blockId, includeChildren]) => {
        const content = await loadAgentLinkedBlockContentById(blockId, includeChildren);
        return [blockId, content] as const;
    }));
    return new Map(entries);
}

function shouldAttachLinkedBlockContent(shape: TLShape): boolean {
    if (shape.type !== 'card' && shape.type !== 'single-block') return false;
    return Boolean((shape as any).props?.blockId);
}

function getShapeLinkedBlockContent(shape: TLShape, blockContentById: Map<string, AgentLinkedBlockContent>): AgentLinkedBlockContent | undefined {
    if (!shouldAttachLinkedBlockContent(shape)) return undefined;
    const blockId = String((shape as any).props?.blockId || '').trim();
    return blockContentById.get(blockId);
}

async function loadAgentLinkedBlockContentById(blockId: string, includeChildren = false): Promise<AgentLinkedBlockContent> {
    if (!SIYUAN_BLOCK_ID_RE.test(blockId)) {
        return { id: blockId, missing: true, error: 'invalid SiYuan block id' };
    }

    try {
        const [block, kramdown, childBlocks] = await Promise.all([
            api.getBlockByID(blockId).catch(() => null),
            api.getBlockKramdown(blockId).catch(() => null),
            includeChildren ? api.getChildBlocks(blockId).catch(() => []) : Promise.resolve([]),
        ]);
        if (!block && !kramdown) return { id: blockId, missing: true };

        const markdownClamp = clampAgentBlockContent(
            String((kramdown as any)?.kramdown || (block as any)?.markdown || '')
        );
        const contentClamp = clampAgentBlockContent(
            String((block as any)?.fcontent || (block as any)?.content || '')
        );
        const title = clampAgentText(
            String((block as any)?.fcontent || (block as any)?.content || (block as any)?.hpath || blockId).replace(/\s+/g, ' ').trim(),
            160,
        );
        const childSummary = includeChildren ? summarizeAgentCardChildBlocks(childBlocks) : undefined;

        return {
            id: blockId,
            type: (block as any)?.type ? String((block as any).type) : undefined,
            subType: (block as any)?.subtype ? String((block as any).subtype) : undefined,
            title,
            content: contentClamp.text,
            markdown: markdownClamp.text,
            childCount: childSummary?.childCount,
            children: childSummary?.children,
            childrenText: childSummary?.childrenText,
            childrenTruncated: childSummary?.truncated || undefined,
            hpath: (block as any)?.hpath ? clampAgentText(String((block as any).hpath), 240) : undefined,
            truncated: contentClamp.truncated || markdownClamp.truncated || childSummary?.truncated || undefined,
        };
    } catch (error) {
        return { id: blockId, missing: true, error: stringifyAgentError(error) };
    }
}

function summarizeAgentCardChildBlocks(value: unknown) {
    const blocks = Array.isArray(value) ? value : [];
    const children = blocks.slice(0, AGENT_CARD_CHILD_MAX_COUNT).map((block: any) => {
        const content = clampAgentBlockContent(
            String(block?.fcontent || block?.content || block?.markdown || ''),
            AGENT_CARD_CHILD_CONTENT_MAX_CHARS,
        );
        const markdown = clampAgentBlockContent(String(block?.markdown || ''), AGENT_CARD_CHILD_CONTENT_MAX_CHARS);
        return {
            id: String(block?.id || ''),
            type: block?.type ? String(block.type) : undefined,
            subType: block?.subtype ? String(block.subtype) : undefined,
            content: content.text,
            markdown: markdown.text || undefined,
            truncated: content.truncated || markdown.truncated || undefined,
        };
    });
    const joined = children
        .map((child) => child.content || child.markdown || '')
        .filter(Boolean)
        .join('\n');
    const childrenText = clampAgentBlockContent(joined, AGENT_CARD_CHILDREN_TEXT_MAX_CHARS);
    const truncated = blocks.length > AGENT_CARD_CHILD_MAX_COUNT ||
        children.some((child) => child.truncated) ||
        childrenText.truncated;

    return {
        childCount: blocks.length,
        children,
        childrenText: childrenText.text,
        truncated,
    };
}

function clampAgentBlockContent(value: string, maxLength = AGENT_BLOCK_CONTENT_MAX_CHARS): { text: string; truncated: boolean } {
    const normalized = String(value || '').trim();
    if (normalized.length <= maxLength) {
        return { text: normalized, truncated: false };
    }
    return {
        text: `${normalized.slice(0, maxLength)}...`,
        truncated: true,
    };
}

function stringifyAgentError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function summarizeAgentBinding(binding: any) {
    return {
        id: String(binding?.id || ''),
        type: String(binding?.type || ''),
        fromId: String(binding?.fromId || ''),
        toId: String(binding?.toId || ''),
        props: binding?.props || {},
    };
}

function buildAgentBasicShape(id: TLShapeId, options: AgentBasicShapeCreateArgs, x: number, y: number, color: any, text: string) {
    const w = finiteNumberInRange(options.w, defaultAgentWidth(options.kind), 1, 4000);
    const h = finiteNumberInRange(options.h, defaultAgentHeight(options.kind), 1, 4000);
    if (options.kind === 'text') {
        return { id, type: 'text', x, y, props: { richText: toRichText(text), color, w, size: 'm', font: 'draw', scale: 1 } };
    }
    if (options.kind === 'note') {
        return { id, type: 'note', x, y, props: { richText: toRichText(text), color, size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle', growY: 0 } };
    }
    if (options.kind === 'geo') {
        return { id, type: 'geo', x, y, props: { w, h, geo: normalizeAgentGeo(options.geo), color, fill: 'none', dash: 'draw', size: 'm', font: 'draw', richText: toRichText(text), align: 'middle', verticalAlign: 'middle', growY: 0 } };
    }
    if (options.kind === 'arrow') {
        return { id, type: 'arrow', x, y, props: { color, start: { x: 0, y: 0 }, end: { x: w, y: h }, richText: toRichText(text), arrowheadStart: 'none', arrowheadEnd: 'arrow' } };
    }
    if (options.kind === 'line') {
        const [start, end] = getIndices(2);
        return {
            id,
            type: 'line',
            x,
            y,
            props: {
                color,
                dash: 'draw',
                size: 'm',
                spline: 'line',
                scale: 1,
                points: {
                    [start]: { id: start, index: start, x: 0, y: 0 },
                    [end]: { id: end, index: end, x: w, y: h },
                },
            },
        };
    }
    if (options.kind === 'frame') {
        return { id, type: 'frame', x, y, props: { w, h, name: clampAgentText(options.name || text || 'Frame', 120) } };
    }
    if (options.kind === 'draw') {
        return {
            id,
            type: 'draw',
            x,
            y,
            props: {
                color,
                fill: 'none',
                dash: 'draw',
                size: 'm',
                isComplete: true,
                isClosed: false,
                isPen: false,
                segments: [{
                    type: 'free',
                    points: [
                        { x: 0, y: 0, z: 0.5 },
                        { x: w * 0.35, y: h * 0.2, z: 0.5 },
                        { x: w * 0.7, y: h * 0.8, z: 0.5 },
                        { x: w, y: h, z: 0.5 },
                    ],
                }],
            },
        };
    }
    if (options.kind === 'highlight') {
        return {
            id,
            type: 'highlight',
            x,
            y,
            props: {
                color,
                size: 'm',
                isComplete: true,
                isPen: false,
                scale: 1,
                segments: [{
                    type: 'free',
                    points: [
                        { x: 0, y: h * 0.5, z: 0.5 },
                        { x: w * 0.33, y: h * 0.45, z: 0.5 },
                        { x: w * 0.66, y: h * 0.55, z: 0.5 },
                        { x: w, y: h * 0.5, z: 0.5 },
                    ],
                }],
            },
        };
    }
    if (options.kind === 'bezier-connector') {
        return { id, type: 'bezier-connector', x: 0, y: 0, props: { start: { x, y }, end: { x: x + w, y: y + h }, color, strokeWidth: 3, strokeStyle: 'solid', richText: toRichText(text), labelPosition: 0.5, font: 'draw', size: 'm', scale: 1 } };
    }
    if (options.kind === 'slide') {
        return { id, type: 'slide', x, y, props: { w, h, color, name: clampAgentText(options.name || text || 'New Slide', 120), blockId: options.blockId, borderStyle: 'dashed' } };
    }
    if (options.kind === 'mind-map') {
        return { id, type: 'mind-map', x, y, props: { w, h, color, rootNode: createMindMapNode(text || '中心主题'), horizontalGap: 50, verticalGap: 20, nodeWidth: 120, nodeHeight: 36, fontSize: 14, lineWidth: 2, direction: options.direction || 'right', theme: options.theme || 'default', blockId: options.blockId, version: 1, refreshNonce: Date.now() } };
    }
    return { id, type: 'js-shape', x, y, props: { w, h, color, script: DEFAULT_SCRIPT, autoRun: false, interactive: false, restrictDom: true, data: JSON.stringify({ createdBy: 'siyuan-agent', note: clampAgentText(text, 500) }) } };
}

function resolveAgentConnectorEndpoints(editor: Editor, options: AgentConnectorCreateArgs) {
    let start = options.start;
    let end = options.end;
    let startShapeId = options.startShapeId as TLShapeId | undefined;
    let endShapeId = options.endShapeId as TLShapeId | undefined;
    let startPortId: string | undefined;
    let endPortId: string | undefined;

    if (startShapeId && endShapeId) {
        if (!editor.getShape(startShapeId)) throw new Error(`Start shape not found: ${startShapeId}`);
        if (!editor.getShape(endShapeId)) throw new Error(`End shape not found: ${endShapeId}`);
        const ports = getBestPortPair(editor, startShapeId, endShapeId);
        startPortId = ports.sourcePortId;
        endPortId = ports.targetPortId;
        start = getPortPagePosition(editor, startShapeId, startPortId) || getAgentShapeCenter(editor, startShapeId);
        end = getPortPagePosition(editor, endShapeId, endPortId) || getAgentShapeCenter(editor, endShapeId);
    }

    if (!start && startShapeId) start = getAgentShapeCenter(editor, startShapeId);
    if (!end && endShapeId) end = getAgentShapeCenter(editor, endShapeId);
    if (!start || !end) throw new Error('connector requires start/end points or startShapeId/endShapeId');

    return {
        start: toPlainAgentPoint(start),
        end: toPlainAgentPoint(end),
        startShapeId,
        endShapeId,
        startPortId,
        endPortId,
    };
}

function toPlainAgentPoint(point: { x: number; y: number }) {
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('connector endpoint must have finite x and y coordinates');
    }
    return { x, y };
}

function buildAgentArrowBindings(arrowId: TLShapeId, endpoints: ReturnType<typeof resolveAgentConnectorEndpoints>) {
    const bindings: any[] = [];
    if (endpoints.startShapeId) {
        bindings.push({
            fromId: arrowId,
            toId: endpoints.startShapeId,
            type: 'arrow',
            props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        });
    }
    if (endpoints.endShapeId) {
        bindings.push({
            fromId: arrowId,
            toId: endpoints.endShapeId,
            type: 'arrow',
            props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        });
    }
    return bindings;
}

function getAgentShapeCenter(editor: Editor, shapeId: TLShapeId) {
    const bounds = editor.getShapePageBounds(shapeId);
    if (bounds) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const shape = editor.getShape(shapeId) as any;
    if (!shape) throw new Error(`Shape not found: ${shapeId}`);
    const w = Number(shape.props?.w) || 300;
    const h = Number(shape.props?.h) || 120;
    return { x: Number(shape.x || 0) + w / 2, y: Number(shape.y || 0) + h / 2 };
}

function finalizeAgentSelection(editor: Editor, focusedId: TLShapeId, options: { select?: boolean; zoom?: boolean }) {
    if (options.select !== false) editor.setSelectedShapes([focusedId]);
    if (options.zoom !== false) {
        try {
            editor.zoomToSelection({ animation: { duration: 300 } });
        } catch (error) {
            console.warn('agent zoomToSelection failed after create/update', error);
        }
    }
}

function isLinkedBlockShape(shape: TLShape) {
    return Boolean((shape as any).props?.blockId && ['card', 'single-block', 'slide', 'mind-map'].includes(shape.type));
}

function clampAgentText(value: string, maxLength: number) {
    return String(value || '').slice(0, maxLength);
}

function plainTextFromRichText(value: unknown): string {
    const parts: string[] = [];
    const visit = (node: any) => {
        if (!node) return;
        if (typeof node === 'string') {
            parts.push(node);
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (typeof node === 'object') {
            if (typeof node.text === 'string') parts.push(node.text);
            if (Array.isArray(node.content)) node.content.forEach(visit);
        }
    };
    visit(value);
    return parts.join('');
}

function defaultAgentText(kind: AgentBasicShapeCreateArgs['kind']) {
    if (kind === 'mind-map') return '中心主题';
    if (kind === 'slide') return 'New Slide';
    if (kind === 'js-shape') return 'Agent-created JS placeholder';
    return '';
}

function defaultAgentWidth(kind: AgentBasicShapeCreateArgs['kind']) {
    if (kind === 'slide') return 720;
    if (kind === 'mind-map') return 800;
    if (kind === 'js-shape') return 320;
    if (kind === 'text') return 240;
    if (kind === 'note') return 220;
    if (kind === 'frame') return 640;
    return 300;
}

function defaultAgentHeight(kind: AgentBasicShapeCreateArgs['kind']) {
    if (kind === 'slide') return 480;
    if (kind === 'mind-map') return 500;
    if (kind === 'js-shape') return 220;
    if (kind === 'text') return 80;
    if (kind === 'note') return 220;
    if (kind === 'frame') return 360;
    return 160;
}

function normalizeAgentGeo(value?: string) {
    const allowed = new Set(['rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'cloud', 'x-box', 'check-box', 'heart']);
    return value && allowed.has(value) ? value : 'rectangle';
}

function buildAgentAlignUpdates(
    boxes: Array<{ shape: TLShape; x: number; y: number; w: number; h: number }>,
    operation: AgentAlignOperation
) {
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.w));
    const top = Math.min(...boxes.map((box) => box.y));
    const bottom = Math.max(...boxes.map((box) => box.y + box.h));
    const centerX = left + (right - left) / 2;
    const centerY = top + (bottom - top) / 2;

    if (operation === 'distribute-x') {
        const sorted = [...boxes].sort((a, b) => a.x - b.x);
        if (sorted.length < 3) return [];
        const totalWidth = sorted.reduce((sum, box) => sum + box.w, 0);
        const gap = (right - left - totalWidth) / (sorted.length - 1);
        let cursor = left;
        return sorted.map((box) => {
            const update = { id: box.shape.id, type: box.shape.type, x: cursor, y: box.shape.y };
            cursor += box.w + gap;
            return update;
        });
    }

    if (operation === 'distribute-y') {
        const sorted = [...boxes].sort((a, b) => a.y - b.y);
        if (sorted.length < 3) return [];
        const totalHeight = sorted.reduce((sum, box) => sum + box.h, 0);
        const gap = (bottom - top - totalHeight) / (sorted.length - 1);
        let cursor = top;
        return sorted.map((box) => {
            const update = { id: box.shape.id, type: box.shape.type, x: box.shape.x, y: cursor };
            cursor += box.h + gap;
            return update;
        });
    }

    return boxes.map((box) => {
        let x = Number(box.shape.x || 0);
        let y = Number(box.shape.y || 0);
        if (operation === 'left') x = left;
        if (operation === 'center-x') x = centerX - box.w / 2;
        if (operation === 'right') x = right - box.w;
        if (operation === 'top') y = top;
        if (operation === 'center-y') y = centerY - box.h / 2;
        if (operation === 'bottom') y = bottom - box.h;
        return { id: box.shape.id, type: box.shape.type, x, y };
    });
}
