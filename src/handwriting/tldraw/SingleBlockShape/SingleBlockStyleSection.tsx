/**
 * SingleBlock 形状样式面板区块
 */
import React from 'react'
import { TldrawUiButton, TldrawUiIcon, Editor } from '@tldraw/tldraw'
import type { ISingleBlockShape } from './single-block-shape-types'
import { arrangeConnectedSingleBlocks } from '../utils/arrangeSingleBlocks'
import { fitSingleBlockWidth } from '../utils/fitSingleBlockWidth'
import { ConnectionModeManager } from '../utils/connectionMode'

export interface SingleBlockStyleSectionProps {
    editor: Editor
    selectedSingleBlockShapes: ISingleBlockShape[]
    connectionManager: ConnectionModeManager | null
    connectionMode: boolean
    connectionConnectorKind: 'arrow' | 'bezier'
    /** 是否同时选中了 Card 形状（用于显示连接按钮） */
    hasCardSelection?: boolean
}

export const SingleBlockStyleSection: React.FC<SingleBlockStyleSectionProps> = ({
    editor,
    selectedSingleBlockShapes,
    connectionManager,
    connectionMode,
    connectionConnectorKind,
    hasCardSelection = false,
}) => {
    const hasSingleBlockSelection = selectedSingleBlockShapes.length > 0

    const connectOnEnterState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasSingleBlockSelection) return false
        const values = selectedSingleBlockShapes.map(s => s.props.connectOnEnter !== false)
        const first = values[0]
        return values.every(v => v === first) ? first : 'mixed'
    }, [hasSingleBlockSelection, selectedSingleBlockShapes])

    const allowBindingState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasSingleBlockSelection) return false
        const values = selectedSingleBlockShapes.map(s => s.props.allowBinding !== false)
        const first = values[0]
        return values.every(v => v === first) ? first : 'mixed'
    }, [hasSingleBlockSelection, selectedSingleBlockShapes])

    const transparentBackgroundState = React.useMemo<boolean | 'mixed'>(() => {
        if (!hasSingleBlockSelection) return false
        const values = selectedSingleBlockShapes.map(s => !!s.props.transparentBackground)
        const first = values[0]
        return values.every(v => v === first) ? first : 'mixed'
    }, [hasSingleBlockSelection, selectedSingleBlockShapes])

    // 连接按钮只在选中了 SingleBlock 或 Card 时显示
    const showConnectionButtons = hasSingleBlockSelection || hasCardSelection

    return (
        <>
            {/* 连接模式按钮 */}
            {showConnectionButtons && (
                <div className="tlui-style-panel__section">
                    <div style={{ display: 'flex' }}>
                        <TldrawUiButton
                            type={connectionConnectorKind === 'arrow' ? 'primary' : 'normal'}
                            disabled={connectionMode}
                            style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                            title="启用直线连接模式：选择目标形状以创建直线（Esc 取消）"
                            onClick={() => {
                                if (connectionManager) {
                                    connectionManager.enableConnectionMode(editor, 'arrow')
                                }
                            }}
                        >
                            <TldrawUiIcon icon="connector-arrow" />
                        </TldrawUiButton>
                        <TldrawUiButton
                            type={connectionConnectorKind === 'bezier' ? 'primary' : 'normal'}
                            disabled={connectionMode}
                            style={{ flex: 1, color: 'var(--color-text)', fontWeight: 400 }}
                            title="启用曲线连接模式：选择目标形状以创建曲线（Esc 取消）"
                            onClick={() => {
                                if (connectionManager) {
                                    connectionManager.enableConnectionMode(editor, 'bezier')
                                }
                            }}
                        >
                            <TldrawUiIcon icon="connector-curve" />
                        </TldrawUiButton>
                    </div>
                </div>
            )}

            {hasSingleBlockSelection && (
                <>
                    <div className="tlui-style-panel__section">
                    </div>
                    <div className="tlui-style-panel__section">
                        <div className="tlui-toggle-button-row">
                            <TldrawUiButton
                                type="normal"
                                className={`tlui-toggle-button ${connectOnEnterState === true ? 'tlui-toggle-button--active' : connectOnEnterState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                onClick={() => {
                                    const next = connectOnEnterState === 'mixed' ? true : !connectOnEnterState
                                    editor.run(() => {
                                        editor.updateShapes(
                                            selectedSingleBlockShapes.map(s => ({
                                                id: s.id,
                                                type: 'single-block',
                                                props: { ...s.props, connectOnEnter: next }
                                            }))
                                        )
                                    })
                                }}
                                title="开启后按 Enter 新建的块会自动用箭头连接"
                                aria-label="回车连接"
                                style={{
                                    fontWeight: connectOnEnterState === true ? 700 : undefined,
                                    background: connectOnEnterState === true ? 'var(--tl-color-muted-2)' : undefined,
                                    color: connectOnEnterState === true ? 'var(--b3-theme-on-surface, var(--color-text))' : undefined,
                                    opacity: connectOnEnterState === 'mixed' ? 0.85 : undefined,
                                }}
                            >
                                <TldrawUiIcon icon="enter-connect" />
                            </TldrawUiButton>

                            <TldrawUiButton
                                type="normal"
                                className={`tlui-toggle-button ${transparentBackgroundState === true ? 'tlui-toggle-button--active' : transparentBackgroundState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                onClick={() => {
                                    const next = transparentBackgroundState === 'mixed' ? true : !transparentBackgroundState
                                    editor.run(() => {
                                        editor.updateShapes(
                                            selectedSingleBlockShapes.map(s => ({
                                                id: s.id,
                                                type: 'single-block',
                                                props: { ...s.props, transparentBackground: next },
                                            }))
                                        )
                                    })
                                }}
                                title="启用透明背景（隐藏背景与边框）"
                                aria-label="透明背景"
                                style={{
                                    fontWeight: transparentBackgroundState === true ? 700 : undefined,
                                    background: transparentBackgroundState === true ? 'var(--tl-color-muted-2)' : undefined,
                                    color: transparentBackgroundState === true ? 'var(--b3-theme-on-surface, var(--color-text))' : undefined,
                                    opacity: transparentBackgroundState === 'mixed' ? 0.85 : undefined,
                                }}
                            >
                                <TldrawUiIcon icon="transparent-background" />
                            </TldrawUiButton>

                            <TldrawUiButton
                                type="normal"
                                className={`tlui-toggle-button ${allowBindingState === true ? 'tlui-toggle-button--active' : allowBindingState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                onClick={() => {
                                    const next = allowBindingState === 'mixed' ? true : !allowBindingState
                                    editor.run(() => {
                                        editor.updateShapes(
                                            selectedSingleBlockShapes.map(s => ({
                                                id: s.id,
                                                type: 'single-block',
                                                props: { ...s.props, allowBinding: next }
                                            }))
                                        )
                                    })
                                }}
                                title="开启后允许与其他形状建立绑定（拖动到目标后会自动绑定）"
                                aria-label="绑定"
                                style={{
                                    fontWeight: allowBindingState === true ? 700 : undefined,
                                    background: allowBindingState === true ? 'var(--tl-color-muted-2)' : undefined,
                                    color: allowBindingState === true ? 'var(--b3-theme-on-surface, var(--color-text))' : undefined,
                                    opacity: allowBindingState === 'mixed' ? 0.85 : undefined,
                                }}
                            >
                                <TldrawUiIcon icon="binding-link" />
                            </TldrawUiButton>

                            <TldrawUiButton
                                type="normal"
                                className="tlui-toggle-button"
                                onClick={() => {
                                    fitSingleBlockWidth(editor, selectedSingleBlockShapes)
                                }}
                                title="自适应调整宽度：根据内容自动收紧块宽度"
                                aria-label="自适应宽度"
                            >
                                <TldrawUiIcon icon="fit-width" />
                            </TldrawUiButton>
                        </div>
                    </div>
                    <div className="tlui-style-panel__section">
                        <div style={{ display: 'flex', gap: '0px' }}>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: '1 1 0', minWidth: '0' }}
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'up')}
                                title="将相连块排列到上方"
                            >
                                <TldrawUiIcon icon="arrange-up" />
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: '1 1 0', minWidth: '0' }}
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'down')}
                                title="将相连块排列到下方"
                            >
                                <TldrawUiIcon icon="arrange-down" />
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: '1 1 0', minWidth: '0' }}
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'left')}
                                title="将相连块排列到左侧"
                            >
                                <TldrawUiIcon icon="arrange-left" />
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                style={{ flex: '1 1 0', minWidth: '0' }}
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'right')}
                                title="将相连块排列到右侧"
                            >
                                <TldrawUiIcon icon="arrange-right" />
                            </TldrawUiButton>
                        </div>
                    </div>
                </>
            )}
        </>
    )
}
