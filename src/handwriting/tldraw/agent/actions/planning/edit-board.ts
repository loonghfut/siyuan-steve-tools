import { getFocusedInstanceId, getInstance } from '../../../tldraw-instance-manager';
import { assertKnownArgs, booleanArg, stringArg } from '../../core/args';
import type { AgentBoardEditMode, AgentBoardEditRequest, AgentBoardEditResultMode } from '../../core/types';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createEditBoardAction(): AgentActionDefinition {
    return {
        name: 'tldraw_edit_board',
        description: 'V2 high-efficiency STtools tldraw Agent entrypoint. Apply semantic whiteboard operations in one call. Optional args: whiteboardId string defaults to focused whiteboard, goal string, mode "commit"|"preview" default commit, result "minimal"|"debug" default minimal, selection shape refs, save boolean. Required args: operations array. Supported ops: createNodes, connect, layout, updateNodes, focus, save. References: "$selection", "$selection[0]", "$created.name", "$last", "$block.<blockId>", "$kind.<shapeType>". createNodes supports card/single-block/text/frame. connect kind "branch" creates branch hierarchy; kind "relation" creates bezier connectors. Layout is runtime-computed: nearSelection, rightOf, below, grid, tree, mindmap, frameAround. Minimal results avoid raw snapshots and shape samples.',
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
    if (!Array.isArray(normalized.operations)) {
        const operations = firstArray(normalized.operations, normalized.operation, normalized.ops, normalized.actions, normalized.steps, normalized.plan);
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
    return normalized;
}

function normalizeEditBoardOperation(operation: unknown): unknown {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return operation;
    const normalized = { ...(operation as Record<string, unknown>) };
    normalized.op = normalizeEditBoardOp(normalized.op);

    if (normalized.op === 'createNodes' && !Array.isArray(normalized.nodes)) {
        const node = firstArray(normalized.nodes, normalized.node, normalized.items, normalized.shapes);
        if (node) normalized.nodes = node;
    }
    if (normalized.op === 'updateNodes' && !Array.isArray(normalized.patches) && Array.isArray(normalized.updates)) {
        normalized.patches = normalized.updates;
    }

    delete normalized.node;
    delete normalized.items;
    delete normalized.shapes;
    delete normalized.updates;
    return normalized;
}

function normalizeEditBoardOp(value: unknown): unknown {
    const raw = stringArg(value)?.replace(/[_\s-]+/g, '').toLowerCase();
    if (raw === 'createnodes' || raw === 'create') return 'createNodes';
    if (raw === 'updatenodes' || raw === 'update') return 'updateNodes';
    if (raw === 'connect' || raw === 'connection') return 'connect';
    if (raw === 'layout' || raw === 'arrange') return 'layout';
    if (raw === 'focus' || raw === 'select' || raw === 'zoom') return 'focus';
    if (raw === 'save') return 'save';
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
    const raw = stringArg(value);
    return raw === 'commit' || raw === 'preview' ? raw : undefined;
}

function boardEditResultArg(value: unknown): AgentBoardEditResultMode | undefined {
    const raw = stringArg(value);
    return raw === 'minimal' || raw === 'debug' ? raw : undefined;
}
