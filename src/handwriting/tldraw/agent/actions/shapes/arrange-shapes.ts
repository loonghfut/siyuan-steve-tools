import { assertKnownArgs, shapeIdArrayArg, stringArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createArrangeShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_arrange_shapes',
        description: 'Adjust z-order for up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[], operation "front"|"back"|"forward"|"backward".',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'shapeIds', 'operation'], 'tldraw_arrange_shapes');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const operation = stringArg(args.operation);
            if (operation !== 'front' && operation !== 'back' && operation !== 'forward' && operation !== 'backward') {
                return { error: 'operation must be "front", "back", "forward", or "backward"' };
            }
            try {
                return jsonResult(target.instance.arrangeAgentShapes({ shapeIds, operation }));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
