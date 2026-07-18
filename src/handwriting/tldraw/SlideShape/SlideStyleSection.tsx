/**
 * Slide 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, TldrawUiIcon, TldrawUiInput, StylePanelDropdownPicker, Editor } from '@tldraw/tldraw'
import { showMessage, openTab } from 'siyuan'
import { updateBlock } from '@/api/api'
import { buildTldrawLink } from '../utils/link-builder'
import { captureSlideScreenshot } from './captureSlideScreenshot'
import { getActiveSlideScreenshotStore, slideScreenshotUrlToAssetPath, uploadSlideScreenshotImage } from './slide-screenshot-store'
import { buildSlideScreenshotMarkdown, findSlideScreenshotBlockId, findSlideScreenshotBlockIds } from './slide-block-binding'
import { settingdata } from '@/index'
import { $currentSlide, setSlideFocusMode, useCurrentSlide, useSlideFocusMode } from './useSlides'
import type { SlideShape } from './SlideShapeUtil'
import { createExportProgressOverlay, waitForPaint } from '../utils/export-progress'

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
        const overlay = createExportProgressOverlay('正在生成 Slide 截图')
        try {
            // 先查找所有已关联的截图块；有绑定时更新原块，不再创建侧边栏暂存项。
            overlay.update('正在准备截图')
            await waitForPaint()
            const targetBlockIds = await findSlideScreenshotBlockIds(slideShape.id)
            const result = await captureSlideScreenshot(editor, slideShape.id, {
                format: 'png',
                includeDataUrl: false,
                updateShape: false,
                background: true,
                onProgress(progress) {
                    overlay.update(progress.message, progress.current, progress.total)
                },
            })
            if (result) {
                try {
                    if (targetBlockIds.length > 0) {
                        overlay.update('正在上传截图')
                        const imageUrl = await uploadSlideScreenshotImage(result.blob, slideShape.props.name || 'Slide')
                        const assetPath = slideScreenshotUrlToAssetPath(imageUrl)
                        if (!assetPath) throw new Error('invalid uploaded slide screenshot asset URL')

                        const markdown = buildSlideScreenshotMarkdown({
                            assetPath,
                            name: slideShape.props.name || 'slide',
                            shapeId: slideShape.id,
                            rootId: rootId || '',
                            title: title || '',
                        })
                        overlay.update('正在更新关联截图', 0, targetBlockIds.length)
                        let updatedCount = 0
                        const updateResults = await Promise.allSettled(
                            targetBlockIds.map(async (blockId) => {
                                try {
                                    return await updateBlock('markdown', markdown, blockId)
                                } finally {
                                    updatedCount += 1
                                    overlay.update('正在更新关联截图', updatedCount, targetBlockIds.length)
                                }
                            })
                        )
                        updateResults.forEach((updateResult, index) => {
                            if (updateResult.status === 'rejected') {
                                console.error('更新关联的幻灯片截图块失败', targetBlockIds[index], updateResult.reason)
                            }
                        })
                        const failedCount = updateResults.filter((updateResult) => updateResult.status === 'rejected').length

                        editor.updateShape({
                            id: slideShape.id,
                            type: 'slide',
                            props: { screenshot: imageUrl },
                        })

                        if (failedCount === 0) {
                            showMessage(`已更新 ${targetBlockIds.length} 个关联的幻灯片截图`)
                        } else {
                            showMessage(`已更新 ${targetBlockIds.length - failedCount} 个截图，${failedCount} 个更新失败`, 4000, 'error')
                        }
                        return
                    }

                    const saveToDock = async () => {
                        overlay.update('正在保存截图')
                        const store = getActiveSlideScreenshotStore()
                        if (!store) throw new Error('slide screenshot store is not initialized')
                        const item = await store.add({
                            image: result.blob,
                            width: result.width,
                            height: result.height,
                            name: slideShape.props.name || 'Slide',
                            rootId: rootId || '',
                            shapeId: slideShape.id,
                            title: title || '',
                        })
                        editor.updateShape({
                            id: slideShape.id,
                            type: 'slide',
                            props: { screenshot: item.imageUrl },
                        })
                    }

                    await saveToDock()
                    showMessage('Slide 截图已保存到侧边栏')
                } catch (insErr) {
                    console.error('save slide screenshot to dock failed', insErr)
                    showMessage('已生成截图，但保存到侧边栏失败', 4000, 'error')
                }
            } else {
                showMessage('生成幻灯片截图失败', -1, 'error')
            }
        } catch (error) {
            console.error('capture slide screenshot failed', error)
            showMessage('生成幻灯片截图失败', -1, 'error')
        } finally {
            overlay.close()
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
                url = `[slide:${slideShape.props.name}](${buildTldrawLink(rootId, rootId, shapeId)})`
            } else {
                url = buildTldrawLink(rootId, rootId, shapeId)
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
                className="slide-name-input"
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
