import { assertKnownArgs, booleanArgWithFallback, shapeIdArrayArg } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createLockShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_lock_shapes',
        description: 'Lock or unlock up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. Optional args: locked boolean, defaults true.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'shapeIds', 'locked'], 'tldraw_lock_shapes');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            try {
                return jsonResult(target.instance.lockAgentShapes({
                    shapeIds,
                    locked: booleanArgWithFallback(args.locked, true),
                }));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
