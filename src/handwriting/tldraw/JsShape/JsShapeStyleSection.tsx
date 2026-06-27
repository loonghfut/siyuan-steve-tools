/**
 * JsShape 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, TldrawUiIcon, Editor } from '@tldraw/tldraw'
import type { IJsShape } from './js-shape-types'

export interface JsShapeStyleSectionProps {
    editor: Editor
    selectedJsShapes: IJsShape[]
}

export const JsShapeStyleSection: React.FC<JsShapeStyleSectionProps> = ({
    editor,
    selectedJsShapes,
}) => {
    const hasJsSelection = selectedJsShapes.length > 0

    const jsInteractiveState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasJsSelection) return false
        const values = selectedJsShapes.map(shape => shape.props.interactive === true)
        const first = values[0]
        return values.every(v => v === first) ? first : 'mixed'
    }, [hasJsSelection, selectedJsShapes])

    if (!hasJsSelection) return null

    return (
        <div className="tlui-style-panel__section">
            <TldrawUiButton
                type="normal"
                title="开启后，渲染出的 DOM 可直接响应点击/拖拽等交互"
                aria-label="允许交互"
                onClick={() => {
                    const next = jsInteractiveState === 'mixed' ? true : !jsInteractiveState
                    editor.run(() => {
                        editor.updateShapes(
                            selectedJsShapes.map(shape => ({
                                id: shape.id,
                                type: 'js-shape',
                                props: { ...shape.props, interactive: next },
                            }))
                        )
                    })
                }}
            >
                <TldrawUiIcon icon="js-interactive" />
            </TldrawUiButton>
        </div>
    )
}
