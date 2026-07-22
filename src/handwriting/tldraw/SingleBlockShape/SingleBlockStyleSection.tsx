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
                    <div className="tlui-custom-button-row">
                        <TldrawUiButton
                            type="normal"
                            className={connectionConnectorKind === 'arrow' ? 'tlui-toggle-button--active' : undefined}
                            aria-pressed={connectionConnectorKind === 'arrow'}
                            disabled={connectionMode}
                            title="启用直线连接模式：选择目标形状以创建直线（Esc 取消）"
                            onClick={() => {
                                if (connectionManager) {
                                    connectionManager.enableConnectionMode(editor, 'arrow')
                                }
                            }}
                        >
                            <TldrawUiIcon label="" icon="connector-arrow" />
                        </TldrawUiButton>
                        <TldrawUiButton
                            type="normal"
                            className={connectionConnectorKind === 'bezier' ? 'tlui-toggle-button--active' : undefined}
                            aria-pressed={connectionConnectorKind === 'bezier'}
                            disabled={connectionMode}
                            title="启用曲线连接模式：选择目标形状以创建曲线（Esc 取消）"
                            onClick={() => {
                                if (connectionManager) {
                                    connectionManager.enableConnectionMode(editor, 'bezier')
                                }
                            }}
                        >
                            <TldrawUiIcon label="" icon="connector-curve" />
                        </TldrawUiButton>
                    </div>
                </div>
            )}

            {hasSingleBlockSelection && (
                <>
                    <div className="tlui-style-panel__section">
                        <div className="tlui-toggle-button-row">
                            <TldrawUiButton
                                type="normal"
                                className={`tlui-toggle-button ${connectOnEnterState === true ? 'tlui-toggle-button--active' : connectOnEnterState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                aria-pressed={connectOnEnterState === true}
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
                            >
                                <TldrawUiIcon label="" icon="enter-connect" />
                            </TldrawUiButton>

                            <TldrawUiButton
                                type="normal"
                                className={`tlui-toggle-button ${transparentBackgroundState === true ? 'tlui-toggle-button--active' : transparentBackgroundState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                aria-pressed={transparentBackgroundState === true}
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
                            >
                                <TldrawUiIcon label="" icon="transparent-background" />
                            </TldrawUiButton>

                            <TldrawUiButton
                                type="normal"
                                className={`tlui-toggle-button ${allowBindingState === true ? 'tlui-toggle-button--active' : allowBindingState === 'mixed' ? 'tlui-toggle-button--mixed' : ''}`}
                                aria-pressed={allowBindingState === true}
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
                            >
                                <TldrawUiIcon label="" icon="binding-link" />
                            </TldrawUiButton>

                            <TldrawUiButton
                                type="normal"
                                className="tlui-toggle-button"
                                onClick={() => {
                                    fitSingleBlockWidth(editor, selectedSingleBlockShapes)
                                }}
                                title="自适应收缩宽度：根据内容紧凑收紧块宽度（只收缩不增宽）"
                                aria-label="自适应宽度"
                            >
                                <TldrawUiIcon label="" icon="fit-width" />
                            </TldrawUiButton>
                        </div>
                    </div>
                    <div className="tlui-style-panel__section">
                        <div className="tlui-custom-button-row">
                            <TldrawUiButton
                                type="normal"
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'up')}
                                title="将相连块排列到上方"
                            >
                                <TldrawUiIcon label="" icon="arrange-up" />
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'down')}
                                title="将相连块排列到下方"
                            >
                                <TldrawUiIcon label="" icon="arrange-down" />
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'left')}
                                title="将相连块排列到左侧"
                            >
                                <TldrawUiIcon label="" icon="arrange-left" />
                            </TldrawUiButton>
                            <TldrawUiButton
                                type="normal"
                                onClick={() => arrangeConnectedSingleBlocks(editor, 'right')}
                                title="将相连块排列到右侧"
                            >
                                <TldrawUiIcon label="" icon="arrange-right" />
                            </TldrawUiButton>
                        </div>
                    </div>
                </>
            )}
        </>
    )
}
