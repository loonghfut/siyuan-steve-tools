/**
 * Card 形状样式面板区块
 */
import React from 'react'
import { StylePanelDropdownPicker, Editor } from '@tldraw/tldraw'
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

    const cardRenderModeValue = React.useMemo<CardRenderMode | 'mixed'>(() => {
        if (!hasCardSelection) return 'inherit'
        const modes = selectedCardShapes.map((shape) => shape.props.renderMode ?? 'inherit')
        const [firstMode] = modes
        return modes.every((mode) => mode === firstMode) ? firstMode : 'mixed'
    }, [hasCardSelection, selectedCardShapes])

    if (!hasCardSelection) return null

    return (
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
    )
}
