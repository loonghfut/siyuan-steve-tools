import { Editor, TLShapeId } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import { createConnectedSingleBlockAt } from './addConnectedSingleBlock'

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

            const containerRect = container.getBoundingClientRect()
            const viewport = editor.getViewportPageBounds()
            if (!viewport) return

            const viewWidth = viewport.maxX - viewport.minX
            const viewHeight = viewport.maxY - viewport.minY
            const scaleX = containerRect.width / viewWidth
            const scaleY = containerRect.height / viewHeight

            const previewWPage = Math.max(editor.getShapePageBounds(editor.getShape(anchorId) as any)?.width ?? 300, 300)
            const previewHPage = Math.max(editor.getShapePageBounds(editor.getShape(anchorId) as any)?.height ?? 50, 50)

            const screenX = containerRect.left + (pagePoint.x - viewport.minX) * scaleX
            const screenY = containerRect.top + (pagePoint.y - viewport.minY) * scaleY

            const screenW = previewWPage * scaleX
            const screenH = previewHPage * scaleY

            if (activeState?.previewEl) {
                const el = activeState.previewEl
                el.style.display = 'block'
                // Align preview's top-left corner with the pointer (to match actual placement behavior)
                el.style.left = `${Math.round(screenX)}px`
                el.style.top = `${Math.round(screenY)}px`
                // Keep preview size representing the shape's page-size mapped to screen
                el.style.width = `${Math.max(20, Math.round(screenW))}px`
                el.style.height = `${Math.max(20, Math.round(screenH))}px`
            }
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

    // attach listeners
    // create visual preview element
    const previewEl = document.createElement('div')
    previewEl.style.position = 'absolute'
    previewEl.style.pointerEvents = 'none'
    previewEl.style.border = '2px dashed var(--b3-border-color)'
    previewEl.style.background = 'rgba(0,0,0,0.06)'
    previewEl.style.borderRadius = '6px'
    previewEl.style.zIndex = '9999'
    previewEl.style.display = 'none'
    document.body.appendChild(previewEl)

    container.addEventListener('pointermove', onPointerMove, { capture: true })
    container.addEventListener('pointerdown', onPointerDown, { capture: true })
    window.addEventListener('keydown', onKeyDown)

    activeState = { editor, anchorId, onPointerDown, onPointerMove, onKeyDown, previewEl }

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
        if (activeState.previewEl && activeState.previewEl.parentElement) {
            activeState.previewEl.parentElement.removeChild(activeState.previewEl)
        }
    } catch (err) {}
    activeState = null
}

export const isArmed = (editor?: Editor, anchorId?: TLShapeId) => {
    if (!activeState) return false
    if (editor && activeState.editor !== editor) return false
    if (anchorId && activeState.anchorId !== anchorId) return false
    return true
}
