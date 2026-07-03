import { parseCreateBasicShapeArgs } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createCreateBasicShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_basic_shape',
        description: 'Create a safe built-in/custom tldraw shape on an open whiteboard. Required args: whiteboardId, kind "text"|"note"|"geo"|"arrow"|"line"|"draw"|"highlight"|"frame"|"bezier-connector"|"slide"|"mind-map"|"js-shape". Default to text for unlinked annotations and frame for grouping/boundaries; for relationships use tldraw_create_connector, whose default is bezier-connector. For mind maps, tree/parent-child/hierarchical layouts, prefer tldraw_apply_plan op "branch"; use kind "mind-map" only when the user explicitly asks for the editable mind-map shape. Avoid note, geo, arrow, line, draw, highlight, slide, mind-map, and js-shape unless the user explicitly requests them or the task clearly requires that specific shape. Use tldraw_create_shape only for semantic card/single-block/branch. Common optional args: x, y, w, h, color, text, geo, name, blockId, direction, theme, select, zoom default true, resultMode "compact"|"full" default compact. Line is an arrow without arrowheads. For connecting two existing shapes, prefer tldraw_create_connector so ports/bindings are created. JS shape script content is not accepted. Unknown args are rejected.',
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
