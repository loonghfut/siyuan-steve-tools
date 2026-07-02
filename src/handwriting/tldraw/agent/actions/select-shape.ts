import { booleanArgWithFallback, stringArg } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createSelectShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_select_shape',
        description: 'Select and optionally zoom to a shape on an open STtools tldraw whiteboard. Required args: whiteboardId string, shapeId string. Optional args: zoom boolean.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeId = stringArg(args.shapeId);
            if (!shapeId) return { error: 'missing required argument: shapeId' };
            try {
                return jsonResult(target.instance.selectAgentShape(shapeId, booleanArgWithFallback(args.zoom, true)));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
