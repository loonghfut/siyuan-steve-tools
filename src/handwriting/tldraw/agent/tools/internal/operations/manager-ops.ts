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
import { WhiteboardFileManager } from '../../../../whiteboard-file-manager';
import { createOrUpdateConnectorBinding } from '../../../../BezierConnectorShape';
import { getBestPortPair, getPortPagePosition } from '../../../../BezierConnectorShape/port-utils';
import {
    alignBranchToRootContent,
    canAttachShapeToBranch,
    getBranchRootParent,
    isBranchConnectableShape,
    isShapeInBranchTree,
    layoutBranchChildren,
    repairBranchStructure,
    relayoutBranchesContainingShapes,
} from '../../../../BranchShape/branch-layout';
import type { IBranchShape } from '../../../../BranchShape/branch-shape-types';
import { buildCardCollapseUpdate, getCardCollapsedHeight } from '../../../../CardShape/card-collapse';
import type { ICardShape } from '../../../../CardShape/card-shape-types';
import { invalidateCache } from '../../../../block-html-cache';
import { createMindMapNode } from '../../../../MindMapShape/mind-map-shape-types';
import { DEFAULT_SCRIPT } from '../../../../JsShape/static';
import { buildTldrawLink } from '../../../../utils/link-builder';
import { convertConnectorsToArrow, convertConnectorsToBezier } from '../../../../utils/connector-convert';
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
    AgentBranchSide,
    AgentCardCreateArgs,
    AgentConnectorCreateArgs,
    AgentCreateShapeArgs,
    AgentCreateShapeResult,
    AgentEditableFieldSpec,
    AgentLinkedBlockContent,
    AgentResultMode,
    AgentShapeCommandRequest,
    AgentShapeCommandResult,
    AgentShapeSummary,
    AgentVisualClusterSummary,
    AgentVisualContext,
    AgentVisualContextOptions,
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

type InternalAgentVisualClusterSummary = AgentVisualClusterSummary & {
    _sampleShapes: TLShape[];
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
const AGENT_BOARD_EDIT_NODE_KINDS = new Set(['card', 'single-block', 'text', 'frame', 'note', 'geo', 'slide', 'mind-map', 'js-shape']);
const AGENT_BOARD_EDIT_LAYOUT_STYLES = new Set(['nearSelection', 'rightOf', 'below', 'grid', 'tree', 'mindmap', 'frameAround']);
const AGENT_EDITABLE_COLORS = [
    'black',
    'grey',
    'light-violet',
    'violet',
    'blue',
    'light-blue',
    'yellow',
    'orange',
    'green',
    'light-green',
    'light-red',
    'red',
    'white',
];
const AGENT_CARD_RENDER_MODES = ['inherit', 'static-dom', 'live-protyle'];
const AGENT_CARD_COLLAPSED_ALIGNMENTS = ['left', 'center', 'right'];
const AGENT_BRANCH_LINE_STYLES = ['curve-solid', 'elbow-solid', 'straight-solid', 'curve-dashed', 'frame-floating'];
const AGENT_CONNECTOR_STROKE_STYLES = ['solid', 'dashed', 'flowing'];
const AGENT_MIND_MAP_THEMES = ['default', 'noBorder', 'underline'];
const AGENT_MIND_MAP_DIRECTIONS = ['right', 'left', 'up', 'down'];
const AGENT_SLIDE_BORDER_STYLES = ['solid', 'dashed', 'wavy'];

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

export async function getAgentVisualContext(
    runtime: AgentManagerRuntime,
    options: AgentVisualContextOptions = {}
): Promise<AgentVisualContext> {
    const editor = requireEditor(runtime);
    const allShapes = editor.getCurrentPageShapes();
    const selectedShapeIds = editor.getSelectedShapeIds().map(String);
    const selectedIdSet = new Set(selectedShapeIds);
    const shapeLimit = finiteNumberInRange(options.shapeLimit, 12, 1, 50);
    const clusterLimit = finiteNumberInRange(options.clusterLimit, 6, 0, 20);
    const viewport = getAgentViewportBounds(editor);
    const boundsById = new Map<string, AgentShapeBounds>();

    for (const shape of allShapes) {
        boundsById.set(String(shape.id), getAgentShapeBounds(editor, shape));
    }

    const selectedShapes = selectedShapeIds
        .map((shapeId) => editor.getShape(shapeId as TLShapeId) as TLShape | undefined)
        .filter(Boolean) as TLShape[];
    const selectedShapesLimited = selectedShapes.slice(0, shapeLimit);

    const visibleShapes = viewport
        ? allShapes.filter((shape) => agentBoundsIntersect(boundsById.get(String(shape.id)) || getAgentShapeBounds(editor, shape), viewport))
        : allShapes.slice();

    const visibleShapesSorted = sortAgentContextShapes(visibleShapes, boundsById, selectedIdSet, viewport);
    const visibleShapesLimited = visibleShapesSorted.slice(0, shapeLimit);
    const visibleShapeIds = visibleShapesLimited.map((shape) => String(shape.id));
    const offscreenShapes = viewport
        ? allShapes.filter((shape) => !agentBoundsIntersect(boundsById.get(String(shape.id)) || getAgentShapeBounds(editor, shape), viewport))
        : [];
    const offscreenClusters = options.includeOffscreenClusters === false
        ? []
        : buildAgentSpatialClusters(editor, offscreenShapes, boundsById, selectedIdSet, viewport, clusterLimit, options.includeVisibleShapeDetails !== false);
    const shapesForBlockContent = new Map<string, TLShape>();

    if (options.includeSelectionDetails !== false) {
        for (const shape of selectedShapesLimited) {
            shapesForBlockContent.set(String(shape.id), shape);
        }
    }
    if (options.includeVisibleShapeDetails !== false) {
        for (const shape of visibleShapesLimited) {
            shapesForBlockContent.set(String(shape.id), shape);
        }
    }
    if (options.includeOffscreenClusters !== false) {
        for (const cluster of offscreenClusters) {
            for (const shape of cluster._sampleShapes) {
                shapesForBlockContent.set(String(shape.id), shape);
            }
        }
    }

    const blockContentById = options.includeLinkedBlockContent === false
        ? new Map<string, AgentLinkedBlockContent>()
        : await loadAgentLinkedBlockContent(Array.from(shapesForBlockContent.values()));

    const selectionBounds = combineAgentBounds(selectedShapes.map((shape) => boundsById.get(String(shape.id)) || getAgentShapeBounds(editor, shape)));
    const selectionShapeSummaries = options.includeSelectionDetails === false
        ? undefined
        : selectedShapesLimited.map((shape) => summarizeAgentShape(
            editor,
            shape,
            false,
            getShapeLinkedBlockContent(shape, blockContentById),
        ));
    const visibleShapeSummaries = options.includeVisibleShapeDetails === false
        ? undefined
        : visibleShapesLimited.map((shape) => summarizeAgentShape(
            editor,
            shape,
            false,
            getShapeLinkedBlockContent(shape, blockContentById),
        ));

    const sceneShapeTypeCounts = allShapes.reduce<Record<string, number>>((acc, shape) => {
        const key = String(shape.type || 'unknown');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const svg = options.includeSvg === true
        ? await buildAgentVisualContextSvg(editor, visibleShapesLimited.length ? visibleShapesLimited : selectedShapes.length ? selectedShapes : allShapes)
        : undefined;

    return {
        whiteboardId: runtime.id,
        title: runtime.title,
        generatedAt: new Date().toISOString(),
        viewport: viewport || undefined,
        selection: {
            selectedShapeIds,
            selectedShapeCount: selectedShapeIds.length,
            returnedShapeCount: selectedShapesLimited.length,
            truncated: selectedShapes.length > selectedShapesLimited.length,
            bounds: selectionBounds || undefined,
            shapes: selectionShapeSummaries,
        },
        visible: {
            shapeCount: visibleShapes.length,
            returnedShapeCount: visibleShapesLimited.length,
            truncated: visibleShapes.length > visibleShapesLimited.length,
            shapeIds: visibleShapeIds,
            shapes: visibleShapeSummaries,
        },
        offscreen: {
            shapeCount: offscreenShapes.length,
            clusterCount: offscreenClusters.length,
            truncated: clusterLimit > 0 && offscreenShapes.length > 0 && offscreenClusters.length >= clusterLimit,
            clusters: offscreenClusters.map(({ _sampleShapes: _ignored, ...cluster }) => cluster),
        },
        scene: {
            totalShapeCount: allShapes.length,
            visibleShapeCount: visibleShapes.length,
            offscreenShapeCount: offscreenShapes.length,
            selectedShapeCount: selectedShapeIds.length,
            dominantShapeTypes: summarizeAgentTypeCounts(sceneShapeTypeCounts, 8),
        },
        svg,
    };
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

export async function runAgentShapeCommand(
    runtime: AgentManagerRuntime,
    request: AgentShapeCommandRequest
): Promise<AgentShapeCommandResult> {
    const editor = requireEditor(runtime);
    const intent = request.intent;
    const target = request.target ?? '$selection';
    const errors: string[] = [];
    let saved = false;

    if (intent !== 'readSelectedContent' && intent !== 'inspectEditable' && intent !== 'updateShape') {
        if (intent !== 'createShapes' && intent !== 'connectShapes' && intent !== 'layoutShapes' && intent !== 'focusShapes') {
            return { ok: false, intent, whiteboardId: runtime.id, target, errors: [`unsupported intent: ${String(intent)}`] };
        }
    }

    if (intent === 'createShapes') {
        return executeAgentShapeCommandCreate(runtime, request);
    }
    if (intent === 'connectShapes') {
        return executeAgentShapeCommandConnect(runtime, request);
    }
    if (intent === 'layoutShapes') {
        return executeAgentShapeCommandLayout(runtime, request);
    }
    if (intent === 'focusShapes') {
        return executeAgentShapeCommandFocus(runtime, request);
    }

    let targetShapeIds: string[];
    try {
        targetShapeIds = resolveAgentShapeCommandTarget(editor, target, request.shapeKind, intent);
    } catch (error) {
        return { ok: false, intent, whiteboardId: runtime.id, target, errors: [stringifyAgentError(error)] };
    }

    if (!targetShapeIds.length) {
        return { ok: false, intent, whiteboardId: runtime.id, target, errors: ['target resolved to no shapes'] };
    }

    if (intent === 'readSelectedContent') {
        const details = await getAgentShapeDetails(runtime, {
            shapeIds: targetShapeIds,
            limit: targetShapeIds.length,
            includeBindings: false,
            includeLinkedBlockContent: true,
        });
        const items = details.shapes.map((shape) => shapeSummaryToContentItem(shape));
        return { ok: true, intent, whiteboardId: runtime.id, target, items };
    }

    if (intent === 'inspectEditable') {
        const targetShapes = targetShapeIds
            .map((shapeId) => editor.getShape(shapeId as TLShapeId) as TLShape | undefined)
            .filter(Boolean) as TLShape[];
        const blockContentById = await loadAgentLinkedBlockContent(targetShapes);
        const items = targetShapes.map((shape) => {
            return {
                shape: summarizeAgentShape(editor, shape, false, getShapeLinkedBlockContent(shape, blockContentById)),
                editableFields: describeEditableShape(shape),
            };
        }) as Array<Record<string, unknown>>;
        return { ok: true, intent, whiteboardId: runtime.id, target, items };
    }

    const patch: Record<string, unknown> = request.patch && typeof request.patch === 'object' && !Array.isArray(request.patch)
        ? request.patch
        : {};
    const hasContentMarkdown = typeof request.contentMarkdown === 'string' || typeof patch.contentMarkdown === 'string';
    if (Object.keys(patch).length === 0 && !hasContentMarkdown) {
        return { ok: false, intent, whiteboardId: runtime.id, target, updatedShapeIds: [], errors: ['updateShape requires a non-empty patch object'], saved };
    }
    if (hasContentMarkdown && request.confirmContentUpdate !== true) {
        return {
            ok: false,
            intent,
            whiteboardId: runtime.id,
            target,
            updatedShapeIds: [],
            items: targetShapeIds.map((shapeId) => {
                const shape = editor.getShape(shapeId as TLShapeId) as TLShape | undefined;
                return {
                    shapeId,
                    shapeType: shape?.type,
                    blockId: String((shape as any)?.props?.blockId || ''),
                };
            }),
            errors: ['card content update requires explicit user confirmation: ask the user to confirm, then call again with confirmContentUpdate:true'],
            saved,
        };
    }

    const items: Array<Record<string, unknown>> = [];
    const updatedShapeIds: string[] = [];

    for (const shapeId of targetShapeIds) {
        const shape = editor.getShape(shapeId as TLShapeId) as TLShape | undefined;
        if (!shape) {
            errors.push(`shape not found: ${shapeId}`);
            continue;
        }

        const before = summarizeAgentShape(editor, shape);
        const contentMarkdown = getAgentShapeCommandContentMarkdown(request, patch);
        const contentMode = getAgentShapeCommandContentMode(request, patch);
        const semanticPatch = omitAgentContentPatchFields(patch);
        const changedFields: string[] = [];
        let contentWrite: Record<string, unknown> | undefined;

        if (contentMarkdown !== undefined) {
            if (contentMode !== 'replace') {
                errors.push(`${shapeId}: contentMode must be "replace"`);
            } else if (shape.type !== 'card') {
                errors.push(`${shapeId}: contentMarkdown is only supported for card shapes`);
            } else {
                try {
                    const contentResult = await updateAgentCardLinkedBlockContent(runtime, editor, shape as ICardShape, contentMarkdown);
                    changedFields.push('contentMarkdown');
                    updatedShapeIds.push(...contentResult.refreshedShapeIds);
                    contentWrite = {
                        blockId: contentResult.blockId,
                        blockType: contentResult.blockType,
                        headingLevel: contentResult.headingLevel,
                        refreshedShapeIds: contentResult.refreshedShapeIds,
                    };
                } catch (error) {
                    errors.push(`${shapeId}: ${stringifyAgentError(error)}`);
                }
            }
        }

        if (Object.keys(semanticPatch).length > 0) {
            const updateResult = applySemanticShapePatch(shape, semanticPatch);
            if (updateResult.errors.length) errors.push(...updateResult.errors.map((error) => `${shapeId}: ${error}`));
            if (updateResult.changedFields.length && updateResult.update) {
                editor.updateShape(updateResult.update as any);
                updatedShapeIds.push(String(shape.id));
                changedFields.push(...updateResult.changedFields);
            }
        }

        if (!changedFields.length) {
            items.push({
                shapeId,
                before,
                after: before,
                changedFields: [],
            });
            continue;
        }

        const afterShape = editor.getShape(shape.id) as TLShape | undefined;
        const after = afterShape ? summarizeAgentShape(editor, afterShape) : before;
        const item: Record<string, unknown> = {
            shapeId: String(shape.id),
            before,
            after,
            changedFields: uniqueStrings(changedFields),
        };
        if (contentWrite) item.contentWrite = contentWrite;
        items.push(item);
    }

    const uniqueUpdatedShapeIds = uniqueStrings(updatedShapeIds);
    if (uniqueUpdatedShapeIds.length) {
        if (request.select !== false) editor.setSelectedShapes(uniqueUpdatedShapeIds as TLShapeId[]);
        relayoutUpdatedSemanticBranches(editor, uniqueUpdatedShapeIds);
        if (request.zoom === true) editor.zoomToSelection({ animation: { duration: 300 } });
        if (request.save === true) {
            await runtime.saveData();
            saved = true;
        } else {
            runtime.triggerSave();
        }
    }

    const result: AgentShapeCommandResult = {
        ok: errors.length === 0,
        intent,
        whiteboardId: runtime.id,
        target,
        updatedShapeIds: uniqueUpdatedShapeIds,
        items,
        errors,
        saved,
    };
    if (request.result === 'debug') {
        (result as any).summary = getAgentResultSummary(runtime, 'full');
    }
    return result;
}

function resolveAgentShapeCommandTarget(
    editor: Editor,
    target: unknown,
    shapeKind: string | undefined,
    _intent: AgentShapeCommandRequest['intent']
): string[] {
    const state: AgentBoardEditState = {
        operationId: 'shape-command',
        mode: 'commit',
        resultMode: 'minimal',
        selectedShapeIds: editor.getSelectedShapeIds().map(String),
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
        saveRequested: false,
        saved: false,
        anyMutation: false,
    };
    const ids = resolveBoardEditRefs(editor, state, target ?? '$selection', 'shape command target');
    const kind = stringValue(shapeKind);
    const filtered = kind
        ? ids.filter((id) => editor.getShape(id as TLShapeId)?.type === kind)
        : ids;
    return filtered;
}

function getAgentShapeCommandContentMarkdown(
    request: AgentShapeCommandRequest,
    patch: Record<string, unknown>
): string | undefined {
    if (typeof request.contentMarkdown === 'string') return request.contentMarkdown;
    return typeof patch.contentMarkdown === 'string' ? patch.contentMarkdown : undefined;
}

function getAgentShapeCommandContentMode(
    request: AgentShapeCommandRequest,
    patch: Record<string, unknown>
): string {
    const raw = typeof request.contentMode === 'string'
        ? request.contentMode
        : typeof patch.contentMode === 'string'
            ? patch.contentMode
            : undefined;
    return raw || 'replace';
}

function omitAgentContentPatchFields(patch: Record<string, unknown>): Record<string, unknown> {
    const next = { ...patch };
    delete next.contentMarkdown;
    delete next.contentMode;
    return next;
}

async function executeAgentShapeCommandCreate(
    runtime: AgentManagerRuntime,
    request: AgentShapeCommandRequest
): Promise<AgentShapeCommandResult> {
    const editor = requireEditor(runtime);
    const state = createShapeCommandState(editor);
    const rawNodes = Array.isArray(request.nodes)
        ? request.nodes
        : request.node
            ? [request.node]
            : [];
    if (!rawNodes.length) {
        return { ok: false, intent: request.intent, whiteboardId: runtime.id, target: request.target, errors: ['createShapes requires node or nodes'] };
    }

    try {
        for (let index = 0; index < rawNodes.length; index++) {
            await validateBoardNodeCreate(rawNodes[index], new Set(), `nodes[${index}]`);
        }

        const createdIds: string[] = [];
        const created: Record<string, string[]> = {};
        for (const node of rawNodes) {
            const alias = optionalBoardAlias(node.as);
            const originalBlockId = stringValue(node.blockId);
            const result = await createBoardEditNode(runtime, editor, node);
            const ids = result.createdShapeIds.map(String);
            createdIds.push(...ids);
            if (alias) {
                state.created[alias] = ids;
                created[alias] = ids;
            }
            trackCommittedShapes(state, ids);
            state.counts.createdShapes += ids.length;
            for (const createdNode of result.createdNodes || []) {
                if (!originalBlockId && createdNode.blockId && (createdNode.kind === 'card' || createdNode.kind === 'single-block')) {
                    state.externalCreatedBlockIds.push(createdNode.blockId);
                }
            }
        }

        state.lastShapeIds = createdIds;
        const layout = buildShapeCommandLayoutIntent(request, 'nearSelection');
        if (createdIds.length && layout) {
            const layoutResult = applyBoardEditLayout(editor, state, createdIds, layout);
            applyBoardLayoutResult(state, layoutResult);
        }
        if (request.select !== false && createdIds.length) editor.setSelectedShapes(createdIds as TLShapeId[]);
        if (request.zoom === true && createdIds.length) editor.zoomToSelection({ animation: { duration: 300 } });
        const saved = await persistShapeCommandIfNeeded(runtime, state, request.save);

        return {
            ok: true,
            intent: request.intent,
            whiteboardId: runtime.id,
            target: request.target,
            updatedShapeIds: uniqueStrings([...createdIds, ...state.committedShapeIds]),
            items: [{
                created,
                createdShapeIds: createdIds,
                externalCreatedBlockIds: uniqueStrings(state.externalCreatedBlockIds),
                counts: state.counts,
            }],
            errors: [],
            saved,
        };
    } catch (error) {
        return { ok: false, intent: request.intent, whiteboardId: runtime.id, target: request.target, updatedShapeIds: state.committedShapeIds, errors: [stringifyAgentError(error)], saved: state.saved };
    }
}

async function executeAgentShapeCommandConnect(
    runtime: AgentManagerRuntime,
    request: AgentShapeCommandRequest
): Promise<AgentShapeCommandResult> {
    const editor = requireEditor(runtime);
    const state = createShapeCommandState(editor);
    const selected = state.selectedShapeIds;
    const from = request.from ?? selected[0];
    const to = request.to ?? (selected.length > 2 ? selected.slice(1) : selected[1]);
    if (!from || !to) {
        return { ok: false, intent: request.intent, whiteboardId: runtime.id, target: request.target, errors: ['connectShapes requires from/to or at least two selected shapes'] };
    }

    try {
        await executeBoardConnect(runtime, editor, {
            op: 'connect',
            kind: request.connectionKind || 'relation',
            from,
            to,
            text: request.text,
            color: boardColor(request.color),
            strokeWidth: request.strokeWidth ?? request.lineWidth,
            lineWidth: request.lineWidth ?? request.strokeWidth,
            layout: buildShapeCommandLayoutIntent(request),
        }, state);
        if (request.select !== false && state.lastShapeIds.length) editor.setSelectedShapes(state.lastShapeIds as TLShapeId[]);
        if (request.zoom === true && state.lastShapeIds.length) editor.zoomToSelection({ animation: { duration: 300 } });
        const saved = await persistShapeCommandIfNeeded(runtime, state, request.save);
        return {
            ok: true,
            intent: request.intent,
            whiteboardId: runtime.id,
            target: request.target,
            updatedShapeIds: state.lastShapeIds,
            items: [{ createdShapeIds: state.lastShapeIds, counts: state.counts }],
            errors: [],
            saved,
        };
    } catch (error) {
        return { ok: false, intent: request.intent, whiteboardId: runtime.id, target: request.target, updatedShapeIds: state.committedShapeIds, errors: [stringifyAgentError(error)], saved: state.saved };
    }
}

async function executeAgentShapeCommandLayout(
    runtime: AgentManagerRuntime,
    request: AgentShapeCommandRequest
): Promise<AgentShapeCommandResult> {
    const editor = requireEditor(runtime);
    const state = createShapeCommandState(editor);

    try {
        const targetIds = resolveBoardEditRefs(editor, state, request.target ?? '$selection', 'layoutShapes.target');
        const layout = buildShapeCommandLayoutIntent(request, 'grid') || { style: 'grid' as const };
        const result = applyBoardEditLayout(editor, state, targetIds, layout);
        applyBoardLayoutResult(state, result);
        const affectedIds = uniqueStrings([...result.updatedShapeIds, ...result.createdShapeIds]);
        if (request.select !== false && affectedIds.length) editor.setSelectedShapes(affectedIds as TLShapeId[]);
        if (request.zoom === true && affectedIds.length) editor.zoomToSelection({ animation: { duration: 300 } });
        const saved = await persistShapeCommandIfNeeded(runtime, state, request.save);
        return {
            ok: true,
            intent: request.intent,
            whiteboardId: runtime.id,
            target: request.target ?? '$selection',
            updatedShapeIds: affectedIds,
            items: [{ layout, affectedShapeIds: affectedIds, counts: state.counts }],
            errors: [],
            saved,
        };
    } catch (error) {
        return { ok: false, intent: request.intent, whiteboardId: runtime.id, target: request.target ?? '$selection', updatedShapeIds: state.committedShapeIds, errors: [stringifyAgentError(error)], saved: state.saved };
    }
}

function executeAgentShapeCommandFocus(
    runtime: AgentManagerRuntime,
    request: AgentShapeCommandRequest
): AgentShapeCommandResult {
    const editor = requireEditor(runtime);
    const state = createShapeCommandState(editor);

    try {
        executeBoardFocus(editor, request.target ?? '$selection', request.zoom, state);
        return {
            ok: true,
            intent: request.intent,
            whiteboardId: runtime.id,
            target: request.target ?? '$selection',
            updatedShapeIds: state.focusedShapeIds,
            items: [{ focusedShapeIds: state.focusedShapeIds, selectedShapeIds: state.selectedShapeIds }],
            errors: [],
            saved: false,
        };
    } catch (error) {
        return { ok: false, intent: request.intent, whiteboardId: runtime.id, target: request.target ?? '$selection', errors: [stringifyAgentError(error)], saved: false };
    }
}

function createShapeCommandState(editor: Editor): AgentBoardEditState {
    return {
        operationId: `shape-command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        mode: 'commit',
        resultMode: 'minimal',
        selectedShapeIds: editor.getSelectedShapeIds().map(String),
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
        saveRequested: false,
        saved: false,
        anyMutation: false,
    };
}

function buildShapeCommandLayoutIntent(
    request: AgentShapeCommandRequest,
    defaultStyle?: AgentBoardLayoutStyle
): AgentBoardLayoutIntent | undefined {
    const raw = request.layout && typeof request.layout === 'object' && !Array.isArray(request.layout)
        ? request.layout
        : {};
    const style = normalizeShapeCommandLayoutStyle(request.layoutStyle ?? raw.style ?? defaultStyle);
    if (!style && !defaultStyle && !Object.keys(raw).length) return undefined;
    return {
        ...raw,
        style: style || defaultStyle,
        target: raw.target ?? request.target,
        anchor: raw.anchor,
        side: request.side ?? raw.side,
        columns: request.columns ?? raw.columns,
        gap: request.gap ?? raw.gap,
        horizontalGap: request.horizontalGap ?? raw.horizontalGap,
        verticalGap: request.verticalGap ?? raw.verticalGap,
        x: request.x ?? raw.x,
        y: request.y ?? raw.y,
        w: request.w ?? raw.w,
        h: request.h ?? raw.h,
        name: request.name ?? raw.name,
        color: boardColor(request.color ?? raw.color),
    };
}

function normalizeShapeCommandLayoutStyle(value: unknown): AgentBoardLayoutStyle | undefined {
    const raw = stringValue(value);
    if (!raw) return undefined;
    return AGENT_BOARD_EDIT_LAYOUT_STYLES.has(raw) ? raw as AgentBoardLayoutStyle : undefined;
}

async function persistShapeCommandIfNeeded(runtime: AgentManagerRuntime, state: AgentBoardEditState, save: boolean | undefined): Promise<boolean> {
    if (!state.anyMutation) return false;
    if (save === true) {
        await runtime.saveData();
        state.saved = true;
        return true;
    }
    runtime.triggerSave();
    return false;
}

function shapeSummaryToContentItem(summary: AgentShapeSummary): Record<string, unknown> {
    const props = { ...(summary.props || {}) };
    const content = (props as any).blockContent || null;
    delete (props as any).blockContent;
    return {
        shape: {
            ...summary,
            props,
        },
        content,
    };
}

function describeEditableShape(shape: TLShape): AgentEditableFieldSpec[] {
    const props = ((shape as any).props || {}) as Record<string, unknown>;
    const commonPosition: AgentEditableFieldSpec[] = [
        numberField('x', shape.x, -100000, 100000, 'Page x position.'),
        numberField('y', shape.y, -100000, 100000, 'Page y position.'),
    ];
    const commonColor = enumField('color', props.color, AGENT_EDITABLE_COLORS, 'Nearest supported tldraw color name.');

    if (shape.type === 'card') {
        return [
            ...commonPosition,
            numberField('w', props.w, 1, 4000, 'Card width.'),
            numberField('h', props.h, 1, 4000, 'Card height. Collapse may override this height.'),
            commonColor,
            booleanField('isCollapsed', props.isCollapsed, 'Collapse or expand the card.'),
            booleanField('showMask', props.showMask, 'Show the card mask overlay.'),
            booleanField('isMain', props.isMain, 'Mark the card as a main card.'),
            enumField('renderMode', props.renderMode || 'inherit', AGENT_CARD_RENDER_MODES, 'Card rendering mode.'),
            numberField('collapsedTextSize', props.collapsedTextSize || 21, 25, 76, 'Collapsed card title text size.'),
            enumField('collapsedTextAlign', props.collapsedTextAlign || 'center', AGENT_CARD_COLLAPSED_ALIGNMENTS, 'Collapsed card title alignment.'),
        ];
    }

    if (shape.type === 'single-block') {
        return [
            ...commonPosition,
            numberField('w', props.w, 1, 4000, 'Single block width.'),
            numberField('h', props.h, 1, 4000, 'Single block height.'),
            commonColor,
            booleanField('transparentBackground', props.transparentBackground, 'Use transparent background and hide border.'),
            booleanField('allowBinding', props.allowBinding, 'Allow connectors to bind to this shape.'),
            booleanField('connectOnEnter', props.connectOnEnter, 'Create a connection when using Enter-created follow-up blocks.'),
        ];
    }

    if (shape.type === 'text') {
        return [
            ...commonPosition,
            numberField('w', props.w, 1, 4000, 'Text width.'),
            commonColor,
            stringField('text', getShapePlainText(shape), 'Visible text.'),
        ];
    }

    if (shape.type === 'note') {
        return [
            ...commonPosition,
            commonColor,
            stringField('text', getShapePlainText(shape), 'Visible note text.'),
        ];
    }

    if (shape.type === 'arrow' || shape.type === 'bezier-connector') {
        const fields = [
            ...commonPosition,
            commonColor,
            stringField('text', getShapePlainText(shape), 'Connector label text.'),
        ];
        if (shape.type === 'bezier-connector') {
            fields.push(
                numberField('strokeWidth', props.strokeWidth ?? 3, 1, 16, 'Bezier connector stroke width.'),
                enumField('strokeStyle', props.strokeStyle || 'solid', AGENT_CONNECTOR_STROKE_STYLES, 'Bezier connector stroke style.'),
                numberField('labelPosition', props.labelPosition ?? 0.5, 0, 1, 'Label position along the connector.'),
            );
        }
        return fields;
    }

    if (shape.type === 'branch') {
        return [
            ...commonPosition,
            numberField('w', props.w, 1, 4000, 'Branch bounds width. Usually managed by layout.'),
            numberField('h', props.h, 1, 4000, 'Branch bounds height. Usually managed by layout.'),
            commonColor,
            enumField('lineStyle', props.lineStyle || 'curve-solid', AGENT_BRANCH_LINE_STYLES, 'Branch connector visual style.'),
            numberField('lineWidth', props.lineWidth ?? 3, 1, 24, 'Branch line width.'),
            numberField('horizontalGap', props.horizontalGap ?? 96, 20, 2000, 'Horizontal spacing between root and children.'),
            numberField('verticalGap', props.verticalGap ?? 28, 8, 1000, 'Vertical spacing between children.'),
            numberField('snapDistance', props.snapDistance ?? 160, 40, 2000, 'Branch attachment snap distance.'),
            booleanField('showBackground', props.showBackground, 'Show branch background or floating frame backdrop.'),
        ];
    }

    if (shape.type === 'mind-map') {
        return [
            ...commonPosition,
            numberField('w', props.w, 1, 4000, 'Mind map width.'),
            numberField('h', props.h, 1, 4000, 'Mind map height.'),
            commonColor,
            stringField('text', String((props.rootNode as any)?.text || ''), 'Root node text.'),
            enumField('theme', props.theme || 'default', AGENT_MIND_MAP_THEMES, 'Mind map theme.'),
            enumField('direction', props.direction || 'right', AGENT_MIND_MAP_DIRECTIONS, 'Mind map layout direction.'),
            numberField('fontSize', props.fontSize ?? 14, 8, 96, 'Mind map font size.'),
            numberField('nodeWidth', props.nodeWidth ?? 120, 60, 300, 'Mind map base node width.'),
            numberField('nodeHeight', props.nodeHeight ?? 40, 20, 200, 'Mind map base node height.'),
            numberField('lineWidth', props.lineWidth ?? 2, 1, 24, 'Mind map connector line width.'),
            numberField('horizontalGap', props.horizontalGap ?? 100, 20, 2000, 'Horizontal spacing between mind map nodes.'),
            numberField('verticalGap', props.verticalGap ?? 60, 8, 1000, 'Vertical spacing between mind map nodes.'),
        ];
    }

    if (shape.type === 'slide') {
        return [
            ...commonPosition,
            numberField('w', props.w, 1, 4000, 'Slide width.'),
            numberField('h', props.h, 1, 4000, 'Slide height.'),
            commonColor,
            stringField('name', props.name, 'Slide name.'),
            enumField('borderStyle', props.borderStyle || 'dashed', AGENT_SLIDE_BORDER_STYLES, 'Slide border style.'),
        ];
    }

    if (shape.type === 'js-shape') {
        return [
            ...commonPosition,
            numberField('w', props.w, 1, 4000, 'JS shape width.'),
            numberField('h', props.h, 1, 4000, 'JS shape height.'),
            commonColor,
            booleanField('interactive', props.interactive, 'Allow rendered DOM to receive pointer events.'),
            booleanField('restrictDom', props.restrictDom !== false, 'Restrict script DOM access to the shape container.'),
        ];
    }

    if (shape.type === 'geo' || shape.type === 'frame') {
        const fields = [
            ...commonPosition,
            numberField('w', props.w, 1, 4000, `${shape.type} width.`),
            numberField('h', props.h, 1, 4000, `${shape.type} height.`),
        ];
        if (shape.type !== 'frame') fields.push(commonColor);
        return fields;
    }

    return commonPosition;
}

function applySemanticShapePatch(
    shape: TLShape,
    patch: Record<string, unknown>
): { update?: Record<string, unknown>; changedFields: string[]; errors: string[] } {
    const editableFields = describeEditableShape(shape);
    const editableNames = new Set(editableFields.map((field) => field.name));
    const errors: string[] = [];
    const changedFields: string[] = [];
    const update: Record<string, unknown> = { id: shape.id, type: shape.type };
    let props: Record<string, unknown> = {};
    let hasUpdate = false;
    let collapseRequested = false;

    for (const key of Object.keys(patch)) {
        if (!editableNames.has(key)) {
            errors.push(`field is not editable for ${shape.type}: ${key}`);
            continue;
        }
        const value = patch[key];
        const currentProps = ((shape as any).props || {}) as Record<string, unknown>;

        if (key === 'x' || key === 'y') {
            const next = numberPatchValue(value, key, errors, -100000, 100000, key === 'x' ? shape.x : shape.y);
            if (next === undefined) continue;
            if (next !== (key === 'x' ? shape.x : shape.y)) {
                update[key] = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'isCollapsed') {
            const next = booleanPatchValue(value, key, errors);
            if (next === undefined) continue;
            if (shape.type !== 'card') {
                errors.push('isCollapsed is only supported for card shapes');
                continue;
            }
            props = { ...props, ...buildCardCollapseUpdate(shape as ICardShape, next).props };
            collapseRequested = true;
            changedFields.push(key);
            hasUpdate = true;
            continue;
        }

        if (
            key === 'w' ||
            key === 'h' ||
            key === 'collapsedTextSize' ||
            key === 'strokeWidth' ||
            key === 'labelPosition' ||
            key === 'lineWidth' ||
            key === 'horizontalGap' ||
            key === 'verticalGap' ||
            key === 'snapDistance' ||
            key === 'fontSize' ||
            key === 'nodeWidth' ||
            key === 'nodeHeight'
        ) {
            const field = editableFields.find((item) => item.name === key);
            const next = numberPatchValue(value, key, errors, field?.min ?? 1, field?.max ?? 4000, Number(currentProps[key]) || 0);
            if (next === undefined) continue;
            if (currentProps[key] !== next) {
                props[key] = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'color') {
            const color = normalizeOptionalAgentColor(value);
            if (!color) {
                errors.push('color must be a supported tldraw color name or hex-like value');
                continue;
            }
            if (currentProps.color !== color) {
                props.color = color;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (
            key === 'showMask' ||
            key === 'isMain' ||
            key === 'transparentBackground' ||
            key === 'allowBinding' ||
            key === 'connectOnEnter' ||
            key === 'showBackground' ||
            key === 'interactive' ||
            key === 'restrictDom'
        ) {
            const next = booleanPatchValue(value, key, errors);
            if (next === undefined) continue;
            if (currentProps[key] !== next) {
                props[key] = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'lineStyle') {
            const next = enumPatchValue(value, key, AGENT_BRANCH_LINE_STYLES, errors);
            if (!next) continue;
            if (currentProps.lineStyle !== next) {
                props.lineStyle = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'strokeStyle') {
            const next = enumPatchValue(value, key, AGENT_CONNECTOR_STROKE_STYLES, errors);
            if (!next) continue;
            if (currentProps.strokeStyle !== next) {
                props.strokeStyle = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'theme') {
            const next = enumPatchValue(value, key, AGENT_MIND_MAP_THEMES, errors);
            if (!next) continue;
            if (currentProps.theme !== next) {
                props.theme = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'direction') {
            const next = enumPatchValue(value, key, AGENT_MIND_MAP_DIRECTIONS, errors);
            if (!next) continue;
            if (currentProps.direction !== next) {
                props.direction = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'borderStyle') {
            const next = enumPatchValue(value, key, AGENT_SLIDE_BORDER_STYLES, errors);
            if (!next) continue;
            if (currentProps.borderStyle !== next) {
                props.borderStyle = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'renderMode') {
            const next = enumPatchValue(value, key, AGENT_CARD_RENDER_MODES, errors);
            if (!next) continue;
            if (currentProps.renderMode !== next) {
                props.renderMode = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'collapsedTextAlign') {
            const next = enumPatchValue(value, key, AGENT_CARD_COLLAPSED_ALIGNMENTS, errors);
            if (!next) continue;
            if (currentProps.collapsedTextAlign !== next) {
                props.collapsedTextAlign = next;
                changedFields.push(key);
                hasUpdate = true;
            }
            continue;
        }

        if (key === 'text' || key === 'name') {
            const extraProps = buildAgentTextPropsPatch(shape, {
                text: key === 'text' ? stringPatchValue(value, key, errors) : undefined,
                name: key === 'name' ? stringPatchValue(value, key, errors) : undefined,
            });
            if (Object.keys(extraProps).length) {
                props = { ...props, ...extraProps };
                changedFields.push(key);
                hasUpdate = true;
            }
        }
    }

    if (collapseRequested && typeof patch.h === 'number' && (props as any).isCollapsed === true) {
        props.preCollapseHeight = finiteNumberInRange(patch.h, Number(((shape as any).props || {}).h) || 300, 1, 4000);
        props.h = getCardCollapsedHeight({ ...(shape as ICardShape), props: { ...(shape as ICardShape).props, h: props.preCollapseHeight as number } });
    }

    if (Object.keys(props).length) update.props = props;
    return { update: hasUpdate ? update : undefined, changedFields: uniqueStrings(changedFields), errors };
}

function numberField(name: string, current: unknown, min: number, max: number, description: string): AgentEditableFieldSpec {
    return { name, kind: 'number', current, min, max, writable: true, description };
}

function booleanField(name: string, current: unknown, description: string): AgentEditableFieldSpec {
    return { name, kind: 'boolean', current: Boolean(current), writable: true, description };
}

function enumField(name: string, current: unknown, enumValues: string[], description: string): AgentEditableFieldSpec {
    return { name, kind: name === 'color' ? 'color' : 'enum', current, enumValues, writable: true, description };
}

function stringField(name: string, current: unknown, description: string): AgentEditableFieldSpec {
    return { name, kind: 'string', current: typeof current === 'string' ? current : '', writable: true, description };
}

function numberPatchValue(value: unknown, key: string, errors: string[], min: number, max: number, fallback: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${key} must be a finite number`);
        return undefined;
    }
    return finiteNumberInRange(value, fallback, min, max);
}

function booleanPatchValue(value: unknown, key: string, errors: string[]): boolean | undefined {
    if (typeof value !== 'boolean') {
        errors.push(`${key} must be boolean`);
        return undefined;
    }
    return value;
}

function enumPatchValue(value: unknown, key: string, enumValues: string[], errors: string[]): string | undefined {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!enumValues.includes(raw)) {
        errors.push(`${key} must be one of: ${enumValues.join(', ')}`);
        return undefined;
    }
    return raw;
}

function stringPatchValue(value: unknown, key: string, errors: string[]): string | undefined {
    if (typeof value !== 'string') {
        errors.push(`${key} must be string`);
        return undefined;
    }
    return value;
}

function getShapePlainText(shape: TLShape): string {
    const richText = (shape as any).props?.richText;
    return plainTextFromRichText(richText);
}

function relayoutUpdatedSemanticBranches(editor: Editor, updatedShapeIds: string[]) {
    const branchIds: TLShapeId[] = [];
    for (const shapeId of updatedShapeIds) {
        const shape = editor.getShape(shapeId as TLShapeId) as IBranchShape | undefined;
        if (shape?.type !== 'branch') continue;
        layoutBranchChildren(editor, shape);
        const latest = editor.getShape(shape.id) as IBranchShape | undefined;
        if (latest?.type === 'branch') {
            alignBranchToRootContent(editor, latest);
            branchIds.push(latest.id);
        } else {
            branchIds.push(shape.id);
        }
    }
    if (branchIds.length) relayoutBranchesContainingShapes(editor, branchIds);
}

function createBoardEditState(editor: Editor, request: AgentBoardEditRequest): AgentBoardEditState {
    const currentSelectedShapeIds = editor.getSelectedShapeIds().map(String);
    const selectedShapeIds = request.selection === undefined
        ? currentSelectedShapeIds
        : resolveInitialBoardSelection(editor, request.selection, currentSelectedShapeIds);
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
                    validateBoardEditOptionalLayoutAnchor(editor, operation.layout.anchor, state, plannedAliases, plannedLast, `operations[${index}].layout.anchor`);
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
            if (operation.anchor !== undefined) validateBoardEditOptionalLayoutAnchor(editor, operation.anchor, state, plannedAliases, plannedLast, `operations[${index}].anchor`);
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
    assertBoardEditKeys(node as any, ['as', 'kind', 'x', 'y', 'w', 'h', 'color', 'blockId', 'contentMarkdown', 'text', 'title', 'name', 'geo', 'direction', 'theme', 'isMain', 'isCollapsed', 'showMask'], label);
    const kind = String(node.kind || '');
    if (!AGENT_BOARD_EDIT_NODE_KINDS.has(kind)) {
        throw new Error(`${label}.kind must be card, single-block, text, frame, note, geo, slide, mind-map, or js-shape`);
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
        geo: stringValue(node.geo),
        select: false,
        zoom: false,
        direction: normalizeAgentMindMapDirection(node.direction),
        theme: normalizeAgentMindMapTheme(node.theme),
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
    const touchedIds: string[] = [];
    if ((operation.kind || 'relation') === 'branch') {
        const layout = operation.layout || {};
        for (let index = 0; index < targets.length; index++) {
            const target = targets[index];
            const side = layout.style === 'mindmap' && !layout.side
                ? (index % 2 === 0 ? 'right' as const : 'left' as const)
                : layout.side;
            const result = connectAgentBranchRelation(runtime, {
                startShapeId: from,
                endShapeId: target,
                color: boardColor(operation.color),
                strokeWidth: operation.lineWidth ?? operation.strokeWidth,
                side,
                horizontalGap: layout.horizontalGap,
                verticalGap: layout.verticalGap,
                select: false,
                zoom: false,
            });
            if (Array.isArray(result.createdShapeIds)) {
                createdIds.push(...result.createdShapeIds.map(String));
            }
            touchedIds.push(String(result.branchId));
            state.counts.branches += 1;
        }
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
            touchedIds.push(...result.createdShapeIds);
            state.counts.connectors += 1;
        }
    }

    const resultIds = uniqueStrings([...createdIds, ...touchedIds]);
    if (alias) state.created[alias] = resultIds;
    trackCommittedShapes(state, resultIds);
    state.counts.createdShapes += createdIds.length;
    state.lastShapeIds = resultIds;
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
        ? resolveBoardEditRefsLenient(editor, state, intent.anchor, 'layout.anchor')
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

function resolveInitialBoardSelection(editor: Editor, value: unknown, currentSelectedShapeIds: string[]): string[] {
    if (Array.isArray(value)) {
        return uniqueStrings(value.flatMap((item) => resolveInitialBoardSelection(editor, item, currentSelectedShapeIds)));
    }
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw || raw === '$selection') return currentSelectedShapeIds;
        const selectionMatch = raw.match(/^\$selection\[(\d+)\]$/);
        if (selectionMatch) {
            const id = currentSelectedShapeIds[Number(selectionMatch[1])];
            return id ? [id] : [];
        }
        const blockMatch = raw.match(/^\$block\.(.+)$/);
        if (blockMatch) return findBoardShapesByBlockId(editor, blockMatch[1], 'selection');
        const kindMatch = raw.match(/^\$kind\.([A-Za-z0-9_-]+)$/);
        if (kindMatch) return findBoardShapesByKind(editor, kindMatch[1], 'selection');
        if (raw.includes(',')) return uniqueStrings(raw.split(',').map((item) => item.trim()).filter(Boolean));
        return editor.getShape(raw as TLShapeId) ? [raw] : [];
    }
    if (value && typeof value === 'object') {
        const obj = value as any;
        if (Array.isArray(obj.shapeIds)) {
            return uniqueStrings(obj.shapeIds.flatMap((shapeId: unknown) => resolveInitialBoardSelection(editor, shapeId, currentSelectedShapeIds)));
        }
        if (obj.shapeId) return resolveInitialBoardSelection(editor, obj.shapeId, currentSelectedShapeIds);
        if (obj.blockId) return findBoardShapesByBlockId(editor, String(obj.blockId), 'selection');
        if (obj.kind) return findBoardShapesByKind(editor, String(obj.kind), 'selection');
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

function validateBoardEditOptionalLayoutAnchor(
    editor: Editor,
    value: unknown,
    state: AgentBoardEditState,
    plannedAliases: Set<string>,
    plannedLast: boolean,
    label: string
) {
    const ids = resolveBoardEditRefsLenientForValidation(editor, value, state, plannedAliases, plannedLast, label);
    return ids.length;
}

function resolveBoardEditRefsLenient(editor: Editor, state: AgentBoardEditState, value: unknown, label: string): string[] {
    return resolveBoardEditRefsLenientForValidation(editor, value, state, new Set(Object.keys(state.created)), state.lastShapeIds.length > 0, label)
        .filter((id) => !id.startsWith('$created.'));
}

function resolveBoardEditRefsLenientForValidation(
    editor: Editor,
    value: unknown,
    state: AgentBoardEditState,
    plannedAliases: Set<string>,
    plannedLast: boolean,
    label: string
): string[] {
    try {
        return resolveBoardEditRefsForValidation(editor, value, state, plannedAliases, plannedLast, label);
    } catch (error) {
        if (isMissingSelectionReferenceError(error)) return [];
        throw error;
    }
}

function isMissingSelectionReferenceError(error: unknown): boolean {
    const message = stringifyAgentError(error);
    return message.includes('selection index is out of range') ||
        message.includes('resolved to no shapes') ||
        message.includes('found no shapes of kind') ||
        message.includes('found no shape for block');
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

function normalizeAgentMindMapDirection(value: unknown): AgentBasicShapeCreateArgs['direction'] | undefined {
    const raw = stringValue(value);
    if (raw === 'left' || raw === 'right' || raw === 'up' || raw === 'down') return raw;
    return undefined;
}

function normalizeAgentMindMapTheme(value: unknown): string | undefined {
    const raw = stringValue(value);
    return AGENT_MIND_MAP_THEMES.includes(raw) ? raw : undefined;
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

function getAgentViewportBounds(editor: Editor): AgentShapeBounds | null {
    try {
        const viewport = (editor as any).getViewportPageBounds?.();
        if (!viewport) return null;
        return {
            x: Number(viewport.x || 0),
            y: Number(viewport.y || 0),
            w: Number(viewport.w || 0),
            h: Number(viewport.h || 0),
        };
    } catch {
        return null;
    }
}

function sortAgentContextShapes(
    shapes: TLShape[],
    boundsById: Map<string, AgentShapeBounds>,
    selectedIdSet: Set<string>,
    viewport: AgentShapeBounds | null,
): TLShape[] {
    const viewportCenter = viewport ? {
        x: viewport.x + viewport.w / 2,
        y: viewport.y + viewport.h / 2,
    } : null;

    return shapes.slice().sort((left, right) => {
        const leftId = String(left.id);
        const rightId = String(right.id);
        const leftSelected = selectedIdSet.has(leftId) ? 1 : 0;
        const rightSelected = selectedIdSet.has(rightId) ? 1 : 0;
        if (leftSelected !== rightSelected) return rightSelected - leftSelected;

        const leftBounds = boundsById.get(leftId) || getFallbackShapeBounds(left);
        const rightBounds = boundsById.get(rightId) || getFallbackShapeBounds(right);
        const leftArea = leftBounds.w * leftBounds.h;
        const rightArea = rightBounds.w * rightBounds.h;
        const leftDistance = viewportCenter ? getAgentBoundsDistanceSquared(leftBounds, viewportCenter) : 0;
        const rightDistance = viewportCenter ? getAgentBoundsDistanceSquared(rightBounds, viewportCenter) : 0;
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        if (leftArea !== rightArea) return rightArea - leftArea;
        return leftId.localeCompare(rightId);
    });
}

function buildAgentSpatialClusters(
    editor: Editor,
    shapes: TLShape[],
    boundsById: Map<string, AgentShapeBounds>,
    selectedIdSet: Set<string>,
    viewport: AgentShapeBounds | null,
    clusterLimit: number,
    includeSampleShapes: boolean,
): InternalAgentVisualClusterSummary[] {
    if (!shapes.length || clusterLimit <= 0) return [];

    const clusters: Array<{ shapes: TLShape[]; bounds: AgentShapeBounds }> = [];
    const unvisited = new Set(shapes.map((shape) => String(shape.id)));

    while (unvisited.size) {
        const firstId = Array.from(unvisited)[0];
        const firstShape = shapes.find((shape) => String(shape.id) === firstId);
        if (!firstShape) {
            unvisited.delete(firstId);
            continue;
        }
        unvisited.delete(firstId);

        const clusterShapes: TLShape[] = [firstShape];
        let clusterBounds = boundsById.get(firstId) || getFallbackShapeBounds(firstShape);
        let didGrow = true;

        while (didGrow) {
            didGrow = false;
            for (const shape of shapes) {
                const shapeId = String(shape.id);
                if (!unvisited.has(shapeId)) continue;
                const candidateBounds = boundsById.get(shapeId) || getFallbackShapeBounds(shape);
                if (!agentBoundsClose(clusterBounds, candidateBounds, 220)) continue;
                clusterShapes.push(shape);
                clusterBounds = combineAgentBounds([clusterBounds, candidateBounds]) || clusterBounds;
                unvisited.delete(shapeId);
                didGrow = true;
            }
        }

        clusters.push({ shapes: clusterShapes, bounds: clusterBounds });
    }

    return clusters
        .sort((left, right) => {
            if (left.shapes.length !== right.shapes.length) return right.shapes.length - left.shapes.length;
            return left.bounds.x - right.bounds.x;
        })
        .slice(0, clusterLimit)
        .map((cluster, index) => {
            const sampleShapes = sortAgentContextShapes(cluster.shapes, boundsById, selectedIdSet, viewport).slice(0, 3);
            const typeCounts = cluster.shapes.reduce<Record<string, number>>((acc, shape) => {
                const key = String(shape.type || 'unknown');
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});

            return {
                id: `cluster-${index + 1}`,
                location: viewport && agentBoundsIntersect(cluster.bounds, viewport) ? 'viewport' : 'offscreen',
                direction: viewport ? describeAgentBoundsDirection(cluster.bounds, viewport) : undefined,
                shapeCount: cluster.shapes.length,
                selectedShapeCount: cluster.shapes.filter((shape) => selectedIdSet.has(String(shape.id))).length,
                bounds: cluster.bounds,
                shapeTypeCounts: summarizeAgentTypeCounts(typeCounts, 6),
                sampleShapeIds: sampleShapes.map((shape) => String(shape.id)),
                sampleShapes: includeSampleShapes
                    ? sampleShapes.map((shape) => summarizeAgentShape(editor, shape))
                    : undefined,
                _sampleShapes: sampleShapes,
            };
        });
}

function combineAgentBounds(boundsList: Array<AgentShapeBounds | null | undefined>): AgentShapeBounds | null {
    const validBounds = boundsList.filter(Boolean) as AgentShapeBounds[];
    if (!validBounds.length) return null;

    let minX = validBounds[0].x;
    let minY = validBounds[0].y;
    let maxX = validBounds[0].x + validBounds[0].w;
    let maxY = validBounds[0].y + validBounds[0].h;

    for (const bounds of validBounds.slice(1)) {
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.w);
        maxY = Math.max(maxY, bounds.y + bounds.h);
    }

    return {
        x: minX,
        y: minY,
        w: Math.max(0, maxX - minX),
        h: Math.max(0, maxY - minY),
    };
}

function agentBoundsIntersect(left: AgentShapeBounds, right: AgentShapeBounds): boolean {
    return !(
        left.x + left.w < right.x ||
        right.x + right.w < left.x ||
        left.y + left.h < right.y ||
        right.y + right.h < left.y
    );
}

function agentBoundsClose(left: AgentShapeBounds, right: AgentShapeBounds, padding: number): boolean {
    const expanded = {
        x: left.x - padding,
        y: left.y - padding,
        w: left.w + padding * 2,
        h: left.h + padding * 2,
    };
    return agentBoundsIntersect(expanded, right);
}

function getAgentBoundsDistanceSquared(bounds: AgentShapeBounds, point: { x: number; y: number }) {
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;
    const dx = centerX - point.x;
    const dy = centerY - point.y;
    return dx * dx + dy * dy;
}

function describeAgentBoundsDirection(bounds: AgentShapeBounds, viewport: AgentShapeBounds): string {
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;
    const viewportCenterX = viewport.x + viewport.w / 2;
    const viewportCenterY = viewport.y + viewport.h / 2;
    const horizontal = centerX < viewport.x ? 'left' : centerX > viewport.x + viewport.w ? 'right' : '';
    const vertical = centerY < viewport.y ? 'above' : centerY > viewport.y + viewport.h ? 'below' : '';

    if (horizontal && vertical) return `${vertical}-${horizontal}`;
    if (horizontal) return horizontal;
    if (vertical) return vertical;

    if (centerX < viewportCenterX) return 'left';
    if (centerX > viewportCenterX) return 'right';
    if (centerY < viewportCenterY) return 'above';
    if (centerY > viewportCenterY) return 'below';
    return 'overlapping';
}

function summarizeAgentTypeCounts(counts: Record<string, number>, limit: number): Record<string, number> {
    return Object.fromEntries(Object.entries(counts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit));
}

async function buildAgentVisualContextSvg(editor: Editor, shapes: TLShape[]) {
    try {
        const svgResult = await (editor as any).getSvgString?.(shapes, { background: true });
        if (!svgResult?.svg) return undefined;
        const maxLength = 120000;
        const svg = String(svgResult.svg);
        return {
            shapeCount: shapes.length,
            truncated: svg.length > maxLength,
            svg: svg.length > maxLength ? `${svg.slice(0, maxLength)}...` : svg,
        };
    } catch (error) {
        return {
            shapeCount: shapes.length,
            truncated: true,
            svg: `<!-- failed to export svg: ${stringifyAgentError(error)} -->`,
        };
    }
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

type AgentBranchRelationOptions = AgentConnectorCreateArgs & {
    side?: AgentBranchSide;
    horizontalGap?: number;
    verticalGap?: number;
}

function connectAgentBranchRelation(runtime: AgentManagerRuntime, options: AgentBranchRelationOptions) {
    const editor = requireEditor(runtime);
    if (!options.startShapeId || !options.endShapeId) {
        throw new Error('branch connector requires startShapeId/endShapeId or shapeIds [root, child]');
    }

    const rootShape = editor.getShape(options.startShapeId as TLShapeId) as TLShape | undefined;
    if (!rootShape) throw new Error(`Root shape not found: ${options.startShapeId}`);

    const existingBranch = rootShape.type === 'branch'
        ? rootShape as IBranchShape
        : getBranchRootParent(editor, rootShape.id);

    const rawChildShape = editor.getShape(options.endShapeId as TLShapeId) as TLShape | undefined;
    if (!rawChildShape) throw new Error(`Child shape not found: ${options.endShapeId}`);
    const childShape = resolveAgentBranchChildShape(editor, existingBranch, rootShape, rawChildShape);
    if (!isBranchConnectableShape(childShape)) {
        throw new Error(`Branch child shape must be card, single-block, or branch: ${options.endShapeId}`);
    }

    if (!existingBranch) {
        if (rootShape.type !== 'card' && rootShape.type !== 'single-block') {
            throw new Error(`Branch root shape must be card or single-block: ${options.startShapeId}`);
        }
        const result = createAgentBusinessShape(editor, {
            kind: 'branch',
            rootShapeId: options.startShapeId,
            children: [{ shapeId: String(childShape.id), side: options.side }],
            direction: options.side,
            horizontalGap: options.horizontalGap,
            verticalGap: options.verticalGap,
            color: options.color,
            lineWidth: options.strokeWidth,
            select: options.select,
            zoom: options.zoom,
            resultMode: options.resultMode,
        });
        syncAgentCreatedBlockAttrs(runtime, result);
        repairBranchStructure(editor);
        runtime.triggerSave();
        return {
            ...result,
            ...buildCreatedBoundsResult(editor, result.createdShapeIds),
            summary: getAgentResultSummary(runtime, options.resultMode),
        };
    }

    if (existingBranch.id === childShape.id) {
        throw new Error('Cannot connect a branch to itself');
    }
    if (existingBranch.props.rootShapeId === childShape.id) {
        throw new Error('Cannot add the branch root shape as its own child');
    }
    if (!canAttachShapeToBranch(editor, existingBranch, childShape)) {
        throw new Error(`Cannot attach branch ${String(childShape.id)} to ${String(existingBranch.id)} because it would create a branch cycle`);
    }
    if (childShape.type === 'branch' && existingBranch.props.rootShapeId) {
        if (isShapeInBranchTree(editor, childShape.id, existingBranch.props.rootShapeId)) {
            throw new Error('Cannot attach a branch that already contains the target branch root shape');
        }
    }

    const childId = childShape.id as string;
    const promotedRootChildId = childShape.id !== rawChildShape.id ? String(rawChildShape.id) : undefined;
    const side = inferAgentBranchSide(editor, existingBranch, childShape, options.side);
    const currentLeftIds = existingBranch.props.leftChildIds || [];
    const currentRightIds = existingBranch.props.rightChildIds;
    const nextLeftIds = currentLeftIds.filter((id) => id !== childId && id !== promotedRootChildId);
    const nextRightIds = currentRightIds.filter((id) => id !== childId && id !== promotedRootChildId);
    if (side === 'left') nextLeftIds.push(childId);
    else nextRightIds.push(childId);

    const didChange =
        !sameStringArray(currentLeftIds, nextLeftIds) ||
        !sameStringArray(currentRightIds, nextRightIds);

    if (didChange) {
        editor.updateShape<IBranchShape>({
            id: existingBranch.id,
            type: 'branch',
            props: {
                ...existingBranch.props,
                leftChildIds: nextLeftIds,
                rightChildIds: nextRightIds,
            },
        });
    }

    const detachedBranchIds = detachAgentBranchChildFromOtherBranches(editor, childId, existingBranch.id);
    if (promotedRootChildId) {
        detachedBranchIds.push(...detachAgentBranchChildFromOtherBranches(editor, promotedRootChildId, existingBranch.id));
    }
    const latestBranch = editor.getShape<IBranchShape>(existingBranch.id);
    if (latestBranch?.type === 'branch') {
        layoutBranchChildren(editor, latestBranch);
        relayoutBranchesContainingShapes(editor, [latestBranch.id, childShape.id, ...detachedBranchIds]);
    }
    repairBranchStructure(editor);

    finalizeAgentSelection(editor, existingBranch.id, options);
    runtime.triggerSave();

    const selectedShapeIds = options.select === false ? [] : [String(existingBranch.id)];
    const finalBranch = editor.getShape<IBranchShape>(existingBranch.id) || existingBranch;
    return {
        createdShapeIds: [],
        updatedShapeIds: [String(existingBranch.id)],
        selectedShapeIds,
        focusedShapeId: String(existingBranch.id),
        branchId: String(existingBranch.id),
        rootShapeId: finalBranch.props.rootShapeId,
        leftChildIds: finalBranch.props.leftChildIds || [],
        rightChildIds: finalBranch.props.rightChildIds,
        focusedShapeBounds: getAgentShapeBoundsById(editor, existingBranch.id),
        summary: getAgentResultSummary(runtime, options.resultMode),
    };
}

function resolveAgentBranchChildShape(
    editor: Editor,
    targetBranch: IBranchShape | null,
    rootShape: TLShape,
    rawChildShape: TLShape
): TLShape {
    if (!isBranchConnectableShape(rawChildShape)) return rawChildShape;

    const childRootBranch =
        rawChildShape.type === 'card' || rawChildShape.type === 'single-block'
            ? getBranchRootParent(editor, rawChildShape.id)
            : null;
    const childShape = childRootBranch || rawChildShape;

    if (childShape.type === 'branch') {
        if (isShapeInBranchTree(editor, childShape.id, rootShape.id)) {
            throw new Error('Cannot attach a branch that already contains the requested root shape');
        }
        if (targetBranch && !canAttachShapeToBranch(editor, targetBranch, childShape)) {
            throw new Error(`Cannot attach branch ${String(childShape.id)} to ${String(targetBranch.id)} because it would create a branch cycle`);
        }
    }

    return childShape;
}

function detachAgentBranchChildFromOtherBranches(editor: Editor, childId: string, targetBranchId: TLShapeId) {
    const detachedBranchIds: TLShapeId[] = [];
    for (const candidate of editor.getCurrentPageShapes()) {
        if (candidate.type !== 'branch' || candidate.id === targetBranchId) continue;
        const branch = candidate as IBranchShape;
        const nextLeftIds = (branch.props.leftChildIds || []).filter((id) => id !== childId);
        const nextRightIds = branch.props.rightChildIds.filter((id) => id !== childId);
        const changed =
            !sameStringArray(nextLeftIds, branch.props.leftChildIds || []) ||
            !sameStringArray(nextRightIds, branch.props.rightChildIds);
        if (!changed) continue;

        editor.updateShape<IBranchShape>({
            id: branch.id,
            type: 'branch',
            props: {
                ...branch.props,
                leftChildIds: nextLeftIds,
                rightChildIds: nextRightIds,
            },
        });
        const latest = editor.getShape<IBranchShape>(branch.id);
        if (latest?.type === 'branch') layoutBranchChildren(editor, latest);
        detachedBranchIds.push(branch.id);
    }
    return detachedBranchIds;
}

function inferAgentBranchSide(
    editor: Editor,
    branch: IBranchShape,
    child: TLShape,
    explicitSide?: AgentBranchSide
): AgentBranchSide {
    if (explicitSide) return explicitSide;
    const branchRootX = branch.x + (branch.props.rootX ?? branch.props.w / 2);
    const childBounds = getAgentShapeBounds(editor, child);
    return childBounds.x + childBounds.w / 2 < branchRootX ? 'left' : 'right';
}

function sameStringArray(a: string[], b: string[]) {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function createAgentConnector(runtime: AgentManagerRuntime, options: AgentConnectorCreateArgs) {
    if (options.kind === 'branch') {
        if (!options.startShapeId || !options.endShapeId) {
            throw new Error('branch connector requires startShapeId/endShapeId or shapeIds [root, child]');
        }
        return connectAgentBranchRelation(runtime, options);
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
    confirmLinkedBlockShapes?: boolean;
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
        if (isLinkedBlockShape(shape) && !(options.allowLinkedBlockShapes === true && options.confirmLinkedBlockShapes === true)) {
            blocked.push({ shapeId, reason: 'linked SiYuan block shape requires explicit user intent: pass allowLinkedBlockShapes=true and confirmLinkedBlockShapes=true' });
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
    if (blockId) {
        return {
            ...options,
            blockId,
            contentMarkdown: undefined,
            isMain: options.isMain ?? await inferAgentCardIsMainFromBlock(blockId),
        } as T;
    }

    const createdBlockId = await createAgentCardBlockForContent(runtime, {
        title: options.title,
        contentMarkdown,
    });
    return { ...options, blockId: createdBlockId, contentMarkdown: undefined } as T;
}

async function inferAgentCardIsMainFromBlock(blockId: string): Promise<boolean | undefined> {
    if (!SIYUAN_BLOCK_ID_RE.test(blockId)) return undefined;
    const block = await api.getBlockByID(blockId).catch(() => null);
    const type = String((block as any)?.type || '');
    if (type === 'd') return true;
    if (type === 'h') return false;
    return undefined;
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
    const createdBlockId = extractFirstOperationId(appendResult) || blockId;
    await waitForAgentCreatedSiyuanBlock(createdBlockId, 'p');
    return createdBlockId;
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
    // appendBlock resolves before the block SQL index is always readable. The
    // card shape immediately queries that index during its first render, so do
    // not create the binding until the heading can actually be retrieved.
    await waitForAgentCreatedSiyuanBlock(appendedBlockId, 'h');
    if (content.bodyMarkdown) {
        await api.insertBlock('markdown', content.bodyMarkdown, undefined, appendedBlockId);
    }
    return appendedBlockId;
}

const AGENT_CREATED_BLOCK_READY_TIMEOUT_MS = 5_000;
const AGENT_CREATED_BLOCK_INITIAL_RETRY_MS = 50;
const AGENT_CREATED_BLOCK_MAX_RETRY_MS = 400;

/**
 * SiYuan's block-write endpoint can complete before its SQL index exposes the
 * new block. Agent-created card and single-block shapes read the index as soon
 * as they mount, so wait for that read path instead of relying on the write
 * response alone.
 */
async function waitForAgentCreatedSiyuanBlock(blockId: string, expectedType: 'h' | 'p'): Promise<void> {
    const deadline = Date.now() + AGENT_CREATED_BLOCK_READY_TIMEOUT_MS;
    let retryDelay = AGENT_CREATED_BLOCK_INITIAL_RETRY_MS;
    let lastObservedType = '';

    while (Date.now() < deadline) {
        try {
            const block = await api.getBlockByID(blockId);
            const type = String((block as any)?.type || '');
            if (type === expectedType) return;
            lastObservedType = type || 'not found';
        } catch (error) {
            console.debug('agent-created SiYuan block is not queryable yet', { blockId, error });
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await delay(Math.min(retryDelay, remaining));
        retryDelay = Math.min(retryDelay * 2, AGENT_CREATED_BLOCK_MAX_RETRY_MS);
    }

    throw new Error(
        `New ${expectedType === 'h' ? 'card' : 'single-block'} block was not ready after ${AGENT_CREATED_BLOCK_READY_TIMEOUT_MS}ms` +
        (lastObservedType ? ` (last observed: ${lastObservedType})` : '')
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

type AgentCardLinkedContentUpdateResult = {
    blockId: string;
    blockType: string;
    headingLevel?: number;
    refreshedShapeIds: string[];
};

async function updateAgentCardLinkedBlockContent(
    runtime: AgentManagerRuntime,
    editor: Editor,
    shape: ICardShape,
    contentMarkdown: string,
): Promise<AgentCardLinkedContentUpdateResult> {
    const blockId = String(shape.props.blockId || '').trim();
    if (!SIYUAN_BLOCK_ID_RE.test(blockId)) {
        throw new Error('card content update requires a valid linked blockId');
    }

    const block = await api.getBlockByID(blockId);
    if (!block) throw new Error(`card linked block not found: ${blockId}`);

    const blockType = String((block as any).type || '');
    if (blockType !== 'd' && blockType !== 'h') {
        throw new Error(`card linked block must be a document or heading block; got type "${blockType || 'unknown'}"`);
    }

    if (blockType === 'h') {
        const headingLevel = getAgentHeadingLevel(block);
        const normalized = normalizeAgentExistingHeadingCardContent(contentMarkdown, block, headingLevel);
        await replaceAgentLinkedBlockChildren(blockId);
        await api.updateBlock('markdown', `${'#'.repeat(headingLevel)} ${normalized.title}`, blockId);
        await syncAgentCardBlockAttrs(runtime, blockId, shape.id);
        if (normalized.bodyMarkdown) {
            await api.insertBlock('markdown', normalized.bodyMarkdown, undefined, blockId);
        }
        return {
            blockId,
            blockType,
            headingLevel,
            refreshedShapeIds: refreshAgentLinkedCardShapes(editor, blockId),
        };
    }

    const bodyMarkdown = normalizeMarkdownHeadingLevelsForCardBody(String(contentMarkdown || '').trim(), 0);
    await replaceAgentLinkedBlockChildren(blockId);
    await syncAgentCardBlockAttrs(runtime, blockId, shape.id);
    if (bodyMarkdown) {
        await api.appendBlock('markdown', bodyMarkdown, blockId);
    }
    return {
        blockId,
        blockType,
        refreshedShapeIds: refreshAgentLinkedCardShapes(editor, blockId),
    };
}

function normalizeAgentExistingHeadingCardContent(
    contentMarkdown: string,
    block: unknown,
    headingLevel: number,
) {
    const rawContent = String(contentMarkdown || '').trim();
    const leadingHeading = parseLeadingMarkdownHeading(rawContent);
    const fallbackTitle = getAgentExistingBlockTitle(block) || renderAgentCardTitle('Untitled');
    const title = leadingHeading?.text || fallbackTitle;
    const rawBody = leadingHeading
        ? rawContent.slice(leadingHeading.raw.length).trimStart()
        : rawContent;
    return {
        title,
        bodyMarkdown: normalizeMarkdownHeadingLevelsForCardBody(rawBody, headingLevel),
    };
}

function normalizeMarkdownHeadingLevelsForCardBody(markdown: string, parentHeadingLevel: number): string {
    const raw = String(markdown || '').trim();
    if (!raw || parentHeadingLevel <= 0) return raw;

    const headingMatches = Array.from(raw.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?$/gm));
    if (!headingMatches.length) return raw;
    if (parentHeadingLevel >= 6) return convertMarkdownHeadingsToBoldParagraphs(raw);

    const minHeadingLevel = Math.min(...headingMatches.map((match) => match[1].length));
    return raw.replace(/^(#{1,6})[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?$/gm, (_line, hashes: string, text: string) => {
        const targetLevel = parentHeadingLevel + 1 + (hashes.length - minHeadingLevel);
        const cleanText = String(text || '').trim();
        if (targetLevel > 6) return `**${cleanText}**`;
        return `${'#'.repeat(targetLevel)} ${cleanText}`;
    });
}

function convertMarkdownHeadingsToBoldParagraphs(markdown: string): string {
    return String(markdown || '').replace(/^(#{1,6})[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?$/gm, (_line, _hashes: string, text: string) => {
        return `**${String(text || '').trim()}**`;
    }).trim();
}

function getAgentHeadingLevel(block: unknown): number {
    const subtype = String((block as any)?.subtype || (block as any)?.subType || '').toLowerCase();
    const subtypeMatch = subtype.match(/h([1-6])/);
    if (subtypeMatch) return Number(subtypeMatch[1]);

    const markdown = String((block as any)?.markdown || '');
    const markdownHeading = parseLeadingMarkdownHeading(markdown);
    if (markdownHeading) return markdownHeading.level;

    return 6;
}

function getAgentExistingBlockTitle(block: unknown): string {
    return String(
        (block as any)?.fcontent ||
        (block as any)?.content ||
        (block as any)?.markdown ||
        ''
    ).replace(/^#{1,6}\s+/, '').trim();
}

async function replaceAgentLinkedBlockChildren(blockId: string): Promise<void> {
    const children = await api.getChildBlocks(blockId).catch(() => []);
    for (const child of children || []) {
        const id = String((child as any)?.id || '').trim();
        if (id && id !== blockId) {
            await api.deleteBlock(id);
        }
    }
}

async function syncAgentCardBlockAttrs(runtime: AgentManagerRuntime, blockId: string, shapeId: TLShapeId): Promise<void> {
    const attrs = await api.getBlockAttrs(blockId).catch(() => ({}));
    const link = String((attrs as any)?.['custom-tldraw-link'] || '') ||
        buildTldrawLink(runtime.id, blockId, runtime.title, shapeId);
    await api.setBlockAttrs(blockId, {
        'custom-st-tldraw': '1',
        'custom-tldraw-link': link,
    });
}

function refreshAgentLinkedCardShapes(editor: Editor, blockId: string): string[] {
    invalidateCache(blockId);
    const nonce = Date.now();
    const updates = editor.getCurrentPageShapes()
        .filter((candidate) => candidate.type === 'card' && String((candidate as ICardShape).props?.blockId || '') === blockId)
        .map((candidate) => ({
            id: candidate.id,
            type: candidate.type,
            props: {
                refreshNonce: nonce,
            },
        }));
    if (updates.length) editor.updateShapes(updates as any);
    return updates.map((update) => String(update.id));
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
    for (const key of [
        'w',
        'h',
        'color',
        'geo',
        'name',
        'text',
        'isMain',
        'isCollapsed',
        'showMask',
        'renderMode',
        'collapsedTextSize',
        'collapsedTextAlign',
        'rootShapeId',
        'leftChildIds',
        'rightChildIds',
        'transparentBackground',
        'allowBinding',
        'connectOnEnter',
        'lineStyle',
        'lineWidth',
        'horizontalGap',
        'verticalGap',
        'snapDistance',
        'showBackground',
        'strokeWidth',
        'strokeStyle',
        'labelPosition',
        'theme',
        'direction',
        'nodeWidth',
        'nodeHeight',
        'fontSize',
        'borderStyle',
        'interactive',
        'restrictDom',
    ]) {
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
    if (!['card', 'single-block', 'slide', 'mind-map'].includes(shape.type)) return false;
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
        return { id, type: 'mind-map', x, y, props: { w, h, color, rootNode: createMindMapNode(text || '涓績涓婚'), horizontalGap: 50, verticalGap: 20, nodeWidth: 120, nodeHeight: 36, fontSize: 14, lineWidth: 2, direction: options.direction || 'right', theme: options.theme || 'default', blockId: options.blockId, version: 1, refreshNonce: Date.now() } };
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
    if (kind === 'mind-map') return '涓績涓婚';
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
