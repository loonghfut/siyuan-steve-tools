import { booleanArgWithFallback, clampNumber, shapeIdArrayArg, stringArg } from '../internal/core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createGetShapeDetailsAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_shape_details',
        description: 'Read safe details for shapes on an open STtools tldraw whiteboard. Required args: whiteboardId string. Optional args: shapeId string or shapeIds string[], type string, limit number, includeBindings boolean, includeLinkedBlockContent boolean default true. Returns page bounds for layout planning, branch relationship props rootShapeId/leftChildIds/rightChildIds, and concrete linked SiYuan block content for card/single-block shapes. Script/data/screenshot-like fields are redacted.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
                const details = await target.instance.getAgentShapeDetails({
                    shapeIds: shapeIds.length ? shapeIds : undefined,
                    type: stringArg(args.type),
                    limit: clampNumber(args.limit, 1, 200, 40),
                    includeBindings: booleanArgWithFallback(args.includeBindings, false),
                    includeLinkedBlockContent: booleanArgWithFallback(args.includeLinkedBlockContent, true),
                });
                return jsonResult(details);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
