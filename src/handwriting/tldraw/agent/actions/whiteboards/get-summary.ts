import { getInstance } from '../../../tldraw-instance-manager';
import { WhiteboardFileManager } from '../../../whiteboard-file-manager';
import { stringArg } from '../../core/args';
import { summarizeSavedSnapshot } from '../../summaries/snapshot-summary';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createGetSummaryAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_summary',
        description: 'Get a summary of an STtools tldraw whiteboard. Required args: whiteboardId string. If the whiteboard is open, returns live editor state; otherwise reads the saved snapshot file. Shape samples include bounds for layout planning.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            try {
                const instance = getInstance(whiteboardId);
                if (instance) return jsonResult(instance.getAgentSummary());

                const content = await WhiteboardFileManager.readWhiteboardFile(whiteboardId);
                if (!content) return { error: `Whiteboard file not found: ${whiteboardId}` };
                return jsonResult(summarizeSavedSnapshot(whiteboardId, content));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
