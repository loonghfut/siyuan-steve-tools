import { assertKnownArgs, booleanArgWithFallback, resultModeArg, shapeIdArrayArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createGroupShapesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_group_shapes',
        description: 'Group or ungroup up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. Optional args: ungroup boolean, select boolean, resultMode "compact"|"full" default compact. Uses tldraw editor group APIs only when available.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'shapeId', 'shapeIds', 'ungroup', 'select', 'resultMode'], 'tldraw_group_shapes');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            try {
                const grouped = target.instance.groupAgentShapes({
                    shapeIds,
                    ungroup: booleanArgWithFallback(args.ungroup, false),
                    select: booleanArgWithFallback(args.select, true),
                    resultMode: resultModeArg(args.resultMode),
                });
                return jsonResult(grouped);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
