// ===== 思维导图布局计算 =====

import { MindMapNode } from './mind-map-shape-types'
import { calculateNodeWidth } from './mind-map-utils'
import { PADDING, MIN_WIDTH, MIN_HEIGHT } from './mind-map-constants'

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
}

/**
 * 获取子树高度
 */
export const getSubtreeHeight = (layout: NodeLayout, gap: number): number => {
    if (layout.children.length === 0 || layout.node.collapsed) {
        return layout.height
    }
    let totalHeight = 0
    for (const child of layout.children) {
        totalHeight += getSubtreeHeight(child, gap) + gap
    }
    return Math.max(layout.height, totalHeight - gap)
}

/**
 * 更新子节点位置
 */
export const updateChildPositions = (
    layout: NodeLayout, 
    hGap: number, 
    vGap: number
): void => {
    if (layout.children.length === 0) return

    let totalChildHeight = 0
    for (const child of layout.children) {
        totalChildHeight += getSubtreeHeight(child, vGap) + vGap
    }
    totalChildHeight -= vGap

    let currentY = layout.y - totalChildHeight / 2

    // 父节点的右边缘位置
    const parentRightEdge = layout.x + layout.width / 2

    for (const childLayout of layout.children) {
        const subtreeHeight = getSubtreeHeight(childLayout, vGap)
        // 子节点的中心 X = 父节点右边缘 + 间距 + 子节点宽度的一半
        childLayout.x = parentRightEdge + hGap + childLayout.width / 2
        childLayout.y = currentY + subtreeHeight / 2
        updateChildPositions(childLayout, hGap, vGap)
        currentY += subtreeHeight + vGap
    }
}

/**
 * 计算节点布局 - 返回布局树和边界信息
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
    // 动态计算节点宽度
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

    // 计算所有子节点的总高度
    const childLayouts: NodeLayout[] = []
    let totalChildHeight = 0

    for (const child of node.children) {
        const childResult = calculateLayoutWithBounds(
            child, 0, 0, level + 1,
            nodeHeight, fontSize, horizontalGap, verticalGap
        )
        childLayouts.push(childResult.layout)
        totalChildHeight += getSubtreeHeight(childResult.layout, verticalGap)
    }

    // 减去最后一个节点后的间距
    if (childLayouts.length > 0) {
        totalChildHeight -= verticalGap
    }

    // 计算子节点的起始 y 位置（居中对齐）
    let currentY = y - totalChildHeight / 2

    // 父节点的右边缘位置
    const parentRightEdge = x + layout.width / 2

    for (const childLayout of childLayouts) {
        const subtreeHeight = getSubtreeHeight(childLayout, verticalGap)
        
        // 设置子节点的实际位置
        childLayout.x = parentRightEdge + horizontalGap + childLayout.width / 2
        childLayout.y = currentY + subtreeHeight / 2
        
        // 递归更新子节点的子节点位置
        updateChildPositions(childLayout, horizontalGap, verticalGap)
        
        layout.children.push(childLayout)
        currentY += subtreeHeight + verticalGap
    }

    // 递归计算所有子节点的边界
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
 * 计算完整的思维导图布局
 * 以根节点为锚点进行布局，返回根节点在内容区域中的位置
 */
export const calculateFullLayout = (
    rootNode: MindMapNode,
    nodeHeight: number,
    fontSize: number,
    horizontalGap: number,
    verticalGap: number
): FullLayoutInfo => {
    // 以原点(0,0)作为根节点中心进行布局计算，获取边界
    const { bounds: tempBounds } = calculateLayoutWithBounds(
        rootNode, 0, 0, 0,
        nodeHeight, fontSize, horizontalGap, verticalGap
    )

    // 计算内容区域大小（加上边距）
    const contentWidth = Math.max(tempBounds.maxX - tempBounds.minX + PADDING * 2, MIN_WIDTH)
    const contentHeight = Math.max(tempBounds.maxY - tempBounds.minY + PADDING * 2, MIN_HEIGHT)

    // 计算根节点在内容区域中的位置
    // 根节点中心相对于内容区域左上角的偏移
    const rootAnchorX = PADDING - tempBounds.minX  // 根节点 X 在内容区域中的位置
    const rootAnchorY = PADDING - tempBounds.minY  // 根节点 Y 在内容区域中的位置

    // 重新计算布局，将根节点放在正确的位置
    const { layout: layoutTree } = calculateLayoutWithBounds(
        rootNode, rootAnchorX, rootAnchorY, 0,
        nodeHeight, fontSize, horizontalGap, verticalGap
    )

    return {
        layoutTree,
        contentWidth,
        contentHeight,
        offsetX: 0,
        offsetY: 0,
        // 根节点锚点位置（相对于内容区域左上角）
        rootAnchor: { x: rootAnchorX, y: rootAnchorY },
    }
}
