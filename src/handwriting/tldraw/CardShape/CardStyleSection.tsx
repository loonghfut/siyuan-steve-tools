/**
 * Card 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, StylePanelDropdownPicker, Editor } from '@tldraw/tldraw'
import type { ICardShape, CardRenderMode } from './card-shape-types'

export interface CardStyleSectionProps {
    editor: Editor
    selectedCardShapes: ICardShape[]
}

export const CardStyleSection: React.FC<CardStyleSectionProps> = ({
    editor,
    selectedCardShapes,
}) => {
    const hasCardSelection = selectedCardShapes.length > 0

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

    if (!hasCardSelection) return null

    return (
        <>
            {showCollapsedTextSettings && <>
                <div className="tlui-style-panel__section">
                    {/* 折叠后文字大小 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--tla-color-text-2)', padding: '0 4px' }}>折叠后文字大小</span>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {[14, 16, 18, 21, 24, 28].map(size => (
                                <TldrawUiButton
                                    key={size}
                                    type={collapsedTextSizeValue === size ? 'primary' : 'normal'}
                                    style={{ flex: '1 1 auto', minWidth: '32px', fontSize: '12px' }}
                                    onClick={() => {
                                        if (!selectedCardShapes.length) return
                                        editor.run(() => {
                                            editor.updateShapes(
                                                selectedCardShapes.map((shape) => ({
                                                    id: shape.id,
                                                    type: 'card',
                                                    props: { ...shape.props, collapsedTextSize: size },
                                                }))
                                            )
                                        })
                                    }}
                                >
                                    {size}px
                                </TldrawUiButton>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="tlui-style-panel__section">
                    {/* 折叠后文字对齐方式 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--tla-color-text-2)', padding: '0 4px' }}>折叠后文字对齐</span>
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
                                    <span style={{ fontSize: '10px' }}>{label}</span>
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
        </>
    )
}
