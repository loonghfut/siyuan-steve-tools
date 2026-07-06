import { assertKnownArgs, booleanArgWithFallback, stringArg } from '../internal/core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createNavigateToBlockAction(): AgentActionDefinition {
    return {
        name: 'tldraw_navigate_to_block',
        description: 'Find/select a tldraw shape linked to a SiYuan block on an open whiteboard. Required args: whiteboardId string, blockId string. Optional args: shapeId string, zoom boolean.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'blockId', 'shapeId', 'zoom'], 'tldraw_navigate_to_block');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const blockId = stringArg(args.blockId);
            if (!blockId) return { error: 'missing required argument: blockId' };
            try {
                const result = target.instance.navigateAgentToBlock({
                    blockId,
                    shapeId: stringArg(args.shapeId),
                    zoom: booleanArgWithFallback(args.zoom, true),
                });
                return jsonResult(result);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
