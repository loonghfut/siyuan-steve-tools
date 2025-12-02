// ===== 思维导图布局计算 =====

import { MindMapNode } from './mind-map-shape-types'
import { calculateNodeWidth } from './mind-map-utils'
import { PADDING, MIN_WIDTH, MIN_HEIGHT } from './mind-map-constants'

// 当方向为 up/down 时，额外增加的父子间垂直间距（像素）
const EXTRA_VERTICAL_GAP = 18

// 布局方向类型
export type LayoutDirection = 'right' | 'left' | 'up' | 'down'

// 节点布局信息
export interface NodeLayout {
    node: MindMapNode
    x: number
    y: number
    width: number
    height: number
    children: NodeLayout[]
}

// 边界信息
export interface LayoutBounds {
    minX: number
    maxX: number
    minY: number
    maxY: number
}

// 布局计算结果
export interface LayoutResult {
    layout: NodeLayout
    bounds: LayoutBounds
}

// 完整布局信息
export interface FullLayoutInfo {
    layoutTree: NodeLayout
    contentWidth: number
    contentHeight: number
    offsetX: number
    offsetY: number
    // 根节点在内容区域中的位置（用于锚点定位）
    rootAnchor: { x: number; y: number }
    // 布局方向
    direction: LayoutDirection
}

/**
 * 获取子树尺寸（横向布局时为高度，纵向布局时为宽度）
 */
export const getSubtreeSize = (layout: NodeLayout, gap: number, isHorizontal: boolean): number => {
    if (layout.children.length === 0 || layout.node.collapsed) {
        return isHorizontal ? layout.height : layout.width
    }
    let totalSize = 0
    for (const child of layout.children) {
        totalSize += getSubtreeSize(child, gap, isHorizontal) + gap
    }
    const nodeSize = isHorizontal ? layout.height : layout.width
    return Math.max(nodeSize, totalSize - gap)
}

// 保留旧的函数名以保持兼容性
export const getSubtreeHeight = (layout: NodeLayout, gap: number): number => {
    return getSubtreeSize(layout, gap, true)
}

/**
 * 更新子节点位置 - 向右布局
 */
export const updateChildPositionsRight = (
    layout: NodeLayout, 
    hGap: number, 
    vGap: number
): void => {
    if (layout.children.length === 0) return

    let totalChildHeight = 0
    for (const child of layout.children) {
        totalChildHeight += getSubtreeSize(child, vGap, true) + vGap
    }
    totalChildHeight -= vGap

    let currentY = layout.y - totalChildHeight / 2
    const parentRightEdge = layout.x + layout.width / 2

    for (const childLayout of layout.children) {
        const subtreeHeight = getSubtreeSize(childLayout, vGap, true)
        childLayout.x = parentRightEdge + hGap + childLayout.width / 2
        childLayout.y = currentY + subtreeHeight / 2
        updateChildPositionsRight(childLayout, hGap, vGap)
        currentY += subtreeHeight + vGap
    }
}

/**
 * 更新子节点位置 - 向左布局
 */
export const updateChildPositionsLeft = (
    layout: NodeLayout, 
    hGap: number, 
    vGap: number
): void => {
    if (layout.children.length === 0) return

    let totalChildHeight = 0
    for (const child of layout.children) {
        totalChildHeight += getSubtreeSize(child, vGap, true) + vGap
    }
    totalChildHeight -= vGap

    let currentY = layout.y - totalChildHeight / 2
    const parentLeftEdge = layout.x - layout.width / 2

    for (const childLayout of layout.children) {
        const subtreeHeight = getSubtreeSize(childLayout, vGap, true)
        childLayout.x = parentLeftEdge - hGap - childLayout.width / 2
        childLayout.y = currentY + subtreeHeight / 2
        updateChildPositionsLeft(childLayout, hGap, vGap)
        currentY += subtreeHeight + vGap
    }
}

/**
 * 更新子节点位置 - 向下布局
 */
export const updateChildPositionsDown = (
    layout: NodeLayout, 
    hGap: number, 
    vGap: number
): void => {
    if (layout.children.length === 0) return

    let totalChildWidth = 0
    for (const child of layout.children) {
        totalChildWidth += getSubtreeSize(child, hGap, false) + hGap
    }
    totalChildWidth -= hGap

    let currentX = layout.x - totalChildWidth / 2
    const parentBottomEdge = layout.y + layout.height / 2

    for (const childLayout of layout.children) {
        const subtreeWidth = getSubtreeSize(childLayout, hGap, false)
        childLayout.x = currentX + subtreeWidth / 2
        childLayout.y = parentBottomEdge + vGap + childLayout.height / 2
        updateChildPositionsDown(childLayout, hGap, vGap)
        currentX += subtreeWidth + hGap
    }
}

/**
 * 更新子节点位置 - 向上布局
 */
export const updateChildPositionsUp = (
    layout: NodeLayout, 
    hGap: number, 
    vGap: number
): void => {
    if (layout.children.length === 0) return

    let totalChildWidth = 0
    for (const child of layout.children) {
        totalChildWidth += getSubtreeSize(child, hGap, false) + hGap
    }
    totalChildWidth -= hGap

    let currentX = layout.x - totalChildWidth / 2
    const parentTopEdge = layout.y - layout.height / 2

    for (const childLayout of layout.children) {
        const subtreeWidth = getSubtreeSize(childLayout, hGap, false)
        childLayout.x = currentX + subtreeWidth / 2
        childLayout.y = parentTopEdge - vGap - childLayout.height / 2
        updateChildPositionsUp(childLayout, hGap, vGap)
        currentX += subtreeWidth + hGap
    }
}

// 保留旧的函数名以保持兼容性
export const updateChildPositions = updateChildPositionsRight

/**
 * 根据方向选择更新子节点位置的函数
 */
const getUpdateChildPositionsFunc = (direction: LayoutDirection) => {
    switch (direction) {
        case 'left': return updateChildPositionsLeft
        case 'up': return updateChildPositionsUp
        case 'down': return updateChildPositionsDown
        case 'right':
        default: return updateChildPositionsRight
    }
}

/**
 * 计算节点布局（带方向）- 返回布局树和边界信息
 */
export const calculateLayoutWithBoundsDirectional = (
    node: MindMapNode,
    x: number,
    y: number,
    level: number,
    nodeHeight: number,
    fontSize: number,
    horizontalGap: number,
    verticalGap: number,
    direction: LayoutDirection
): LayoutResult => {
    const dynamicWidth = calculateNodeWidth(node.text, level, fontSize)
    const layout: NodeLayout = {
        node,
        x,
        y,
        width: dynamicWidth,
        height: level === 0 ? nodeHeight * 1.2 : nodeHeight,
        children: [],
    }

    let bounds: LayoutBounds = {
        minX: x - layout.width / 2,
        maxX: x + layout.width / 2,
        minY: y - layout.height / 2,
        maxY: y + layout.height / 2,
    }

    if (node.collapsed || node.children.length === 0) {
        return { layout, bounds }
    }

    const isHorizontal = direction === 'left' || direction === 'right'
    const childLayouts: NodeLayout[] = []
    let totalChildSize = 0
    const gap = isHorizontal ? verticalGap : horizontalGap

    for (const child of node.children) {
        const childResult = calculateLayoutWithBoundsDirectional(
            child, 0, 0, level + 1,
            nodeHeight, fontSize, horizontalGap, verticalGap, direction
        )
        childLayouts.push(childResult.layout)
        totalChildSize += getSubtreeSize(childResult.layout, gap, isHorizontal)
    }

    if (childLayouts.length > 0) {
        totalChildSize += gap * (childLayouts.length - 1)
    }

    const updateFunc = getUpdateChildPositionsFunc(direction)

    // 当为垂直布局时（up/down），增加父子之间的垂直间距
    const isVerticalLayout = !isHorizontal
    const vGapUsed = isVerticalLayout ? verticalGap + EXTRA_VERTICAL_GAP : verticalGap

    if (isHorizontal) {
        // 水平布局 (left/right)
        let currentY = y - totalChildSize / 2
        const parentEdge = direction === 'right' 
            ? x + layout.width / 2 
            : x - layout.width / 2

        for (const childLayout of childLayouts) {
            const subtreeHeight = getSubtreeSize(childLayout, verticalGap, true)
            if (direction === 'right') {
                childLayout.x = parentEdge + horizontalGap + childLayout.width / 2
            } else {
                childLayout.x = parentEdge - horizontalGap - childLayout.width / 2
            }
            childLayout.y = currentY + subtreeHeight / 2
            updateFunc(childLayout, horizontalGap, verticalGap)
            layout.children.push(childLayout)
            currentY += subtreeHeight + verticalGap
        }
    } else {
        // 垂直布局 (up/down)
        let currentX = x - totalChildSize / 2
        const parentEdge = direction === 'down'
            ? y + layout.height / 2
            : y - layout.height / 2

        for (const childLayout of childLayouts) {
            const subtreeWidth = getSubtreeSize(childLayout, horizontalGap, false)
            childLayout.x = currentX + subtreeWidth / 2
            if (direction === 'down') {
                childLayout.y = parentEdge + vGapUsed + childLayout.height / 2
            } else {
                childLayout.y = parentEdge - vGapUsed - childLayout.height / 2
            }
            // 传递调整后的 vGap 给递归布局函数，以保持一致的间距
            updateFunc(childLayout, horizontalGap, vGapUsed)
            layout.children.push(childLayout)
            currentX += subtreeWidth + horizontalGap
        }
    }

    // 收集边界
    const collectBounds = (l: NodeLayout) => {
        bounds.minX = Math.min(bounds.minX, l.x - l.width / 2)
        bounds.maxX = Math.max(bounds.maxX, l.x + l.width / 2)
        bounds.minY = Math.min(bounds.minY, l.y - l.height / 2)
        bounds.maxY = Math.max(bounds.maxY, l.y + l.height / 2)
        for (const child of l.children) {
            collectBounds(child)
        }
    }
    for (const child of layout.children) {
        collectBounds(child)
    }

    return { layout, bounds }
}

/**
 * 计算节点布局 - 返回布局树和边界信息（向右布局，保持兼容性）
 */
export const calculateLayoutWithBounds = (
    node: MindMapNode,
    x: number,
    y: number,
    level: number,
    nodeHeight: number,
    fontSize: number,
    horizontalGap: number,
    verticalGap: number
): LayoutResult => {
    return calculateLayoutWithBoundsDirectional(
        node, x, y, level, nodeHeight, fontSize, horizontalGap, verticalGap, 'right'
    )
}

/**
 * 计算完整的思维导图布局
 * 以根节点为锚点进行布局，返回根节点在内容区域中的位置
 */
export const calculateFullLayout = (
    rootNode: MindMapNode,
    nodeHeight: number,
    fontSize: number,
    horizontalGap: number,
    verticalGap: number,
    direction: LayoutDirection = 'right'
): FullLayoutInfo => {
    // 以原点(0,0)作为根节点中心进行布局计算，获取边界
    const { bounds: tempBounds } = calculateLayoutWithBoundsDirectional(
        rootNode, 0, 0, 0,
        nodeHeight, fontSize, horizontalGap, verticalGap, direction
    )

    // 计算内容区域大小（加上边距）
    const contentWidth = Math.max(tempBounds.maxX - tempBounds.minX + PADDING * 2, MIN_WIDTH)
    const contentHeight = Math.max(tempBounds.maxY - tempBounds.minY + PADDING * 2, MIN_HEIGHT)

    // 计算根节点在内容区域中的位置
    const rootAnchorX = PADDING - tempBounds.minX
    const rootAnchorY = PADDING - tempBounds.minY

    // 重新计算布局，将根节点放在正确的位置
    const { layout: layoutTree } = calculateLayoutWithBoundsDirectional(
        rootNode, rootAnchorX, rootAnchorY, 0,
        nodeHeight, fontSize, horizontalGap, verticalGap, direction
    )

    return {
        layoutTree,
        contentWidth,
        contentHeight,
        offsetX: 0,
        offsetY: 0,
        rootAnchor: { x: rootAnchorX, y: rootAnchorY },
        direction,
    }
}
