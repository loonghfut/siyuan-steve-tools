import { assertKnownArgs, booleanArgWithFallback, numberArg, shapeIdArrayArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createDuplicateShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_duplicate_shapes',
        description: 'Duplicate up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. Optional args: offsetX, offsetY, select, zoom. Complex bindings may not be preserved when the editor duplicate API is unavailable.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'shapeIds', 'offsetX', 'offsetY', 'select', 'zoom'], 'tldraw_duplicate_shapes');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            try {
                const duplicated = target.instance.duplicateAgentShapes({
                    shapeIds,
                    offsetX: numberArg(args.offsetX),
                    offsetY: numberArg(args.offsetY),
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, false),
                });
                return jsonResult(duplicated);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
