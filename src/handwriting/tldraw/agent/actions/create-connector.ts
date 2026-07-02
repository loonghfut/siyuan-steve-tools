import { parseCreateConnectorArgs } from '../args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createCreateConnectorAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_connector',
        description: 'Create a safe connector on an open whiteboard. Required args: whiteboardId and either shapeIds [sourceId,targetId], startShapeId/endShapeId, or start/end points. Optional args: kind "arrow"|"bezier-connector" default "bezier-connector", color, text, strokeWidth, select, zoom default true. Prefer shapeIds for connecting two existing shapes; ports are chosen automatically for custom card/single-block/mind-map ports when available. Use bezier-connector for durable labeled relationships, arrow for simpler tldraw arrows, and plain line only for non-binding visual marks. Unknown args are rejected.',
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
