import {
    getAllInstanceIds,
    getFocusedInstanceId,
    getInstance,
    getInstanceFocusedAt,
} from '../../../../tldraw-instance-manager'

export type AgentInteractionContextOptions = {
    includeSelectedShapeIds?: boolean
    includeSelectedShapeDetails?: boolean
    selectedShapeLimit?: number
}

export async function getAgentInteractionContext(options: AgentInteractionContextOptions = {}) {
    const focusedWhiteboardId = getFocusedInstanceId()
    const openWhiteboards = await Promise.all(getAllInstanceIds().map(async (id) => {
        const instance = getInstance(id)
        const summary = instance?.getAgentSummary()
        const selectedShapeIds = (summary?.selectedShapeIds || []) as string[]
        const selectedShapeLimit = Math.max(0, Math.min(options.selectedShapeLimit ?? 5, 50))
        const selectedShapeDetails = options.includeSelectedShapeDetails !== true ||
            !instance ||
            selectedShapeLimit === 0 ||
            selectedShapeIds.length === 0
            ? undefined
            : (await instance.getAgentShapeDetails({
                shapeIds: selectedShapeIds.slice(0, selectedShapeLimit),
                limit: selectedShapeLimit,
                includeBindings: false,
            })).shapes

        return {
            id,
            title: summary?.title || id,
            isFocused: id === focusedWhiteboardId,
            focusedAt: getInstanceFocusedAt(id) || null,
            isOpen: Boolean(instance),
            visualContextAvailable: Boolean(instance?.getAgentVisualContext),
            hasSelection: selectedShapeIds.length > 0,
            selectedShapeIds: options.includeSelectedShapeIds === true ? selectedShapeIds : undefined,
            selectedShapeCount: selectedShapeIds.length,
            selectedShapeDetails,
            shapeCount: summary?.shapeCount ?? 0,
            shapeTypeCounts: summary?.shapeTypeCounts || {},
        }
    }))

    const focusedWhiteboard = openWhiteboards.find((item) => item.id === focusedWhiteboardId) || null

    return {
        focusedWhiteboardId,
        hasFocusedWhiteboard: Boolean(focusedWhiteboard),
        focusedWhiteboard,
        anyWhiteboardHasSelection: openWhiteboards.some((item) => item.hasSelection),
        openWhiteboardCount: openWhiteboards.length,
        openWhiteboards,
        nextStepHint: focusedWhiteboard
            ? 'Use focusedWhiteboardId as whiteboardId unless the user explicitly requested another whiteboard. For complex spatial reasoning, call tldraw_get_visual_context on the focused whiteboard next.'
            : 'No focused whiteboard is known; ask the user to focus/open a whiteboard or call tldraw_open_whiteboard.',
    }
}
