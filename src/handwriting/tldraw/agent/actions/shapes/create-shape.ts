import { parseCreateBasicShapeArgs, parseCreateShapeArgs, stringArg } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

const BASIC_SHAPE_KINDS = new Set([
    'text',
    'note',
    'geo',
    'arrow',
    'line',
    'draw',
    'highlight',
    'frame',
    'bezier-connector',
    'slide',
    'mind-map',
    'js-shape',
]);

export function createCreateShapeAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_shape',
        description: 'Create an STtools semantic/business shape on an open whiteboard. Required args: whiteboardId, kind "card"|"single-block"|"branch"; "singleblock" is accepted as an alias. Default to card for document/heading/substantial content and single-block for compact paragraph-like items. Use branch for mind maps, tree/parent-child/hierarchical layouts, or when the user explicitly asks for branch-connected components; for ordinary relationship lines prefer tldraw_create_connector. Card has two simple modes: pass blockId to reference an existing document/heading block, or pass contentMarkdown with optional title to create a new heading block and insert the content after it. Single-block similarly accepts blockId for an existing paragraph, or contentMarkdown/title to create a new paragraph block. Do not combine blockId with contentMarkdown/title. If neither blockId nor content is passed, card creates an empty heading block and single-block creates an empty paragraph block. Entity shapes auto-avoid overlap and return final bounds. For text/frame/bezier-connector and other basic kinds, prefer tldraw_create_basic_shape or tldraw_create_connector; this action redirects basic kinds only for compatibility. Common optional args: x, y, w, h, color, blockId, contentMarkdown, title, select, zoom default true, resultMode "compact"|"full" default compact. If blockId is provided, card blockId must be a SiYuan document or heading block id, and single-block blockId must be a paragraph block id. Card-only optional: isMain, isCollapsed, showMask. Branch optional: rootShapeId, childIds, children, leftChildren, rightChildren, direction, horizontalGap, verticalGap, lineStyle "curve-solid"|"elbow-solid"|"straight-solid"|"curve-dashed"|"frame-floating", lineWidth, snapDistance, showBackground. Branch children may be existing shape IDs or objects like {shapeId} / {kind:"card"|"single-block", blockId|contentMarkdown, title, side}. Compact results avoid shape samples; use full only for debugging. Unknown args are rejected.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                const kind = stringArg(args.kind);
                if (kind && BASIC_SHAPE_KINDS.has(kind)) {
                    return jsonResult(target.instance.createAgentBasicShape(parseCreateBasicShapeArgs(args)));
                }
                return jsonResult(await target.instance.createAgentShape(parseCreateShapeArgs(args)));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
