/**
 * Slide 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, StylePanelDropdownPicker, Editor } from '@tldraw/tldraw'
import { showMessage, openTab } from 'siyuan'
import { upload, appendBlock, updateBlock, getBlockByID } from '@/api/api'
import { getCursorBlockId } from '@/api/api2'
import { buildTldrawLink } from '../utils/link-builder'
import { captureSlideScreenshot } from './captureSlideScreenshot'
import { settingdata } from '@/index'
import { $currentSlide, setSlideFocusMode, useCurrentSlide, useSlideFocusMode } from './useSlides'
import type { SlideShape } from './SlideShapeUtil'

export interface SlideStyleSectionProps {
    editor: Editor
    slideShape: SlideShape | null
    isSingleSlideSelected: boolean
    rootId: string | null | undefined
    blockId: string | null | undefined
    title: string | null | undefined
}

export const SlideStyleSection: React.FC<SlideStyleSectionProps> = ({
    editor,
    slideShape,
    isSingleSlideSelected,
    rootId,
    blockId,
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
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (slideShape) {
                editor.run(() => {
                    editor.updateShape({
                        id: slideShape.id,
                        type: 'slide',
                        props: { name: e.target.value },
                    })
                })
            }
        },
        [editor, slideShape]
    )

    const handleNameBlur = React.useCallback(
        (e: React.FocusEvent<HTMLInputElement>) => {
            if (slideShape && slideShape.props.name !== e.target.value.trim()) {
                editor.updateShape({
                    id: slideShape.id,
                    type: 'slide',
                    props: { name: e.target.value.trim() },
                })
            }
        },
        [editor, slideShape]
    )

    const handleKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.currentTarget.blur()
            } else if (e.key === 'Escape') {
                e.currentTarget.blur()
            }
        },
        []
    )

    const handleCaptureScreenshot = React.useCallback(async () => {
        if (!slideShape || isCapturingScreenshot) return

        setIsCapturingScreenshot(true)
        try {
            let targetBlockId: string | null = (slideShape.props.blockId ?? '').trim()
            if (!targetBlockId) {
                targetBlockId = null
            }

            const cursorId = getCursorBlockId()

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
                background: true,
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
                    const md = `![${alt}](${assetPath})\n{: custom-st-slide-id="${slideShape.id}" custom-tldraw-link="${buildTldrawLink(rootId || '', blockId || '', title || '', slideShape.id)}" }`

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
    }, [editor, slideShape, isCapturingScreenshot, rootId, blockId, title])

    const handleOpenSlideBlock = React.useCallback(async () => {
        if (!slideShape) return

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
                url = `[slide:${slideShape.props.name}](${buildTldrawLink(rootId, blockId, title, shapeId)})`
            } else {
                url = buildTldrawLink(rootId, blockId, title, shapeId)
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
    }, [slideShape, rootId, blockId, title])

    if (!isSingleSlideSelected || !slideShape) return null

    return (
        <div className="tlui-style-panel__section">
            <input
                className="tlui-input slide-name-input"
                type="text"
                value={slideShape.props.name}
                onChange={handleNameChange}
                onBlur={handleNameBlur}
                onKeyDown={handleKeyDown}
                spellCheck={false}
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
			<TldrawUiButton
				type="normal"
				onClick={handleToggleFocus}
				style={{ marginTop: '-8px', width: '100%' }}
				title={isThisSlideFocused ? '退出聚焦（Esc）' : '聚焦此 Slide（仅显示 Slide 内内容）'}
			>
				{isThisSlideFocused ? '退出聚焦' : '聚焦此 Slide'}
			</TldrawUiButton>
            <TldrawUiButton
                type="normal"
                onClick={handleCopyLink}
                style={{ marginTop: '-8px', width: '100%' }}
                disabled={rootId === ''}
            >
                复制链接
            </TldrawUiButton>
            <TldrawUiButton
                type="normal"
                onClick={handleOpenSlideBlock}
                style={{ marginTop: '-8px', width: '100%' }}
                disabled={!slideShape.props.blockId}
            >
                跳转到笔记
            </TldrawUiButton>
            <TldrawUiButton
                type="normal"
                onClick={handleCaptureScreenshot}
                style={{ marginTop: '-8px', width: '100%' }}
                disabled={isCapturingScreenshot}
            >
                {isCapturingScreenshot ? '生成中…' : '更新截图'}
            </TldrawUiButton>
        </div>
    )
}
