export type JsShapeRuntimeStatus = {
    state: 'running' | 'success' | 'error' | 'disabled' | 'empty'
    message?: string
    updatedAt: number
}

const statuses = new Map<string, JsShapeRuntimeStatus>()
const listeners = new Map<string, Set<(status: JsShapeRuntimeStatus) => void>>()

/** Stores non-persistent, safe runtime diagnostics for Agent feedback and the current canvas session. */
export function reportJsShapeRuntimeStatus(shapeId: string, status: Omit<JsShapeRuntimeStatus, 'updatedAt'>) {
    const next: JsShapeRuntimeStatus = {
        ...status,
        message: status.message ? status.message.slice(0, 4000) : undefined,
        updatedAt: Date.now(),
    }
    statuses.set(shapeId, next)
    listeners.get(shapeId)?.forEach((listener) => listener(next))
}

/** Returns a copy so diagnostics cannot be mutated outside this module. */
export function getJsShapeRuntimeStatus(shapeId: string): JsShapeRuntimeStatus | undefined {
    const status = statuses.get(shapeId)
    return status ? { ...status } : undefined
}

/** Waits briefly for the mounted ShapeUtil to report its initial execution result. */
export function waitForJsShapeRuntimeStatus(shapeId: string, timeoutMs = 500): Promise<JsShapeRuntimeStatus | undefined> {
    const current = getJsShapeRuntimeStatus(shapeId)
    if (current && current.state !== 'running') return Promise.resolve(current)

    return new Promise((resolve) => {
        let unsubscribe = () => {}
        const timeout = window.setTimeout(() => {
            unsubscribe()
            resolve(getJsShapeRuntimeStatus(shapeId))
        }, timeoutMs)
        unsubscribe = subscribe(shapeId, (status) => {
            if (status.state === 'running') return
            window.clearTimeout(timeout)
            unsubscribe()
            resolve(status)
        })
    })
}

function subscribe(shapeId: string, listener: (status: JsShapeRuntimeStatus) => void) {
    const shapeListeners = listeners.get(shapeId) ?? new Set<(status: JsShapeRuntimeStatus) => void>()
    shapeListeners.add(listener)
    listeners.set(shapeId, shapeListeners)
    return () => {
        shapeListeners.delete(listener)
        if (shapeListeners.size === 0) listeners.delete(shapeId)
    }
}
