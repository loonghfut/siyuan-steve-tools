import { booleanArgWithFallback, stringArg } from '../internal/core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createInsertDocOutlineMindmapAction(): AgentActionDefinition {
    return {
        name: 'tldraw_insert_doc_outline_mindmap',
        description: 'Insert the outline blocks of a SiYuan document into its open STtools tldraw whiteboard as a branch/mindmap layout. Required args: docId string. Optional args: whiteboardId string defaults to docId, mainShapeId string, select boolean, zoom boolean. If the document main card is missing, the plugin creates it. If the document has no heading blocks, the plugin samples meaningful content blocks, creates fallback h6 headings near those blocks, and inserts cards for them. Existing block cards are skipped.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const docId = stringArg(args.docId || args.blockId || args.rootId || args.id);
            if (!docId) return { error: 'missing required argument: docId' };
            const target = requireOpenWhiteboard({ ...args, whiteboardId: stringArg(args.whiteboardId) || docId });
            if (target.error) return { error: target.error };

            try {
                const inserted = await target.instance.insertDocOutlineMindmapForAgent({
                    docId,
                    mainShapeId: stringArg(args.mainShapeId || args.shapeId),
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, true),
                });
                return jsonResult(inserted);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
