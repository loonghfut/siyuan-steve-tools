import { parseCreateConnectorArgs } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createCreateConnectorAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_connector',
        description: 'Create a safe connector on an open whiteboard. Required args: whiteboardId and either shapeIds [sourceId,targetId], startShapeId/endShapeId, or start/end points. Optional args: kind "arrow"|"bezier-connector"|"branch" default "bezier-connector", color, text, strokeWidth, select, zoom default true, resultMode "compact"|"full" default compact. Prefer shapeIds for ordinary relationship lines between existing shapes; ports are chosen automatically for custom card/single-block/mind-map ports when available. For mind maps, tree/parent-child/hierarchical layouts, pass kind:"branch" with shapeIds [root, child]. Use bezier-connector for durable labeled relationships, arrow for simpler tldraw arrows, and plain line only for non-binding visual marks. Unknown args are rejected.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                return jsonResult(await target.instance.createAgentConnector(parseCreateConnectorArgs(args)));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
