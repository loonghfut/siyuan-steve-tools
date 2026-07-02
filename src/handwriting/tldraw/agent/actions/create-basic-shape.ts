import { parseCreateBasicShapeArgs } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createCreateBasicShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_basic_shape',
        description: 'Create a safe built-in/custom tldraw shape on an open whiteboard. Required args: whiteboardId, kind "text"|"note"|"geo"|"arrow"|"line"|"draw"|"highlight"|"frame"|"bezier-connector"|"slide"|"mind-map"|"js-shape". Use tldraw_create_shape only for semantic card/single-block/branch. Use this tool for unlinked annotations and custom containers: slide for presentation frames, mind-map for a root-topic tree or linked markdown block, js-shape only as a restricted placeholder. Common optional args: x, y, w, h, color, text, geo, name, blockId, direction, theme, select, zoom default true. Line is an arrow without arrowheads. For connecting two existing shapes, prefer tldraw_create_connector so ports/bindings are created. JS shape script content is not accepted. Unknown args are rejected.',
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
