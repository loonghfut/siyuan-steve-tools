import { assertKnownArgs, shapeIdArrayArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createZoomToShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_zoom_to_shapes',
        description: 'Select and zoom to up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[].',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'shapeIds'], 'tldraw_zoom_to_shapes');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            try {
                return jsonResult(target.instance.zoomAgentToShapes({ shapeIds }));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
