import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

// 思维导图节点类型
export interface MindMapNode {
    id: string
    text: string
    children: MindMapNode[]
    collapsed?: boolean // 是否折叠子节点
    color?: string // 节点颜色
}

// 思维导图形状类型
export type IMindMapShape = TLBaseShape<
    'mind-map',
    {
        w: number
        h: number
        color: TLDefaultColorStyle
        // 思维导图根节点数据
        rootNode: MindMapNode
        // 节点间距配置
        horizontalGap: number // 水平间距
        verticalGap: number // 垂直间距
        // 样式配置
        nodeWidth: number // 节点宽度
        nodeHeight: number // 节点高度
        fontSize: number // 字体大小
        lineWidth: number // 连接线宽度
        // 布局方向: 'right' | 'left' | 'both'
        direction: string
        // 主题: 'default' | 'colorful' | 'minimal'
        theme: string
        // 当前选中的节点ID
        selectedNodeId?: string
        // 版本号
        version?: number
    }
>

// 创建新节点的辅助函数
export function createMindMapNode(text: string = '新节点', children: MindMapNode[] = []): MindMapNode {
    return {
        id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text,
        children,
        collapsed: false,
    }
}

// 深度克隆节点
export function cloneMindMapNode(node: MindMapNode): MindMapNode {
    return {
        ...node,
        id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        children: node.children.map(cloneMindMapNode),
    }
}

// 查找节点
export function findNodeById(root: MindMapNode, id: string): MindMapNode | null {
    if (root.id === id) return root
    for (const child of root.children) {
        const found = findNodeById(child, id)
        if (found) return found
    }
    return null
}

// 查找父节点
export function findParentNode(root: MindMapNode, nodeId: string): MindMapNode | null {
    for (const child of root.children) {
        if (child.id === nodeId) return root
        const found = findParentNode(child, nodeId)
        if (found) return found
    }
    return null
}

// 删除节点
export function deleteNodeById(root: MindMapNode, id: string): boolean {
    const idx = root.children.findIndex(c => c.id === id)
    if (idx !== -1) {
        root.children.splice(idx, 1)
        return true
    }
    for (const child of root.children) {
        if (deleteNodeById(child, id)) return true
    }
    return false
}

// 添加子节点
export function addChildNode(root: MindMapNode, parentId: string, newNode: MindMapNode): boolean {
    if (root.id === parentId) {
        root.children.push(newNode)
        return true
    }
    for (const child of root.children) {
        if (addChildNode(child, parentId, newNode)) return true
    }
    return false
}

// 添加兄弟节点
export function addSiblingNode(root: MindMapNode, nodeId: string, newNode: MindMapNode, position: 'before' | 'after' = 'after'): boolean {
    const idx = root.children.findIndex(c => c.id === nodeId)
    if (idx !== -1) {
        const insertIdx = position === 'after' ? idx + 1 : idx
        root.children.splice(insertIdx, 0, newNode)
        return true
    }
    for (const child of root.children) {
        if (addSiblingNode(child, nodeId, newNode, position)) return true
    }
    return false
}

// 更新节点文本
export function updateNodeText(root: MindMapNode, nodeId: string, text: string): boolean {
    const node = findNodeById(root, nodeId)
    if (node) {
        node.text = text
        return true
    }
    return false
}

// 切换节点折叠状态
export function toggleNodeCollapse(root: MindMapNode, nodeId: string): boolean {
    const node = findNodeById(root, nodeId)
    if (node) {
        node.collapsed = !node.collapsed
        return true
    }
    return false
}

// 移动节点到新的父节点下
export function moveNodeToParent(root: MindMapNode, nodeId: string, newParentId: string, insertIndex?: number): boolean {
    // 不能移动根节点
    if (root.id === nodeId) return false
    
    // 不能移动到自己或自己的子节点下
    const nodeToMove = findNodeById(root, nodeId)
    if (!nodeToMove) return false
    
    // 检查 newParentId 是否是 nodeId 的子节点
    const isDescendant = (parent: MindMapNode, targetId: string): boolean => {
        if (parent.id === targetId) return true
        for (const child of parent.children) {
            if (isDescendant(child, targetId)) return true
        }
        return false
    }
    if (isDescendant(nodeToMove, newParentId)) return false
    
    // 从原父节点中删除
    const oldParent = findParentNode(root, nodeId)
    if (!oldParent) return false
    
    const oldIndex = oldParent.children.findIndex(c => c.id === nodeId)
    if (oldIndex === -1) return false
    
    // 移除节点
    const [removedNode] = oldParent.children.splice(oldIndex, 1)
    
    // 添加到新父节点
    const newParent = findNodeById(root, newParentId)
    if (!newParent) {
        // 恢复原状
        oldParent.children.splice(oldIndex, 0, removedNode)
        return false
    }
    
    // 如果指定了插入位置
    if (typeof insertIndex === 'number' && insertIndex >= 0) {
        newParent.children.splice(Math.min(insertIndex, newParent.children.length), 0, removedNode)
    } else {
        newParent.children.push(removedNode)
    }
    
    // 确保新父节点展开
    newParent.collapsed = false
    
    return true
}

// 在同一父节点下重新排序节点
export function reorderNode(root: MindMapNode, nodeId: string, newIndex: number): boolean {
    const parent = findParentNode(root, nodeId)
    if (!parent) return false
    
    const oldIndex = parent.children.findIndex(c => c.id === nodeId)
    if (oldIndex === -1) return false
    
    const [node] = parent.children.splice(oldIndex, 1)
    const targetIndex = Math.max(0, Math.min(newIndex, parent.children.length))
    parent.children.splice(targetIndex, 0, node)
    
    return true
}
