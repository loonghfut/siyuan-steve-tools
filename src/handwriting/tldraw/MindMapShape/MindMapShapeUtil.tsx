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
    useValue,
} from '@tldraw/tldraw'
import { mindMapShapeMigrations } from './mind-map-shape-migrations'
import { mindMapShapeProps } from './mind-map-shape-props'
import {
    IMindMapShape,
    MindMapNode,
    createMindMapNode,
    findNodeById,
} from './mind-map-shape-types'
import { ThemeName } from './mind-map-constants'
import { calculateFullLayout } from './mind-map-layout'
import { MindMapNodeRenderer, ColorPicker, ContextMenu, ConfirmDialog } from './mind-map-components'
import {
    deepCloneRootNode,
    useDragHandlers,
    useEditHandlers,
    useContextMenu,
    useKeyboardHandlers,
    useNodeSelection,
} from './mind-map-hooks'

// ===== DOM 尺寸测量 =====
// 用 EditorAtom 存储每个 shape 的测量尺寸，保证 getGeometry 响应式更新
const MindMapSizes = new EditorAtom('mind-map sizes', (editor) => {
    const map = new AtomMap<TLShapeId, { width: number; height: number }>('mind-map sizes')
    editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
        map.delete(shape.id)
    })
    return map
})

// 存储每个 shape 的根节点锚点位置，用于保持根节点位置稳定
const MindMapRootAnchors = new EditorAtom('mind-map root-anchors', (editor) => {
    const map = new AtomMap<TLShapeId, { x: number; y: number }>('mind-map root-anchors')
    editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
        map.delete(shape.id)
    })
    return map
})

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
        return true
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
        const containerRef = useRef<HTMLDivElement>(null)
        const svgRef = useRef<SVGSVGElement>(null)
        const inputRef = useRef<HTMLInputElement>(null)

        const {
            rootNode,
            horizontalGap,
            verticalGap,
            nodeHeight,
            fontSize,
            lineWidth,
            theme: themeName,
            selectedNodeId,
            direction,
        } = shape.props

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
        }, [editor, shape.id, shape.props])

        // 使用自定义 hooks
        const {
            draggingNodeId,
            dropTargetId,
            dropPosition,
            handleDragStart,
            handleDragMove,
            handleDragEnd,
            handleDragCancel,
            clearDropTarget,
        } = useDragHandlers(rootNode, updateShape)

        const {
            editingNodeId,
            editText,
            setEditText,
            handleDoubleClick,
            handleFinishEdit,
            handleCancelEdit,
            setEditingNodeId,
        } = useEditHandlers(rootNode, updateShape)

        // 替换整个思维导图根节点的函数
        const replaceRootNode = useCallback((newRootNode: MindMapNode) => {
            editor.updateShape<IMindMapShape>({
                id: shape.id,
                type: 'mind-map',
                props: {
                    ...shape.props,
                    rootNode: newRootNode,
                    selectedNodeId: newRootNode.id,
                },
            })
        }, [editor, shape.id, shape.props])

        const {
            menuState,
            showColorPicker,
            openContextMenu,
            closeContextMenu,
            handleAddChild,
            handleAddSibling,
            handleDelete,
            handlePasteMarkdown,
            handlePasteMarkdownReplace,
            handleExportMarkdown,
            handleExportMarkdownList,
            handleOpenColorPicker,
            handleColorChange,
        } = useContextMenu(rootNode, updateShape, replaceRootNode)

        const { handleKeyDown } = useKeyboardHandlers(
            rootNode,
            selectedNodeId,
            updateShape,
            setEditingNodeId,
            setEditText,
            replaceRootNode
        )

        const { handleSelectNode, handleToggleCollapse } = useNodeSelection(rootNode, updateShape)

        // 确认对话框状态
        const [confirmDialog, setConfirmDialog] = useState<{
            message: string
            onConfirm: () => void
        } | null>(null)

        // 显示确认对话框的函数
        const showConfirm = useCallback((message: string, onConfirm: () => void) => {
            setConfirmDialog({ message, onConfirm })
        }, [])

        // 关闭确认对话框
        const closeConfirmDialog = useCallback(() => {
            setConfirmDialog(null)
        }, [])

        // 编辑节点的处理函数（从上下文菜单调用）
        const handleEditFromMenu = useCallback(() => {
            if (menuState.nodeId) {
                const node = findNodeById(rootNode, menuState.nodeId)
                if (node) {
                    setEditingNodeId(menuState.nodeId)
                    setEditText(node.text)
                }
            }
        }, [menuState.nodeId, rootNode, setEditingNodeId, setEditText])

        // 计算布局（传入方向参数）
        const layoutDirection = (direction || 'right') as 'right' | 'left' | 'up' | 'down'
        const { layoutTree, contentWidth, contentHeight, offsetX, offsetY, rootAnchor } = calculateFullLayout(
            rootNode,
            nodeHeight,
            fontSize,
            horizontalGap,
            verticalGap,
            layoutDirection
        )

        // 更新 DOM 尺寸并调整 shape 位置以保持根节点稳定
        const updateDomSizeAndPosition = useCallback(() => {
            const prevAnchor = MindMapRootAnchors.get(editor).get(shape.id)
            
            // 更新尺寸
            MindMapSizes.update(editor, (map) => {
                const existing = map.get(shape.id)
                if (existing && existing.height === contentHeight && existing.width === contentWidth) return map
                return map.set(shape.id, { width: contentWidth, height: contentHeight })
            })

            // 更新锚点
            MindMapRootAnchors.update(editor, (map) => {
                return map.set(shape.id, rootAnchor)
            })

            // 如果有之前的锚点位置，计算位置偏移并调整 shape 位置
            if (prevAnchor && (prevAnchor.x !== rootAnchor.x || prevAnchor.y !== rootAnchor.y)) {
                const deltaX = rootAnchor.x - prevAnchor.x
                const deltaY = rootAnchor.y - prevAnchor.y
                
                // 调整 shape 位置以补偿锚点偏移，保持根节点在画布上的绝对位置不变
                const currentShape = editor.getShape<IMindMapShape>(shape.id)
                if (currentShape) {
                    editor.updateShape<IMindMapShape>({
                        id: shape.id,
                        type: 'mind-map',
                        x: currentShape.x - deltaX,
                        y: currentShape.y - deltaY,
                    })
                }
            }
        }, [editor, shape.id, contentWidth, contentHeight, rootAnchor])

        // 在渲染后更新尺寸
        useLayoutEffect(() => {
            updateDomSizeAndPosition()
        }, [updateDomSizeAndPosition])

        // 当 rootNode 变化时重新计算尺寸
        useEffect(() => {
            updateDomSizeAndPosition()
        }, [rootNode, updateDomSizeAndPosition])

        // 聚焦输入框
        useEffect(() => {
            if (editingNodeId && inputRef.current) {
                inputRef.current.focus()
                inputRef.current.select()
            }
        }, [editingNodeId])

        // 编辑模式时自动聚焦容器以接收键盘事件
        useEffect(() => {
            if (containerRef.current && !editingNodeId) {
                containerRef.current.focus()
            }
        }, [editingNodeId])

        // 监听 tldraw 编辑状态，退出编辑模式时清除选中
        const isEditingThisShape = useValue(
            'is editing this shape',
            () => editor.getEditingShapeId() === shape.id,
            [editor, shape.id]
        )
        
        // 监听当前形状是否被选中
        const isThisShapeSelected = useValue(
            'is this shape selected',
            () => editor.getSelectedShapeIds().includes(shape.id),
            [editor, shape.id]
        )
        
        useEffect(() => {
            // 当退出编辑模式或形状不再被选中时，清除节点选中
            if ((!isEditingThisShape || !isThisShapeSelected) && selectedNodeId) {
                const newRoot = deepCloneRootNode(rootNode)
                updateShape(newRoot, undefined)
            }
        }, [isEditingThisShape, isThisShapeSelected])

        // 点击空白区域时清除选中
        const handleContainerClick = useCallback((e: React.MouseEvent) => {
            const target = e.target as HTMLElement | SVGElement
            const tagName = target.tagName.toLowerCase()
            // 点击的是容器、SVG 或透明背景 rect 时取消选中
            if (e.target === e.currentTarget || tagName === 'svg' || (tagName === 'rect' && target.getAttribute('fill') === 'transparent')) {
                if (selectedNodeId) {
                    const newRoot = deepCloneRootNode(rootNode)
                    updateShape(newRoot, undefined)
                }
            }
        }, [selectedNodeId, rootNode, updateShape])

        // 处理折叠按钮点击
        const handleToggleCollapseClick = useCallback((nodeId: string, e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            handleToggleCollapse(nodeId, selectedNodeId)
        }, [handleToggleCollapse, selectedNodeId])

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
                    onClick={(e) => {
                        handleContainerClick(e)
                        if (menuState.nodeId) {
                            closeContextMenu()
                        }
                    }}
                    onPointerUp={() => {
                        if (draggingNodeId) {
                            handleDragCancel()
                        }
                    }}
                    style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'transparent',
                        borderRadius: 8,
                        overflow: 'visible', // 允许菜单溢出容器边界
                        position: 'relative',
                    }}
                >
                    <svg
                        ref={svgRef}
                        width={contentWidth}
                        height={contentHeight}
                        style={{ display: 'block' }}
                        onClick={(e) => {
                            handleContainerClick(e)
                            if (menuState.nodeId) {
                                closeContextMenu()
                            }
                        }}
                    >
                        {/* 透明背景，用于捕获空白区域的点击事件 */}
                        <rect
                            width={contentWidth}
                            height={contentHeight}
                            fill="transparent"
                            style={{ pointerEvents: 'all' }}
                        />
                        <g transform={`translate(${offsetX}, ${offsetY})`}>
                            <MindMapNodeRenderer
                                layout={layoutTree}
                                level={0}
                                themeName={themeName as ThemeName}
                                fontSize={fontSize}
                                lineWidth={lineWidth}
                                horizontalGap={horizontalGap}
                                verticalGap={verticalGap}
                                direction={layoutDirection}
                                selectedNodeId={selectedNodeId}
                                editingNodeId={editingNodeId}
                                editText={editText}
                                draggingNodeId={draggingNodeId}
                                dropTargetId={dropTargetId}
                                dropPosition={dropPosition}
                                inputRef={inputRef}
                                onSelectNode={handleSelectNode}
                                onDoubleClick={handleDoubleClick}
                                onContextMenu={openContextMenu}
                                onDragStart={handleDragStart}
                                onDragMove={handleDragMove}
                                onDragEnd={handleDragEnd}
                                onDropTargetLeave={clearDropTarget}
                                onToggleCollapse={handleToggleCollapseClick}
                                onEditTextChange={setEditText}
                                onFinishEdit={handleFinishEdit}
                                onCancelEdit={handleCancelEdit}
                            />
                        </g>
                    </svg>
                    
                    {/* 上下文菜单弹窗 */}
                    {menuState.nodeId && menuState.position && !showColorPicker && (
                        <ContextMenu
                            position={{
                                x: menuState.position.x + offsetX,
                                y: menuState.position.y + offsetY,
                            }}
                            containerWidth={contentWidth}
                            containerHeight={contentHeight}
                            isRootNode={menuState.isRootNode}
                            onAddChild={handleAddChild}
                            onAddSibling={handleAddSibling}
                            onDelete={handleDelete}
                            onEdit={handleEditFromMenu}
                            onPasteMarkdown={handlePasteMarkdown}
                            onPasteMarkdownReplace={handlePasteMarkdownReplace}
                            onExportMarkdown={handleExportMarkdown}
                            onExportMarkdownList={handleExportMarkdownList}
                            onOpenColorPicker={handleOpenColorPicker}
                            onClose={closeContextMenu}
                            showConfirm={showConfirm}
                        />
                    )}

                    {/* 颜色选择器弹窗 */}
                    {menuState.nodeId && menuState.position && showColorPicker && (
                        <ColorPicker
                            position={{
                                x: menuState.position.x + offsetX,
                                y: menuState.position.y + offsetY,
                            }}
                            containerWidth={contentWidth}
                            onColorChange={handleColorChange}
                            onClose={closeContextMenu}
                        />
                    )}

                    {/* 确认对话框 */}
                    {confirmDialog && (
                        <ConfirmDialog
                            message={confirmDialog.message}
                            onConfirm={() => {
                                confirmDialog.onConfirm()
                                closeConfirmDialog()
                                closeContextMenu()
                            }}
                            onCancel={closeConfirmDialog}
                        />
                    )}
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
