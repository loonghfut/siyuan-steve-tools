/**
 * Card 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, TldrawUiIcon, TldrawUiSlider, StylePanelDropdownPicker, Editor } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import type { ICardShape, CardRenderMode } from './card-shape-types'
import { loadChildDocsForDoc, loadOutlineForDoc, outlineNodeToRelationItem } from '../doc-outline/doc-outline-data'
import { insertDocRelations } from '../doc-outline/insert-doc-relations'
import { buildCardCollapseUpdate } from './card-collapse'
import { getShapeHostElement } from '../utils/getShapeHostElement'

const COLLAPSED_TEXT_MIN_SIZE = 25
const COLLAPSED_TEXT_MAX_SIZE = 76
const COLLAPSED_TEXT_LINE_HEIGHT = 1.4
const COLLAPSED_TEXT_HORIZONTAL_PADDING = 28
const COLLAPSED_TEXT_VERTICAL_PADDING = 20
const COLLAPSED_ICON_SIZE_RATIO = 0.85
const COLLAPSED_TEXT_GAP = 10
const CARD_AUTO_SHRINK_MIN_HEIGHT = 25

type CardCollapsedTextSizeUpdate = {
    id: ICardShape['id']
    type: 'card'
    props: ICardShape['props']
}

export interface CardStyleSectionProps {
    editor: Editor
    selectedCardShapes: ICardShape[]
}

function getCollapsedTextElement(shape: ICardShape): HTMLElement | null {
    const host = getShapeHostElement(shape.id as string)
    return (host?.querySelector('[data-card-collapsed-text]') as HTMLElement | null) || null
}

function createCollapsedTextMeasureRoot() {
    const root = document.createElement('div')
    root.style.position = 'absolute'
    root.style.left = '-99999px'
    root.style.top = '0'
    root.style.visibility = 'hidden'
    root.style.pointerEvents = 'none'
    root.style.contain = 'layout style size'
    document.body.appendChild(root)
    return root
}

function getCollapsedTextAvailableSize(shape: ICardShape, fontSize: number) {
    const align = shape.props.collapsedTextAlign || 'center'
    const iconWidth = Math.round(fontSize * COLLAPSED_ICON_SIZE_RATIO)
    return {
        width: Math.max(
            1,
        shape.props.w -
            COLLAPSED_TEXT_HORIZONTAL_PADDING -
            (align === 'center' ? iconWidth : iconWidth + COLLAPSED_TEXT_GAP)
        ),
        height: Math.max(1, shape.props.h - COLLAPSED_TEXT_VERTICAL_PADDING),
    }
}

function createCollapsedTextMeasureElement(textEl: HTMLElement, measureRoot: HTMLElement) {
    const clone = textEl.cloneNode(true) as HTMLElement
    clone.removeAttribute('id')
    clone.style.position = 'static'
    clone.style.visibility = 'hidden'
    clone.style.pointerEvents = 'none'
    clone.style.height = 'auto'
    clone.style.maxHeight = 'none'
    clone.style.lineHeight = `${COLLAPSED_TEXT_LINE_HEIGHT}`
    clone.style.display = 'block'
    clone.style.overflow = 'visible'
    clone.style.textOverflow = 'clip'
    clone.style.setProperty('-webkit-line-clamp', 'unset')
    clone.style.setProperty('-webkit-box-orient', 'initial')
    measureRoot.appendChild(clone)
    return clone
}

function canCollapsedTextFitWithClone(clone: HTMLElement, shape: ICardShape, fontSize: number) {
    const availableSize = getCollapsedTextAvailableSize(shape, fontSize)
    clone.style.width = `${availableSize.width}px`
    clone.style.maxWidth = `${availableSize.width}px`
    clone.style.fontSize = `${fontSize}px`

    return clone.scrollWidth <= availableSize.width + 1 && clone.scrollHeight <= availableSize.height + 1
}

function getBestCollapsedTextSize(shape: ICardShape, measureRoot: HTMLElement): number | null {
    const textEl = getCollapsedTextElement(shape)
    if (!textEl) return null

    const clone = createCollapsedTextMeasureElement(textEl, measureRoot)

    let low = COLLAPSED_TEXT_MIN_SIZE
    let high = COLLAPSED_TEXT_MAX_SIZE
    let best = COLLAPSED_TEXT_MIN_SIZE

    while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        if (canCollapsedTextFitWithClone(clone, shape, mid)) {
            best = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }

    clone.remove()
    return best
}

function getVisibleContentHeight(element: HTMLElement) {
    const top = element.getBoundingClientRect().top
    let bottom = top
    const textWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let textNode: Text | null

    while ((textNode = textWalker.nextNode() as Text | null)) {
        if (!textNode.data.trim()) continue

        const range = document.createRange()
        range.selectNodeContents(textNode)
        for (const rect of Array.from(range.getClientRects())) {
            if (rect.height > 0) bottom = Math.max(bottom, rect.bottom)
        }
    }

    // Text ranges do not cover non-text content such as images and embeds.
    for (const child of Array.from(element.querySelectorAll<HTMLElement>(
        'img, video, audio, iframe, canvas, svg, [data-type="NodeBlockQueryEmbed"]'
    ))) {
        if (getComputedStyle(child).display === 'none') continue
        const rect = child.getBoundingClientRect()
        if (rect.height > 0) bottom = Math.max(bottom, rect.bottom)
    }

    // Keep the regular box measurement as a fallback for content which has no
    // text range or supported media element (for example, a custom widget).
    if (bottom === top) return Math.ceil(element.scrollHeight)

    const paddingBottom = Number.parseFloat(getComputedStyle(element).paddingBottom) || 0
    return Math.ceil(bottom - top + paddingBottom)
}

function getShrunkCardHeight(shape: ICardShape): number | null {
    const host = getShapeHostElement(shape.id as string)
    const container = host?.querySelector<HTMLElement>('[blockid]') || null
    const source = container?.querySelector<HTMLElement>('.protyle-wysiwyg') || null
    if (!container || !source || source.childElementCount === 0 || source.offsetWidth <= 0) return null

    // Preserve the source's tldraw parent selector while measuring. In particular,
    // it resets Siyuan's `.render-node` min-height; measuring the clone directly
    // under `body` otherwise adds a blank line to short cards.
    const measureRoot = document.createElement('div')
    measureRoot.className = 'tl-html-container'
    measureRoot.style.position = 'fixed'
    measureRoot.style.left = '-10000px'
    measureRoot.style.top = '0'
    measureRoot.style.visibility = 'hidden'
    measureRoot.style.pointerEvents = 'none'
    measureRoot.style.width = `${source.offsetWidth}px`
    measureRoot.style.contain = 'layout style'

    const clone = source.cloneNode(true) as HTMLElement
    clone.style.width = '100%'
    clone.style.height = 'auto'
    clone.style.minHeight = '0'
    clone.style.maxHeight = 'none'
    clone.style.overflow = 'visible'
    clone.style.boxSizing = 'border-box'
    measureRoot.appendChild(clone)
    document.body.appendChild(measureRoot)

    try {
        const contentHeight = getVisibleContentHeight(clone)
        // Account for the card border and the content container's padding using
        // the actual source element, rather than assuming the container fills h.
        const cardChromeHeight = Math.max(0, shape.props.h - source.offsetHeight)
        return Math.max(CARD_AUTO_SHRINK_MIN_HEIGHT, contentHeight + cardChromeHeight)
    } finally {
        measureRoot.remove()
    }
}

export const CardStyleSection: React.FC<CardStyleSectionProps> = ({
    editor,
    selectedCardShapes,
}) => {
    const hasCardSelection = selectedCardShapes.length > 0
    const selectedMainCard = React.useMemo(() => {
        if (selectedCardShapes.length !== 1) return null
        const [card] = selectedCardShapes
        if (!card.props.isMain || !card.props.blockId) return null
        return card
    }, [selectedCardShapes])
    const [insertingChildDocs, setInsertingChildDocs] = React.useState(false)
    const [insertingOutline, setInsertingOutline] = React.useState(false)

    // 仅对非主卡片且处于折叠状态的卡片显示折叠文字设置
    const showCollapsedTextSettings = React.useMemo(() => {
        if (!hasCardSelection) return false
        return selectedCardShapes.some(s => !s.props.isMain && s.props.isCollapsed)
    }, [hasCardSelection, selectedCardShapes])

    const cardRenderModeValue = React.useMemo<CardRenderMode | 'mixed'>(() => {
        if (!hasCardSelection) return 'inherit'
        const modes = selectedCardShapes.map((shape) => shape.props.renderMode ?? 'inherit')
        const [firstMode] = modes
        return modes.every((mode) => mode === firstMode) ? firstMode : 'mixed'
    }, [hasCardSelection, selectedCardShapes])

    // 折叠后的文字大小
    const collapsedTextSizeValue = React.useMemo<number | 'mixed'>(() => {
        if (!hasCardSelection) return 21
        const sizes = selectedCardShapes.map(shape => shape.props.collapsedTextSize || 21)
        const first = sizes[0]
        return sizes.every(s => s === first) ? first : 'mixed'
    }, [hasCardSelection, selectedCardShapes])

    // 折叠后的文字对齐方式
    const collapsedTextAlignValue = React.useMemo<string | 'mixed'>(() => {
        if (!hasCardSelection) return 'center'
        const aligns = selectedCardShapes.map(shape => shape.props.collapsedTextAlign || 'center')
        const first = aligns[0]
        return aligns.every(a => a === first) ? first : 'mixed'
    }, [hasCardSelection, selectedCardShapes])

    const collapsedState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasCardSelection) return false
        const values = selectedCardShapes.map((shape) => !!shape.props.isCollapsed)
        const first = values[0]
        return values.every((value) => value === first) ? first : 'mixed'
    }, [hasCardSelection, selectedCardShapes])

    const collapsedNormalCardShapes = React.useMemo(() => {
        return selectedCardShapes.filter((shape) => !shape.props.isMain && shape.props.isCollapsed)
    }, [selectedCardShapes])
    const expandedCardShapes = React.useMemo(() => {
        return selectedCardShapes.filter((shape) => !shape.props.isCollapsed)
    }, [selectedCardShapes])

    React.useEffect(() => {
        // 主卡片切换时仅重置插入中状态，子文档/大纲数据改为点击对应按钮时再按需加载
        setInsertingChildDocs(false)
        setInsertingOutline(false)
    }, [selectedMainCard])

    const handleInsertAllChildDocs = React.useCallback(async () => {
        if (!selectedMainCard?.props.blockId) return

        setInsertingChildDocs(true)
        try {
            const docId = selectedMainCard.props.blockId

            const childDocs = await loadChildDocsForDoc(docId)
            if (childDocs.length === 0) {
                showMessage('当前文档没有子文档', 3000, 'info')
                return
            }

            const result = await insertDocRelations({
                editor,
                mainCard: selectedMainCard,
                items: childDocs.map((doc) => ({ blockId: doc.id })),
                kind: 'child-doc',
            })

            if (result.createdShapeIds.length === 0) {
                showMessage('无可插入子文档', 3000, 'info')
                return
            }

            showMessage(
                result.skippedCount > 0
                    ? `已插入 ${result.createdShapeIds.length} 个子文档，跳过 ${result.skippedCount} 个已存在项`
                    : `已插入 ${result.createdShapeIds.length} 个子文档`,
                3000,
                'info'
            )
        } catch (err) {
            console.error('insert child docs from style panel failed', err)
            showMessage('插入子文档失败', 3000, 'error')
        } finally {
            setInsertingChildDocs(false)
        }
    }, [selectedMainCard, editor])

    const handleInsertAllOutline = React.useCallback(async () => {
        if (!selectedMainCard?.props.blockId) return

        setInsertingOutline(true)
        try {
            const outline = await loadOutlineForDoc(selectedMainCard.props.blockId)

            const result = await insertDocRelations({
                editor,
                mainCard: selectedMainCard,
                items: outline.map(outlineNodeToRelationItem),
                kind: 'outline-block',
            })

            if (result.createdShapeIds.length === 0) {
                showMessage('无可插入大纲块', 3000, 'info')
                return
            }

            showMessage(
                result.skippedCount > 0
                    ? `已插入 ${result.createdShapeIds.length} 个大纲块，跳过 ${result.skippedCount} 个已存在项`
                    : `已插入 ${result.createdShapeIds.length} 个大纲块`,
                3000,
                'info'
            )
        } catch (err) {
            console.error('insert outline blocks from style panel failed', err)
            showMessage('插入大纲块失败', 3000, 'error')
        } finally {
            setInsertingOutline(false)
        }
    }, [selectedMainCard, editor])

    const handleFitCollapsedTextSize = React.useCallback(() => {
        if (!collapsedNormalCardShapes.length) return

        const measureRoot = createCollapsedTextMeasureRoot()
        const updates: CardCollapsedTextSizeUpdate[] = []

        try {
            for (const shape of collapsedNormalCardShapes) {
                const nextSize = getBestCollapsedTextSize(shape, measureRoot)
                if (nextSize === null) continue
                if (Math.round(shape.props.collapsedTextSize || 21) === nextSize) continue
                updates.push({
                    id: shape.id,
                    type: 'card' as const,
                    props: { ...shape.props, collapsedTextSize: nextSize },
                })
            }
        } finally {
            measureRoot.remove()
        }

        if (!updates.length) return

        editor.run(() => {
            editor.updateShapes(updates)
        })
    }, [collapsedNormalCardShapes, editor])

    const handleShrinkToContentHeight = React.useCallback(() => {
        const updates: CardCollapsedTextSizeUpdate[] = []

        for (const shape of expandedCardShapes) {
            const nextHeight = getShrunkCardHeight(shape)
            if (nextHeight === null || nextHeight >= shape.props.h - 1) continue
            updates.push({
                id: shape.id,
                type: 'card',
                props: { ...shape.props, h: nextHeight },
            })
        }

        if (!updates.length) return
        editor.run(() => {
            editor.updateShapes(updates)
        })
    }, [editor, expandedCardShapes])

    if (!hasCardSelection) return null

    return (
        <>
            <div className="tlui-style-panel__section">
                <div className="tlui-toggle-button-row">
                    <TldrawUiButton
                        type="normal"
                        className={`tlui-toggle-button ${collapsedState === true ? 'tlui-toggle-button--active' : collapsedState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                        aria-pressed={collapsedState === true}
                        onClick={() => {
                            const nextCollapsed = collapsedState === 'mixed' ? true : !collapsedState
                            editor.run(() => {
                                editor.updateShapes(
                                    selectedCardShapes.map((shape) => buildCardCollapseUpdate(shape, nextCollapsed))
                                )
                            })
                        }}
                        title={collapsedState === true ? '展开选中的卡片' : '折叠选中的卡片'}
                        aria-label="切换卡片折叠状态"
                    >
                        <TldrawUiIcon label="" icon={collapsedState === true ? 'card-expand' : 'card-collapse'} />
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="normal"
                        className="tlui-toggle-button"
                        disabled={!expandedCardShapes.length}
                        onClick={handleShrinkToContentHeight}
                        title="收缩至内容高度"
                    >
                        <TldrawUiIcon label="" icon="fit-width" />
                    </TldrawUiButton>
                </div>
            </div>

            {showCollapsedTextSettings && <>
                <div className="tlui-style-panel__section">
                    {/* 折叠后文字大小 */}
                    <TldrawUiSlider
                        label={`${collapsedTextSizeValue === 'mixed' ? '' : `${collapsedTextSizeValue}px`}`}
                        title="折叠后文字大小"
                        min={COLLAPSED_TEXT_MIN_SIZE}
                        steps={52}
                        value={collapsedTextSizeValue === 'mixed' ? null : collapsedTextSizeValue}
                        onValueChange={(value) => {
                            if (!selectedCardShapes.length) return
                            editor.run(() => {
                                editor.updateShapes(
                                    selectedCardShapes.map((shape) => ({
                                        id: shape.id,
                                        type: 'card',
                                        props: { ...shape.props, collapsedTextSize: value },
                                    }))
                                )
                            })
                        }}
                    />
                    <div className="tlui-toggle-button-row">
                        <TldrawUiButton
                            type="normal"
                            className="tlui-toggle-button"
                            disabled={!collapsedNormalCardShapes.length}
                            onClick={handleFitCollapsedTextSize}
                            title="自动调整折叠文字大小"
                        >
                            <TldrawUiIcon label="" icon="fit-width" />
                        </TldrawUiButton>
                    </div>
                </div>

                <div className="tlui-style-panel__section">
                    {/* 折叠后文字对齐方式 */}
                    <div className="tlui-custom-button-row">
                            {([
                                { value: 'left', label: '靠左', icon: 'text-align-left-custom' },
                                { value: 'center', label: '居中', icon: 'text-align-center-custom' },
                                { value: 'right', label: '靠右', icon: 'text-align-right-custom' },
                            ] as const).map(({ value, label, icon }) => (
                                <TldrawUiButton
                                    key={value}
                                    type="normal"
                                    className={collapsedTextAlignValue === value ? 'tlui-toggle-button--active' : collapsedTextAlignValue === 'mixed' ? 'tlui-toggle-button--mixed' : undefined}
                                    aria-pressed={collapsedTextAlignValue === value}
                                    onClick={() => {
                                        if (!selectedCardShapes.length) return
                                        editor.run(() => {
                                            editor.updateShapes(
                                                selectedCardShapes.map((shape) => ({
                                                    id: shape.id,
                                                    type: 'card',
                                                    props: { ...shape.props, collapsedTextAlign: value },
                                                }))
                                            )
                                        })
                                    }}
                                    title={label}
                                >
                                    <TldrawUiIcon label="" icon={icon} />
                                </TldrawUiButton>
                            ))}
                    </div>
                </div>
            </>}

            <div className="tlui-style-panel__section">
                <StylePanelDropdownPicker
                    label={"渲染方式"}
                    type="menu"
                    id="card-render-mode"
                    uiType="card-render-mode"
                    stylePanelType="card-render-mode"
                    style={{ id: 'card-render-mode' } as any}
                    items={[
                        { value: 'inherit', icon: 'mixed' },
                        { value: 'static-dom', icon: 'pack' },
                        { value: 'live-protyle', icon: 'warning-triangle' },
                    ]}
                    value={
                        cardRenderModeValue === 'mixed'
                            ? { type: 'mixed' as const }
                            : { type: 'shared' as const, value: cardRenderModeValue }
                    }
                    onValueChange={(_style, nextMode: any) => {
                        if (!selectedCardShapes.length) return
                        const nextModeStr = nextMode as CardRenderMode
                        editor.run(() => {
                            editor.updateShapes(
                                selectedCardShapes.map((shape) => ({
                                    id: shape.id,
                                    type: 'card',
                                    props: { ...shape.props, renderMode: nextModeStr },
                                }))
                            )
                        })
                    }}
                />
            </div>

            {selectedMainCard && (
                <div className="tlui-style-panel__section">
                    <div className="tlui-custom-button-row">
                            <TldrawUiButton
                                type="normal"
                                disabled={insertingChildDocs}
                                onClick={() => { void handleInsertAllChildDocs() }}
                                title="插入全部子文档"
                            >
                                <TldrawUiIcon label="" icon={insertingChildDocs ? 'loading-spinner' : 'child-docs'} />
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                disabled={insertingOutline}
                                onClick={() => { void handleInsertAllOutline() }}
                                title="插入全部大纲块"
                            >
                                <TldrawUiIcon label="" icon={insertingOutline ? 'loading-spinner' : 'outline-blocks'} />
                            </TldrawUiButton>
                    </div>
                </div>
            )}
        </>
    )
}
