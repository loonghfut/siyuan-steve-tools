import { assertKnownArgs, booleanArgWithFallback, parseShapeUpdatePatch, resultModeArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createBatchUpdateShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_batch_update_shapes',
        description: 'Safely batch update up to 50 shapes on an open whiteboard. Required args: whiteboardId string, patches array of {shapeId,x,y,w,h,color,isCollapsed,text,name}. Size props only apply to shapes whose schema stores w/h; text supports w only, and note does not support w/h. isCollapsed only applies to card shapes. Text updates are only applied to text/note/arrow/bezier-connector/mind-map, and name only to slide. Optional args: select boolean, zoom boolean default true, resultMode "compact"|"full" default compact.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'patches', 'select', 'zoom', 'resultMode'], 'tldraw_batch_update_shapes');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            if (!Array.isArray(args.patches)) return { error: 'missing required argument: patches array' };
            try {
                const patches = args.patches.slice(0, 50).map((patch) => {
                    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
                        throw new Error('each patch must be an object');
                    }
                    return parseShapeUpdatePatch(patch as Record<string, unknown>);
                });
                const updated = target.instance.updateAgentShapesBatch({
                    patches,
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, true),
                    resultMode: resultModeArg(args.resultMode),
                });
                return jsonResult(updated);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
