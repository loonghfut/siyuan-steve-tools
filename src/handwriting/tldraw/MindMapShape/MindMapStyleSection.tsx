/**
 * 思维导图样式面板区块
 */
import React from 'react'
import { TldrawUiButton, TldrawUiIcon, TldrawUiSlider, StylePanelDropdownPicker, Editor } from '@tldraw/tldraw'
import type { IMindMapShape } from './mind-map-shape-types'
import type { ThemeName } from './mind-map-constants'
import { MindMapBindingUI } from './MindMapBindingUI'

export interface MindMapStyleSectionProps {
    editor: Editor
    selectedMindMapShapes: IMindMapShape[]
}

export const MindMapStyleSection: React.FC<MindMapStyleSectionProps> = ({
    editor,
    selectedMindMapShapes,
}) => {
    const hasMindMapSelection = selectedMindMapShapes.length > 0

    const mindMapThemeValue = React.useMemo<ThemeName | 'mixed'>(() => {
        if (!hasMindMapSelection) return 'default'
        const themes = selectedMindMapShapes.map(shape => (shape.props.theme || 'default') as ThemeName)
        const first = themes[0]
        return themes.every(t => t === first) ? first : 'mixed'
    }, [hasMindMapSelection, selectedMindMapShapes])

    const mindMapFontSizeValue = React.useMemo<number | 'mixed'>(() => {
        if (!hasMindMapSelection) return 14
        const fontSizes = selectedMindMapShapes.map(shape => shape.props.fontSize || 14)
        const first = fontSizes[0]
        return fontSizes.every(fs => fs === first) ? first : 'mixed'
    }, [hasMindMapSelection, selectedMindMapShapes])

    if (!hasMindMapSelection) return null

    return (
        <>
            {/* 字号选择 */}
            <div className="tlui-style-panel__section">
                <TldrawUiSlider
                    label={`字号${mindMapFontSizeValue === 'mixed' ? '' : ` — ${mindMapFontSizeValue}px`}`}
                    title="思维导图字号"
                    min={20}
                    steps={48}
                    value={mindMapFontSizeValue === 'mixed' ? null : mindMapFontSizeValue}
                    onValueChange={(size) => {
                        if (!selectedMindMapShapes.length) return
                        const baseFontSize = 14
                        const baseNodeWidth = 120
                        const baseNodeHeight = 40
                        const baseLineWidth = 2
                        const scale = size / baseFontSize
                        const nodeWidth = Math.round(baseNodeWidth * scale)
                        const nodeHeight = Math.round(baseNodeHeight * scale)
                        const lineWidth = +(baseLineWidth * scale).toFixed(2)
                        editor.run(() => {
                            editor.updateShapes(
                                selectedMindMapShapes.map((shape) => ({
                                    id: shape.id,
                                    type: 'mind-map',
                                    props: {
                                        ...shape.props,
                                        fontSize: size,
                                        nodeWidth,
                                        nodeHeight,
                                        lineWidth,
                                    },
                                }))
                            )
                        })
                    }}
                />
            </div>

            {/* 主题选择 */}
            <div className="tlui-style-panel__section">
                <StylePanelDropdownPicker
                    label={"思维导图主题"}
                    type="menu"
                    id="mind-map-theme"
                    uiType="mind-map-theme"
                    stylePanelType="mind-map-theme"
                    style={{ id: 'mind-map-theme' } as any}
                    items={[
                        { value: 'default', icon: 'color' },
                        { value: 'noBorder', icon: 'broken' },
                        { value: 'underline', icon: 'minus' },
                    ]}
                    value={
                        mindMapThemeValue === 'mixed'
                            ? { type: 'mixed' as const }
                            : { type: 'shared' as const, value: mindMapThemeValue }
                    }
                    onValueChange={(_style, nextTheme: any) => {
                        if (!selectedMindMapShapes.length) return
                        const nextThemeStr = nextTheme as ThemeName
                        editor.run(() => {
                            editor.updateShapes(
                                selectedMindMapShapes.map((shape) => ({
                                    id: shape.id,
                                    type: 'mind-map',
                                    props: { ...shape.props, theme: nextThemeStr },
                                }))
                            )
                        })
                    }}
                />
            </div>

            {/* 方向选择 */}
            <div className="tlui-style-panel__section">
                <div className="tlui-custom-button-row">
                    {(['up', 'down', 'left', 'right'] as const).map(dir => {
                        const v = selectedMindMapShapes.length ? selectedMindMapShapes[0].props.direction : 'right'
                        const icons = { up: 'arrange-up', down: 'arrange-down', left: 'arrange-left', right: 'arrange-right' }
                        const titles = { up: '将导图排列到上方', down: '将导图排列到下方', left: '将导图排列到左侧', right: '将导图排列到右侧' }
                        return (
                            <TldrawUiButton
                                key={dir}
                                type="normal"
                                className={v === dir ? 'tlui-toggle-button--active' : undefined}
                                aria-pressed={v === dir}
                                onClick={() => {
                                    if (!selectedMindMapShapes.length) return
                                    editor.run(() => {
                                        editor.updateShapes(
                                            selectedMindMapShapes.map((shape) => ({
                                                id: shape.id,
                                                type: 'mind-map',
                                                props: { ...shape.props, direction: dir },
                                            }))
                                        )
                                    })
                                }}
                                title={titles[dir]}
                            >
                                <TldrawUiIcon label="" icon={icons[dir]} />
                            </TldrawUiButton>
                        )
                    })}
                </div>
            </div>

            {/* 绑定思源�?*/}
            <div className="tlui-style-panel__section">
                <MindMapBindingUI
                    selectedMindMapShapes={selectedMindMapShapes}
                    editor={editor}
                />
            </div>
        </>
    )
}

