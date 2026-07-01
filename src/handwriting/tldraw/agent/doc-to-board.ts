import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
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

    const outline = await loadOutlineForDoc(docId)
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
        skippedCount: result.skippedCount,
        outline: summarizeOutline(outline),
    }
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
