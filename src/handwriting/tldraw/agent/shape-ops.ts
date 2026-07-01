import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import type { ICardShape } from '../CardShape/card-shape-types'
import type { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'
import type { IBranchShape } from '../BranchShape/branch-shape-types'
import { layoutBranchChildren, relayoutBranchesContainingShapes } from '../BranchShape/branch-layout'
import type { AgentBranchSide, AgentCreateShapeArgs, AgentCreateShapeResult, AgentCreatedNode, AgentNodeKind, AgentShapeRef } from './types'
import { finiteNumberInRange, normalizeAgentColor, normalizeBranchLineStyle } from './schema'

const DEFAULT_CARD_WIDTH = 300
const DEFAULT_CARD_HEIGHT = 300
const DEFAULT_SINGLE_WIDTH = 300
const DEFAULT_SINGLE_HEIGHT = 50
const DEFAULT_BRANCH_WIDTH = 80
const DEFAULT_BRANCH_HEIGHT = 40
const DEFAULT_BRANCH_HORIZONTAL_GAP = 96
const DEFAULT_BRANCH_VERTICAL_GAP = 28

export function createAgentBusinessShape(editor: Editor, options: AgentCreateShapeArgs): AgentCreateShapeResult {
    const context = createContext()

    if (options.kind === 'single-block') {
        const created = createSingleBlock(editor, options)
        recordCreatedNode(context, created, 'single-block', options.blockId)
        return finalize(editor, context, created, options)
    }

    if (options.kind === 'branch') {
        return createBranch(editor, options, context)
    }

    const created = createCard(editor, options)
    recordCreatedNode(context, created, 'card', options.blockId)
    return finalize(editor, context, created, options)
}

type CreateContext = {
    createdShapeIds: TLShapeId[]
    createdNodes: AgentCreatedNode[]
}

function createContext(): CreateContext {
    return { createdShapeIds: [], createdNodes: [] }
}

function recordCreatedNode(context: CreateContext, id: TLShapeId, kind: AgentNodeKind, blockId?: string) {
    context.createdShapeIds.push(id)
    context.createdNodes.push({
        id: String(id),
        kind,
        blockId: blockId || undefined,
    })
}

function createCard(editor: Editor, options: {
    x?: number
    y?: number
    w?: number
    h?: number
    color?: string
    blockId?: string
    isMain?: boolean
    isCollapsed?: boolean
    showMask?: boolean
}): TLShapeId {
    const id = createShapeId()
    const isMain = options.isMain === true
    editor.createShape<ICardShape>({
        id,
        type: 'card',
        x: finiteNumber(options.x, 0),
        y: finiteNumber(options.y, 0),
        props: {
            w: finiteNumberInRange(options.w, isMain ? 500 : DEFAULT_CARD_WIDTH, 1, 4000),
            h: finiteNumberInRange(options.h, isMain ? 700 : DEFAULT_CARD_HEIGHT, 1, 4000),
            color: normalizeAgentColor(options.color),
            showMask: options.showMask !== false,
            blockId: options.blockId || '',
            isMain,
            isCollapsed: options.isCollapsed === true,
            isNewlyCreated: !options.blockId,
        },
    })
    return id
}

function createSingleBlock(editor: Editor, options: {
    x?: number
    y?: number
    w?: number
    h?: number
    color?: string
    blockId?: string
}): TLShapeId {
    const id = createShapeId()
    editor.createShape<ISingleBlockShape>({
        id,
        type: 'single-block',
        x: finiteNumber(options.x, 0),
        y: finiteNumber(options.y, 0),
        props: {
            w: finiteNumberInRange(options.w, DEFAULT_SINGLE_WIDTH, 1, 4000),
            h: finiteNumberInRange(options.h, DEFAULT_SINGLE_HEIGHT, 1, 4000),
            color: normalizeAgentColor(options.color),
            blockId: options.blockId || '',
            isNewlyCreated: !options.blockId,
        },
    })
    return id
}

function createBranch(editor: Editor, options: AgentCreateShapeArgs, context: CreateContext): AgentCreateShapeResult {
    let branchId: TLShapeId | undefined
    editor.run(() => {
        branchId = createBranchNode(editor, options, context)
    })

    if (!branchId) throw new Error('Failed to create branch shape.')
    const latestBranch = editor.getShape<IBranchShape>(branchId)
    const selectedIds = options.select === false ? [] : [branchId]
    if (selectedIds.length) editor.setSelectedShapes(selectedIds)
    if (options.zoom !== false && selectedIds.length) editor.zoomToSelection({ animation: { duration: 300 } })

    return {
        createdShapeIds: context.createdShapeIds.map(String),
        selectedShapeIds: selectedIds.map(String),
        focusedShapeId: String(branchId),
        branchId: String(branchId),
        rootShapeId: latestBranch?.props.rootShapeId,
        leftChildIds: latestBranch?.props.leftChildIds || [],
        rightChildIds: latestBranch?.props.rightChildIds || latestBranch?.props.childIds || [],
        createdNodes: context.createdNodes,
    }
}

function createBranchNode(editor: Editor, options: AgentCreateShapeArgs, context: CreateContext): TLShapeId {
    const rootPoint = getBranchRootPoint(editor, options)
    const branchId = createShapeId()
    const leftChildIds: string[] = []
    const rightChildIds: string[] = []
    let rootShapeId = options.rootShapeId

    if (rootShapeId && !editor.getShape(rootShapeId as TLShapeId)) {
        throw new Error(`Root shape not found: ${rootShapeId}`)
    }

    if (!rootShapeId && options.root) {
        rootShapeId = ensureShapeRef(editor, options.root, {
            x: rootPoint.x - DEFAULT_CARD_WIDTH / 2,
            y: rootPoint.y - DEFAULT_CARD_HEIGHT / 2,
            color: options.color,
        }, context, 'card')
    }

    const normalizedChildren = normalizeBranchChildren(options, rootPoint)
    for (const child of normalizedChildren) {
        const childId = ensureShapeRef(editor, child.ref, child.defaults, context, 'single-block')
        if (!childId) continue
        if (child.side === 'left') leftChildIds.push(childId)
        else rightChildIds.push(childId)
    }

    editor.createShape<IBranchShape>({
        id: branchId,
        type: 'branch',
        x: rootPoint.x - DEFAULT_BRANCH_WIDTH / 2,
        y: rootPoint.y - DEFAULT_BRANCH_HEIGHT / 2,
        props: {
            w: DEFAULT_BRANCH_WIDTH,
            h: DEFAULT_BRANCH_HEIGHT,
            color: normalizeAgentColor(options.color),
            childIds: [...rightChildIds],
            leftChildIds,
            rightChildIds,
            rootShapeId,
            rootX: DEFAULT_BRANCH_WIDTH / 2,
            direction: options.direction || 'right',
            horizontalGap: finiteNumberInRange(options.horizontalGap, DEFAULT_BRANCH_HORIZONTAL_GAP, 20, 2000),
            verticalGap: finiteNumberInRange(options.verticalGap, DEFAULT_BRANCH_VERTICAL_GAP, 8, 1000),
            lineWidth: finiteNumberInRange(options.lineWidth, 3, 1, 24),
            lineStyle: normalizeBranchLineStyle(options.lineStyle),
            snapDistance: finiteNumberInRange(options.snapDistance, 160, 40, 2000),
            showBackground: options.showBackground === true,
            version: 5,
        },
    })
    recordCreatedNode(context, branchId, 'branch')

    const branch = editor.getShape<IBranchShape>(branchId)
    if (branch?.type === 'branch') {
        layoutBranchChildren(editor, branch)
    }

    relayoutBranchesContainingShapes(editor, [branchId, ...leftChildIds.map(toShapeId), ...rightChildIds.map(toShapeId)])
    return branchId
}

function normalizeBranchChildren(options: AgentCreateShapeArgs, rootPoint: { x: number; y: number }): Array<{
    side: AgentBranchSide
    ref: AgentShapeRef
    defaults: { x: number; y: number; color?: string }
}> {
    const left = options.leftChildren || []
    const right = options.rightChildren || []
    const fromIds = (options.childShapeIds || []).map((id) => ({ shapeId: id, side: options.direction || 'right' }))
    const generic = options.children || []
    const items: Array<{ side: AgentBranchSide; ref: AgentShapeRef }> = [
        ...left.map((ref) => ({ side: 'left' as const, ref })),
        ...right.map((ref) => ({ side: 'right' as const, ref })),
        ...fromIds.map((ref) => ({ side: ref.side as AgentBranchSide, ref })),
        ...generic.map((ref) => ({ side: getRefSide(ref) || options.direction || 'right', ref })),
    ]

    const sideIndexes: Record<AgentBranchSide, number> = { left: 0, right: 0 }
    return items.map((item) => {
        const sideIndex = sideIndexes[item.side]++
        return {
            ...item,
            defaults: {
                x: rootPoint.x + (item.side === 'left' ? -DEFAULT_BRANCH_HORIZONTAL_GAP - DEFAULT_SINGLE_WIDTH : DEFAULT_BRANCH_HORIZONTAL_GAP),
                y: rootPoint.y + sideIndex * (DEFAULT_SINGLE_HEIGHT + DEFAULT_BRANCH_VERTICAL_GAP),
                color: options.color,
            },
        }
    })
}

function ensureShapeRef(
    editor: Editor,
    ref: AgentShapeRef,
    defaults: { x: number; y: number; color?: string },
    context: CreateContext,
    defaultKind: AgentNodeKind
): string | undefined {
    if (typeof ref === 'string') {
        return editor.getShape(ref as TLShapeId) ? ref : undefined
    }

    const existingId = ref.shapeId || ref.id
    if (existingId && editor.getShape(existingId as TLShapeId)) {
        return existingId
    }

    const kind = ref.kind || defaultKind
    if (kind === 'branch') {
        return String(createBranchNode(editor, {
            kind: 'branch',
            x: finiteNumber(ref.x, defaults.x),
            y: finiteNumber(ref.y, defaults.y),
            color: ref.color || defaults.color,
            rootShapeId: ref.rootShapeId,
            root: ref.root,
            childShapeIds: ref.childShapeIds,
            children: ref.children,
            leftChildren: ref.leftChildren,
            rightChildren: ref.rightChildren,
            direction: ref.direction,
            horizontalGap: ref.horizontalGap,
            verticalGap: ref.verticalGap,
            lineStyle: ref.lineStyle,
            lineWidth: ref.lineWidth,
            snapDistance: ref.snapDistance,
            showBackground: ref.showBackground,
            select: false,
            zoom: false,
        }, context))
    }

    const id = kind === 'card'
        ? createCard(editor, {
            x: finiteNumber(ref.x, defaults.x),
            y: finiteNumber(ref.y, defaults.y),
            w: ref.w,
            h: ref.h,
            color: ref.color || defaults.color,
            blockId: ref.blockId,
            isMain: ref.isMain,
            isCollapsed: ref.isCollapsed,
            showMask: ref.showMask,
        })
        : createSingleBlock(editor, {
            x: finiteNumber(ref.x, defaults.x),
            y: finiteNumber(ref.y, defaults.y),
            w: ref.w,
            h: ref.h,
            color: ref.color || defaults.color,
            blockId: ref.blockId,
        })
    recordCreatedNode(context, id, kind, ref.blockId)
    return String(id)
}

function finalize(editor: Editor, context: CreateContext, focusedId: TLShapeId, options: AgentCreateShapeArgs): AgentCreateShapeResult {
    if (options.select !== false) editor.setSelectedShapes([focusedId])
    if (options.zoom) editor.zoomToSelection({ animation: { duration: 300 } })
    return {
        createdShapeIds: context.createdShapeIds.map(String),
        selectedShapeIds: options.select === false ? [] : [String(focusedId)],
        focusedShapeId: String(focusedId),
        createdNodes: context.createdNodes,
    }
}

function getRefSide(ref: AgentShapeRef): AgentBranchSide | undefined {
    return typeof ref === 'object' && ref && !Array.isArray(ref) ? ref.side : undefined
}

function finiteNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toShapeId(id: string): TLShapeId {
    return id as TLShapeId
}

function getBranchRootPoint(editor: Editor, options: AgentCreateShapeArgs): { x: number; y: number } {
    if ((options.x === undefined || options.y === undefined) && options.rootShapeId) {
        const center = getShapeCenter(editor, options.rootShapeId)
        if (center) {
            return {
                x: finiteNumber(options.x, center.x),
                y: finiteNumber(options.y, center.y),
            }
        }
    }

    if ((options.x === undefined || options.y === undefined) && options.root) {
        const center = getRefCenter(editor, options.root)
        if (center) {
            return {
                x: finiteNumber(options.x, center.x),
                y: finiteNumber(options.y, center.y),
            }
        }
    }

    return { x: finiteNumber(options.x, 0), y: finiteNumber(options.y, 0) }
}

function getRefCenter(editor: Editor, ref: AgentShapeRef): { x: number; y: number } | null {
    if (typeof ref === 'string') return getShapeCenter(editor, ref)
    const existingId = ref.shapeId || ref.id
    if (existingId) return getShapeCenter(editor, existingId)
    if (typeof ref.x !== 'number' && typeof ref.y !== 'number') return null

    const kind = ref.kind || 'card'
    const w = finiteNumber(ref.w, kind === 'card' ? DEFAULT_CARD_WIDTH : DEFAULT_SINGLE_WIDTH)
    const h = finiteNumber(ref.h, kind === 'card' ? DEFAULT_CARD_HEIGHT : DEFAULT_SINGLE_HEIGHT)
    return {
        x: finiteNumber(ref.x, 0) + w / 2,
        y: finiteNumber(ref.y, 0) + h / 2,
    }
}

function getShapeCenter(editor: Editor, shapeId: string): { x: number; y: number } | null {
    const shape = editor.getShape(shapeId as TLShapeId)
    if (!shape) return null

    const bounds = editor.getShapePageBounds(shape.id)
    if (bounds) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }

    const props = (shape as any).props || {}
    const w = Number(props.w) || DEFAULT_CARD_WIDTH
    const h = Number(props.h) || DEFAULT_SINGLE_HEIGHT
    return { x: shape.x + w / 2, y: shape.y + h / 2 }
}
