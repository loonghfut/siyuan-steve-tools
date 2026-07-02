import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import { generateSiyuanID, getBlockByID, insertBlock, prependBlock, sql } from '@/api/api'
import type { ICardShape } from '../CardShape/card-shape-types'
import { insertDocRelations } from '../doc-outline/insert-doc-relations'
import { loadOutlineForDoc, outlineNodeToRelationItem, type OutlineNode } from '../doc-outline/doc-outline-data'

export type AgentDocOutlineBoardOptions = {
    docId: string
    mainShapeId?: string
    select?: boolean
    zoom?: boolean
}

export type AgentDocOutlineBoardResult = {
    docId: string
    layout: 'outline-mindmap'
    mainShapeId: string
    createdMainShape: boolean
    outlineNodeCount: number
    branchId: string | null
    createdShapeIds: string[]
    createdFallbackHeadingId: string | null
    createdFallbackHeadingIds: string[]
    skippedCount: number
    outline: AgentOutlineSummaryNode[]
}

export type AgentOutlineSummaryNode = {
    id: string
    title: string
    type?: string
    subType?: string
    depth?: number
    children?: AgentOutlineSummaryNode[]
}

export async function insertDocOutlineMindmapForAgent(
    editor: Editor,
    options: AgentDocOutlineBoardOptions
): Promise<AgentDocOutlineBoardResult> {
    const docId = options.docId.trim()
    if (!docId) throw new Error('missing required argument: docId')

    const loadedOutline = await loadOutlineForDoc(docId)
    const { outline, createdFallbackHeadingIds } = await ensureOutlineHasCardTargets(docId, loadedOutline)
    const { mainCard, createdMainShape } = ensureMainCard(editor, docId, options.mainShapeId)
    const result = await insertDocRelations({
        editor,
        mainCard,
        items: outline.map(outlineNodeToRelationItem),
        kind: 'outline-block',
    })

    const selectedId = result.branchId || mainCard.id
    if (options.select !== false && selectedId) {
        editor.select(selectedId as TLShapeId)
    }
    if (options.zoom !== false && selectedId) {
        editor.zoomToSelection({ animation: { duration: 300 } })
    }

    return {
        docId,
        layout: 'outline-mindmap',
        mainShapeId: String(mainCard.id),
        createdMainShape,
        outlineNodeCount: countOutlineNodes(outline),
        branchId: result.branchId ? String(result.branchId) : null,
        createdShapeIds: result.createdShapeIds.map(String),
        createdFallbackHeadingId: createdFallbackHeadingIds[0] || null,
        createdFallbackHeadingIds,
        skippedCount: result.skippedCount,
        outline: summarizeOutline(outline),
    }
}

async function ensureOutlineHasCardTargets(
    docId: string,
    outline: OutlineNode[]
): Promise<{ outline: OutlineNode[]; createdFallbackHeadingIds: string[] }> {
    if (countOutlineNodes(outline) > 0) {
        return { outline, createdFallbackHeadingIds: [] }
    }

    const headings = await createFallbackHeadingsForDocContent(docId)
    return {
        outline: headings.map((heading) => ({
            id: heading.id,
            name: heading.title,
            type: 'h',
            subType: 'h6',
            depth: 0,
            blocks: [],
            children: null,
        })),
        createdFallbackHeadingIds: headings.map((heading) => heading.id),
    }
}

type FallbackContentBlock = {
    id: string
    type?: string
    content?: string
    markdown?: string
}

async function createFallbackHeadingsForDocContent(docId: string): Promise<Array<{ id: string; title: string }>> {
    const candidates = await getFallbackContentBlocks(docId)
    const selected = selectFallbackContentBlocks(candidates)
    if (selected.length === 0) {
        return [await prependFallbackHeadingForDoc(docId)]
    }

    const headings: Array<{ id: string; title: string }> = []
    for (const block of selected) {
        const id = String(await generateSiyuanID())
        const title = getFallbackHeadingTitleFromBlock(block)
        await insertBlock('markdown', buildFallbackHeadingMarkdown(id, title), block.id)
        headings.push({ id, title })
    }
    return headings
}

async function prependFallbackHeadingForDoc(docId: string): Promise<{ id: string; title: string }> {
    const id = String(await generateSiyuanID())
    const title = await getFallbackDocumentTitle(docId)
    await prependBlock('markdown', buildFallbackHeadingMarkdown(id, title), docId)
    return { id, title }
}

async function getFallbackContentBlocks(docId: string): Promise<FallbackContentBlock[]> {
    const safeDocId = escapeSql(docId)
    const rows = await sql(`
        SELECT id, type, content, markdown, length, created, sort
        FROM blocks
        WHERE root_id = '${safeDocId}'
          AND id != '${safeDocId}'
          AND type != 'd'
          AND type != 'h'
          AND length > 0
        ORDER BY created ASC
        LIMIT 200
    `)
    if (!Array.isArray(rows)) return []
    return rows
        .filter((row: any) => typeof row?.id === 'string' && getFallbackHeadingTitleFromBlock(row))
        .map((row: any) => ({
            id: row.id,
            type: row.type,
            content: row.content,
            markdown: row.markdown,
        }))
}

function selectFallbackContentBlocks(blocks: FallbackContentBlock[], maxCount = 8): FallbackContentBlock[] {
    if (blocks.length <= maxCount) return blocks
    const selected: FallbackContentBlock[] = []
    for (let i = 0; i < maxCount; i += 1) {
        const index = Math.floor((i * blocks.length) / maxCount)
        selected.push(blocks[index])
    }
    return selected
}

function getFallbackHeadingTitleFromBlock(block: FallbackContentBlock): string {
    return sanitizeFallbackHeadingTitle(block.content || block.markdown || '')
}

function buildFallbackHeadingMarkdown(id: string, title: string): string {
    return `###### ${title}\n{: id="${id}"}`
}

async function getFallbackDocumentTitle(docId: string): Promise<string> {
    try {
        const block = await getBlockByID(docId)
        const raw = String((block as any)?.content || (block as any)?.markdown || (block as any)?.hpath || '').trim()
        const title = sanitizeFallbackHeadingTitle(raw)
        if (title) return title
    } catch (error) {
        console.warn('failed to read document title for fallback heading', error)
    }
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

function sanitizeFallbackHeadingTitle(value: string): string {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
        .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ''))
        .replace(/[`*_~#>\-[\]()+|{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)
}

function escapeSql(value: string): string {
    return String(value || '').replace(/'/g, "''")
}

function ensureMainCard(editor: Editor, docId: string, mainShapeId?: string): { mainCard: ICardShape; createdMainShape: boolean } {
    if (mainShapeId) {
        const shape = editor.getShape(mainShapeId as TLShapeId)
        if (!shape) throw new Error(`Main shape not found: ${mainShapeId}`)
        if (shape.type !== 'card') throw new Error(`Main shape must be a card: ${mainShapeId}`)
        return { mainCard: shape as ICardShape, createdMainShape: false }
    }

    const existing = findMainCardByBlockId(editor, docId)
    if (existing) return { mainCard: existing, createdMainShape: false }

    const id = createShapeId()
    const position = getNewMainCardPosition(editor)
    editor.createShape<ICardShape>({
        id,
        type: 'card',
        x: position.x,
        y: position.y,
        props: {
            w: 800,
            h: 1200,
            color: 'black',
            showMask: true,
            blockId: docId,
            isMain: true,
            isCollapsed: false,
        },
    })

    const created = editor.getShape<ICardShape>(id)
    if (!created || created.type !== 'card') {
        throw new Error('Failed to create document main card.')
    }
    return { mainCard: created, createdMainShape: true }
}

function findMainCardByBlockId(editor: Editor, docId: string): ICardShape | null {
    const cards = editor
        .getCurrentPageShapes()
        .filter((shape): shape is ICardShape => shape.type === 'card' && (shape as ICardShape).props?.blockId === docId)

    return cards.find((shape) => shape.props.isMain) || cards[0] || null
}

function getNewMainCardPosition(editor: Editor): { x: number; y: number } {
    const viewport = (editor as any).getViewportPageBounds?.()
    if (viewport && Number.isFinite(viewport.x) && Number.isFinite(viewport.y)) {
        return { x: viewport.x + 64, y: viewport.y + 64 }
    }
    return { x: 50, y: 50 }
}

export function summarizeOutline(nodes: OutlineNode[], maxNodes = 80): AgentOutlineSummaryNode[] {
    let remaining = maxNodes
    const visit = (node: OutlineNode): AgentOutlineSummaryNode | null => {
        if (remaining <= 0) return null
        remaining -= 1

        const children = (node.blocks || []).map(visit).filter(Boolean) as AgentOutlineSummaryNode[]
        return {
            id: node.id,
            title: node.name || node.content || node.id,
            type: node.type,
            subType: node.subType,
            depth: node.depth,
            children: children.length ? children : undefined,
        }
    }

    return nodes.map(visit).filter(Boolean) as AgentOutlineSummaryNode[]
}

function countOutlineNodes(nodes: OutlineNode[]): number {
    let count = 0
    const visit = (node: OutlineNode) => {
        count += 1
        node.blocks?.forEach(visit)
    }
    nodes.forEach(visit)
    return count
}
