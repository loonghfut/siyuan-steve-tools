import { parseCreateBasicShapeArgs } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createCreateBasicShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_basic_shape',
        description: 'Create safe non-business tldraw shapes on an open whiteboard. Required args: whiteboardId string, kind "text"|"note"|"geo"|"arrow"|"line"|"draw"|"highlight"|"frame"|"bezier-connector"|"slide"|"mind-map"|"js-shape". Optional args: x, y, w, h, color, text, geo, name, direction, theme, select, zoom. Line is implemented as an arrow shape without arrowheads. JS shape creation uses a restricted placeholder; custom script content is not accepted.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                return jsonResult(target.instance.createAgentBasicShape(parseCreateBasicShapeArgs(args)));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
