import { parseCreateBasicShapeArgs } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createCreateBasicShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_basic_shape',
        description: 'Create a safe built-in/custom tldraw shape on an open whiteboard. Required args: whiteboardId, kind "text"|"note"|"geo"|"arrow"|"line"|"draw"|"highlight"|"frame"|"bezier-connector"|"slide"|"mind-map"|"js-shape". Use this tool for smoke-test note/text/geo creation; use tldraw_create_shape only for STtools business card/single-block/branch shapes. All other props have defaults; only pass optional overrides you need: x, y, w, h, color, text, geo, name, direction, theme, select, zoom default true. Line is an arrow without arrowheads. JS shape uses a restricted placeholder; script content is not accepted. Unknown args are rejected.',
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
