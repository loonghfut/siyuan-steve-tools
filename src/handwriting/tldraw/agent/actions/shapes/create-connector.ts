import { parseCreateConnectorArgs } from '../../core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createCreateConnectorAction(): AgentActionDefinition {
    return {
        name: 'tldraw_create_connector',
        description: 'Create a safe connector on an open whiteboard. Required args: whiteboardId and either shapeIds [sourceId,targetId], startShapeId/endShapeId, or start/end points. Optional args: kind "arrow"|"bezier-connector"|"branch" default "bezier-connector", color, text, strokeWidth, side "left"|"right" for branch only, horizontalGap, verticalGap, select, zoom default true, resultMode "compact"|"full" default compact. Prefer shapeIds for ordinary relationship lines between existing shapes; ports are chosen automatically for custom card/single-block/mind-map ports when available. For tree/parent-child/hierarchical layouts, pass kind:"branch" with shapeIds [root, child]. Branch constraints: root content must be card/single-block, children must be card/single-block/branch, and branch cycles or duplicate root branches are rejected. Never use branch for text/note/geo/frame/slide/mind-map/js-shape/arrow/connector shapes. Do not move or manually layout shapes before creating or changing a branch connector: branch auto-arranges children and its main position is controlled by the root/branch center. To move an existing left child to the right side, call kind:"branch" again with the same root/branch and child plus side:"right"; this updates branch child-id props and relayouts automatically. Use bezier-connector for durable labeled relationships, arrow for simpler tldraw arrows, and plain line only for non-binding visual marks. Unknown args are rejected.',
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
