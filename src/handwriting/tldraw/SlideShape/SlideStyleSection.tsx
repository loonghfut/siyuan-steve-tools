/**
 * Slide 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, TldrawUiIcon, TldrawUiInput, StylePanelDropdownPicker, Editor } from '@tldraw/tldraw'
import { showMessage, openTab } from 'siyuan'
import { upload, appendBlock, updateBlock } from '@/api/api'
import { getCursorBlockId } from '@/api/api2'
import { buildTldrawLink } from '../utils/link-builder'
import { captureSlideScreenshot } from './captureSlideScreenshot'
import { getActiveSlideScreenshotStore } from './slide-screenshot-store'
import { buildSlideScreenshotMarkdown, findSlideScreenshotBlockId } from './slide-block-binding'
import { settingdata } from '@/index'
import { $currentSlide, setSlideFocusMode, useCurrentSlide, useSlideFocusMode } from './useSlides'
import type { SlideShape } from './SlideShapeUtil'

export interface SlideStyleSectionProps {
    editor: Editor
    slideShape: SlideShape | null
    isSingleSlideSelected: boolean
    rootId: string | null | undefined
    title: string | null | undefined
}

export const SlideStyleSection: React.FC<SlideStyleSectionProps> = ({
    editor,
    slideShape,
    isSingleSlideSelected,
    rootId,
    title,
}) => {
    const [isCapturingScreenshot, setIsCapturingScreenshot] = React.useState(false)
    const isFocusMode = useSlideFocusMode()
    const currentSlide = useCurrentSlide()
    const isThisSlideFocused = isFocusMode && currentSlide?.id === slideShape?.id

    const handleToggleFocus = React.useCallback(() => {
        if (!slideShape) return
        if (isThisSlideFocused) {
            setSlideFocusMode(false)
            return
        }

        // Set current slide without clearing selection (unlike moveToSlide)
        $currentSlide.set(slideShape)
        const bounds = editor.getShapePageBounds(slideShape.id)
        if (bounds) {
            editor.zoomToBounds(bounds, {
                inset: 0,
                animation: { duration: 400 },
            })
        }
        setSlideFocusMode(true)
    }, [editor, slideShape, isThisSlideFocused])

    const slideBorderStyleValue = React.useMemo<'solid' | 'dashed' | 'wavy' | 'mixed'>(() => {
        if (!isSingleSlideSelected) return 'dashed'
        const borderStyle = slideShape?.props?.borderStyle as 'solid' | 'dashed' | 'wavy' | undefined
        return borderStyle || 'dashed'
    }, [isSingleSlideSelected, slideShape])

    const handleNameChange = React.useCallback(
        (value: string) => {
            if (slideShape) {
                editor.run(() => {
                    editor.updateShape({
                        id: slideShape.id,
                        type: 'slide',
                        props: { name: value },
                    })
                })
            }
        },
        [editor, slideShape]
    )

    const handleNameTrim = React.useCallback(
        (value: string) => {
            const trimmed = value.trim()
            if (slideShape && slideShape.props.name !== trimmed) {
                editor.updateShape({
                    id: slideShape.id,
                    type: 'slide',
                    props: { name: trimmed },
                })
            }
        },
        [editor, slideShape]
    )

    const handleCaptureScreenshot = React.useCallback(async () => {
        if (!slideShape || isCapturingScreenshot) return

        setIsCapturingScreenshot(true)
        try {
            const cursorId = getCursorBlockId()
            let targetBlockId = await findSlideScreenshotBlockId(slideShape.id)

            const result = await captureSlideScreenshot(editor, slideShape.id, {
                format: 'png',
                updateShape: true,
                background: true,
            })
            if (result) {
                try {
                    const saveToDock = async () => {
                        const store = getActiveSlideScreenshotStore()
                        if (!store) throw new Error('slide screenshot store is not initialized')
                        await store.add({
                            dataUrl: result.dataUrl,
                            width: result.width,
                            height: result.height,
                            name: slideShape.props.name || 'Slide',
                            rootId: rootId || '',
                            shapeId: slideShape.id,
                            title: title || '',
                        })
                    }

                    if (!targetBlockId && !cursorId) {
                        await saveToDock()
                        showMessage('未检测到光标块，截图已保存到 Slide 截图侧边栏')
                        return
                    }

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

                    const md = buildSlideScreenshotMarkdown({
                        assetPath,
                        name: rawName || 'slide',
                        shapeId: slideShape.id,
                        rootId: rootId || '',
                        title: title || '',
                    })

                    let fallbackFromUpdateFailure = false

                    if (targetBlockId) {
                        try {
                            await updateBlock('markdown', md, targetBlockId)
                            showMessage('已更新之前插入的幻灯片截图')
                            return
                        } catch (updateErr) {
                            console.error('更新现有幻灯片截图块失败', updateErr)
                            if (!cursorId) {
                                await saveToDock()
                                showMessage('原截图块更新失败，截图已保存到 Slide 截图侧边栏', 4000, 'info')
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
                        if (!appendRes?.[0]?.doOperations?.[0]?.id) console.warn('无法获取新建幻灯片截图块的 ID', appendRes)
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
    }, [editor, slideShape, isCapturingScreenshot, rootId, title])

    const handleOpenSlideBlock = React.useCallback(async () => {
        if (!slideShape) return

        const blockId = await findSlideScreenshotBlockId(slideShape.id)
        if (!blockId) {
            showMessage('幻灯片暂未绑定思源截图块', 3000, 'error')
            return
        }

        try {
            await openTab({
                app: window.siyuan.ws.app,
                doc: {
                    id: blockId,
                    action: ['cb-get-hl', 'cb-get-all'],
                    zoomIn: false,
                },
                keepCursor: false,
            })
        } catch (err) {
            console.error('打开幻灯片关联的思源块失败', err)
            showMessage('打开关联的思源块失败', 4000, 'error')
        }
    }, [slideShape])

    const handleCopyLink = React.useCallback(async () => {
        if (slideShape && rootId !== '') {
            const shapeId = slideShape.id
            let url: string
            if (settingdata['copyLinkTitle']) {
                url = `[slide:${slideShape.props.name}](${buildTldrawLink(rootId, rootId, title, shapeId)})`
            } else {
                url = buildTldrawLink(rootId, rootId, title, shapeId)
            }
            try {
                await navigator.clipboard.writeText(url)
                showMessage('幻灯片链接已复制到剪贴板!')
                console.debug('Link copied:', url)
            } catch (err) {
                console.error('无法复制链接: ', err)
                showMessage('复制链接失败。', -1, 'error')
            }
        } else if (rootId === '') {
            showMessage('无法生成链接：缺少 rootId。', -1, 'error')
            console.error('Cannot copy link: rootId is not set.')
        }
    }, [slideShape, rootId, title])

    if (!isSingleSlideSelected || !slideShape) return null

    return (
        <div className="tlui-style-panel__section">
            <TldrawUiInput
                value={slideShape.props.name}
                onValueChange={handleNameChange}
                onBlur={handleNameTrim}
                onCancel={handleNameTrim}
                onComplete={handleNameTrim}
                placeholder="幻灯片名称"
            />
            <StylePanelDropdownPicker
                label="边框样式"
                type="menu"
                id="slide-border-style"
                uiType="slide-border-style"
                stylePanelType="slide-border-style"
                style={{ id: 'slide-border-style' } as any}
                items={[
                    { value: 'solid', icon: 'dash-solid' },
                    { value: 'dashed', icon: 'dash-dashed' },
                    { value: 'wavy', icon: 'blob' },
                ]}
                value={{ type: 'shared' as const, value: slideBorderStyleValue }}
                onValueChange={(_style, nextStyle: any) => {
                    if (!slideShape) return
                    const nextStyleStr = nextStyle as 'solid' | 'dashed' | 'wavy'
                    editor.run(() => {
                        editor.updateShape({
                            id: slideShape.id,
                            type: 'slide',
                            props: { borderStyle: nextStyleStr },
                        })
                    })
                }}
            />
            <div style={{ display: 'flex', gap: 0, marginTop: '-8px' }}>
                <TldrawUiButton
                    type="normal"
                    onClick={handleToggleFocus}
                    style={{ flex: '1 1 0', minWidth: 0 }}
                    title={isThisSlideFocused ? '退出聚焦（Esc）' : '聚焦此 Slide（仅显示 Slide 内内容）'}
                    aria-label={isThisSlideFocused ? '退出聚焦' : '聚焦此 Slide'}
                >
                    <TldrawUiIcon label="" icon={isThisSlideFocused ? 'slide-exit-focus' : 'slide-focus'} />
                </TldrawUiButton>
                <TldrawUiButton
                    type="normal"
                    onClick={handleCopyLink}
                    style={{ flex: '1 1 0', minWidth: 0 }}
                    title="复制链接"
                    aria-label="复制链接"
                    disabled={rootId === ''}
                >
                    <TldrawUiIcon label="" icon="copy-link-custom" />
                </TldrawUiButton>
                <TldrawUiButton
                    type="normal"
                    onClick={handleOpenSlideBlock}
                    style={{ flex: '1 1 0', minWidth: 0 }}
                    title="跳转到笔记"
                    aria-label="跳转到笔记"
                >
                    <TldrawUiIcon label="" icon="open-block" />
                </TldrawUiButton>
                <TldrawUiButton
                    type="normal"
                    onClick={handleCaptureScreenshot}
                    style={{ flex: '1 1 0', minWidth: 0 }}
                    title={isCapturingScreenshot ? '生成中…' : '更新截图'}
                    aria-label={isCapturingScreenshot ? '生成中…' : '更新截图'}
                    disabled={isCapturingScreenshot}
                >
                    <TldrawUiIcon label="" icon={isCapturingScreenshot ? 'loading-spinner' : 'update-screenshot'} />
                </TldrawUiButton>
            </div>
        </div>
    )
}
