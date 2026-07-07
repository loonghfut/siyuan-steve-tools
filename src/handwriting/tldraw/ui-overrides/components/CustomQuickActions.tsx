/**
 * 快捷操作面板组件
 */
import React from 'react'
import {
    DefaultQuickActions,
    DefaultQuickActionsContent,
    TldrawUiMenuItem,
    useEditor,
} from '@tldraw/tldraw'
import { showMessage, openTab } from 'siyuan'
import { settingdata } from '@/index'
import { buildTldrawLink } from '../../utils/link-builder'
import { resetShapeLibraryPanelPosition } from '../../shapelibrary/shape-library-manager'
import { resetDocOutlinePanelPosition } from '../../doc-outline/doc-outline-manager'
import { resetChildDocsPanelPosition } from '../../doc-outline/child-docs-manager'
import { toggleShapeLibrary, toggleDocOutline, toggleChildDocs } from '../panel-state'
import { isCardLikeShape, CardLikeShape } from '../types'

export const CustomQuickActions: React.FC = () => {
    const editor = useEditor()
    const container = editor.getContainer()
    const editorElement = container?.closest('.tldraw__editor')
    const rootId = editorElement?.getAttribute('data-tldraw-id')
    const title = editorElement?.getAttribute('data-tldraw-title')
    const [restoreOnEdit, setRestoreOnEdit] = React.useState<boolean>(() => {
        return settingdata['restore-camera-on-edit'] === true
    })

    const toggleRestoreOnEdit = React.useCallback(() => {
        const next = !restoreOnEdit
        setRestoreOnEdit(next)
        try {
            settingdata['restore-camera-on-edit'] = next
        } catch (err) {
            console.warn('设置保存失败', err)
        }
        showMessage(next ? '编辑时聚焦并恢复视角：已启用' : '编辑时聚焦并恢复视角：已禁用')
    }, [restoreOnEdit])

    return (
        <DefaultQuickActions>
            <DefaultQuickActionsContent />
            <div>
                <TldrawUiMenuItem id="heading" icon="external-link" label="打开文档" onSelect={() => {
                    openTab({
                        app: window.siyuan.ws.app,
                        doc: {
                            id: rootId,
                        },
                    })
                }} />
            </div>
            <div>
                <TldrawUiMenuItem id="external-link" icon="heading" label="复制白板链接" onSelect={() => {
                    let url: string
                    if (settingdata['copyLinkTitle']) {
                        url = `[画板:${title}](${buildTldrawLink(rootId, undefined, title)})`
                    } else {
                        url = buildTldrawLink(rootId, undefined, title)
                    }
                    navigator.clipboard.writeText(url).then(() => {
                        showMessage('链接已复制到剪贴板!')
                    }).catch(err => {
                        console.error('无法复制链接: ', err)
                    })
                }} />
            </div>
            <div>
                <TldrawUiMenuItem
                    id="refresh-all-cards"
                    icon="arrow-cycle"
                    label="刷新所有卡片"
                    onSelect={() => {
                        const shapes = editor.getCurrentPageShapes().filter(isCardLikeShape) as CardLikeShape[]
                        if (shapes.length === 0) {
                            showMessage('当前画布无卡片')
                            return
                        }
                        const nonce = Date.now()
                        editor.run(() => {
                            for (const s of shapes) {
                                editor.updateShape({
                                    id: s.id,
                                    type: 'card',
                                    props: { ...s.props, refreshNonce: nonce },
                                })
                            }
                        })
                        showMessage(`已刷新 ${shapes.length} 张卡片`)
                    }}
                />
            </div>
            <div>
                <div
                    onMouseDown={(e: any) => {
                        if (e?.detail === 2) {
                            try { e.stopPropagation(); e.preventDefault() } catch (err) { }
                            resetShapeLibraryPanelPosition()
                        }
                    }}
                >
                    <TldrawUiMenuItem
                        id="shape-library"
                        icon="bookmark"
                        label="素材库"
                        onSelect={() => { toggleShapeLibrary() }}
                    />
                </div>
            </div>
            <div>
                <div
                    onMouseDown={(e: any) => {
                        if (e?.detail === 2) {
                            try { e.stopPropagation(); e.preventDefault() } catch (err) { }
                            resetDocOutlinePanelPosition()
                        }
                    }}
                >
                    <TldrawUiMenuItem
                        id="doc-outline"
                        icon="text-align-left"
                        label="文档大纲"
                        onSelect={() => { toggleDocOutline() }}
                    />
                </div>
            </div>
            <div>
                <div
                    onMouseDown={(e: any) => {
                        if (e?.detail === 2) {
                            try { e.stopPropagation(); e.preventDefault() } catch (err) { }
                            resetChildDocsPanelPosition()
                        }
                    }}
                >
                    <TldrawUiMenuItem
                        id="child-docs"
                        icon="tool-note"
                        label="子文档"
                        onSelect={() => { toggleChildDocs() }}
                    />
                </div>
            </div>
            <div
                style={
                    restoreOnEdit
                        ? {
                              borderRadius: 6,
                              backgroundColor: 'var(--tl-color-hint)',
                              display: 'inline-block',
                          }
                        : undefined
                }
                data-selected={restoreOnEdit ? 'true' : 'false'}
            >
                <TldrawUiMenuItem
                    id="toggle-restore-camera"
                    icon="group"
                    label={restoreOnEdit ? '编辑时聚焦（已启用）' : '编辑时聚焦（已禁用）'}
                    isSelected={restoreOnEdit}
                    onSelect={() => { toggleRestoreOnEdit() }}
                />
            </div>
        </DefaultQuickActions>
    )
}
