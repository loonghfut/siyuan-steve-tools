import { booleanArgWithFallback, clampNumber } from '../args'
import { getAgentInteractionContext } from '../interaction-context'
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from './shared'

export function createGetInteractionContextAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_interaction_context',
        description: 'Sense current STtools tldraw user context before using whiteboard tools. Returns focusedWhiteboardId, all open whiteboards, whether the user has selected shapes, selectedShapeIds, and optional selected shape details. Call this first before any tldraw create/edit/navigate/read operation, then use focusedWhiteboardId as whiteboardId unless the user asked for a different board. Optional args: includeSelectedShapeDetails boolean default true, selectedShapeLimit number default 20.',
        handler: async (args) => {
            const disabled = disabledResult()
            if (disabled) return disabled
            try {
                return jsonResult(getAgentInteractionContext({
                    includeSelectedShapeDetails: booleanArgWithFallback(args.includeSelectedShapeDetails, true),
                    selectedShapeLimit: clampNumber(args.selectedShapeLimit, 0, 50, 20),
                }))
            } catch (error) {
                return { error: stringifyError(error) }
            }
        },
    }
}
