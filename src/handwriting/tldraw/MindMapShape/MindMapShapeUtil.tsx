import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
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
} from './mind-map-shape-types'
import { ThemeName } from './mind-map-constants'
import { calculateFullLayout } from './mind-map-layout'
import { MindMapNodeRenderer, ColorPicker } from './mind-map-components'
import {
    deepCloneRootNode,
    useDragHandlers,
    useEditHandlers,
    useColorPicker,
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

        const {
            colorPickerNodeId,
            colorPickerPos,
            handleContextMenu,
            handleColorChange,
            closeColorPicker,
        } = useColorPicker(rootNode, updateShape)

        const { handleKeyDown } = useKeyboardHandlers(
            rootNode,
            selectedNodeId,
            updateShape,
            setEditingNodeId,
            setEditText
        )

        const { handleSelectNode, handleToggleCollapse } = useNodeSelection(rootNode, updateShape)

        // 计算布局
        const { layoutTree, contentWidth, contentHeight, offsetX, offsetY } = calculateFullLayout(
            rootNode,
            nodeHeight,
            fontSize,
            horizontalGap,
            verticalGap
        )

        // 更新 DOM 尺寸到 AtomMap
        const updateDomSize = useCallback(() => {
            MindMapSizes.update(editor, (map) => {
                const existing = map.get(shape.id)
                if (existing && existing.height === contentHeight && existing.width === contentWidth) return map
                return map.set(shape.id, { width: contentWidth, height: contentHeight })
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

        // 点击空白区域时清除选中
        const handleContainerClick = useCallback((e: React.MouseEvent) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
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
                        if (colorPickerNodeId) {
                            closeColorPicker()
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
                        overflow: 'hidden',
                        position: 'relative',
                    }}
                >
                    <svg
                        ref={svgRef}
                        width={contentWidth}
                        height={contentHeight}
                        style={{ display: 'block', pointerEvents: 'none' }}
                    >
                        <g transform={`translate(${offsetX}, ${offsetY})`}>
                            <MindMapNodeRenderer
                                layout={layoutTree}
                                level={0}
                                themeName={themeName as ThemeName}
                                fontSize={fontSize}
                                lineWidth={lineWidth}
                                horizontalGap={horizontalGap}
                                selectedNodeId={selectedNodeId}
                                editingNodeId={editingNodeId}
                                editText={editText}
                                draggingNodeId={draggingNodeId}
                                dropTargetId={dropTargetId}
                                dropPosition={dropPosition}
                                inputRef={inputRef}
                                onSelectNode={handleSelectNode}
                                onDoubleClick={handleDoubleClick}
                                onContextMenu={handleContextMenu}
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
                    
                    {/* 颜色选择器弹窗 */}
                    {colorPickerNodeId && colorPickerPos && (
                        <ColorPicker
                            position={{
                                x: colorPickerPos.x + offsetX,
                                y: colorPickerPos.y + offsetY,
                            }}
                            onColorChange={handleColorChange}
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
