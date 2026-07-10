import { getFocusedInstanceId, getInstance } from '../../../tldraw-instance-manager';
import { assertKnownArgs, booleanArgWithFallback, clampNumber, stringArg } from '../internal/core/args';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createGetVisualContextAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_visual_context',
        description: 'Read richer STtools tldraw visual context for the focused or specified whiteboard. Use this before complex AI edits that depend on spatial layout. Returns viewport bounds, selected shapes, visible shapes, offscreen clusters, and optional SVG export. Optional args: whiteboardId string, includeSelectionDetails boolean default true, includeVisibleShapeDetails boolean default true, includeOffscreenClusters boolean default true, includeLinkedBlockContent boolean default true, includeSvg boolean default false, shapeLimit number default 12, clusterLimit number default 6.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, [
                    'whiteboardId',
                    'id',
                    'rootId',
                    'includeSelectionDetails',
                    'includeVisibleShapeDetails',
                    'includeOffscreenClusters',
                    'includeLinkedBlockContent',
                    'includeSvg',
                    'shapeLimit',
                    'clusterLimit',
                ], 'tldraw_get_visual_context');

                const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId) || getFocusedInstanceId();
                if (!whiteboardId) {
                    return { error: 'No focused whiteboard. Focus/open a whiteboard, or pass whiteboardId.' };
                }

                const instance = getInstance(whiteboardId);
                if (!instance) {
                    return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };
                }

                return jsonResult(await instance.getAgentVisualContext({
                    includeSelectionDetails: booleanArgWithFallback(args.includeSelectionDetails, true),
                    includeVisibleShapeDetails: booleanArgWithFallback(args.includeVisibleShapeDetails, true),
                    includeOffscreenClusters: booleanArgWithFallback(args.includeOffscreenClusters, true),
                    includeLinkedBlockContent: booleanArgWithFallback(args.includeLinkedBlockContent, true),
                    includeSvg: booleanArgWithFallback(args.includeSvg, false),
                    shapeLimit: clampNumber(args.shapeLimit, 1, 50, 12),
                    clusterLimit: clampNumber(args.clusterLimit, 0, 20, 6),
                }));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
