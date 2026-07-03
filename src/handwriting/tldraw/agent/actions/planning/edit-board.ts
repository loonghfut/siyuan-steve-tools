import { getFocusedInstanceId, getInstance } from '../../../tldraw-instance-manager';
import { assertKnownArgs, booleanArg, stringArg } from '../../core/args';
import type { AgentBoardEditMode, AgentBoardEditRequest, AgentBoardEditResultMode } from '../../core/types';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createEditBoardAction(): AgentActionDefinition {
    return {
        name: 'tldraw_edit_board',
        description: 'Primary STtools tldraw write tool. Use this for every whiteboard edit. Omit whiteboardId to edit the focused whiteboard. Required: operations array. Normal call: {operations:[{op:"createNodes",nodes:[{as:"n1",kind:"single-block",text:"..."}],layout:{style:"nearSelection"}},{op:"focus",target:"$last"}],save:true}. Ops: createNodes, connect, layout, updateNodes, focus, save. Node kinds: card, single-block, text, frame. References: "$selection", "$selection[0]", "$created.alias", "$last", "$block.<blockId>", "$kind.<shapeType>". Layout styles: nearSelection, rightOf, below, grid, tree, mindmap, frameAround. Branch template: createNodes children, then connect kind:"branch" from "$selection[0]" to "$created.alias" refs. Relation template: connect kind:"relation" from one ref to one or more refs. Use mode:"preview" for large/uncertain edits; use result:"debug" only after errors.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const normalizedArgs = normalizeEditBoardArgs(args);
            try {
                assertKnownArgs(normalizedArgs, ['whiteboardId', 'id', 'rootId', 'goal', 'mode', 'operations', 'selection', 'result', 'save'], 'tldraw_edit_board');
            } catch (error) {
                return { error: stringifyError(error) };
            }

            const whiteboardId = stringArg(normalizedArgs.whiteboardId || normalizedArgs.id || normalizedArgs.rootId) || getFocusedInstanceId();
            if (!whiteboardId) {
                return { error: 'No focused whiteboard. Focus/open a whiteboard, or pass whiteboardId.' };
            }

            const instance = getInstance(whiteboardId);
            if (!instance) {
                return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };
            }

            try {
                const request: AgentBoardEditRequest = {
                    whiteboardId,
                    goal: stringArg(normalizedArgs.goal),
                    mode: boardEditModeArg(normalizedArgs.mode),
                    operations: Array.isArray(normalizedArgs.operations) ? normalizedArgs.operations as AgentBoardEditRequest['operations'] : undefined,
                    selection: normalizedArgs.selection as AgentBoardEditRequest['selection'],
                    result: boardEditResultArg(normalizedArgs.result),
                    save: booleanArg(normalizedArgs.save),
                };
                return jsonResult(await instance.editAgentBoard(request));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}

function normalizeEditBoardArgs(args: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...(args || {}) };
    normalizeTopLevelAliases(normalized);

    if (!Array.isArray(normalized.operations)) {
        const operations = firstArray(normalized.operations, normalized.operation, normalized.ops, normalized.actions, normalized.steps, normalized.plan, normalized.action);
        if (operations) normalized.operations = operations;
    }

    if (Array.isArray(normalized.operations)) {
        normalized.operations = normalized.operations.map(normalizeEditBoardOperation);
    }

    delete normalized.operation;
    delete normalized.ops;
    delete normalized.actions;
    delete normalized.steps;
    delete normalized.plan;
    delete normalized.action;
    delete normalized.whiteboard_id;
    delete normalized.root_id;
    delete normalized.resultMode;
    delete normalized.result_mode;
    delete normalized.dryRun;
    delete normalized.dry_run;
    pruneUndefinedProperties(normalized);
    return normalized;
}

function normalizeTopLevelAliases(args: Record<string, unknown>) {
    if (args.whiteboardId === undefined) args.whiteboardId = args.whiteboard_id ?? args.root_id;
    if (args.rootId === undefined) args.rootId = args.root_id;
    if (args.result === undefined) args.result = args.resultMode ?? args.result_mode;
    if (args.mode === undefined && (args.dryRun === true || args.dry_run === true)) args.mode = 'preview';
    args.save = normalizeBoolean(args.save);
}

function normalizeEditBoardOperation(operation: unknown): unknown {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return operation;
    const normalized = { ...(operation as Record<string, unknown>) };
    normalizeOperationAliases(normalized);
    normalized.op = normalizeEditBoardOp(normalized.op);
    normalizeNumericFields(normalized, ['x', 'y', 'w', 'h', 'columns', 'gap', 'horizontalGap', 'verticalGap', 'strokeWidth', 'lineWidth']);
    normalizeBooleanFields(normalized, ['save', 'zoom', 'select', 'isCollapsed', 'isMain', 'showMask']);
    normalizeTargetAliases(normalized);
    normalizeConnectorAliases(normalized);
    normalizeLayoutAliases(normalized);

    if (normalized.op === 'createNodes' && !Array.isArray(normalized.nodes)) {
        const node = firstArray(normalized.nodes, normalized.node, normalized.item, normalized.items, normalized.shape, normalized.shapes);
        if (node) normalized.nodes = node;
    }
    if (Array.isArray(normalized.nodes)) {
        normalized.nodes = normalized.nodes.map((node) => normalizeEditBoardNode(node));
    }
    if (normalized.op === 'updateNodes' && !Array.isArray(normalized.patches) && Array.isArray(normalized.updates)) {
        normalized.patches = normalized.updates;
    }
    if (Array.isArray(normalized.patches)) {
        normalized.patches = normalized.patches.map(normalizeEditBoardPatch);
    }
    if (normalized.layout) {
        normalized.layout = normalizeEditBoardNestedObject(normalized.layout, ['x', 'y', 'w', 'h', 'columns', 'gap', 'horizontalGap', 'verticalGap']);
        normalizeLayoutAliases(normalized.layout as Record<string, unknown>);
    }

    delete normalized.node;
    delete normalized.item;
    delete normalized.items;
    delete normalized.shape;
    delete normalized.shapes;
    delete normalized.updates;
    delete normalized.layoutStyle;
    delete normalized.layout_style;
    delete normalized.operation;
    delete normalized.action;
    delete normalized.type;
    pruneUndefinedProperties(normalized);
    return normalized;
}

function normalizeOperationAliases(operation: Record<string, unknown>) {
    if (operation.op === undefined) operation.op = operation.operation ?? operation.action ?? operation.type;
    if (operation.op === undefined && (operation.nodes !== undefined || operation.node !== undefined || operation.shapes !== undefined || operation.shape !== undefined)) {
        operation.op = 'createNodes';
    }
    if (
        operation.op === undefined &&
        (
            operation.from !== undefined ||
            operation.to !== undefined ||
            operation.source !== undefined ||
            operation.destination !== undefined ||
            operation.startShapeId !== undefined ||
            operation.endShapeId !== undefined ||
            (Array.isArray(operation.shapeIds) && operation.shapeIds.length >= 2)
        )
    ) {
        operation.op = 'connect';
    }
}

function normalizeTargetAliases(operation: Record<string, unknown>) {
    if (operation.op !== 'layout' && operation.op !== 'updateNodes' && operation.op !== 'focus') return;
    if (operation.target === undefined) {
        operation.target = operation.shapeIds ?? operation.shapeId ?? operation.id ?? operation.ids;
    }
    delete operation.shapeId;
    delete operation.shapeIds;
    delete operation.id;
    delete operation.ids;
}

function normalizeConnectorAliases(operation: Record<string, unknown>) {
    if (operation.op !== 'connect') return;
    const shapeIds = Array.isArray(operation.shapeIds) ? operation.shapeIds : undefined;
    if (operation.from === undefined) operation.from = operation.startShapeId ?? operation.fromShapeId ?? operation.sourceShapeId ?? operation.source ?? operation.start ?? shapeIds?.[0];
    if (operation.to === undefined) operation.to = operation.endShapeId ?? operation.toShapeId ?? operation.targetShapeId ?? operation.target ?? operation.destination ?? operation.end ?? shapeIds?.[1];
    operation.kind = normalizeConnectorKind(operation.kind);
    delete operation.startShapeId;
    delete operation.fromShapeId;
    delete operation.endShapeId;
    delete operation.toShapeId;
    delete operation.sourceShapeId;
    delete operation.targetShapeId;
    delete operation.source;
    delete operation.destination;
    delete operation.start;
    delete operation.end;
    delete operation.shapeIds;
}

function normalizeEditBoardNode(value: unknown): unknown {
    const normalized = normalizeEditBoardNestedObject(value, ['x', 'y', 'w', 'h']);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized;
    const node = normalized as Record<string, unknown>;
    if (node.kind === undefined) node.kind = node.type ?? node.shapeType ?? node.shape_type;
    if (node.as === undefined) node.as = node.id ?? node.alias;
    if (node.text === undefined) node.text = node.content ?? node.markdown ?? node.label ?? node.value;
    if (node.contentMarkdown === undefined) node.contentMarkdown = node.content_markdown ?? node.markdown;
    if (node.blockId === undefined) node.blockId = node.block_id;
    node.kind = normalizeNodeKind(node.kind);
    delete node.type;
    delete node.shapeType;
    delete node.shape_type;
    delete node.id;
    delete node.alias;
    delete node.content;
    delete node.markdown;
    delete node.label;
    delete node.value;
    delete node.content_markdown;
    delete node.block_id;
    pruneUndefinedProperties(node);
    return node;
}

function normalizeEditBoardPatch(value: unknown): unknown {
    const normalized = normalizeEditBoardNestedObject(value, ['x', 'y', 'w', 'h']);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized;
    const patch = normalized as Record<string, unknown>;
    if (patch.shapeId === undefined && patch.id !== undefined) patch.shapeId = patch.id;
    if (patch.target === undefined) patch.target = patch.shapeId ?? patch.shapeIds;
    if (patch.text === undefined) patch.text = patch.content ?? patch.label ?? patch.value;
    normalizeBooleanFields(patch, ['isCollapsed', 'zoom', 'select']);
    delete patch.id;
    delete patch.content;
    delete patch.label;
    delete patch.value;
    pruneUndefinedProperties(patch);
    return patch;
}

function normalizeEditBoardNestedObject(value: unknown, numericKeys: string[]): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const normalized = { ...(value as Record<string, unknown>) };
    normalizeNumericFields(normalized, numericKeys);
    pruneUndefinedProperties(normalized);
    return normalized;
}

function normalizeNumericFields(value: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        if (typeof value[key] === 'string' && value[key].trim() && Number.isFinite(Number(value[key]))) {
            value[key] = Number(value[key]);
        }
    }
}

function normalizeBooleanFields(value: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        value[key] = normalizeBoolean(value[key]);
    }
}

function normalizeBoolean(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const raw = value.trim().toLowerCase();
    if (raw === 'true' || raw === 'yes' || raw === '1') return true;
    if (raw === 'false' || raw === 'no' || raw === '0') return false;
    return value;
}

function normalizeLayoutAliases(value: Record<string, unknown>) {
    if (value.style === undefined && (value.layoutStyle !== undefined || value.layout_style !== undefined || value.type !== undefined)) {
        value.style = value.layoutStyle ?? value.layout_style ?? value.type;
    }
    if (value.style !== undefined) value.style = normalizeLayoutStyle(value.style);
    if (value.horizontalGap === undefined && (value.hGap !== undefined || value.horizontal_gap !== undefined)) {
        value.horizontalGap = value.hGap ?? value.horizontal_gap;
    }
    if (value.verticalGap === undefined && (value.vGap !== undefined || value.vertical_gap !== undefined)) {
        value.verticalGap = value.vGap ?? value.vertical_gap;
    }
    if (value.anchor === undefined && (value.anchorShapeId !== undefined || value.anchorId !== undefined)) {
        value.anchor = value.anchorShapeId ?? value.anchorId;
    }
    delete value.layoutStyle;
    delete value.layout_style;
    delete value.hGap;
    delete value.vGap;
    delete value.horizontal_gap;
    delete value.vertical_gap;
    delete value.anchorShapeId;
    delete value.anchorId;
    pruneUndefinedProperties(value);
}

function pruneUndefinedProperties(value: Record<string, unknown>) {
    for (const key of Object.keys(value)) {
        if (value[key] === undefined) delete value[key];
    }
}

function normalizeEditBoardOp(value: unknown): unknown {
    const raw = stringArg(value)?.replace(/[_\s-]+/g, '').toLowerCase();
    if (raw === 'createnodes' || raw === 'createshapes' || raw === 'createshape' || raw === 'addnodes' || raw === 'addshapes' || raw === 'addshape' || raw === 'add' || raw === 'create') return 'createNodes';
    if (raw === 'updatenodes' || raw === 'updateshapes' || raw === 'updateshape' || raw === 'modify' || raw === 'edit' || raw === 'update') return 'updateNodes';
    if (raw === 'connect' || raw === 'connection' || raw === 'connector' || raw === 'link' || raw === 'relate' || raw === 'arrow') return 'connect';
    if (raw === 'layout' || raw === 'arrange' || raw === 'align' || raw === 'position') return 'layout';
    if (raw === 'focus' || raw === 'select' || raw === 'zoom') return 'focus';
    if (raw === 'save') return 'save';
    return value;
}

function normalizeNodeKind(value: unknown): unknown {
    const raw = stringArg(value)?.replace(/[_\s-]+/g, '').toLowerCase();
    if (raw === 'singleblock') return 'single-block';
    if (raw === 'sticky' || raw === 'stickynote' || raw === 'note' || raw === 'label') return 'text';
    if (raw === 'paragraph' || raw === 'block' || raw === 'single') return 'single-block';
    if (raw === 'card' || raw === 'text' || raw === 'frame') return raw;
    return value;
}

function normalizeConnectorKind(value: unknown): unknown {
    const raw = stringArg(value)?.replace(/[_\s-]+/g, '').toLowerCase();
    if (!raw) return value;
    if (raw === 'branch' || raw === 'tree' || raw === 'mindmap' || raw === 'hierarchy') return 'branch';
    if (raw === 'relation' || raw === 'connector' || raw === 'bezierconnector' || raw === 'bezier' || raw === 'arrow' || raw === 'line' || raw === 'link') return 'relation';
    return value;
}

function normalizeLayoutStyle(value: unknown): unknown {
    const raw = stringArg(value)?.replace(/[_\s-]+/g, '').toLowerCase();
    if (!raw) return value;
    if (raw === 'nearselection' || raw === 'near' || raw === 'nearby') return 'nearSelection';
    if (raw === 'rightof' || raw === 'right') return 'rightOf';
    if (raw === 'below' || raw === 'under' || raw === 'bottom') return 'below';
    if (raw === 'grid' || raw === 'matrix') return 'grid';
    if (raw === 'tree' || raw === 'branch') return 'tree';
    if (raw === 'mindmap' || raw === 'mindmaplike' || raw === 'balanced') return 'mindmap';
    if (raw === 'framearound' || raw === 'frame' || raw === 'group' || raw === 'groupframe') return 'frameAround';
    if (raw === 'row' || raw === 'column' || raw === 'columns') return 'grid';
    return value;
}

function firstArray(...values: unknown[]): unknown[] | undefined {
    for (const value of values) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return [value];
    }
    return undefined;
}

function boardEditModeArg(value: unknown): AgentBoardEditMode | undefined {
    const raw = stringArg(value)?.toLowerCase();
    if (raw === 'dryrun' || raw === 'dry-run' || raw === 'validate') return 'preview';
    return raw === 'commit' || raw === 'preview' ? raw : undefined;
}

function boardEditResultArg(value: unknown): AgentBoardEditResultMode | undefined {
    const raw = stringArg(value)?.toLowerCase();
    if (raw === 'full' || raw === 'verbose') return 'debug';
    if (raw === 'compact') return 'minimal';
    return raw === 'minimal' || raw === 'debug' ? raw : undefined;
}
