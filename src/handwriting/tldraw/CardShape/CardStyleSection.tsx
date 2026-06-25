/**
 * Card 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, TldrawUiSlider, StylePanelDropdownPicker, Editor } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import type { ICardShape, CardRenderMode } from './card-shape-types'
import { collectAllOutlineNodeIds, loadChildDocsForDoc, loadOutlineForDoc, type ChildDocItem, type OutlineNode } from '../doc-outline/doc-outline-data'
import { insertDocRelations } from '../doc-outline/insert-doc-relations'

export interface CardStyleSectionProps {
    editor: Editor
    selectedCardShapes: ICardShape[]
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
    const [childDocs, setChildDocs] = React.useState<ChildDocItem[]>([])
    const [outline, setOutline] = React.useState<OutlineNode[]>([])
    const [loadingChildDocs, setLoadingChildDocs] = React.useState(false)
    const [loadingOutline, setLoadingOutline] = React.useState(false)
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
        if (!hasCardSelection) return 'left'
        const aligns = selectedCardShapes.map(shape => shape.props.collapsedTextAlign || 'left')
        const first = aligns[0]
        return aligns.every(a => a === first) ? first : 'mixed'
    }, [hasCardSelection, selectedCardShapes])

    React.useEffect(() => {
        if (!selectedMainCard?.props.blockId) {
            setChildDocs([])
            setOutline([])
            setLoadingChildDocs(false)
            setLoadingOutline(false)
            return
        }

        const controller = new AbortController()
        const docId = selectedMainCard.props.blockId

        setLoadingChildDocs(true)
        setLoadingOutline(true)

        void loadChildDocsForDoc(docId, controller.signal)
            .then((docs) => {
                if (controller.signal.aborted) return
                setChildDocs(docs)
            })
            .catch((err) => {
                if (controller.signal.aborted) return
                console.error('load child docs for style panel failed', err)
                setChildDocs([])
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingChildDocs(false)
            })

        void loadOutlineForDoc(docId, controller.signal)
            .then((nodes) => {
                if (controller.signal.aborted) return
                setOutline(nodes)
            })
            .catch((err) => {
                if (controller.signal.aborted) return
                console.error('load outline for style panel failed', err)
                setOutline([])
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingOutline(false)
            })

        return () => controller.abort()
    }, [selectedMainCard])

    const handleInsertAllChildDocs = React.useCallback(async () => {
        if (!selectedMainCard) return

        setInsertingChildDocs(true)
        try {
            const result = insertDocRelations({
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
    }, [selectedMainCard, editor, childDocs])

    const handleInsertAllOutline = React.useCallback(async () => {
        if (!selectedMainCard) return

        setInsertingOutline(true)
        try {
            const allNodeIds = collectAllOutlineNodeIds(outline)
                .filter((id, index, arr) => Boolean(id) && arr.indexOf(id) === index)

            const result = insertDocRelations({
                editor,
                mainCard: selectedMainCard,
                items: allNodeIds.map((blockId) => ({ blockId })),
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
    }, [selectedMainCard, editor, outline])

    if (!hasCardSelection) return null

    return (
        <>
            {showCollapsedTextSettings && <>
                <div className="tlui-style-panel__section">
                    {/* 折叠后文字大小 */}
                    <TldrawUiSlider
                        label={`${collapsedTextSizeValue === 'mixed' ? '' : `${collapsedTextSizeValue}px`}`}
                        title="折叠后文字大小"
                        min={25}
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
                </div>

                <div className="tlui-style-panel__section">
                    {/* 折叠后文字对齐方式 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', gap: '0px' }}>
                            {([
                                { value: 'left', label: '靠左' },
                                { value: 'center', label: '居中' },
                                { value: 'right', label: '靠右' },
                            ] as const).map(({ value, label }) => (
                                <TldrawUiButton
                                    key={value}
                                    type={collapsedTextAlignValue === value ? 'primary' : 'normal'}
                                    style={{ flex: '1 1 0', minWidth: '0' }}
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
                                    <span style={{ fontSize: '12px' }}>{label}</span>
                                </TldrawUiButton>
                            ))}
                        </div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '12px', opacity: 0.8 }}>
                            当前文档：已选主卡片 ({selectedMainCard.props.blockId.slice(-6)})
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <TldrawUiButton
                                type="normal"
                                disabled={loadingChildDocs || insertingChildDocs || childDocs.length === 0}
                                onClick={() => { void handleInsertAllChildDocs() }}
                                title={
                                    loadingChildDocs
                                        ? '正在加载子文档'
                                        : childDocs.length === 0
                                            ? '当前没有可插入的子文档'
                                            : '插入全部子文档'
                                }
                            >
                                <span style={{ fontSize: '12px' }}>
                                    {loadingChildDocs ? '加载中...' : insertingChildDocs ? '插入中...' : '插入全部子文档'}
                                </span>
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                disabled={loadingOutline || insertingOutline || outline.length === 0}
                                onClick={() => { void handleInsertAllOutline() }}
                                title={
                                    loadingOutline
                                        ? '正在加载大纲'
                                        : outline.length === 0
                                            ? '当前没有可插入的大纲块'
                                            : '插入全部大纲'
                                }
                            >
                                <span style={{ fontSize: '12px' }}>
                                    {loadingOutline ? '加载中...' : insertingOutline ? '插入中...' : '插入全部大纲'}
                                </span>
                            </TldrawUiButton>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
