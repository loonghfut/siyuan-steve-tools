import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import type { ICardShape } from '../CardShape/card-shape-types'
import type { IBranchShape } from '../BranchShape/branch-shape-types'
import { layoutBranchChildren } from '../BranchShape'

type InsertRelationKind = 'child-doc' | 'outline-block'

type InsertRelationItem = {
    blockId: string
}

type InsertDocRelationsOptions = {
    editor: Editor
    mainCard: ICardShape
    items: InsertRelationItem[]
    kind: InsertRelationKind
}

type InsertDocRelationsResult = {
    branchId: TLShapeId | null
    createdShapeIds: TLShapeId[]
    skippedCount: number
}

const CHILD_DOC_CARD_PROPS = {
    w: 500,
    h: 700,
    color: 'black' as const,
    showMask: true,
    isMain: true,
    isCollapsed: true,
}

const OUTLINE_CARD_PROPS = {
    w: 300,
    h: 300,
    color: 'black' as const,
    showMask: true,
    isMain: false,
    isCollapsed: false,
}

const BRANCH_DEFAULT_PROPS: IBranchShape['props'] = {
    w: 80,
    h: 40,
    color: 'black',
    childIds: [],
    leftChildIds: [],
    rightChildIds: [],
    rootX: 40,
    direction: 'right',
    horizontalGap: 96,
    verticalGap: 28,
    lineWidth: 3,
    snapDistance: 160,
    showOuterFrame: false,
    version: 2,
}

function getExistingBlockIds(editor: Editor) {
    const ids = new Set<string>()
    for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type !== 'card' && shape.type !== 'single-block') continue
        const blockId = (shape as any).props?.blockId
        if (typeof blockId === 'string' && blockId) ids.add(blockId)
    }
    return ids
}

export function insertDocRelations(options: InsertDocRelationsOptions): InsertDocRelationsResult {
    const { editor, mainCard, items, kind } = options
    const existingBlockIds = getExistingBlockIds(editor)

    const dedupedItems = items.filter((item, index) => {
        if (!item.blockId) return false
        return items.findIndex((candidate) => candidate.blockId === item.blockId) === index
    })

    const creatableItems = dedupedItems.filter((item) => !existingBlockIds.has(item.blockId))
    const skippedCount = dedupedItems.length - creatableItems.length

    if (creatableItems.length === 0) {
        return { branchId: null, createdShapeIds: [], skippedCount }
    }

    const mainBounds = editor.getShapePageBounds(mainCard.id)
    const rootX = mainBounds ? mainBounds.center.x : mainCard.x + (mainCard.props.w || 0) / 2
    const rootY = mainBounds ? mainBounds.center.y : mainCard.y + (mainCard.props.h || 0) / 2

    const branchId = createShapeId()
    const branchShape = {
        id: branchId,
        type: 'branch' as const,
        x: rootX - (BRANCH_DEFAULT_PROPS.rootX || 40),
        y: rootY - BRANCH_DEFAULT_PROPS.h / 2,
        props: {
            ...BRANCH_DEFAULT_PROPS,
            childIds: [],
            leftChildIds: [mainCard.id as string],
            rightChildIds: [],
        },
    }

    const cardShapes = creatableItems.map((item, index) => {
        const id = createShapeId()
        const isChildDoc = kind === 'child-doc'
        const props = isChildDoc ? CHILD_DOC_CARD_PROPS : OUTLINE_CARD_PROPS
        return {
            id,
            type: 'card' as const,
            x: rootX + 180,
            y: rootY + index * 24,
            props: {
                ...props,
                blockId: item.blockId,
            },
        }
    })

    branchShape.props.childIds = cardShapes.map((shape) => shape.id as string)
    branchShape.props.rightChildIds = cardShapes.map((shape) => shape.id as string)

    editor.createShapes([branchShape, ...cardShapes])

    const latestBranch = editor.getShape<IBranchShape>(branchId)
    if (latestBranch?.type === 'branch') {
        layoutBranchChildren(editor, latestBranch)
    } else {
        showMessage('branch 创建后未能完成布局', 3000, 'error')
    }

    return {
        branchId,
        createdShapeIds: cardShapes.map((shape) => shape.id),
        skippedCount,
    }
}
