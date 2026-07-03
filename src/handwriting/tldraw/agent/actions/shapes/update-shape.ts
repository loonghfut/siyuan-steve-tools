import { assertKnownArgs, booleanArgWithFallback, numberArg, stringArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createUpdateShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_update_shape',
        description: 'Update position, size, and supported visual props of a shape on an open tldraw whiteboard. Required args: whiteboardId string, shapeId string. Optional args: x, y, w, h, color, isCollapsed for card expand/collapse, select boolean, zoom boolean default true. Color must be a tldraw color name or value normalized to one. This does not edit card/single-block/branch content; those come from bound SiYuan blocks/layout props. For text/note/connector labels, mind-map root text, or slide names, use tldraw_batch_update_shapes patches with text/name.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'x', 'y', 'w', 'h', 'color', 'isCollapsed', 'select', 'zoom'], 'tldraw_update_shape');
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
                    isCollapsed: typeof args.isCollapsed === 'boolean' ? args.isCollapsed : undefined,
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, true),
                });
                return jsonResult(updated);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
