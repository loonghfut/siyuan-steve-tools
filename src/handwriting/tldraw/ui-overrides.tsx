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
    DefaultStylePanel
} from '@tldraw/tldraw'
import React from 'react';
import { $currentSlide, getSlides, moveToSlide } from './SlideShape/useSlides';
import { SlidesPanel } from './SlideShape/SlidesPanel';
import { ICardShape } from './CardShape/card-shape-types';
import { openTab } from 'siyuan';
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
        }
    },
}

export const components: TLComponents = {
    HelperButtons: SlidesPanel,
    Minimap: null,
    Toolbar: (props) => {
        const tools = useTools()
        const isCardSelected = useIsToolSelected(tools['card'])
        const isSlideSelected = useIsToolSelected(tools['slide'])
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
                    zIndex: 1000
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
                        // 复制卡片
                        editor.duplicateShapes([selectionInfo.id])
                    }}
                    title="复制卡片"
                >
                    📋
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

                        // // 直接应用到当前DOM元素以立即看到效果
                        // const cardElement = document.querySelector(`[data-shape-id="${selectionInfo.id}"]`);
                        // if (cardElement) {
                        //     const protyleElement = cardElement.querySelector(".protyle-wysiwyg");
                        //     if (protyleElement) {
                        //         (protyleElement as HTMLElement).style.fontSize = `${newSize}px`;
                        //     }
                        // }
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

                        // // 直接应用到当前DOM元素以立即看到效果
                        // const cardElement = document.querySelector(`[data-shape-id="${selectionInfo.id}"]`);
                        // if (cardElement) {
                        //     const protyleElement = cardElement.querySelector(".protyle-wysiwyg");
                        //     if (protyleElement) {
                        //         (protyleElement as HTMLElement).style.fontSize = `${newSize}px`;
                        //     }
                        // }
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
    // StylePanel: (props) => {
    //     const editor = useEditor()
        
    //     // 检查是否选中了卡片
    //     const isCardSelected = useValue('selected_shape', () => {
    //         const selectedShapes = editor.getSelectedShapes()
    //         return selectedShapes.length === 1 && selectedShapes[0].type === 'card'
    //     }, [editor])
        
    //     // 如果选中了卡片，获取卡片的字体大小
    //     const fontSize = useValue('font_size', () => {
    //         if (!isCardSelected) return 16
    //         const selectedShape = editor.getSelectedShapes()[0] as ICardShape
    //         return selectedShape.props.fontSize || 16
    //     }, [editor, isCardSelected])
        
    //     return (
    //         <>
    //             <DefaultStylePanel {...props} />
                
    //             {isCardSelected && (
    //                 <div style={{ 
    //                     padding: '0 4px',
    //                     display: 'flex', 
    //                     flexDirection: 'column',
    //                     gap: '4px' 
    //                 }}>
    //                     <div style={{ 
    //                         display: 'flex', 
    //                         alignItems: 'center', 
    //                         justifyContent: 'space-between',
    //                         padding: '0 4px'
    //                     }}>
    //                         <span>字体大小</span>
    //                         <div style={{ display: 'flex', gap: '4px' }}>
    //                             <button 
    //                                 style={{
    //                                     width: '24px',
    //                                     height: '24px',
    //                                     display: 'flex',
    //                                     alignItems: 'center',
    //                                     justifyContent: 'center',
    //                                     border: '1px solid var(--b3-border-color)',
    //                                     borderRadius: '4px',
    //                                     background: 'var(--b3-theme-background)'
    //                                 }}
    //                                 onClick={() => {
    //                                     // 减小字体
    //                                     const selectedShapes = editor.getSelectedShapes()
    //                                     if (selectedShapes.length !== 1 || selectedShapes[0].type !== 'card') return
                                        
    //                                     const shape = selectedShapes[0] as ICardShape
    //                                     const currentSize = shape.props.fontSize || 16
    //                                     const newSize = Math.max(currentSize - 2, 8)
                                        
    //                                     // 更新卡片属性
    //                                     editor.updateShape({
    //                                         id: shape.id,
    //                                         type: 'card',
    //                                         props: {
    //                                             ...shape.props,
    //                                             fontSize: newSize
    //                                         }
    //                                     })
                                        
    //                                     // 直接应用到DOM元素
    //                                     const cardElement = document.querySelector(`[data-shape-id="${shape.id}"]`)
    //                                     if (cardElement) {
    //                                         const protyleElement = cardElement.querySelector('.protyle-wysiwyg')
    //                                         if (protyleElement) {
    //                                             (protyleElement as HTMLElement).style.fontSize = `${newSize}px`
    //                                         }
    //                                     }
    //                                 }}
    //                             >
    //                                 A-
    //                             </button>
    //                             <span style={{ width: '30px', textAlign: 'center' }}>{fontSize}px</span>
    //                             <button 
    //                                 style={{
    //                                     width: '24px',
    //                                     height: '24px',
    //                                     display: 'flex',
    //                                     alignItems: 'center',
    //                                     justifyContent: 'center',
    //                                     border: '1px solid var(--b3-border-color)',
    //                                     borderRadius: '4px',
    //                                     background: 'var(--b3-theme-background)'
    //                                 }}
    //                                 onClick={() => {
    //                                     // 增大字体
    //                                     const selectedShapes = editor.getSelectedShapes()
    //                                     if (selectedShapes.length !== 1 || selectedShapes[0].type !== 'card') return
                                        
    //                                     const shape = selectedShapes[0] as ICardShape
    //                                     const currentSize = shape.props.fontSize || 16
    //                                     const newSize = currentSize + 2
                                        
    //                                     // 更新卡片属性
    //                                     editor.updateShape({
    //                                         id: shape.id,
    //                                         type: 'card',
    //                                         props: {
    //                                             ...shape.props,
    //                                             fontSize: newSize
    //                                         }
    //                                     })
                                        
    //                                     // 直接应用到DOM元素
    //                                     const cardElement = document.querySelector(`[data-shape-id="${shape.id}"]`)
    //                                     if (cardElement) {
    //                                         const protyleElement = cardElement.querySelector('.protyle-wysiwyg')
    //                                         if (protyleElement) {
    //                                             (protyleElement as HTMLElement).style.fontSize = `${newSize}px`
    //                                         }
    //                                     }
    //                                 }}
    //                             >
    //                                 A+
    //                             </button>
    //                         </div>
    //                     </div>
    //                     <button
    //                         style={{
    //                             padding: '4px 8px',
    //                             borderRadius: '4px',
    //                             border: '1px solid var(--b3-border-color)',
    //                             background: 'var(--b3-theme-background)'
    //                         }}
    //                         onClick={() => {
    //                             // 适应内容尺寸
    //                             const selectedShapes = editor.getSelectedShapes()
    //                             if (selectedShapes.length !== 1 || selectedShapes[0].type !== 'card') return
                                
    //                             const shape = selectedShapes[0] as ICardShape
                                
    //                             // 找到卡片元素
    //                             const cardElement = document.querySelector(`[data-shape-id="${shape.id}"]`)
    //                             if (!cardElement) return
                                
    //                             // 找到内容元素
    //                             const contentElement = cardElement.querySelector('.protyle-wysiwyg')
    //                             if (!contentElement) return
                                
    //                             // 获取内容尺寸
    //                             const contentRect = contentElement.getBoundingClientRect()
                                
    //                             // 设置新尺寸
    //                             const newWidth = Math.max(contentRect.width + 40, 200)
    //                             const newHeight = Math.max(contentRect.height + 40, 100)
                                
    //                             // 更新形状
    //                             editor.updateShape({
    //                                 id: shape.id,
    //                                 type: 'card',
    //                                 props: {
    //                                     ...shape.props,
    //                                     w: newWidth,
    //                                     h: newHeight
    //                                 }
    //                             })
    //                         }}
    //                     >
    //                         适应内容尺寸
    //                     </button>
    //                 </div>
    //             )}
    //         </>
    //     )
    // },
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