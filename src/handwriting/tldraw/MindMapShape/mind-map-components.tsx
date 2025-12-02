// ===== 思维导图 UI 组件 =====

import React from 'react'
import { NodeLayout, LayoutDirection } from './mind-map-layout'
import { getContrastTextColor, truncateText } from './mind-map-utils'
import {
    NODE_COLORS,
    THEMES,
    ThemeName,
    MAX_NODE_WIDTH,
    COLLAPSE_BUTTON_SIZE,
    COLLAPSE_BUTTON_GAP,
    NodeStyle,
} from './mind-map-constants'

// ===== 类型定义 =====

export interface NodeRenderProps {
    layout: NodeLayout
    level: number
    themeName: ThemeName
    fontSize: number
    lineWidth: number
    horizontalGap: number
    verticalGap: number
    direction: LayoutDirection
    selectedNodeId?: string
    editingNodeId: string | null
    editText: string
    draggingNodeId: string | null
    dropTargetId: string | null
    dropPosition: 'before' | 'after' | 'child' | null
    inputRef: React.RefObject<HTMLInputElement>
    // 事件处理
    onSelectNode: (nodeId: string, e: React.MouseEvent) => void
    onDoubleClick: (nodeId: string, text: string, e: React.MouseEvent) => void
    onContextMenu: (nodeId: string, nodeX: number, nodeY: number, nodeWidth: number, nodeHeight: number, e: React.MouseEvent) => void
    onDragStart: (nodeId: string, e: React.PointerEvent) => void
    onDragMove: (nodeId: string, e: React.PointerEvent) => void
    onDragEnd: () => void
    onDropTargetLeave: (nodeId: string) => void
    onToggleCollapse: (nodeId: string, e: React.MouseEvent) => void
    onEditTextChange: (text: string) => void
    onFinishEdit: () => void
    onCancelEdit: () => void
}

export interface ColorPickerProps {
    position: { x: number; y: number }
    containerWidth: number
    onColorChange: (color: string | undefined) => void
    onClose?: () => void
}

// ===== 颜色选择器组件 =====

// 颜色选择器的宽度：4列 * 24px + 3个间隙 * 4px + padding 16px = 124px
const COLOR_PICKER_WIDTH = 124

export const ColorPicker: React.FC<ColorPickerProps> = ({
    position,
    containerWidth,
    onColorChange,
    onClose,
}) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    React.useEffect(() => {
        // 自动聚焦以便能够监听失焦事件
        if (containerRef.current) containerRef.current.focus()
    }, [])
    // 计算是否需要向左偏移以避免超出容器
    const shouldAlignLeft = position.x + COLOR_PICKER_WIDTH > containerWidth - 10
    const adjustedX = shouldAlignLeft ? position.x - COLOR_PICKER_WIDTH - 8 : position.x + 8
    
    return (
        <div
            ref={containerRef}
            tabIndex={0}
            onBlur={() => { onClose && onClose() }}
            style={{
                position: 'absolute',
                left: adjustedX,
                top: position.y,
                backgroundColor: '#fff',
                border: '1px solid #d9d9d9',
                borderRadius: 8,
                padding: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 1000,
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 24px)',
                gap: 4,
                pointerEvents: 'all',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* 纯色选项 */}
            {NODE_COLORS.map((color) => (
                <div
                    key={color}
                    onClick={() => onColorChange(color)}
                    style={{
                        width: 24,
                        height: 24,
                        backgroundColor: color,
                        border: '1px solid #d9d9d9',
                        borderRadius: 4,
                        cursor: 'pointer',
                    }}
                />
            ))}
            {/* 无填充样式 */}
            <div
                onClick={() => onColorChange('none')}
                style={{
                    width: 24,
                    height: 24,
                    background: 'repeating-linear-gradient(45deg, #f5f5f5 0, #f5f5f5 4px, #ccc 4px, #ccc 8px)',
                    border: '1px solid #d9d9d9',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                }}
                title="无填充"
            >
                空
            </div>
            {/* 重置颜色（回到主题默认） */}
            <div
                onClick={() => onColorChange(undefined)}
                style={{
                    width: 24,
                    height: 24,
                    backgroundColor: '#fff',
                    border: '1px solid #d9d9d9',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    color: '#999',
                }}
                title="重置为主题默认颜色"
            >
                ✕
            </div>
        </div>
    )
}

// ===== 节点渲染组件 =====

export const MindMapNodeRenderer: React.FC<NodeRenderProps> = ({
    layout,
    level,
    themeName,
    fontSize,
    lineWidth,
    horizontalGap,
    verticalGap,
    direction,
    selectedNodeId,
    editingNodeId,
    editText,
    draggingNodeId,
    dropTargetId,
    dropPosition,
    inputRef,
    onSelectNode,
    onDoubleClick,
    onContextMenu,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDropTargetLeave,
    onToggleCollapse,
    onEditTextChange,
    onFinishEdit,
    onCancelEdit,
}) => {
    const { node, x, y, width, height } = layout
    const isRoot = level === 0
    const isSelected = node.id === selectedNodeId
    const isCurrentEditing = node.id === editingNodeId
    const hasChildren = node.children.length > 0
    const isDragging = node.id === draggingNodeId
    const isDropTarget = node.id === dropTargetId
    
    // 悬浮状态 - 用于控制折叠按钮的显示
    const [isHovered, setIsHovered] = React.useState(false)

    const colors = THEMES[themeName] || THEMES.default
    const nodeStyle: NodeStyle = colors.nodeStyle || 'box'

    // 获取节点颜色
    let bgColor = isRoot ? colors.rootBg : colors.nodeBg
    let textColor = isRoot ? colors.rootText : colors.nodeText
    let borderColor = isSelected ? colors.selectedBorder : colors.nodeBorder

    // 自定义节点颜色
    if (node.color === 'none') {
        bgColor = 'transparent'
        textColor = 'var(--b3-theme-on-background)'
    } else if (node.color) {
        // 对于无边框主题，颜色应用到文字；对于下划线主题，颜色应用到下划线；其他主题应用到背景
        if (nodeStyle === 'none') {
            bgColor = 'transparent'
            textColor = node.color
        } else if (nodeStyle === 'underline') {
            bgColor = 'transparent'
            borderColor = node.color
            textColor = colors.nodeText
        } else {
            bgColor = node.color
            textColor = getContrastTextColor(node.color)
        }
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
            borderColor = indicatorColor
        } else if (dropPosition === 'before') {
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

    // 计算显示文本
    const displayFontSize = isRoot ? fontSize * 1.2 : fontSize
    const displayFontWeight = isRoot ? 'bold' : 'normal'
    const maxWidth = isRoot ? MAX_NODE_WIDTH * 1.2 : MAX_NODE_WIDTH
    const displayText = truncateText(node.text, displayFontSize, displayFontWeight, maxWidth)

    // 根据方向计算连接线路径
    const getConnectionPath = (childLayout: NodeLayout) => {
        const cx = childLayout.x
        const cy = childLayout.y
        const cw = childLayout.width
        const ch = childLayout.height

        switch (direction) {
            case 'left':
                // 父节点左边中心 -> 子节点右边中心
                return `M ${x - width / 2} ${y} 
                        C ${x - width / 2 - horizontalGap / 2} ${y},
                          ${cx + cw / 2 + horizontalGap / 2} ${cy},
                          ${cx + cw / 2} ${cy}`
            case 'down':
                // 父节点下边中心 -> 子节点上边中心
                return `M ${x} ${y + height / 2} 
                        C ${x} ${y + height / 2 + verticalGap / 2},
                          ${cx} ${cy - ch / 2 - verticalGap / 2},
                          ${cx} ${cy - ch / 2}`
            case 'up':
                // 父节点上边中心 -> 子节点下边中心
                return `M ${x} ${y - height / 2} 
                        C ${x} ${y - height / 2 - verticalGap / 2},
                          ${cx} ${cy + ch / 2 + verticalGap / 2},
                          ${cx} ${cy + ch / 2}`
            case 'right':
            default:
                // 父节点右边中心 -> 子节点左边中心
                return `M ${x + width / 2} ${y} 
                        C ${x + width / 2 + horizontalGap / 2} ${y},
                          ${cx - cw / 2 - horizontalGap / 2} ${cy},
                          ${cx - cw / 2} ${cy}`
        }
    }

    return (
        <React.Fragment key={node.id}>
            {/* 渲染连接线 */}
            {layout.children.map((childLayout) => (
                <path
                    key={`line-${node.id}-${childLayout.node.id}`}
                    d={getConnectionPath(childLayout)}
                    fill="none"
                    stroke={colors.lineColor}
                    strokeWidth={lineWidth}
                />
            ))}

            {/* 渲染节点 */}
            <g
                transform={`translate(${x - width / 2}, ${y - height / 2})`}
                onClick={(e) => onSelectNode(node.id, e)}
                onDoubleClick={(e) => onDoubleClick(node.id, node.text, e)}
                onContextMenu={(e) => onContextMenu(node.id, x, y, width, height, e)}
                onPointerDown={(e) => {
                    e.stopPropagation()
                    onDragStart(node.id, e)
                }}
                onPointerMove={(e) => {
                    if (draggingNodeId) {
                        onDragMove(node.id, e)
                    }
                }}
                onPointerUp={(e) => {
                    if (draggingNodeId) {
                        e.stopPropagation()
                        onDragEnd()
                    }
                }}
                onPointerLeave={() => {
                    if (dropTargetId === node.id) {
                        onDropTargetLeave(node.id)
                    }
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{ 
                    cursor: isDragging ? 'grabbing' : 'grab', 
                    pointerEvents: 'all',
                    opacity: isDragging ? 0.6 : 1,
                }}
            >
                {/* 扩展的悬浮检测区域 - 包含折叠按钮区域（根据方向调整） */}
                {hasChildren && (
                    <rect
                        x={direction === 'left' ? -(COLLAPSE_BUTTON_GAP + COLLAPSE_BUTTON_SIZE + 4) : 0}
                        y={direction === 'up' ? -(COLLAPSE_BUTTON_GAP + COLLAPSE_BUTTON_SIZE + 4) : 0}
                        width={direction === 'left' || direction === 'right' 
                            ? width + COLLAPSE_BUTTON_GAP + COLLAPSE_BUTTON_SIZE + 4 
                            : width}
                        height={direction === 'up' || direction === 'down' 
                            ? height + COLLAPSE_BUTTON_GAP + COLLAPSE_BUTTON_SIZE + 4 
                            : height}
                        fill="transparent"
                        stroke="none"
                        style={{ pointerEvents: 'all' }}
                    />
                )}
                
                {/* 放置指示器 */}
                {dropIndicator}
                
                {/* 根据 nodeStyle 渲染不同样式的节点 */}
                {nodeStyle === 'underline' && !isRoot ? (
                    // 下划线样式：只有底部边框 + 透明点击区域
                    <>
                        {/* 透明点击区域 */}
                        <rect
                            width={width}
                            height={height}
                            fill="transparent"
                            stroke="none"
                        />
                        <line
                            x1={0}
                            y1={height}
                            x2={width}
                            y2={height}
                            stroke={isSelected ? colors.selectedBorder : borderColor}
                            strokeWidth={isSelected ? 3 : 2}
                        />
                    </>
                ) : nodeStyle === 'none' && !isRoot ? (
                    // 无边框样式：透明点击区域（选中时显示虚线边框）
                    <rect
                        width={width}
                        height={height}
                        rx={4}
                        ry={4}
                        fill="transparent"
                        stroke={isSelected ? colors.selectedBorder : 'transparent'}
                        strokeWidth={isSelected ? 2 : 0}
                        strokeDasharray={isSelected ? '4 2' : 'none'}
                    />
                ) : (
                    // 默认 box 样式
                    <rect
                        width={width}
                        height={height}
                        rx={isRoot ? height / 2 : 4}
                        ry={isRoot ? height / 2 : 4}
                        fill={bgColor}
                        stroke={isDropTarget && dropPosition === 'child' ? '#4A90D9' : borderColor}
                        strokeWidth={isSelected || (isDropTarget && dropPosition === 'child') ? 3 : 1}
                    />
                )}
                
                {/* 节点文本或输入框 */}
                {isCurrentEditing ? (
                    <foreignObject x={4} y={4} width={width - 8} height={height - 8}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={editText}
                            onChange={(e) => onEditTextChange(e.target.value)}
                            onBlur={onFinishEdit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    onFinishEdit()
                                } else if (e.key === 'Escape') {
                                    onCancelEdit()
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
                        fontSize={displayFontSize}
                        fontWeight={displayFontWeight}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                        {displayText}
                    </text>
                )}

                {/* 折叠/展开按钮 - 有子节点时显示，悬浮或已折叠时可见 */}
                {hasChildren && (isHovered || node.collapsed || isSelected) && (
                    <g
                        transform={(() => {
                            const btnOffset = COLLAPSE_BUTTON_GAP + COLLAPSE_BUTTON_SIZE / 2
                            switch (direction) {
                                case 'left':
                                    return `translate(${-btnOffset}, ${height / 2})`
                                case 'down':
                                    return `translate(${width / 2}, ${height + btnOffset})`
                                case 'up':
                                    return `translate(${width / 2}, ${-btnOffset})`
                                case 'right':
                                default:
                                    return `translate(${width + btnOffset}, ${height / 2})`
                            }
                        })()}
                        onClick={(e) => onToggleCollapse(node.id, e)}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer', pointerEvents: 'all' }}
                    >
                        <circle r={COLLAPSE_BUTTON_SIZE / 2} fill={colors.nodeBg === 'transparent' ? 'var(--b3-theme-background, #ffffff)' : colors.nodeBg} stroke={colors.nodeBorder === 'transparent' ? 'var(--b3-border-color, #cccccc)' : colors.nodeBorder} />
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
            {!node.collapsed && layout.children.map((childLayout) => (
                <MindMapNodeRenderer
                    key={childLayout.node.id}
                    layout={childLayout}
                    level={level + 1}
                    themeName={themeName}
                    fontSize={fontSize}
                    lineWidth={lineWidth}
                    horizontalGap={horizontalGap}
                    verticalGap={verticalGap}
                    direction={direction}
                    selectedNodeId={selectedNodeId}
                    editingNodeId={editingNodeId}
                    editText={editText}
                    draggingNodeId={draggingNodeId}
                    dropTargetId={dropTargetId}
                    dropPosition={dropPosition}
                    inputRef={inputRef}
                    onSelectNode={onSelectNode}
                    onDoubleClick={onDoubleClick}
                    onContextMenu={onContextMenu}
                    onDragStart={onDragStart}
                    onDragMove={onDragMove}
                    onDragEnd={onDragEnd}
                    onDropTargetLeave={onDropTargetLeave}
                    onToggleCollapse={onToggleCollapse}
                    onEditTextChange={onEditTextChange}
                    onFinishEdit={onFinishEdit}
                    onCancelEdit={onCancelEdit}
                />
            ))}
        </React.Fragment>
    )
}
