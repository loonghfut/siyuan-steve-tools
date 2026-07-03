import { assertKnownArgs, booleanArgWithFallback, clampNumber } from '../../core/args'
import { getAgentInteractionContext } from '../../context/interaction-context'
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared'

export function createGetInteractionContextAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_interaction_context',
        description: 'Sense compact current STtools tldraw user context before using whiteboard tools. Returns focusedWhiteboardId, all open whiteboards, whether the user has selected shapes, and selectedShapeIds. Call this first before any tldraw create/edit/navigate/read operation, then use focusedWhiteboardId as whiteboardId unless the user asked for a different board. Optional args: includeSelectedShapeDetails boolean default false, selectedShapeLimit number default 5.',
        handler: async (args) => {
            const disabled = disabledResult()
            if (disabled) return disabled
            try {
                assertKnownArgs(args, ['includeSelectedShapeDetails', 'selectedShapeLimit'], 'tldraw_get_interaction_context')
                return jsonResult(getAgentInteractionContext({
                    includeSelectedShapeDetails: booleanArgWithFallback(args.includeSelectedShapeDetails, false),
                    selectedShapeLimit: clampNumber(args.selectedShapeLimit, 0, 50, 5),
                }))
            } catch (error) {
                return { error: stringifyError(error) }
            }
        },
    }
}
