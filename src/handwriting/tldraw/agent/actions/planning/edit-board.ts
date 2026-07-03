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
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'goal', 'mode', 'operations', 'selection', 'result', 'save'], 'tldraw_edit_board');
            } catch (error) {
                return { error: stringifyError(error) };
            }

            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId) || getFocusedInstanceId();
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
                    goal: stringArg(args.goal),
                    mode: boardEditModeArg(args.mode),
                    operations: Array.isArray(args.operations) ? args.operations as AgentBoardEditRequest['operations'] : undefined,
                    selection: args.selection as AgentBoardEditRequest['selection'],
                    result: boardEditResultArg(args.result),
                    save: booleanArg(args.save),
                };
                return jsonResult(await instance.editAgentBoard(request));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}

function boardEditModeArg(value: unknown): AgentBoardEditMode | undefined {
    const raw = stringArg(value);
    return raw === 'commit' || raw === 'preview' ? raw : undefined;
}

function boardEditResultArg(value: unknown): AgentBoardEditResultMode | undefined {
    const raw = stringArg(value);
    return raw === 'minimal' || raw === 'debug' ? raw : undefined;
}
