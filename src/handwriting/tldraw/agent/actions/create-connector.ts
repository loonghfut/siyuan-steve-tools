import { parseCreateConnectorArgs } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createCreateConnectorAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_connector',
        description: 'Create a safe connector on an open whiteboard. Required args: whiteboardId string and either start/end points or startShapeId/endShapeId. Optional args: kind "arrow"|"bezier-connector" default "bezier-connector", color, text, strokeWidth, select, zoom. Binds to ports when shape IDs are provided.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                return jsonResult(target.instance.createAgentConnector(parseCreateConnectorArgs(args)));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
