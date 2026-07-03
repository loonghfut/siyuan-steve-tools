import { booleanArgWithFallback, clampNumber, stringArg } from '../../core/args'
import { createSummaryChildDocWhiteboard, readSourceDocForSummary } from '../../documents/summary-child-doc-board'
import { disabledResult, jsonResult, stringifyError, type AgentActionContext, type AgentActionDefinition } from '../shared'

export function createCreateSummaryChildDocWhiteboardAction(context: AgentActionContext): AgentActionDefinition {
    return {
        name: 'siyuan_create_summary_child_doc_whiteboard',
        description: 'Create a child document for the current/source SiYuan document, fill it with a hierarchical Markdown summary, open the child document STtools tldraw whiteboard, and convert the child document headings into a branch/mindmap. Required args: docId string. Preferred args: summaryMarkdown string generated from the source document content. The summaryMarkdown must use heading blocks for hierarchy, prefer ## through ######, and avoid # headings. Optional args: childTitle string, openWhiteboard boolean default true, insertMindmap boolean default true, select boolean default true, zoom boolean default true, waitMs number default 8000. If summaryMarkdown is missing, this action returns sourceMarkdown and summarization instructions; call it again with summaryMarkdown.',
        handler: async (args) => {
            const disabled = disabledResult()
            if (disabled) return disabled
            const docId = stringArg(args.docId || args.blockId || args.rootId || args.id || args.whiteboardId)
            if (!docId) return { error: 'missing required argument: docId' }

            try {
                const summaryMarkdown = stringArg(args.summaryMarkdown || args.markdown || args.summary)
                if (!summaryMarkdown) {
                    const maxChars = clampNumber(args.maxChars, 1000, 80000, 30000)
                    return jsonResult(await readSourceDocForSummary(docId, maxChars))
                }

                const result = await createSummaryChildDocWhiteboard(context.plugin, {
                    docId,
                    summaryMarkdown,
                    childTitle: stringArg(args.childTitle || args.title),
                    openWhiteboard: booleanArgWithFallback(args.openWhiteboard, true),
                    insertMindmap: booleanArgWithFallback(args.insertMindmap, true),
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, true),
                    waitMs: clampNumber(args.waitMs, 0, 30000, 8000),
                })
                return jsonResult(result)
            } catch (error) {
                return { error: stringifyError(error) }
            }
        },
    }
}
