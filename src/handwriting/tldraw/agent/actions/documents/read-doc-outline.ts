import { loadOutlineForDoc } from '../../../doc-outline/doc-outline-data';
import { clampNumber, stringArg } from '../../core/args';
import { summarizeOutline } from '../../documents/doc-to-board';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createReadDocOutlineAction(): AgentActionDefinition {
    return {
        name: 'siyuan_read_doc_outline_for_tldraw',
        description: 'Read a SiYuan document outline for planning a tldraw mindmap. Required args: docId string. Optional args: maxNodes number. Returns heading/block IDs, titles, depth, type, and subType. Use these block IDs when creating cards or branches.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const docId = stringArg(args.docId || args.id || args.rootId || args.whiteboardId);
            if (!docId) return { error: 'missing required argument: docId' };

            try {
                const maxNodes = clampNumber(args.maxNodes, 1, 500, 120);
                const outline = await loadOutlineForDoc(docId);
                return jsonResult({
                    docId,
                    outlineNodeCount: countOutlineNodes(outline),
                    outline: summarizeOutline(outline, maxNodes),
                });
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}

function countOutlineNodes(nodes: Array<{ blocks?: any[] }>): number {
    let count = 0;
    const visit = (node: { blocks?: any[] }) => {
        count += 1;
        node.blocks?.forEach(visit);
    };
    nodes.forEach(visit);
    return count;
}
