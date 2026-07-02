import { shapeIdArrayArg, stringArg } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createConvertConnectorsAction(): AgentActionDefinition {
    return {
        name: 'tldraw_convert_connectors',
        description: 'Convert selected connector shapes between arrow and bezier-connector. Required args: whiteboardId string, shapeId string or shapeIds string[], to "arrow"|"bezier-connector". Max 50 shapes.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const to = stringArg(args.to);
            if (to !== 'arrow' && to !== 'bezier-connector') return { error: 'to must be "arrow" or "bezier-connector"' };
            try {
                return jsonResult(target.instance.convertAgentConnectors({ shapeIds, to }));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
