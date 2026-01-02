/**
 * BezierConnector 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, Editor, TLShapeId } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import type { IBezierConnectorShape } from './bezier-connector-types'
import { getConnectorTerminals } from './BezierConnectorShapeUtil'
import { createAndBindShape } from './createAndBindShape'
import { convertConnectorsToArrow, convertConnectorsToBezier } from '../utils/connector-convert'

export interface BezierConnectorStyleSectionProps {
    editor: Editor
    selectedConnectorShapes: IBezierConnectorShape[]
    /** 所有选中的形状（用于连接线类型转换） */
    selectedShapes: any[]
}

export const BezierConnectorStyleSection: React.FC<BezierConnectorStyleSectionProps> = ({
    editor,
    selectedConnectorShapes,
    selectedShapes,
}) => {
    const hasConnectorSelection = selectedConnectorShapes.length > 0

    const connectorStrokeState = React.useMemo<number | 'mixed'>(() => {
        if (!hasConnectorSelection) return 2
        const widths = selectedConnectorShapes.map((s) => s.props.strokeWidth ?? 2)
        const first = widths[0]
        return widths.every((w) => w === first) ? first : 'mixed'
    }, [hasConnectorSelection, selectedConnectorShapes])

    const connectorStrokeStyleState = React.useMemo<'solid' | 'dashed' | 'mixed'>(() => {
        if (!hasConnectorSelection) return 'solid'
        const styles = selectedConnectorShapes.map((s) => s.props.strokeStyle ?? 'solid')
        const first = styles[0]
        return styles.every((s) => s === first) ? first : 'mixed'
    }, [hasConnectorSelection, selectedConnectorShapes])

    const handleConnectorWidthChange = React.useCallback(
        (nextWidth: number) => {
            if (!hasConnectorSelection || Number.isNaN(nextWidth) || nextWidth <= 0) return
            editor.run(() => {
                editor.updateShapes(
                    selectedConnectorShapes.map((shape) => ({
                        id: shape.id,
                        type: 'bezier-connector',
                        props: { ...shape.props, strokeWidth: nextWidth },
                    }))
                )
            })
        },
        [editor, hasConnectorSelection, selectedConnectorShapes]
    )

    const handleConnectorStyleChange = React.useCallback(
        (nextStyle: 'solid' | 'dashed') => {
            if (!hasConnectorSelection) return
            editor.run(() => {
                editor.updateShapes(
                    selectedConnectorShapes.map((shape) => ({
                        id: shape.id,
                        type: 'bezier-connector',
                        props: { ...shape.props, strokeStyle: nextStyle },
                    }))
                )
            })
        },
        [editor, hasConnectorSelection, selectedConnectorShapes]
    )

    // 连接线类型互换（arrow <-> bezier-connector）
    const renderConnectorTypeConvert = () => {
        const convertible = selectedShapes.filter((s: any) => s?.type === 'arrow' || s?.type === 'bezier-connector') as any[]
        if (!convertible.length) return null

        const hasAnyArrow = convertible.some((s) => s.type === 'arrow')
        const hasAnyBezier = convertible.some((s) => s.type === 'bezier-connector')
        if (!hasAnyArrow && !hasAnyBezier) return null

        const ids = convertible.map((s) => s.id)
        const keepSelectedIds = selectedShapes
            .filter((s: any) => s?.type !== 'arrow' && s?.type !== 'bezier-connector')
            .map((s: any) => s.id)

        const handleToBezier = () => {
            try {
                editor.run(() => {
                    const nextIds = convertConnectorsToBezier(editor, ids)
                    if (keepSelectedIds.length) {
                        editor.setSelectedShapes([...keepSelectedIds, ...nextIds])
                    }
                })
            } catch (err) {
                console.error('convert connectors to bezier failed', err)
                showMessage('批量转换为曲线失败', 3000, 'error')
            }
        }

        const handleToArrow = () => {
            try {
                editor.run(() => {
                    const nextIds = convertConnectorsToArrow(editor, ids)
                    if (keepSelectedIds.length) {
                        editor.setSelectedShapes([...keepSelectedIds, ...nextIds])
                    }
                })
            } catch (err) {
                console.error('convert connectors to arrow failed', err)
                showMessage('批量转换为直线失败', 3000, 'error')
            }
        }

        return (
            <div className="tlui-style-panel__section">
                <div style={{ display: 'flex', gap: 0 }}>
                    {hasAnyArrow && (
                        <TldrawUiButton
                            type="normal"
                            style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                            title="将选中箭头批量转换为曲线连接器（保留文字，尽量保留绑定）"
                            onClick={handleToBezier}
                        >
                            全部转为曲线
                        </TldrawUiButton>
                    )}
                    {hasAnyBezier && (
                        <TldrawUiButton
                            type="normal"
                            style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                            title="将选中曲线连接器批量转换为箭头（保留文字，尽量保留绑定）"
                            onClick={handleToArrow}
                        >
                            全部转为直线
                        </TldrawUiButton>
                    )}
                </div>
            </div>
        )
    }

    // 快速添加连接目标
    const renderQuickAddTarget = () => {
        if (!hasConnectorSelection || selectedConnectorShapes.length !== 1) return null

        const connector = selectedConnectorShapes[0]
        const terminals = getConnectorTerminals(editor, connector)

        const createAndBindShapeLocal = (terminal: 'start' | 'end', type: 'card' | 'single-block') => {
            try {
                editor.run(() => {
                    createAndBindShape(editor, connector.id, terminal, type)
                })
            } catch (err) {
                console.error('创建并绑定目标失败 (delegated)', err)
            }
        }

        const startConnected = !!terminals.startShapeId
        const endConnected = !!terminals.endShapeId
        if (!(startConnected !== endConnected)) {
            return null
        }
        const unconnectedTerminal = startConnected ? 'end' : 'start'

        return (
            <div className="tlui-style-panel__section">
                <div style={{ display: 'flex' }}>
                    <TldrawUiButton
                        type="normal"
                        style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                        title="创建并绑定卡片"
                        onClick={() => createAndBindShapeLocal(unconnectedTerminal, 'card')}
                    >
                        卡片
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="normal"
                        style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                        title="创建并绑定单块"
                        onClick={() => createAndBindShapeLocal(unconnectedTerminal, 'single-block')}
                    >
                        单块
                    </TldrawUiButton>
                </div>
            </div>
        )
    }

    // 跳转到连接器两端
    const renderJumpToEnds = () => {
        if (!hasConnectorSelection || selectedConnectorShapes.length !== 1) return null

        const connector = selectedConnectorShapes[0]
        const terminals = getConnectorTerminals(editor, connector)
        const startConnected = !!terminals.startShapeId
        const endConnected = !!terminals.endShapeId
        if (!(startConnected && endConnected)) return null

        const jumpToShape = (shapeId?: TLShapeId) => {
            if (!shapeId) return
            const target = editor.getShape(shapeId)
            if (!target) return
            const bounds = editor.getShapePageBounds(target)
            if (!bounds) return
            editor.centerOnPoint(bounds.center, { animation: { duration: 300 } })
        }

        return (
            <div className="tlui-style-panel__section">
                <div style={{ display: 'flex' }}>
                    <TldrawUiButton
                        type="normal"
                        style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                        title="跳转到起点"
                        onClick={() => jumpToShape(terminals.startShapeId)}
                    >
                        起点
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="normal"
                        style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                        title="跳转到终点"
                        onClick={() => jumpToShape(terminals.endShapeId)}
                    >
                        终点
                    </TldrawUiButton>
                </div>
            </div>
        )
    }

    return (
        <>
            {renderConnectorTypeConvert()}

            {hasConnectorSelection && (
                <div className="tlui-style-panel__section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <span style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>线宽</span>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <input
                                className="connector-width-input"
                                type="number"
                                min={0.5}
                                max={12}
                                step={0.5}
                                value={connectorStrokeState === 'mixed' ? '' : connectorStrokeState}
                                placeholder={connectorStrokeState === 'mixed' ? '混合' : undefined}
                                onChange={(e) => handleConnectorWidthChange(parseFloat(e.target.value))}
                                style={{ color: 'var(--color-text)' }}
                            />
                            <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>px</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 8 }}>
                        <span style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>线型</span>
                        <div className="tlui-toggle-button-row" style={{ marginLeft: 8 }}>
                            {(['solid', 'dashed'] as const).map((style) => {
                                const isMixed = connectorStrokeStyleState === 'mixed'
                                const isActive = connectorStrokeStyleState === style
                                return (
                                    <TldrawUiButton
                                        key={style}
                                        type="normal"
                                        className={`tlui-toggle-button ${isActive ? 'tlui-toggle-button--active' : isMixed ? 'tlui-toggle-button--mixed' : ''}`}
                                        onClick={() => handleConnectorStyleChange(style)}
                                    >
                                        {style === 'solid' ? '实线' : '虚线'}
                                    </TldrawUiButton>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {renderQuickAddTarget()}
            {renderJumpToEnds()}
        </>
    )
}
