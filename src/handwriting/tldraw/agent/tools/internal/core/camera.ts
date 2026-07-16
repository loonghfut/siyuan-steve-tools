import { Box, EASINGS, Editor, TLShapeId } from '@tldraw/tldraw'

export type AgentCameraBounds = { x: number; y: number; w: number; h: number }

const AGENT_CAMERA_INSET = 64
const AGENT_CAMERA_IN_VIEW_MARGIN = 48
const AGENT_CAMERA_MIN_ZOOM = 0.05
const AGENT_CAMERA_READABLE_ZOOM = 0.25
const AGENT_CAMERA_COMFORT_ZOOM_MIN = 0.15
const AGENT_CAMERA_COMFORT_ZOOM_MAX = 4
const AGENT_CAMERA_DURATION = 320

export type AgentCameraFocusOptions = {
    /** Skip the "already in view" guard and always move the camera. */
    force?: boolean
    duration?: number
}

/**
 * Focuses the camera on the target page bounds with minimal disruption:
 * - no-op when the target is already comfortably in view (unless `force`),
 * - pans without zooming in when the target fits at the current zoom,
 * - zooms out just enough to fit otherwise.
 * Returns true when the camera actually moved.
 */
export function focusAgentCamera(
    editor: Editor,
    target: AgentCameraBounds | null | undefined,
    opts: AgentCameraFocusOptions = {}
): boolean {
    if (!target) return false
    try {
        const bounds = {
            x: Number(target.x) || 0,
            y: Number(target.y) || 0,
            w: Math.max(1, Number(target.w) || 1),
            h: Math.max(1, Number(target.h) || 1),
        }
        const viewport = editor.getViewportPageBounds()
        const zoom = editor.getZoomLevel()

        if (!opts.force && viewport && isBoundsComfortablyInView(bounds, viewport, zoom)) {
            return false
        }

        const fitZoom = getAgentCameraFitZoom(editor, bounds, viewport, zoom)
        let targetZoom = Math.min(zoom, fitZoom)
        if (zoom < AGENT_CAMERA_READABLE_ZOOM) {
            targetZoom = Math.min(AGENT_CAMERA_READABLE_ZOOM, fitZoom)
        }
        targetZoom = Math.max(AGENT_CAMERA_MIN_ZOOM, targetZoom)

        editor.zoomToBounds(Box.From(bounds), {
            targetZoom,
            inset: AGENT_CAMERA_INSET,
            animation: { duration: opts.duration ?? AGENT_CAMERA_DURATION, easing: EASINGS.easeInOutCubic },
        })
        return true
    } catch (error) {
        console.warn('agent focus camera failed', error)
        return false
    }
}

/** Unions the page bounds of the given shapes (missing ids skipped) and focuses the camera on them. */
export function focusAgentShapesById(
    editor: Editor,
    shapeIds: Array<string | TLShapeId>,
    opts: AgentCameraFocusOptions = {}
): boolean {
    const bounds = unionAgentShapePageBounds(editor, shapeIds)
    return focusAgentCamera(editor, bounds, opts)
}

/** Returns a top-left origin that centers a shape of the given size in the viewport. Fallback {0,0}. */
export function getAgentViewportCenterOrigin(editor: Editor, size: { w: number; h: number }): { x: number; y: number } {
    try {
        const viewport = editor.getViewportPageBounds()
        if (viewport) {
            return {
                x: Number(viewport.x || 0) + Number(viewport.w || 0) / 2 - size.w / 2,
                y: Number(viewport.y || 0) + Number(viewport.h || 0) / 2 - size.h / 2,
            }
        }
    } catch { }
    return { x: 0, y: 0 }
}

function unionAgentShapePageBounds(editor: Editor, shapeIds: Array<string | TLShapeId>): AgentCameraBounds | null {
    let left = Number.POSITIVE_INFINITY
    let top = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    let found = false
    for (const shapeId of shapeIds) {
        let bounds: { x: number; y: number; width: number; height: number } | undefined
        try {
            bounds = editor.getShapePageBounds(shapeId as TLShapeId)
        } catch {
            continue
        }
        if (!bounds) continue
        found = true
        left = Math.min(left, Number(bounds.x) || 0)
        top = Math.min(top, Number(bounds.y) || 0)
        right = Math.max(right, (Number(bounds.x) || 0) + (Number(bounds.width) || 0))
        bottom = Math.max(bottom, (Number(bounds.y) || 0) + (Number(bounds.height) || 0))
    }
    if (!found) return null
    return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) }
}

function isBoundsComfortablyInView(
    bounds: AgentCameraBounds,
    viewport: { x: number; y: number; w: number; h: number },
    zoom: number
): boolean {
    if (zoom < AGENT_CAMERA_COMFORT_ZOOM_MIN || zoom > AGENT_CAMERA_COMFORT_ZOOM_MAX) return false
    const margin = AGENT_CAMERA_IN_VIEW_MARGIN
    return (
        bounds.x - margin >= viewport.x &&
        bounds.y - margin >= viewport.y &&
        bounds.x + bounds.w + margin <= viewport.x + viewport.w &&
        bounds.y + bounds.h + margin <= viewport.y + viewport.h
    )
}

function getAgentCameraFitZoom(
    editor: Editor,
    bounds: AgentCameraBounds,
    viewport: { w: number; h: number } | null | undefined,
    zoom: number
): number {
    let screenW = 0
    let screenH = 0
    try {
        const screen = editor.getViewportScreenBounds()
        screenW = Number(screen?.w || screen?.width || 0)
        screenH = Number(screen?.h || screen?.height || 0)
    } catch { }
    if ((!screenW || !screenH) && viewport) {
        screenW = Number(viewport.w || 0) * zoom
        screenH = Number(viewport.h || 0) * zoom
    }
    if (!screenW || !screenH) return zoom
    const availableW = Math.max(1, screenW - AGENT_CAMERA_INSET * 2)
    const availableH = Math.max(1, screenH - AGENT_CAMERA_INSET * 2)
    return Math.min(availableW / bounds.w, availableH / bounds.h)
}
