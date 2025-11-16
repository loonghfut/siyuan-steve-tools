import {
    DefaultKeyboardShortcutsDialog,
    DefaultKeyboardShortcutsDialogContent,
    DefaultToolbar,
    DefaultToolbarContent,
    TLComponents,
    TLUiOverrides,
    TldrawUiMenuItem,
    computed,
    useIsToolSelected,
    useTools,
    useEditor,
    useValue,
    stopEventPropagation,
    DefaultStylePanel,
    DefaultMainMenu,
    TldrawUiMenuGroup,
    DefaultMainMenuContent,
    track, // 导入 track
    useRelevantStyles,
    DefaultStylePanelContent,
    DefaultQuickActions,
    DefaultQuickActionsContent, // 导入 useRelevantStyles
} from '@tldraw/tldraw'

// Extend the TLEventMap interface to include custom events
declare module '@tldraw/tldraw' {
    interface TLEventMap {
        'sttools:importData': () => void
        'sttools:backupData': () => void
        'sttools:exportData': () => void
    }
}
import React from 'react';
import { $currentSlide, getSlides, moveToSlide } from './SlideShape/useSlides';
import { captureSlideScreenshot } from './SlideShape/captureSlideScreenshot';
import { SlidesPanel } from './SlideShape/SlidesPanel';
import { ICardShape } from './CardShape/card-shape-types';
import { ISingleBlockShape } from './SingleBlockShape/single-block-shape-types';
import { SlideShape } from './SlideShape/SlideShapeUtil';
import { openTab, showMessage } from 'siyuan';
import { upload, appendBlock, updateBlock, getBlockByID } from '@/api/api'
import { getCursorBlockId } from '@/api/api2'
import { settingdata } from '@/index';
// There's a guide at the bottom of this file!

type CardLikeShape = ICardShape | ISingleBlockShape;

const isCardLikeShape = (shape: any): shape is CardLikeShape =>
    shape?.type === 'card' || shape?.type === 'single-block';

export const uiOverrides: TLUiOverrides = {
    tools(editor, tools) {
        // Create a tool item in the ui's context.
        // console.log('tools', tools)
        tools.card = {
            id: 'card',
            icon: 'color',
            label: 'Card',
            kbd: 'c',
            onSelect: () => {
                editor.setCurrentTool('card')
            },
        }
        tools['single-block'] = {
            id: 'single-block',
            icon: 'bulletList',
            label: 'Single Block',
            kbd: 'b',
            onSelect: () => {
                editor.setCurrentTool('single-block')
            },
        }
        tools.slide = {
            id: 'slide',
            icon: 'group',
            label: 'Slide',
            kbd: 's',
            onSelect: () => editor.setCurrentTool('slide'),
        }
        tools['mindmap-node'] = {
            id: 'mindmap-node',
            icon: 'activity', // 你可以选择一个更合适的图标
            label: 'MindMap Node',
            kbd: 'm', // 设置键盘快捷键
            onSelect: () => {
                editor.setCurrentTool('mindmap-node')
            },
        }
        return tools
    },
    actions(editor, actions) {
        const $slides = computed('slides', () => getSlides(editor))
        return {
            ...actions,
            'next-slide': {
                id: 'next-slide',
                label: 'Next slide',
                kbd: 'right',
                onSelect() {
                    const slides = $slides.get()
                    const currentSlide = $currentSlide.get()
                    const index = slides.findIndex((s) => s.id === currentSlide?.id)
                    const nextSlide = slides[index + 1] ?? currentSlide ?? slides[0]
                    if (nextSlide) {
                        editor.stopCameraAnimation()
                        moveToSlide(editor, nextSlide)
                    }
                },
            },
            'previous-slide': {
                id: 'previous-slide',
                label: 'Previous slide',
                kbd: 'left',
                onSelect() {
                    const slides = $slides.get()
                    const currentSlide = $currentSlide.get()
                    const index = slides.findIndex((s) => s.id === currentSlide?.id)
                    const previousSlide = slides[index - 1] ?? currentSlide ?? slides[slides.length - 1]
                    if (previousSlide) {
                        editor.stopCameraAnimation()
                        moveToSlide(editor, previousSlide)
                    }
                },
            },
            'zoom-in': {
                ...actions['zoom-in'], // Keep default behavior
                kbd: '',
            },
            'zoom-out': {
                ...actions['zoom-out'], // Keep default behavior
                kbd: '',
            },
            // 'toggle-grid': { ...actions['toggle-grid'], kbd: '' },
        }
    },
}

const CustomStylePanel = track(() => {
    const editor = useEditor()
    const selectedShapes = useValue('selected shapes', () => editor.getSelectedShapes(), [editor])
    const styles = useRelevantStyles()
    const [isCapturingScreenshot, setIsCapturingScreenshot] = React.useState(false)

    const isSingleSlideSelected = selectedShapes.length === 1 && selectedShapes[0].type === 'slide';
    const slideShape = isSingleSlideSelected ? (selectedShapes[0] as SlideShape) : null;

    // --- 获取 rootId ---

    const container = editor.getContainer();
    const editorElement = container?.closest('.tldraw__editor');
    const rootId = editorElement?.getAttribute('data-tldraw-id');
    const title = editorElement?.getAttribute('data-tldraw-title');
    const blockId = rootId;


    const handleNameChange = React.useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (slideShape) {
                // 使用事务来确保撤销/重做能正确处理连续输入
                editor.run(() => {
                    editor.updateShape({
                        id: slideShape.id,
                        type: 'slide',
                        props: { name: e.target.value },
                    });
                })
            }
        },
        [editor, slideShape]
    );

    const handleNameBlur = React.useCallback(
        (e: React.FocusEvent<HTMLInputElement>) => {
            if (slideShape && slideShape.props.name !== e.target.value.trim()) {
                editor.updateShape({
                    id: slideShape.id,
                    type: 'slide',
                    props: { name: e.target.value.trim() },
                });
            }
        },
        [editor, slideShape]
    );

    // 处理键盘事件，例如 Enter 确认，Escape 取消
    const handleKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.currentTarget.blur(); // 触发 blur 保存最终值（如果需要 trim）
            } else if (e.key === 'Escape') {
                // 如果需要恢复到修改前的值，需要额外状态管理，
                // 当前实现是 Escape 后直接 blur，会保存当前输入框的值
                e.currentTarget.blur();
            }
        },
        []
    );
    // --- 处理截图更新 ---
    const handleCaptureScreenshot = React.useCallback(async () => {
        if (!slideShape || isCapturingScreenshot) return

        setIsCapturingScreenshot(true)
        try {
            let targetBlockId: string | null = (slideShape.props.blockId ?? '').trim()
            if (!targetBlockId) {
                targetBlockId = null
            }

            const cursorId = getCursorBlockId()

            // 若 slide 中保存了 blockId，则在思源中验证其是否仍然有效
            if (targetBlockId) {
                try {
                    const blk = await getBlockByID(targetBlockId)
                    if (!blk || !blk.id) {
                        console.warn('保存的 blockId 在思源中未找到: ', targetBlockId)
                        showMessage('幻灯片保存的块在思源中未找到，后续将作为新块插入', 3000, 'info')
                        targetBlockId = null
                    }
                } catch (err) {
                    console.warn('检查保存的 blockId 时出错', err)
                    // 将其视为无效，允许在有光标时新建
                    targetBlockId = null
                }
            }

            if (!targetBlockId && !cursorId) {
                showMessage('未检测到已有截图块且未获取到光标位置，已取消操作', 3000, 'error')
                return
            }

            const result = await captureSlideScreenshot(editor, slideShape.id, {
                format: 'png',
                updateShape: true,
            })
            if (result) {
                try {
                    const now = new Date()
                    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
                    const rawName = slideShape?.props?.name || 'slide'
                    const safeName = String(rawName).replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
                    const ext = result.format === 'svg' ? 'svg' : 'png'
                    const fileName = `slide_${safeName}_${ts}.${ext}`
                    const blobType = result.blob.type || 'image/png'
                    const file = new File([result.blob], fileName, { type: blobType })
                    const uploadDir = 'assets/st_slides'

                    const upRes = await upload(uploadDir, [file])
                    const succMap = (upRes as any)?.succMap || {}
                    const kernelPath: string | undefined = succMap[fileName]
                    if (!kernelPath) {
                        throw new Error('upload screenshot failed: no succMap path')
                    }
                    const assetPath = kernelPath.replace(/^data\//, '')

                    const alt = rawName || 'slide'
                    const md = `[_](https://plugins/siyuan-steve-tools/?rootid=${rootId}&blockid=${blockId}&title=${title}&shapeid=${slideShape.id})![${alt}](${assetPath})\n{: custom-st-slide-id="${slideShape.id}"}`

                    let fallbackFromUpdateFailure = false

                    if (targetBlockId) {
                        try {
                            await updateBlock('markdown', md, targetBlockId)
                            editor.updateShape({
                                id: slideShape.id,
                                type: 'slide',
                                props: { blockId: targetBlockId },
                            })
                            showMessage('已更新之前插入的幻灯片截图')
                            return
                        } catch (updateErr) {
                            console.error('更新现有幻灯片截图块失败', updateErr)
                            if (!cursorId) {
                                showMessage('更新截图块失败，且未检测到光标位置可新建截图', 4000, 'error')
                                return
                            }
                            fallbackFromUpdateFailure = true
                            targetBlockId = null
                        }
                    }

                    if (!targetBlockId) {
                        if (!cursorId) {
                            showMessage('未检测到光标位置，已取消插入新的截图', 3000, 'error')
                            return
                        }

                        const appendRes = await appendBlock('markdown', md, cursorId)
                        const newBlockId = appendRes?.[0]?.doOperations?.[0]?.id as string | undefined
                        if (typeof newBlockId === 'string' && newBlockId) {
                            editor.updateShape({
                                id: slideShape.id,
                                type: 'slide',
                                props: { blockId: newBlockId },
                            })
                        } else {
                            console.warn('无法获取新建幻灯片截图块的 ID', appendRes)
                        }
                        showMessage(
                            fallbackFromUpdateFailure
                                ? '原块更新失败，已在光标位置插入新的幻灯片截图'
                                : '已将幻灯片截图插入到当前光标位置'
                        )
                    }
                } catch (insErr) {
                    console.error('insert slide screenshot to Siyuan failed', insErr)
                    showMessage('已更新截图，但插入到思源失败', 4000, 'error')
                }
            } else {
                showMessage('生成幻灯片截图失败', -1, 'error')
            }
        } catch (error) {
            console.error('capture slide screenshot failed', error)
            showMessage('生成幻灯片截图失败', -1, 'error')
        } finally {
            setIsCapturingScreenshot(false)
        }
    }, [editor, slideShape, isCapturingScreenshot])

    const handleOpenSlideBlock = React.useCallback(async () => {
        if (!slideShape) {
            return
        }

        const blockId = slideShape.props.blockId
        if (!blockId) {
            showMessage('幻灯片暂未绑定思源块', 3000, 'error')
            return
        }

        try {
            await openTab({
                app: window.siyuan.ws.app,
                doc: {
                    id: blockId,
                    action: ['cb-get-hl', 'cb-get-focus'],
                    zoomIn: true,
                },
                position: 'right',
                keepCursor: false,
            })
        } catch (err) {
            console.error('打开幻灯片关联的思源块失败', err)
            showMessage('打开关联的思源块失败', 4000, 'error')
        }
    }, [slideShape])

    const handleCopyLink = React.useCallback(async () => {
        if (slideShape && rootId !== '') { // 检查 rootId 是否已设置
            const shapeId = slideShape.id;
            // 使用幻灯片名称，如果为空则使用 rootId 作为后备标题
            let url: string;
            if (settingdata['copyLinkTitle']) {
                url = `[slide:${slideShape.props.name}](https://plugins/siyuan-steve-tools/?rootid=${rootId}&blockid=${blockId}&title=${title}&shapeid=${shapeId})`;
            } else {
                url = `https://plugins/siyuan-steve-tools/?rootid=${rootId}&blockid=${blockId}&title=${title}&shapeid=${shapeId}`;
            }
            try {
                await navigator.clipboard.writeText(url);
                showMessage('幻灯片链接已复制到剪贴板!'); // 简单反馈
                console.log('Link copied:', url);
            } catch (err) {
                console.error('无法复制链接: ', err);
                showMessage('复制链接失败。', -1, "error");
            }
        } else if (rootId === '') {
            showMessage('无法生成链接：缺少 rootId。', -1, "error");
            console.error('Cannot copy link: rootId is not set.');
        }
    }, [editor, slideShape, rootId]); // 添加依赖项


    return (
        <DefaultStylePanel>
            {/* 渲染默认的样式控件 */}
            <DefaultStylePanelContent styles={styles} />

            {isSingleSlideSelected && slideShape && (
                <div className="tlui-style-panel__section"> {/* 移除 styles={styles}，因为父级已经处理 */}
                    <input
                        className="tlui-input slide-name-input"
                        type="text"
                        value={slideShape.props.name}
                        onChange={handleNameChange}
                        onBlur={handleNameBlur}
                        onKeyDown={handleKeyDown}
                        onPointerDown={stopEventPropagation}
                        spellCheck={false}
                    />
                    <button
                        className="tlui-button" // 使用 tldraw 风格的按钮类名 (可能需要调整)
                        onClick={handleCopyLink}
                        onPointerDown={stopEventPropagation} // 阻止事件冒泡
                        style={{ marginTop: '-8px', width: '100%' }} // 添加边距并充满宽度
                        disabled={rootId === ''} // 如果 rootId 未设置则禁用
                    >
                        复制链接
                    </button>
                    <button
                        className="tlui-button"
                        onClick={handleOpenSlideBlock}
                        onPointerDown={stopEventPropagation}
                        style={{ marginTop: '-8px', width: '100%' }}
                        disabled={!slideShape.props.blockId}
                    >
                        跳转到笔记
                    </button>
                    <button
                        className="tlui-button"
                        onClick={handleCaptureScreenshot}
                        onPointerDown={stopEventPropagation}
                        style={{ marginTop: '-8px', width: '100%' }}
                        disabled={isCapturingScreenshot}
                    >
                        {isCapturingScreenshot ? '生成中…' : '更新截图'}
                    </button>
                </div>
            )}
        </DefaultStylePanel>
    );
});

function CustomQuickActions() {
    const editor = useEditor()
    const container = editor.getContainer();
    const editorElement = container?.closest('.tldraw__editor');
    const rootId = editorElement?.getAttribute('data-tldraw-id');
    const title = editorElement?.getAttribute('data-tldraw-title');
    return (
        <DefaultQuickActions>
            <DefaultQuickActionsContent />
            <div>
                <TldrawUiMenuItem id="heading" icon="heading" label="打开文档" onSelect={() => {
                    openTab({
                        app: window.siyuan.ws.app,
                        doc: {
                            id: rootId,
                        },
                        position: "right",
                    });
                }} />
            </div>
            <div>
                <TldrawUiMenuItem id="external-link" icon="external-link" label="复制白板链接" onSelect={() => {
                    let url: string;
                    if (settingdata['copyLinkTitle']) {
                        url = `[画板:${title}](https://plugins/siyuan-steve-tools/?rootid=${rootId}&title=${title})`;
                    } else {
                        url = `https://plugins/siyuan-steve-tools/?rootid=${rootId}&title=${title}`
                    }
                    navigator.clipboard.writeText(url).then(() => {
                        showMessage('链接已复制到剪贴板!');
                    }).catch(err => {
                        console.error('无法复制链接: ', err);
                    });
                }} />
            </div>
            <div>
                <TldrawUiMenuItem
                    id="refresh-all-cards"
                    icon="arrow-cycle"
                    label="刷新所有卡片"
                    onSelect={() => {
                        const shapes = editor.getCurrentPageShapes().filter(isCardLikeShape) as CardLikeShape[]
                        if (shapes.length === 0) {
                            showMessage('当前画布无卡片')
                            return
                        }
                        const nonce = Date.now()
                        editor.run(() => {
                            for (const s of shapes) {
                                editor.updateShape({
                                    id: s.id,
                                    type: 'card',
                                    props: { ...s.props, refreshNonce: nonce },
                                })
                            }
                        })
                        showMessage(`已刷新 ${shapes.length} 张卡片`)
                    }}
                />
            </div>
        </DefaultQuickActions>
    )
}


export const components: TLComponents = {
    HelperButtons: SlidesPanel,
    QuickActions: CustomQuickActions,
    StylePanel: CustomStylePanel,
    // Minimap: null,
    Toolbar: (props) => {
        const tools = useTools()
        const isCardSelected = useIsToolSelected(tools['card'])
        const isSingleBlockSelected = useIsToolSelected(tools['single-block'])
        const isSlideSelected = useIsToolSelected(tools['slide'])
        // const isMindMapNodeSelected = useIsToolSelected(tools['mindmap-node'])
        return (
            <DefaultToolbar {...props}>
                <TldrawUiMenuItem {...tools['card']} isSelected={isCardSelected} />
                <TldrawUiMenuItem {...tools['single-block']} isSelected={isSingleBlockSelected} />
                <TldrawUiMenuItem {...tools['slide']} isSelected={isSlideSelected} />

                <DefaultToolbarContent />
            </DefaultToolbar>
        )
    },
    KeyboardShortcutsDialog: (props) => {
        const tools = useTools()
        return (
            <DefaultKeyboardShortcutsDialog {...props}>
                <TldrawUiMenuItem {...tools['card']} />
                <TldrawUiMenuItem {...tools['single-block']} />
                <TldrawUiMenuItem {...tools['slide']} />
                <DefaultKeyboardShortcutsDialogContent />
            </DefaultKeyboardShortcutsDialog>
        )
    },
    MainMenu: () => {
        const editor = useEditor()
        return (
            <DefaultMainMenu>
                <DefaultMainMenuContent />
                <TldrawUiMenuGroup id="sttools">
                    <TldrawUiMenuItem
                        id="backupData"
                        label="备份数据"
                        readonlyOk
                        onSelect={() => {
                            editor.emit('sttools:backupData');
                        }}
                    />
                    <TldrawUiMenuItem
                        id="importData"
                        label="导入备份数据"
                        readonlyOk
                        onSelect={() => {
                            editor.emit('sttools:importData');
                        }}
                    />
                    <TldrawUiMenuItem
                        id="exportData"
                        label="导出数据"
                        readonlyOk
                        onSelect={() => {
                            editor.emit('sttools:exportData');
                        }}
                    />
                </TldrawUiMenuGroup>
            </DefaultMainMenu>
        )
    },

    InFrontOfTheCanvas: () => {
        const editor = useEditor()

        // 获取选中元素信息
        const selectionInfo = useValue(
            'selection bounds',
            () => {
                const selectedShapes = editor.getSelectedShapes()
                if (selectedShapes.length !== 1) {
                    return null
                }

                const selectedShape = selectedShapes[0]
                if (!isCardLikeShape(selectedShape)) {
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

        if (!selectionInfo) return null

        // 卡片按钮样式
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
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transform: `translate(${selectionInfo.x + selectionInfo.width / 2 - 115}px, ${selectionInfo.y - 40}px)`,
                    display: 'flex',
                    pointerEvents: 'all',
                    zIndex: 1
                }}
                onPointerDown={stopEventPropagation}
            >
                <button
                    style={buttonStyle}
                    onClick={() => {
                        // 编辑卡片内容
                        editor.setEditingShape(selectionInfo.id)
                    }}
                    title="编辑内容"
                >
                    ✏️
                </button>
                <button
                    style={buttonStyle}
                    onClick={() => {
                        // 刷新卡片：通过刷新 nonce 触发 Card 组件的重新挂载逻辑
                        const shape = editor.getShape(selectionInfo.id)
                        if (!isCardLikeShape(shape)) return

                        const shapeLabel = shape.type === 'card' ? '卡片' : '块'
                        editor.updateShape({
                            id: selectionInfo.id,
                            type: shape.type,
                            props: {
                                ...shape.props,
                                // 更新 nonce 以触发 useEffect，重建静态/实例视图
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
                        // 仅对 card 类型显示，其他类型隐藏
                        display: editor.getShape(selectionInfo.id)?.type === 'card' ? undefined : 'none',
                    }}
                    onClick={() => {
                        const shape = editor.getShape(selectionInfo.id)
                        if (!shape || shape.type !== 'card') return

                        const card = shape as ICardShape
                        const collapsed = !!card.props?.isCollapsed
                        editor.updateShape({
                            id: card.id,
                            type: 'card',
                            props: {
                                ...card.props,
                                isCollapsed: !collapsed,
                            },
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
                        // 放大字体
                        const shape = editor.getShape(selectionInfo.id);
                        if (!isCardLikeShape(shape)) return;

                        // 获取当前字体大小
                        const currentSize = shape.props.fontSize || 16;

                        // 放大字体 (增加2px)
                        const newSize = currentSize + 2;

                        // 更新卡片属性
                        editor.updateShape({
                            id: selectionInfo.id,
                            type: shape.type,
                            props: {
                                ...shape.props,
                                fontSize: newSize,
                            },
                        });
                    }}
                    title="放大字体"
                >
                    A+
                </button>
                <button
                    style={buttonStyle}
                    onClick={() => {
                        // 减小字体
                        const shape = editor.getShape(selectionInfo.id);
                        if (!isCardLikeShape(shape)) return;

                        // 获取当前字体大小
                        const currentSize = shape.props.fontSize || 16;

                        // 减小字体 (减少2px)
                        const newSize = currentSize - 2;

                        // 更新卡片属性
                        editor.updateShape({
                            id: selectionInfo.id,
                            type: shape.type,
                            props: {
                                ...shape.props,
                                fontSize: newSize,
                            },
                        });
                    }}
                    title="减小字体"
                >
                    A-
                </button>
                <button
                    style={buttonStyle}
                    onClick={async () => {
                        // 获取卡片数据并跳转到笔记
                        const shape = editor.getShape(selectionInfo.id);
                        if (!isCardLikeShape(shape) || !shape.props.blockId) {
                            console.error("未找到块ID");
                            return;
                        }
                        const blockId = shape.props.blockId;
                        await openTab({
                            app: window.siyuan.ws.app,
                            doc: {
                                id: blockId,
                                action: ["cb-get-hl"],
                                // zoomIn: true,
                            },
                            // position: "",
                            keepCursor: false,
                        });
                    }}
                    title="跳转到笔记"
                >
                    🔗
                </button>
            </div>
        )
    },

}







/* 

This file contains overrides for the Tldraw UI. These overrides are used to add your custom tools to
the toolbar and the keyboard shortcuts menu.

First we have to add our new tool to the tools object in the tools override. This is where we define
all the basic information about our new tool - its icon, label, keyboard shortcut, what happens when
we select it, etc.

Then, we replace the UI components for the toolbar and keyboard shortcut dialog with our own, that
add our new tool to the existing default content. Ideally, we'd interleave our new tool into the
ideal place among the default tools, but for now we're just adding it at the start to keep things
simple.
*/