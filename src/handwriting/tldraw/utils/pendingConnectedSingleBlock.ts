import { Editor, TLShapeId } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import { createConnectedSingleBlockAt } from './addConnectedSingleBlock'
import {
	resetPendingConnectedSingleBlockState,
	setPendingConnectedSingleBlockState,
} from './pendingConnectedSingleBlockState'

let activeState: {
    editor: Editor
    anchorId: TLShapeId
    onPointerDown: (e: PointerEvent) => void
    onPointerMove: (e: PointerEvent) => void
    onKeyDown: (e: KeyboardEvent) => void
    previewEl: HTMLElement | null
} | null = null

export const armAddConnectedSingleBlock = (editor: Editor, anchorId: TLShapeId) => {
    // cleanup any existing
    if (activeState) {
        cleanupPending()
    }

    const container = editor.getContainer()
    if (!container) {
        showMessage('未找到编辑器容器，无法等待点击', 3000, 'error')
        return
    }

    const onPointerMove = (e: PointerEvent) => {
        try {
            const clientX = (e as any).clientX
            const clientY = (e as any).clientY
            if (clientX == null || clientY == null) return

            // compute page position and scale to container screen position
            const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
            if (!pagePoint) return
            setPendingConnectedSingleBlockState(editor, { previewPoint: pagePoint })
        } catch (err) {
            // ignore preview errors
        }
    }

    const onPointerDown = (e: PointerEvent) => {
        try {
            // only handle primary button
            const btn = (e as any).button
            if (typeof btn === 'number' && btn !== 0) return
            // only respond to primary button
            // If the event was consumed by UI elements, the target may not be the canvas but we still accept coordinates
            const pagePoint = editor.screenToPage({ x: (e as any).clientX, y: (e as any).clientY })
            if (!pagePoint) throw new Error('无法转换坐标')

            // Use the transformed page coords directly
            createConnectedSingleBlockAt(editor, anchorId, pagePoint.x, pagePoint.y)
            // If Ctrl is held during the click, don't exit the pending mode (allow continuous placement)
            const ctrlHeld = (e as any).ctrlKey || (e as any).metaKey || false
            if (ctrlHeld) {
                // keep the mode active and continue listening
                return
            }
        } catch (err) {
            console.error('创建关联块失败', err)
            showMessage('创建关联块失败', 3000, 'error')
        }
        // If we reach here, the placement succeeded and Ctrl wasn't held — exit pending mode
        cleanupPending()
    }

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            showMessage('已取消创建关联块', 1200, 'info')
            cleanupPending()
        }
    }

    container.addEventListener('pointermove', onPointerMove, { capture: true })
    container.addEventListener('pointerdown', onPointerDown, { capture: true })
    window.addEventListener('keydown', onKeyDown)

    setPendingConnectedSingleBlockState(editor, { anchorId, previewPoint: null })

    activeState = { editor, anchorId, onPointerDown, onPointerMove, onKeyDown, previewEl: null }

    showMessage('请在画布上点击以放置关联单块（Esc 取消）', 4000, 'info')
}

export const cleanupPending = () => {
    if (!activeState) return
    try {
        const c = activeState.editor.getContainer()
        if (c) {
            c.removeEventListener('pointerdown', activeState.onPointerDown, { capture: true } as any)
            c.removeEventListener('pointermove', activeState.onPointerMove, { capture: true } as any)
        }
    } catch (err) {
        // ignore
    }
    try {
        window.removeEventListener('keydown', activeState.onKeyDown)
    } catch (err) {
        // ignore
    }
    try {
        resetPendingConnectedSingleBlockState(activeState.editor)
    } catch (err) {}
    activeState = null
}

export const isArmed = (editor?: Editor, anchorId?: TLShapeId) => {
    if (!activeState) return false
    if (editor && activeState.editor !== editor) return false
    if (anchorId && activeState.anchorId !== anchorId) return false
    return true
}
