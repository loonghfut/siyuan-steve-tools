// ===== 思维导图 UI 组件 =====

import React from 'react'
import { NodeLayout, LayoutDirection } from './mind-map-layout'
import { getContrastTextColor, truncateText } from './mind-map-utils'
import {
    NODE_COLORS,
    THEMES,
    ThemeName,
    MAX_NODE_WIDTH,
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

// ===== 确认对话框组件 =====

export interface ConfirmDialogProps {
    message: string
    onConfirm: () => void
    onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    message,
    onConfirm,
    onCancel,
}) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    
    React.useEffect(() => {
        if (containerRef.current) containerRef.current.focus()
    }, [])
    
    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1100,
                pointerEvents: 'all',
            }}
            onClick={(e) => {
                e.stopPropagation()
                onCancel()
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                ref={containerRef}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        onConfirm()
                    } else if (e.key === 'Escape') {
                        e.preventDefault()
                        onCancel()
                    }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: '#fff',
                    borderRadius: 8,
                    padding: 20,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                    minWidth: 280,
                    maxWidth: 400,
                }}
            >
                <div style={{ 
                    marginBottom: 16, 
                    fontSize: 14, 
                    color: '#333',
                    lineHeight: 1.5,
                }}>
                    ⚠️ {message}
                </div>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    gap: 8 
                }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '6px 16px',
                            border: '1px solid #d9d9d9',
                            borderRadius: 4,
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            fontSize: 13,
                        }}
                    >
                        取消
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '6px 16px',
                            border: 'none',
                            borderRadius: 4,
                            backgroundColor: '#1890ff',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 13,
                        }}
                    >
                        确定
                    </button>
                </div>
            </div>
        </div>
    )
}

// ===== 右键上下文菜单组件 =====

export interface ContextMenuProps {
    position: { x: number; y: number }
    containerWidth: number
    containerHeight: number
    isRootNode: boolean
    onAddChild: () => void
    onAddSibling: () => void
    onDelete: () => void
    onEdit: () => void
    onPasteMarkdown: () => void
    onPasteMarkdownReplace: () => void
    onExportMarkdown: () => void
    onExportMarkdownList: () => void
    onOpenColorPicker: () => void
    onClose: () => void
    // 用于显示确认对话框
    showConfirm?: (message: string, onConfirm: () => void) => void
}

const CONTEXT_MENU_WIDTH = 160
const CONTEXT_MENU_ITEM_HEIGHT = 32

export const ContextMenu: React.FC<ContextMenuProps> = ({
    position,
    containerWidth,
    containerHeight,
    isRootNode,
    onAddChild,
    onAddSibling,
    onDelete,
    onEdit,
    onPasteMarkdown,
    onPasteMarkdownReplace,
    onExportMarkdown,
    onExportMarkdownList,
    onOpenColorPicker,
    onClose,
    showConfirm,
}) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    
    React.useEffect(() => {
        if (containerRef.current) containerRef.current.focus()
    }, [])
    
    // 计算菜单位置，避免超出容器
    // 菜单项数量：根节点少2项（删除和添加兄弟节点），加上2条分隔线
    const menuItems = isRootNode ? 7 : 8
    const separatorCount = isRootNode ? 1 : 2
    const menuHeight = menuItems * CONTEXT_MENU_ITEM_HEIGHT + separatorCount * 9 + 8 // 8是padding
    
    let adjustedX = position.x + 8
    let adjustedY = position.y
    
    // 水平方向：优先右侧，不够则左侧，都不够则贴左边
    if (adjustedX + CONTEXT_MENU_WIDTH > containerWidth - 10) {
        adjustedX = position.x - CONTEXT_MENU_WIDTH - 8
    }
    if (adjustedX < 5) {
        adjustedX = 5
    }
    
    // 垂直方向：优先下方，不够则上方，都不够则贴顶部
    if (adjustedY + menuHeight > containerHeight - 10) {
        adjustedY = position.y - menuHeight
    }
    if (adjustedY < 5) {
        adjustedY = 5
    }
    
    const menuItemStyle: React.CSSProperties = {
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: 13,
        color: '#333',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 4,
    }
    
    const menuItemHoverStyle = {
        backgroundColor: '#f0f0f0',
    }
    
    const MenuItem: React.FC<{
        onClick: () => void
        icon?: string
        children: React.ReactNode
        disabled?: boolean
        shortcut?: string
        closeOnClick?: boolean  // 是否在点击后关闭菜单，默认 true
    }> = ({ onClick, icon, children, disabled, shortcut, closeOnClick = true }) => {
        const [isHovered, setIsHovered] = React.useState(false)
        
        return (
            <div
                onClick={() => {
                    if (!disabled) {
                        onClick()
                        if (closeOnClick) {
                            onClose()
                        }
                    }
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{
                    ...menuItemStyle,
                    ...(isHovered && !disabled ? menuItemHoverStyle : {}),
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    justifyContent: 'space-between',
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {icon && <span>{icon}</span>}
                    {children}
                </span>
                {shortcut && (
                    <span style={{ fontSize: 11, color: '#999' }}>{shortcut}</span>
                )}
            </div>
        )
    }
    
    return (
        <div
            ref={containerRef}
            tabIndex={0}
            onBlur={(e) => {
                // 检查是否点击了菜单内的元素
                if (!containerRef.current?.contains(e.relatedTarget as Node)) {
                    onClose()
                }
            }}
            style={{
                position: 'absolute',
                left: adjustedX,
                top: adjustedY,
                backgroundColor: '#fff',
                border: '1px solid #d9d9d9',
                borderRadius: 8,
                padding: 4,
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                zIndex: 1000,
                minWidth: CONTEXT_MENU_WIDTH,
                pointerEvents: 'all',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <MenuItem onClick={onEdit} icon="✏️" shortcut="F2">编辑节点</MenuItem>
            <MenuItem onClick={onAddChild} icon="➕" shortcut="Tab">添加子节点</MenuItem>
            {!isRootNode && (
                <MenuItem onClick={onAddSibling} icon="↔️" shortcut="Enter">添加兄弟节点</MenuItem>
            )}
            <MenuItem onClick={onOpenColorPicker} icon="🎨" closeOnClick={false}>节点颜色</MenuItem>
            <div style={{ height: 1, backgroundColor: '#e8e8e8', margin: '4px 0' }} />
            <MenuItem onClick={onPasteMarkdown} icon="📋" shortcut="Ctrl+V">粘贴 Markdown</MenuItem>
            <MenuItem 
                onClick={() => {
                    if (showConfirm) {
                        showConfirm('此操作将替换整个思维导图，是否继续？', onPasteMarkdownReplace)
                    } else {
                        onPasteMarkdownReplace()
                    }
                }} 
                icon="📥" 
                shortcut="Ctrl+Shift+V"
            >
                替换为 Markdown
            </MenuItem>
            <MenuItem onClick={onExportMarkdown} icon="📤">导出为标题格式</MenuItem>
            <MenuItem onClick={onExportMarkdownList} icon="📝">导出为列表格式</MenuItem>
            {!isRootNode && (
                <>
                    <div style={{ height: 1, backgroundColor: '#e8e8e8', margin: '4px 0' }} />
                    <MenuItem onClick={onDelete} icon="🗑️" shortcut="Del">删除节点</MenuItem>
                </>
            )}
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

    // 折叠按钮尺寸根据字体大小动态调整，保证可点击性
    const btnSize = Math.max(12, Math.round(fontSize * 1.0))

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
                        x={direction === 'left' ? -(COLLAPSE_BUTTON_GAP + btnSize + 4) : 0}
                        y={direction === 'up' ? -(COLLAPSE_BUTTON_GAP + btnSize + 4) : 0}
                        width={direction === 'left' || direction === 'right' 
                            ? width + COLLAPSE_BUTTON_GAP + btnSize + 4 
                            : width}
                        height={direction === 'up' || direction === 'down' 
                            ? height + COLLAPSE_BUTTON_GAP + btnSize + 4 
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
                            const btnOffset = COLLAPSE_BUTTON_GAP + btnSize / 2
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
                        <circle r={btnSize / 2} fill={colors.nodeBg === 'transparent' ? 'var(--b3-theme-background, #ffffff)' : colors.nodeBg} stroke={colors.nodeBorder === 'transparent' ? 'var(--b3-border-color, #cccccc)' : colors.nodeBorder} />
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
