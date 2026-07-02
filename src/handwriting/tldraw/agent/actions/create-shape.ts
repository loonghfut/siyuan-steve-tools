import { parseCreateShapeArgs } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createCreateShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_shape',
        description: 'Create an STtools business shape on an open whiteboard. Required args: whiteboardId, kind "card"|"single-block"|"branch". Use tldraw_create_basic_shape for note/text/geo/arrow/line/frame/etc. All shape props have safe defaults; for a smoke test omit blockId and pass only kind/x/y. Optional overrides: x, y, w, h, color, blockId, select, zoom default true. If blockId is provided, card blockId must be a SiYuan document or heading block id, and single-block blockId must be a paragraph block id. Card-only optional: isMain, isCollapsed, showMask. Branch optional: rootShapeId, childIds, children, leftChildren, rightChildren, direction, horizontalGap, verticalGap, lineStyle, lineWidth, snapDistance, showBackground. Branch children may be existing shape IDs or objects like {shapeId} / {kind:"card"|"single-block", blockId, side}. Unknown args are rejected.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                return jsonResult(await target.instance.createAgentShape(parseCreateShapeArgs(args)));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
