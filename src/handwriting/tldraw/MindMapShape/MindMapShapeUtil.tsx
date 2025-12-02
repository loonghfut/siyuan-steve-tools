import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
    HTMLContainer,
    Rectangle2d,
    ShapeUtil,
    TLResizeInfo,
    resizeBox,
    AtomMap,
    EditorAtom,
    TLShapeId,
} from '@tldraw/tldraw'
import { mindMapShapeMigrations } from './mind-map-shape-migrations'
import { mindMapShapeProps } from './mind-map-shape-props'
import {
    IMindMapShape,
    MindMapNode,
    createMindMapNode,
    findNodeById,
    findParentNode,
    deleteNodeById,
    addChildNode,
    addSiblingNode,
    updateNodeText,
    toggleNodeCollapse,
    moveNodeToParent,
    reorderNode,
} from './mind-map-shape-types'

// ===== DOM 尺寸测量 =====
// 用 EditorAtom 存储每个 shape 的测量尺寸，保证 getGeometry 响应式更新
const MindMapSizes = new EditorAtom('mind-map sizes', (editor) => {
    const map = new AtomMap<TLShapeId, { width: number; height: number }>('mind-map sizes')
    editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
        map.delete(shape.id)
    })
    return map
})

const PADDING = 20 // 内边距
const MIN_WIDTH = 1
const MIN_HEIGHT = 1

// 节点布局信息
interface NodeLayout {
    node: MindMapNode
    x: number
    y: number
    width: number
    height: number
    children: NodeLayout[]
}

// 主题颜色配置
const THEMES = {
    default: {
        rootBg: '#4A90D9',
        rootText: '#ffffff',
        nodeBg: '#ffffff',
        nodeText: '#333333',
        nodeBorder: '#cccccc',
        lineColor: '#888888',
        selectedBorder: '#4A90D9',
    },
    colorful: {
        rootBg: '#FF6B6B',
        rootText: '#ffffff',
        nodeBg: '#FFF3E0',
        nodeText: '#333333',
        nodeBorder: '#FFB74D',
        lineColor: '#FF9800',
        selectedBorder: '#E91E63',
    },
    minimal: {
        rootBg: '#333333',
        rootText: '#ffffff',
        nodeBg: '#f5f5f5',
        nodeText: '#333333',
        nodeBorder: '#e0e0e0',
        lineColor: '#999999',
        selectedBorder: '#333333',
    },
}

// 颜色数组用于不同层级
const LEVEL_COLORS = [
    '#4A90D9', '#52C41A', '#FA8C16', '#722ED1', '#EB2F96', '#13C2C2', '#F5222D'
]

export class MindMapShapeUtil extends ShapeUtil<IMindMapShape> {
    static override type = 'mind-map' as const
    static override props = mindMapShapeProps
    static override migrations = mindMapShapeMigrations

    override isAspectRatioLocked(_shape: IMindMapShape) {
        return false
    }

    override canResize(_shape: IMindMapShape) {
        return false
    }

    override canEdit() {
        return false
    }

    getDefaultProps(): IMindMapShape['props'] {
        return {
            w: 800,
            h: 500,
            color: 'black',
            rootNode: createMindMapNode('中心主题', [
                createMindMapNode('主题 1', [
                    createMindMapNode('子主题 1.1'),
                    createMindMapNode('子主题 1.2'),
                ]),
                createMindMapNode('主题 2', [
                    createMindMapNode('子主题 2.1'),
                ]),
                createMindMapNode('主题 3'),
            ]),
            horizontalGap: 50,
            verticalGap: 20,
            nodeWidth: 120,
            nodeHeight: 36,
            fontSize: 14,
            lineWidth: 2,
            direction: 'right',
            theme: 'default',
            selectedNodeId: undefined,
            version: 1,
        }
    }

    getGeometry(shape: IMindMapShape) {
        const size = MindMapSizes.get(this.editor).get(shape.id)
        return new Rectangle2d({
            width: size?.width ?? shape.props.w,
            height: size?.height ?? shape.props.h,
            isFilled: true,
        })
    }

    override onResize(shape: IMindMapShape, info: TLResizeInfo<IMindMapShape>) {
        return resizeBox(shape, info)
    }

    component(shape: IMindMapShape) {
        const editor = this.editor
        // 思维导图始终保持可编辑状态，无需进入编辑模式
        const isEditing = true
        const containerRef = useRef<HTMLDivElement>(null)
        const svgRef = useRef<SVGSVGElement>(null)
        const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
        const [editText, setEditText] = useState('')
        const inputRef = useRef<HTMLInputElement>(null)
        
        // 拖拽状态
        const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
        const [dropTargetId, setDropTargetId] = useState<string | null>(null)
        const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'child' | null>(null)
        const dragStartPos = useRef<{ x: number; y: number } | null>(null)

        const {
            rootNode,
            horizontalGap,
            verticalGap,
            nodeWidth,
            nodeHeight,
            fontSize,
            lineWidth,
            // direction, // 保留以便将来支持多方向布局
            theme: themeName,
            selectedNodeId,
        } = shape.props

        const colors = THEMES[themeName as keyof typeof THEMES] || THEMES.default

        // 获取子树高度
        const getSubtreeHeight = useCallback((layout: NodeLayout, gap: number): number => {
            if (layout.children.length === 0 || layout.node.collapsed) {
                return layout.height
            }
            let totalHeight = 0
            for (const child of layout.children) {
                totalHeight += getSubtreeHeight(child, gap) + gap
            }
            return Math.max(layout.height, totalHeight - gap)
        }, [])

        // 更新子节点位置
        const updateChildPositions = useCallback((layout: NodeLayout, hGap: number, vGap: number) => {
            if (layout.children.length === 0) return

            let totalChildHeight = 0
            for (const child of layout.children) {
                totalChildHeight += getSubtreeHeight(child, vGap) + vGap
            }
            totalChildHeight -= vGap

            let currentY = layout.y - totalChildHeight / 2

            for (const childLayout of layout.children) {
                const subtreeHeight = getSubtreeHeight(childLayout, vGap)
                childLayout.x = layout.x + layout.width + hGap
                childLayout.y = currentY + subtreeHeight / 2
                updateChildPositions(childLayout, hGap, vGap)
                currentY += subtreeHeight + vGap
            }
        }, [getSubtreeHeight])

        // 计算节点布局 - 返回布局树和边界信息
        const calculateLayoutWithBounds = useCallback((
            node: MindMapNode,
            x: number,
            y: number,
            level: number = 0
        ): { layout: NodeLayout; bounds: { minX: number; maxX: number; minY: number; maxY: number } } => {
            const layout: NodeLayout = {
                node,
                x,
                y,
                width: level === 0 ? nodeWidth * 1.2 : nodeWidth,
                height: level === 0 ? nodeHeight * 1.2 : nodeHeight,
                children: [],
            }

            let bounds = {
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
                const childResult = calculateLayoutWithBounds(child, 0, 0, level + 1)
                childLayouts.push(childResult.layout)
                totalChildHeight += getSubtreeHeight(childResult.layout, verticalGap)
            }

            // 减去最后一个节点后的间距
            if (childLayouts.length > 0) {
                totalChildHeight -= verticalGap
            }

            // 计算子节点的起始 y 位置（居中对齐）
            let currentY = y - totalChildHeight / 2

            for (let i = 0; i < childLayouts.length; i++) {
                const childLayout = childLayouts[i]
                const subtreeHeight = getSubtreeHeight(childLayout, verticalGap)
                
                // 设置子节点的实际位置
                childLayout.x = x + layout.width + horizontalGap
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
        }, [nodeWidth, nodeHeight, horizontalGap, verticalGap, getSubtreeHeight, updateChildPositions])

        // 第一次计算布局获取边界，使用临时位置
        const tempRootX = PADDING + nodeWidth * 0.6
        const tempRootY = 0 // 临时 Y 位置，后续会调整
        const { bounds: tempBounds } = calculateLayoutWithBounds(rootNode, tempRootX, tempRootY, 0)

        // 计算实际需要的尺寸
        const rawHeight = tempBounds.maxY - tempBounds.minY
        const rawWidth = tempBounds.maxX - tempBounds.minX
        const contentWidth = Math.max(rawWidth + PADDING * 2, MIN_WIDTH)
        const contentHeight = Math.max(rawHeight + PADDING * 2, MIN_HEIGHT)

        // 重新计算布局，让根节点位于内容区域的垂直中心
        const finalRootX = PADDING + nodeWidth * 0.6
        const finalRootY = contentHeight / 2
        const { layout: layoutTree, bounds } = calculateLayoutWithBounds(rootNode, finalRootX, finalRootY, 0)

        // 计算偏移量，确保所有节点都在可视区域内
        const offsetX = 0 // X 已经正确定位
        const offsetY = PADDING - bounds.minY // 调整 Y 偏移确保顶部有 padding

        // 更新 DOM 尺寸到 AtomMap
        const updateDomSize = useCallback(() => {
            const nextWidth = Math.max(contentWidth, MIN_WIDTH)
            const nextHeight = Math.max(contentHeight, MIN_HEIGHT)
            
            MindMapSizes.update(editor, (map) => {
                const existing = map.get(shape.id)
                if (existing && existing.height === nextHeight && existing.width === nextWidth) return map
                return map.set(shape.id, { width: nextWidth, height: nextHeight })
            })
        }, [editor, shape.id, contentWidth, contentHeight])

        // 在渲染后更新尺寸
        useLayoutEffect(() => {
            updateDomSize()
        }, [updateDomSize])

        // 当 rootNode 变化时重新计算尺寸
        useEffect(() => {
            updateDomSize()
        }, [rootNode, updateDomSize])

        // 深拷贝根节点
        const deepCloneRootNode = (node: MindMapNode): MindMapNode => {
            return {
                ...node,
                children: node.children.map(deepCloneRootNode),
            }
        }

        // 更新形状
        const updateShape = useCallback((newRootNode: MindMapNode, newSelectedId?: string) => {
            editor.updateShape<IMindMapShape>({
                id: shape.id,
                type: 'mind-map',
                props: {
                    ...shape.props,
                    rootNode: newRootNode,
                    selectedNodeId: newSelectedId,
                },
            })
        }, [shape.id, shape.props])

        // 选择节点
        const handleSelectNode = useCallback((nodeId: string, e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            
            const newRoot = deepCloneRootNode(rootNode)
            updateShape(newRoot, nodeId)
        }, [rootNode, updateShape])

        // 双击编辑节点
        const handleDoubleClick = useCallback((nodeId: string, text: string, e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            
            setEditingNodeId(nodeId)
            setEditText(text)
        }, [])

        // 完成编辑
        const handleFinishEdit = useCallback(() => {
            if (editingNodeId && editText.trim()) {
                const newRoot = deepCloneRootNode(rootNode)
                updateNodeText(newRoot, editingNodeId, editText.trim())
                updateShape(newRoot, editingNodeId)
            }
            setEditingNodeId(null)
            setEditText('')
        }, [editingNodeId, editText, rootNode, updateShape])

        // 拖拽开始
        const handleDragStart = useCallback((nodeId: string, e: React.PointerEvent) => {
            // 根节点不可拖拽
            if (nodeId === rootNode.id) return
            
            e.stopPropagation()
            dragStartPos.current = { x: e.clientX, y: e.clientY }
            setDraggingNodeId(nodeId)
        }, [rootNode.id])

        // 拖拽移动 - 计算放置目标
        const handleDragMove = useCallback((targetNodeId: string, e: React.PointerEvent) => {
            if (!draggingNodeId || draggingNodeId === targetNodeId) return
            
            // 不能拖到自己的子节点上
            const draggingNode = findNodeById(rootNode, draggingNodeId)
            if (draggingNode) {
                // 检查 targetNodeId 是否在 draggingNode 的子树中
                const checkIsChild = (node: MindMapNode, targetId: string): boolean => {
                    if (node.id === targetId) return true
                    for (const child of node.children) {
                        if (checkIsChild(child, targetId)) return true
                    }
                    return false
                }
                if (checkIsChild(draggingNode, targetNodeId)) return
            }
            
            e.stopPropagation()
            setDropTargetId(targetNodeId)
            
            // 计算放置位置：上1/3为before，中1/3为child，下1/3为after
            const rect = (e.target as Element).getBoundingClientRect()
            const relativeY = e.clientY - rect.top
            const third = rect.height / 3
            
            if (relativeY < third) {
                setDropPosition('before')
            } else if (relativeY > third * 2) {
                setDropPosition('after')
            } else {
                setDropPosition('child')
            }
        }, [draggingNodeId, rootNode])

        // 拖拽结束
        const handleDragEnd = useCallback(() => {
            if (draggingNodeId && dropTargetId && dropPosition) {
                const newRoot = deepCloneRootNode(rootNode)
                
                if (dropPosition === 'child') {
                    // 移动为目标节点的子节点
                    moveNodeToParent(newRoot, draggingNodeId, dropTargetId)
                } else {
                    // 移动为目标节点的兄弟节点
                    const targetParent = findParentNode(newRoot, dropTargetId)
                    if (targetParent) {
                        // 找到目标节点在父节点中的索引
                        const targetIndex = targetParent.children.findIndex(c => c.id === dropTargetId)
                        if (targetIndex !== -1) {
                            const insertIndex = dropPosition === 'before' ? targetIndex : targetIndex + 1
                            // 先移动到父节点
                            moveNodeToParent(newRoot, draggingNodeId, targetParent.id)
                            // 再调整顺序
                            reorderNode(newRoot, draggingNodeId, insertIndex)
                        }
                    } else if (dropTargetId === rootNode.id) {
                        // 放到根节点上
                        moveNodeToParent(newRoot, draggingNodeId, rootNode.id)
                    }
                }
                
                updateShape(newRoot, draggingNodeId)
            }
            
            // 重置拖拽状态
            setDraggingNodeId(null)
            setDropTargetId(null)
            setDropPosition(null)
            dragStartPos.current = null
        }, [draggingNodeId, dropTargetId, dropPosition, rootNode, updateShape])

        // 取消拖拽
        const handleDragCancel = useCallback(() => {
            setDraggingNodeId(null)
            setDropTargetId(null)
            setDropPosition(null)
            dragStartPos.current = null
        }, [])

        // 键盘事件处理
        const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
            if (!isEditing || !selectedNodeId) return
            
            e.stopPropagation()
            
            const newRoot = deepCloneRootNode(rootNode)
            
            switch (e.key) {
                case 'Tab': {
                    // 添加子节点
                    e.preventDefault()
                    const newNode = createMindMapNode('新节点')
                    addChildNode(newRoot, selectedNodeId, newNode)
                    // 展开父节点
                    const parentNode = findNodeById(newRoot, selectedNodeId)
                    if (parentNode) parentNode.collapsed = false
                    updateShape(newRoot, newNode.id)
                    break
                }
                case 'Enter': {
                    // 添加兄弟节点
                    e.preventDefault()
                    if (selectedNodeId === rootNode.id) {
                        // 根节点不能添加兄弟
                        const newNode = createMindMapNode('新节点')
                        addChildNode(newRoot, selectedNodeId, newNode)
                        updateShape(newRoot, newNode.id)
                    } else {
                        const newNode = createMindMapNode('新节点')
                        addSiblingNode(newRoot, selectedNodeId, newNode)
                        updateShape(newRoot, newNode.id)
                    }
                    break
                }
                case 'Delete':
                case 'Backspace': {
                    // 删除节点
                    if (selectedNodeId !== rootNode.id) {
                        e.preventDefault()
                        const parent = findParentNode(newRoot, selectedNodeId)
                        deleteNodeById(newRoot, selectedNodeId)
                        updateShape(newRoot, parent?.id)
                    }
                    break
                }
                case ' ': {
                    // 折叠/展开
                    e.preventDefault()
                    toggleNodeCollapse(newRoot, selectedNodeId)
                    updateShape(newRoot, selectedNodeId)
                    break
                }
                case 'F2': {
                    // 编辑节点
                    e.preventDefault()
                    const node = findNodeById(rootNode, selectedNodeId)
                    if (node) {
                        setEditingNodeId(selectedNodeId)
                        setEditText(node.text)
                    }
                    break
                }
            }
        }, [isEditing, selectedNodeId, rootNode, updateShape])

        // 聚焦输入框
        useEffect(() => {
            if (editingNodeId && inputRef.current) {
                inputRef.current.focus()
                inputRef.current.select()
            }
        }, [editingNodeId])

        // 编辑模式时自动聚焦容器以接收键盘事件
        useEffect(() => {
            if (isEditing && containerRef.current && !editingNodeId) {
                containerRef.current.focus()
            }
        }, [isEditing, editingNodeId])

        // 点击空白区域时清除选中
        const handleContainerClick = useCallback((e: React.MouseEvent) => {
            // 只有当点击的是容器本身（不是节点）时才清除选中
            if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
                if (isEditing && selectedNodeId) {
                    const newRoot = deepCloneRootNode(rootNode)
                    updateShape(newRoot, undefined)
                }
            }
        }, [isEditing, selectedNodeId, rootNode, updateShape])

        // 渲染节点
        const renderNode = (layout: NodeLayout, level: number = 0): React.ReactNode => {
            const { node, x, y, width, height } = layout
            const isRoot = level === 0
            const isSelected = node.id === selectedNodeId
            const isCurrentEditing = node.id === editingNodeId
            const hasChildren = node.children.length > 0
            const isDragging = node.id === draggingNodeId
            const isDropTarget = node.id === dropTargetId

            // 获取节点颜色
            let bgColor = isRoot ? colors.rootBg : colors.nodeBg
            let textColor = isRoot ? colors.rootText : colors.nodeText
            let borderColor = isSelected ? colors.selectedBorder : colors.nodeBorder

            // colorful 主题使用层级颜色
            if (themeName === 'colorful' && !isRoot) {
                const colorIndex = (level - 1) % LEVEL_COLORS.length
                borderColor = isSelected ? colors.selectedBorder : LEVEL_COLORS[colorIndex]
            }

            // 自定义节点颜色
            if (node.color) {
                bgColor = node.color
            }

            // 拖拽时的样式
            if (isDragging) {
                bgColor = 'rgba(128, 128, 128, 0.5)'
            }

            // 放置目标的高亮
            let dropIndicator = null
            if (isDropTarget && dropPosition) {
                const indicatorColor = '#4A90D9'
                if (dropPosition === 'child') {
                    // 作为子节点 - 高亮整个节点
                    borderColor = indicatorColor
                } else if (dropPosition === 'before') {
                    // 在节点之前 - 显示上方线条
                    dropIndicator = (
                        <line
                            x1={0}
                            y1={-4}
                            x2={width}
                            y2={-4}
                            stroke={indicatorColor}
                            strokeWidth={3}
                            strokeLinecap="round"
                        />
                    )
                } else if (dropPosition === 'after') {
                    // 在节点之后 - 显示下方线条
                    dropIndicator = (
                        <line
                            x1={0}
                            y1={height + 4}
                            x2={width}
                            y2={height + 4}
                            stroke={indicatorColor}
                            strokeWidth={3}
                            strokeLinecap="round"
                        />
                    )
                }
            }

            return (
                <React.Fragment key={node.id}>
                    {/* 渲染连接线 - 从节点右边中心到子节点左边中心 */}
                    {layout.children.map((childLayout) => (
                        <path
                            key={`line-${node.id}-${childLayout.node.id}`}
                            d={`M ${x + width / 2} ${y} 
                                C ${x + width / 2 + horizontalGap / 2} ${y},
                                  ${childLayout.x - childLayout.width / 2 - horizontalGap / 2} ${childLayout.y},
                                  ${childLayout.x - childLayout.width / 2} ${childLayout.y}`}
                            fill="none"
                            stroke={colors.lineColor}
                            strokeWidth={lineWidth}
                        />
                    ))}

                    {/* 渲染节点 */}
                    <g
                        transform={`translate(${x - width / 2}, ${y - height / 2})`}
                        onClick={(e) => handleSelectNode(node.id, e)}
                        onDoubleClick={(e) => handleDoubleClick(node.id, node.text, e)}
                        onPointerDown={(e) => {
                            // 只在节点上阻止事件冒泡，允许形状拖动
                            e.stopPropagation()
                            // 开始拖拽
                            handleDragStart(node.id, e)
                        }}
                        onPointerMove={(e) => {
                            // 拖拽移动时计算放置目标
                            if (draggingNodeId) {
                                handleDragMove(node.id, e)
                            }
                        }}
                        onPointerUp={(e) => {
                            // 拖拽结束
                            if (draggingNodeId) {
                                e.stopPropagation()
                                handleDragEnd()
                            }
                        }}
                        onPointerLeave={() => {
                            // 离开节点时清除放置目标
                            if (dropTargetId === node.id) {
                                setDropTargetId(null)
                                setDropPosition(null)
                            }
                        }}
                        style={{ 
                            cursor: isDragging ? 'grabbing' : 'grab', 
                            pointerEvents: 'all',
                            opacity: isDragging ? 0.6 : 1,
                        }}
                    >
                        {/* 放置指示器 */}
                        {dropIndicator}
                        
                        <rect
                            width={width}
                            height={height}
                            rx={isRoot ? height / 2 : 4}
                            ry={isRoot ? height / 2 : 4}
                            fill={bgColor}
                            stroke={isDropTarget && dropPosition === 'child' ? '#4A90D9' : borderColor}
                            strokeWidth={isSelected || (isDropTarget && dropPosition === 'child') ? 3 : 1}
                        />
                        
                        {/* 节点文本或输入框 */}
                        {isCurrentEditing ? (
                            <foreignObject x={4} y={4} width={width - 8} height={height - 8}>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    onBlur={handleFinishEdit}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleFinishEdit()
                                        } else if (e.key === 'Escape') {
                                            setEditingNodeId(null)
                                            setEditText('')
                                        }
                                        e.stopPropagation()
                                    }}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        border: 'none',
                                        outline: 'none',
                                        background: 'transparent',
                                        fontSize: `${fontSize}px`,
                                        textAlign: 'center',
                                        color: textColor,
                                    }}
                                />
                            </foreignObject>
                        ) : (
                            <text
                                x={width / 2}
                                y={height / 2}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill={textColor}
                                fontSize={isRoot ? fontSize * 1.2 : fontSize}
                                fontWeight={isRoot ? 'bold' : 'normal'}
                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                            >
                                {node.text.length > 10 ? node.text.slice(0, 10) + '...' : node.text}
                            </text>
                        )}

                        {/* 折叠/展开按钮 - 有子节点时显示 */}
                        {hasChildren && (
                            <g
                                transform={`translate(${width - 8}, ${height / 2})`}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    const newRoot = deepCloneRootNode(rootNode)
                                    toggleNodeCollapse(newRoot, node.id)
                                    updateShape(newRoot, selectedNodeId)
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                style={{ cursor: 'pointer', pointerEvents: 'all' }}
                            >
                                <circle r={8} fill={colors.nodeBg} stroke={colors.nodeBorder} />
                                <text
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fontSize={12}
                                    fill={colors.nodeText}
                                >
                                    {node.collapsed ? '+' : '−'}
                                </text>
                            </g>
                        )}
                    </g>

                    {/* 递归渲染子节点 */}
                    {!node.collapsed && layout.children.map((childLayout) => 
                        renderNode(childLayout, level + 1)
                    )}
                </React.Fragment>
            )
        }

        return (
            <HTMLContainer
                id={shape.id}
                style={{
                    width: contentWidth,
                    height: contentHeight,
                    pointerEvents: 'all',
                }}
            >
                <div
                    ref={containerRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onClick={handleContainerClick}
                    onPointerUp={() => {
                        // 在空白区域释放时取消拖拽
                        if (draggingNodeId) {
                            handleDragCancel()
                        }
                    }}
                    style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'transparent',
                        borderRadius: 8,
                        overflow: 'hidden',
                        // outline: selectedNodeId ? '2px solid #4A90D9' : 'none',
                        position: 'relative',
                    }}
                >
                    <svg
                        ref={svgRef}
                        width={contentWidth}
                        height={contentHeight}
                        style={{ display: 'block', pointerEvents: 'none' }}
                    >
                        {/* 渲染整个思维导图 - 使用计算出的偏移量 */}
                        <g transform={`translate(${offsetX}, ${offsetY})`}>
                            {renderNode(layoutTree, 0)}
                        </g>
                    </svg>
                </div>
            </HTMLContainer>
        )
    }

    indicator(shape: IMindMapShape) {
        const { width, height } = this.editor.getShapeGeometry(shape).bounds
        return (
            <rect
                width={width}
                height={height}
                rx={8}
                ry={8}
            />
        )
    }
}
