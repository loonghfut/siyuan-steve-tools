import { parseCreateConnectorArgs } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createCreateConnectorAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_connector',
        description: 'Create a safe connector on an open whiteboard. Required args: whiteboardId and either shapeIds [sourceId,targetId], startShapeId/endShapeId, or start/end points. Optional args: kind "arrow"|"bezier-connector" default "bezier-connector", color, text, strokeWidth, select, zoom. Prefer shapeIds for connecting two existing shapes; ports are chosen automatically. Unknown args are rejected.',
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
