/**
 * 思维导图绑定思源块 UI 组件
 */
import React from 'react'
import { TldrawUiButton, Editor } from '@tldraw/tldraw'
import { showMessage, openTab } from 'siyuan'
import { getBlockKramdown } from '@/api/api'
import { parseMarkdownToMindMap } from './mind-map-markdown'
import { inputDialog } from '@/libs/dialog'
import type { IMindMapShape } from './mind-map-shape-types'

export interface MindMapBindingUIProps {
    selectedMindMapShapes: IMindMapShape[]
    editor: Editor
}

export const MindMapBindingUI: React.FC<MindMapBindingUIProps> = ({ selectedMindMapShapes, editor }) => {
    const singleSelected = selectedMindMapShapes.length === 1
    const currentShape = singleSelected ? selectedMindMapShapes[0] : null
    const isLinked = currentShape?.props?.blockId ? true : false
    const linkedBlockId = currentShape?.props?.blockId || ''

    const [isBinding, setIsBinding] = React.useState(false)

    const doBindBlock = async (blockId: string) => {
        if (!singleSelected || !currentShape) {
            showMessage('请选中单个思维导图', 3000, 'error')
            return
        }
        const blockIdToUse = blockId.trim()
        if (!blockIdToUse) {
            showMessage('请输入块ID', 3000, 'error')
            return
        }
        setIsBinding(true)
        try {
            const res = await getBlockKramdown(blockIdToUse)
            const kramdown = res?.kramdown || ''
            if (!kramdown.trim()) {
                showMessage('块内容为空或块ID无效', 3000, 'error')
                return
            }
            const newRootNode = parseMarkdownToMindMap(kramdown)
            editor.updateShape({
                id: currentShape.id,
                type: 'mind-map',
                props: {
                    ...currentShape.props,
                    blockId: blockIdToUse,
                    rootNode: newRootNode,
                    refreshNonce: Date.now(),
                },
            })
            showMessage('已绑定思源块')
        } catch (err) {
            console.error('绑定思源块失败', err)
            showMessage('绑定失败，请检查块ID是否正确', 3000, 'error')
        } finally {
            setIsBinding(false)
        }
    }

    const handleUnbindBlock = () => {
        if (!singleSelected || !currentShape) return
        editor.updateShape({
            id: currentShape.id,
            type: 'mind-map',
            props: {
                ...currentShape.props,
                blockId: undefined,
            },
        })
        showMessage('已解除绑定')
    }

    const handleRefresh = () => {
        if (!singleSelected || !currentShape) return
        editor.updateShape({
            id: currentShape.id,
            type: 'mind-map',
            props: {
                ...currentShape.props,
                refreshNonce: Date.now(),
            },
        })
        showMessage('已刷新思维导图')
    }

    const handleJumpToBlock = () => {
        if (!linkedBlockId) return
        openTab({
            app: window.siyuan.ws.app,
            doc: {
                id: linkedBlockId,
                action: ['cb-get-hl', 'cb-get-all'],
                zoomIn: false,
            },
            keepCursor: false,
        })
    }

    const handleOpenBindDialog = () => {
        inputDialog({
            title: '绑定思源块',
            placeholder: '请输入思源块ID',
            confirm: (text) => doBindBlock(text),
        })
    }

    if (!singleSelected) {
        return (
            <div style={{ fontSize: 12, color: 'var(--b3-theme-on-surface-light)', padding: '4px 0' }}>
                选中单个思维导图以绑定思源块
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {isLinked ? (
                <>
                    <div style={{ fontSize: 11, color: 'var(--b3-theme-on-surface-light)', wordBreak: 'break-all' }}>
                        已绑定: {linkedBlockId.slice(0, 8)}...
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <TldrawUiButton
                            type="normal"
                            style={{ flex: 1 }}
                            onClick={handleRefresh}
                            title="从思源块重新获取内容"
                        >
                            刷新
                        </TldrawUiButton>
                        <TldrawUiButton
                            type="normal"
                            style={{ flex: 1 }}
                            onClick={handleJumpToBlock}
                            title="跳转到绑定的思源块"
                        >
                            跳转
                        </TldrawUiButton>
                    </div>
                    <TldrawUiButton
                        type="normal"
                        onClick={handleUnbindBlock}
                        title="解除绑定后可手动编辑思维导图"
                    >
                        解除绑定
                    </TldrawUiButton>
                </>
            ) : (
                <TldrawUiButton
                    type="normal"
                    onClick={handleOpenBindDialog}
                    disabled={isBinding}
                    title="输入思源块ID后点击绑定，将从该块获取 Markdown 内容渲染思维导图"
                >
                    {isBinding ? '绑定中...' : '绑定思源块'}
                </TldrawUiButton>
            )}
        </div>
    )
}
