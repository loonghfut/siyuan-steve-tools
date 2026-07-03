import { assertKnownArgs, resultModeArg, shapeIdArrayArg, stringArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createAlignShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_align_shapes',
        description: 'Align or distribute 2-50 shapes on an open whiteboard. Required args: whiteboardId string, shapeIds string[], operation "left"|"center-x"|"right"|"top"|"center-y"|"bottom"|"distribute-x"|"distribute-y". Optional args: resultMode "compact"|"full" default compact. This only changes x/y positions.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'shapeIds', 'operation', 'resultMode'], 'tldraw_align_shapes');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (shapeIds.length < 2) return { error: 'shapeIds must contain at least 2 shapes' };
            const operation = stringArg(args.operation);
            const allowed = new Set(['left', 'center-x', 'right', 'top', 'center-y', 'bottom', 'distribute-x', 'distribute-y']);
            if (!operation || !allowed.has(operation)) {
                return { error: 'operation must be one of left, center-x, right, top, center-y, bottom, distribute-x, distribute-y' };
            }
            try {
                return jsonResult(target.instance.alignAgentShapes({ shapeIds, operation: operation as any, resultMode: resultModeArg(args.resultMode) }));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
