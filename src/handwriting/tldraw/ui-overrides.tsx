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
    TLEventMap,
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
import { SlidesPanel } from './SlideShape/SlidesPanel';
import { ICardShape } from './CardShape/card-shape-types';
import { SlideShape } from './SlideShape/SlideShapeUtil';
import { openTab, showMessage } from 'siyuan';
import { settingdata } from '@/index';
// There's a guide at the bottom of this file!

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
                editor.batch(() => {
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

    const handleCopyLink = React.useCallback(async () => {
        if (slideShape && rootId !== '') { // 检查 rootId 是否已设置
            const shapeId = slideShape.id;
            // 使用幻灯片名称，如果为空则使用 rootId 作为后备标题
            let url: string;
            if (settingdata['copyLinkTitle']) {
                url = `[slide:${slideShape.props.name}](siyuan://plugins/siyuan-steve-tools/?rootid=${rootId}&blockid=${blockId}&title=${title}&shapeid=${shapeId})`;
            } else {
                url = `siyuan://plugins/siyuan-steve-tools/?rootid=${rootId}&blockid=${blockId}&title=${title}&shapeid=${shapeId}`
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
                        url = `[画板:${title}](siyuan://plugins/siyuan-steve-tools/?rootid=${rootId}&title=${title})`;
                    } else {
                        url = `siyuan://plugins/siyuan-steve-tools/?rootid=${rootId}&title=${title}`
                    }
                    navigator.clipboard.writeText(url).then(() => {
                        showMessage('链接已复制到剪贴板!');
                    }).catch(err => {
                        console.error('无法复制链接: ', err);
                    });
                }} />
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
        const isSlideSelected = useIsToolSelected(tools['slide'])
        // const isMindMapNodeSelected = useIsToolSelected(tools['mindmap-node'])
        return (
            <DefaultToolbar {...props}>
                <TldrawUiMenuItem {...tools['card']} isSelected={isCardSelected} />
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
                // 只处理单个选中且为卡片类型的情况
                if (selectedShapes.length !== 1 || selectedShapes[0].type !== 'card') {
                    return null
                }

                const screenBounds = editor.getViewportScreenBounds()
                const rotatedScreenBounds = editor.getSelectionRotatedScreenBounds()
                if (!rotatedScreenBounds) return null

                return {
                    id: selectedShapes[0].id,
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
                        const shape = editor.getShape(selectionInfo.id) as ICardShape
                        if (!shape) return
                        editor.updateShape({
                            id: selectionInfo.id,
                            type: 'card',
                            props: {
                                ...shape.props,
                                // 更新 nonce 以触发 useEffect，重建静态/实例视图
                                refreshNonce: Date.now(),
                            },
                        })
                        showMessage('卡片已刷新')
                    }}
                    title="刷新卡片"
                >
                    🔄
                </button>
                <button
                    style={buttonStyle}
                    onClick={() => {
                        // 适应内容尺寸
                        const shape = editor.getShape(selectionInfo.id) as ICardShape;
                        if (!shape || !shape.props.blockId) return;

                        // 找到与此卡片关联的容器元素
                        const cardElement = document.querySelector(`[data-shape-id="${selectionInfo.id}"]`);
                        if (!cardElement) return;

                        // 找到Protyle内容元素
                        const contentElement = cardElement.querySelector(".protyle-wysiwyg");
                        if (!contentElement) return;

                        // 获取内容的实际尺寸
                        const contentRect = contentElement.getBoundingClientRect();

                        // 适当增加边距，确保内容完全显示
                        const newWidth = Math.max(contentRect.width + 40, 200);
                        const newHeight = Math.max(contentRect.height + 40, 100);

                        // 更新卡片尺寸
                        editor.updateShape({
                            id: shape.id,
                            type: shape.type,
                            props: {
                                ...shape.props,
                                w: newWidth,
                                h: newHeight,
                            },
                        });
                    }}
                    title="适应内容尺寸"
                >
                    📏
                </button>
                <button
                    style={buttonStyle}
                    onClick={() => {
                        // 放大字体
                        const shape = editor.getShape(selectionInfo.id) as ICardShape;
                        if (!shape) return;

                        // 获取当前字体大小
                        const currentSize = shape.props.fontSize || 16;

                        // 放大字体 (增加2px)
                        const newSize = currentSize + 2;

                        // 更新卡片属性
                        editor.updateShape({
                            id: selectionInfo.id,
                            type: 'card',
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
                        // 放大字体
                        const shape = editor.getShape(selectionInfo.id) as ICardShape;
                        if (!shape) return;

                        // 获取当前字体大小
                        const currentSize = shape.props.fontSize || 16;

                        // 放大字体 (增加2px)
                        const newSize = currentSize - 2;

                        // 更新卡片属性
                        editor.updateShape({
                            id: selectionInfo.id,
                            type: 'card',
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
                        const cardShape = editor.getShape(selectionInfo.id);
                        const blockId = (cardShape as ICardShape)?.props?.blockId || "";
                        if (!blockId) {
                            console.error("未找到块ID");
                            return;
                        }
                        await openTab({
                            app: window.siyuan.ws.app,
                            doc: {
                                id: blockId,
                                action: ["cb-get-hl", "cb-get-focus"],
                                zoomIn: true,
                            },
                            position: "right",
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