import { assertKnownArgs, booleanArgWithFallback, clampNumber } from '../internal/core/args'
import { getAgentInteractionContext } from '../internal/context/interaction-context'
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared'

export function createGetInteractionContextAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_interaction_context',
        description: 'Read compact current STtools tldraw context: focusedWhiteboardId, open whiteboards, selection state, and selectedShapeCount. Use this to route the next action to the right whiteboard. For deeper spatial reasoning, follow with tldraw_get_visual_context. For simple shape reads/edits, tldraw_shape_command can omit whiteboardId and use the focused whiteboard automatically. Optional args: includeSelectedShapeIds boolean default false, includeSelectedShapeDetails boolean default false, selectedShapeLimit number default 5. Selected card/single-block details include linked SiYuan block content.',
        handler: async (args) => {
            const disabled = disabledResult()
            if (disabled) return disabled
            try {
                assertKnownArgs(args, ['includeSelectedShapeIds', 'includeSelectedShapeDetails', 'selectedShapeLimit'], 'tldraw_get_interaction_context')
                return jsonResult(await getAgentInteractionContext({
                    includeSelectedShapeIds: booleanArgWithFallback(args.includeSelectedShapeIds, false),
                    includeSelectedShapeDetails: booleanArgWithFallback(args.includeSelectedShapeDetails, false),
                    selectedShapeLimit: clampNumber(args.selectedShapeLimit, 0, 50, 5),
                }))
            } catch (error) {
                return { error: stringifyError(error) }
            }
        },
    }
}
