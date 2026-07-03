import { assertKnownArgs, booleanArgWithFallback, resultModeArg, shapeIdArrayArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createDeleteShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_delete_shapes',
        description: 'Delete up to 50 shapes from an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. Optional args: confirm boolean (omit for a dry-run preview, set true to execute the deletion autonomously), allowLinkedBlockShapes boolean, resultMode "compact"|"full" default compact. A whiteboard backup is always created before confirmed deletion. Linked SiYuan block shapes are blocked unless allowLinkedBlockShapes true.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'shapeIds', 'confirm', 'allowLinkedBlockShapes', 'resultMode'], 'tldraw_delete_shapes');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            try {
                const deleted = await target.instance.deleteAgentShapes({
                    shapeIds,
                    confirm: booleanArgWithFallback(args.confirm, false),
                    allowLinkedBlockShapes: booleanArgWithFallback(args.allowLinkedBlockShapes, false),
                    resultMode: resultModeArg(args.resultMode),
                });
                return jsonResult(deleted);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
