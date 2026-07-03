import { assertKnownArgs, booleanArgWithFallback, shapeIdArrayArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createDeleteShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_delete_shapes',
        description: 'Dry-run or delete up to 50 shapes from an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. By default this is a dry run; pass confirm true to execute. A whiteboard backup is created before confirmed deletion. Linked SiYuan block shapes are blocked unless allowLinkedBlockShapes true.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'shapeIds', 'confirm', 'allowLinkedBlockShapes'], 'tldraw_delete_shapes');
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
                });
                return jsonResult(deleted);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
