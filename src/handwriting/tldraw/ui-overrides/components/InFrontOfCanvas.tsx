/**
 * 画布前层组件
 * 包含素材库面板、文档大纲面板、子文档面板和选中元素的浮动操作按钮
 */
import React from 'react'
import { useEditor, useValue, TLShapeId } from '@tldraw/tldraw'
import { showMessage, openTab } from 'siyuan'
import { ShapeLibraryPanel } from '../../shapelibrary/ShapeLibraryPanel'
import { DocOutlinePanel } from '../../doc-outline/DocOutlinePanel'
import { ChildDocsPanel } from '../../doc-outline/ChildDocsPanel'
import {
    useShapeLibraryOpen,
    toggleShapeLibrary,
    useDocOutlineOpen,
    toggleDocOutline,
    setDocOutlineDocId,
    useChildDocsOpen,
    toggleChildDocs,
} from '../panel-state'
import { CardLikeShape, isCardLikeShape, isOverlayShape } from '../types'
import type { ICardShape } from '../../CardShape/card-shape-types'
import type { IJsShape } from '../../JsShape/js-shape-types'
import { armAddConnectedSingleBlock, isArmed as isAddPending } from '../../utils/pendingConnectedSingleBlock'

export const InFrontOfCanvas: React.FC = () => {
    const editor = useEditor()
    const isLibraryOpen = useShapeLibraryOpen()
    const isDocOutlineOpen = useDocOutlineOpen()
    const isChildDocsOpen = useChildDocsOpen()

    // 获取白板绑定的文档ID
    const container = editor.getContainer()
    const editorElement = container?.closest('.tldraw__editor')
    const boundDocId = editorElement?.getAttribute('data-tldraw-id')

    // 当绑定的文档ID变化时，更新到全局状态
    React.useEffect(() => {
        if (boundDocId) {
            setDocOutlineDocId(boundDocId)
        }
    }, [boundDocId])

    // 获取选中元素信息
    const selectionInfo = useValue(
        'selection bounds',
        () => {
            const selectedShapes = editor.getSelectedShapes()
            if (selectedShapes.length !== 1) {
                return null
            }

            const selectedShape = selectedShapes[0]
            if (!isOverlayShape(selectedShape)) {
                return null
            }

            const screenBounds = editor.getViewportScreenBounds()
            const rotatedScreenBounds = editor.getSelectionRotatedScreenBounds()
            if (!rotatedScreenBounds) return null

            return {
                id: selectedShape.id,
                x: rotatedScreenBounds.x - screenBounds.x,
                y: rotatedScreenBounds.y - screenBounds.y,
                width: rotatedScreenBounds.width,
                height: rotatedScreenBounds.height,
                rotation: editor.getSelectionRotation() || 0
            }
        },
        [editor]
    )

    const selectedShape = selectionInfo ? editor.getShape(selectionInfo.id) : null
    const isValidSelection = selectedShape && isOverlayShape(selectedShape)

    const isSingleBlockSelection = isValidSelection && selectedShape.type === 'single-block'
    const isCardOrBlock = isValidSelection && isCardLikeShape(selectedShape)
    const isJsShapeSelection = isValidSelection && selectedShape.type === 'js-shape'
    const selectedJsShape = isJsShapeSelection ? (selectedShape as IJsShape) : null

    // 手形工具点击跳转功能
    const pointerDownPoint = React.useRef<{ x: number; y: number } | null>(null)
    const pointerMovedWhileDown = React.useRef(false)
    React.useEffect(() => {
        const container = editor.getContainer()
        if (!container) return

        const isInteractiveTarget = (target: EventTarget | null) => {
            if (!(target instanceof Element)) return false
            return Boolean(target.closest('button, [role="button"], input, textarea, select, [contenteditable="true"]'))
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (event.button !== 0 || isInteractiveTarget(event.target) || event.defaultPrevented) {
                pointerDownPoint.current = null
                return
            }
            pointerDownPoint.current = { x: event.clientX, y: event.clientY }
            pointerMovedWhileDown.current = false
        }

        const handlePointerMove = (event: PointerEvent) => {
            const start = pointerDownPoint.current
            if (!start) return
            const dx = event.clientX - start.x
            const dy = event.clientY - start.y
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                pointerMovedWhileDown.current = true
            }
        }

        const handlePointerUp = (event: PointerEvent) => {
            const start = pointerDownPoint.current
            pointerDownPoint.current = null
            if (event.button !== 0 || !start || pointerMovedWhileDown.current || event.defaultPrevented) {
                pointerMovedWhileDown.current = false
                return
            }
            if (editor.getCurrentToolId() !== 'hand') return
            if (isInteractiveTarget(event.target)) return

            const pagePoint = editor.screenToPage({ x: event.clientX, y: event.clientY })
            const targetShape = editor.getShapeAtPoint(pagePoint, {
                hitInside: true,
                filter: (shape) => isCardLikeShape(shape) && Boolean((shape as CardLikeShape).props.blockId),
            })
            if (!targetShape || !isCardLikeShape(targetShape)) return
            const blockId = (targetShape as CardLikeShape).props.blockId
            if (!blockId) {
                console.error('未找到块ID')
                return
            }
            void openTab({
                app: window.siyuan.ws.app,
                doc: {
                    id: blockId,
                    action: ['cb-get-hl', 'cb-get-all'],
                    zoomIn: false,
                },
                position: 'right',
                keepCursor: false,
            }).catch((err) => {
                console.error('跳转到笔记失败', err)
                showMessage('跳转到笔记失败', 3000, 'error')
            })
        }

        container.addEventListener('pointerdown', handlePointerDown, { passive: true })
        container.addEventListener('pointermove', handlePointerMove, { passive: true })
        container.addEventListener('pointerup', handlePointerUp, { passive: true })
        container.addEventListener('pointercancel', handlePointerUp, { passive: true })

        return () => {
            container.removeEventListener('pointerdown', handlePointerDown)
            container.removeEventListener('pointermove', handlePointerMove)
            container.removeEventListener('pointerup', handlePointerUp)
            container.removeEventListener('pointercancel', handlePointerUp)
        }
    }, [editor])

    const buttonStyle = {
        width: '32px',
        height: '32px',
        margin: '0 4px',
        borderRadius: '4px',
        background: 'var(--b3-theme-background)',
        border: '1px solid var(--b3-border-color)',
        color: 'var(--b3-theme-on-background)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)'
    }

    return (
        <>
            {/* 素材库面板 */}
            <ShapeLibraryPanel
                isOpen={isLibraryOpen}
                onClose={() => toggleShapeLibrary()}
            />

            {/* 文档大纲面板 */}
            <DocOutlinePanel
                isOpen={isDocOutlineOpen}
                onClose={() => toggleDocOutline()}
                docId={boundDocId || null}
            />

            {/* 子文档面板 */}
            <ChildDocsPanel
                isOpen={isChildDocsOpen}
                onClose={() => toggleChildDocs()}
                docId={boundDocId || null}
            />

            {/* 选中元素的操作按钮 */}
            {selectionInfo && isValidSelection && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transform: `translate(${selectionInfo.x + selectionInfo.width / 2 - 115}px, ${selectionInfo.y - 40 + Math.sin(selectionInfo.rotation) * Math.abs(selectionInfo.width)}px)`,
                        display: 'flex',
                        pointerEvents: 'all',
                        zIndex: 1
                    }}
                >
                    {isCardOrBlock && (
                        <>
                            <button
                                style={buttonStyle}
                                onClick={() => {
                                    editor.setEditingShape(selectionInfo.id)
                                }}
                                title="编辑内容"
                            >
                                ✏️
                            </button>
                            <button
                                style={buttonStyle}
                                onClick={() => {
                                    const shape = editor.getShape(selectionInfo.id)
                                    if (!isCardLikeShape(shape)) return

                                    const shapeLabel = shape.type === 'card' ? '卡片' : '块'
                                    editor.updateShape({
                                        id: selectionInfo.id,
                                        type: shape.type,
                                        props: {
                                            ...shape.props,
                                            refreshNonce: Date.now(),
                                        },
                                    })
                                    showMessage(`${shapeLabel}已刷新`)
                                }}
                                title="刷新卡片"
                            >
                                🔄
                            </button>
                            <button
                                style={{
                                    ...buttonStyle,
                                    display: selectedShape.type === 'card' ? undefined : 'none',
                                }}
                                onClick={() => {
                                    const shape = editor.getShape(selectionInfo.id)
                                    if (!shape || shape.type !== 'card') return

                                    const card = shape as ICardShape
                                    const collapsed = !!card.props?.isCollapsed
                                    const nextCollapsed = !collapsed
                                    const collapsedHeight = Math.max((card.props.fontSize || 16) * 6, card.props.isMain ? 260 : 180)
                                    const nextProps = {
                                        ...card.props,
                                        isCollapsed: nextCollapsed,
                                    } as ICardShape['props']

                                    if (nextCollapsed) {
                                        nextProps.preCollapseHeight = card.props.h
                                        nextProps.h = collapsedHeight
                                    } else if (card.props.preCollapseHeight && card.props.preCollapseHeight > 0) {
                                        nextProps.h = card.props.preCollapseHeight
                                    }

                                    editor.updateShape({
                                        id: card.id,
                                        type: 'card',
                                        props: nextProps,
                                    })
                                }}
                                title={
                                    ((editor.getShape(selectionInfo.id) as ICardShape | undefined)?.props?.isCollapsed)
                                        ? '展开卡片'
                                        : '折叠卡片'
                                }
                            >
                                {((editor.getShape(selectionInfo.id) as ICardShape | undefined)?.props?.isCollapsed) ? '▶' : '▼'}
                            </button>
                            <button
                                style={buttonStyle}
                                onClick={() => {
                                    const shape = editor.getShape(selectionInfo.id)
                                    if (!isCardLikeShape(shape)) return

                                    const currentSize = shape.props.fontSize || 16
                                    const newSize = currentSize + 2
                                    editor.updateShape({
                                        id: selectionInfo.id,
                                        type: shape.type,
                                        props: {
                                            ...shape.props,
                                            fontSize: newSize,
                                        },
                                    })
                                }}
                                title="放大字体"
                            >
                                A+
                            </button>
                            <button
                                style={buttonStyle}
                                onClick={() => {
                                    const shape = editor.getShape(selectionInfo.id)
                                    if (!isCardLikeShape(shape)) return

                                    const currentSize = shape.props.fontSize || 16
                                    const newSize = currentSize - 2
                                    editor.updateShape({
                                        id: selectionInfo.id,
                                        type: shape.type,
                                        props: {
                                            ...shape.props,
                                            fontSize: newSize,
                                        },
                                    })
                                }}
                                title="减小字体"
                            >
                                A-
                            </button>
                            {isSingleBlockSelection && (
                                <button
                                    style={{
                                        ...buttonStyle,
                                        background: isAddPending(editor, selectionInfo.id)
                                            ? 'var(--b3-accent-background)' : buttonStyle.background,
                                        boxShadow: isAddPending(editor, selectionInfo.id)
                                            ? '0 0 0 3px rgba(0, 128, 255, 0.12)' : buttonStyle.boxShadow,
                                    }}
                                    onClick={() => armAddConnectedSingleBlock(editor, selectionInfo.id)}
                                    title="点击后将在你下一次点击的位置创建关联单块（按住 Ctrl 点击可连续放置；Esc 取消）"
                                >
                                    ❇️
                                </button>
                            )}
                            <button
                                style={buttonStyle}
                                onClick={async () => {
                                    const shape = editor.getShape(selectionInfo.id)
                                    if (!isCardLikeShape(shape) || !shape.props.blockId) {
                                        console.error('未找到块ID')
                                        return
                                    }
                                    const blockId = shape.props.blockId
                                    await openTab({
                                        app: window.siyuan.ws.app,
                                        doc: {
                                            id: blockId,
                                            action: ['cb-get-hl', 'cb-get-all'],
                                        },
                                        position: 'right',
                                        keepCursor: false,
                                    })
                                }}
                                title="跳转到笔记"
                            >
                                🔗
                            </button>
                        </>
                    )}
                    {isJsShapeSelection && (
                        <>
                            <button
                                style={buttonStyle}
                                onClick={() => editor.emit('sttools:editJsShape', selectionInfo.id)}
                                title="打开脚本编辑器"
                            >
                                {'</>'}
                            </button>
                            <button
                                style={buttonStyle}
                                onClick={() => {
                                    editor.emit('sttools:rerunJsShape', selectionInfo.id)
                                    showMessage('脚本已重新执行')
                                }}
                                title="手动重新执行脚本"
                            >
                                ⚡
                            </button>
                            <button
                                style={{
                                    ...buttonStyle,
                                    background: selectedJsShape?.props.interactive === true
                                        ? 'rgba(59,130,246,0.15)'
                                        : buttonStyle.background,
                                }}
                                onClick={() => {
                                    const shape = editor.getShape(selectionInfo.id)
                                    if (!shape || shape.type !== 'js-shape') return
                                    const jsShape = shape as IJsShape
                                    editor.updateShape({
                                        id: jsShape.id,
                                        type: 'js-shape',
                                        props: {
                                            ...jsShape.props,
                                            interactive: !(jsShape.props.interactive === true),
                                        },
                                    })
                                }}
                                title={(selectedJsShape?.props.interactive === true)
                                    ? '禁用 DOM 交互 (恢复画布拖拽)'
                                    : '允许 DOM 交互'}
                            >
                                🖱️
                            </button>
                        </>
                    )}
                </div>
            )}
        </>
    )
}
