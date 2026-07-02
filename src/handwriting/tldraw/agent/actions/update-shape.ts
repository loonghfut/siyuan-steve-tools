import { assertKnownArgs, booleanArgWithFallback, numberArg, stringArg } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createUpdateShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_update_shape',
        description: 'Update position and supported visual props of an STtools business shape on an open tldraw whiteboard. Required args: whiteboardId string, shapeId string. Optional args: x, y, w, h, color, select boolean, zoom boolean. Color must be a tldraw color name; unsupported colors are normalized. Do not pass text for card, single-block, or branch; their content comes from bound SiYuan blocks.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'x', 'y', 'w', 'h', 'color', 'select', 'zoom'], 'tldraw_update_shape');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeId = stringArg(args.shapeId);
            if (!shapeId) return { error: 'missing required argument: shapeId' };
            try {
                const updated = target.instance.updateAgentShape({
                    shapeId,
                    x: numberArg(args.x),
                    y: numberArg(args.y),
                    w: numberArg(args.w),
                    h: numberArg(args.h),
                    color: stringArg(args.color),
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, false),
                });
                return jsonResult(updated);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
