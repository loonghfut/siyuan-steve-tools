import { getInstance } from '../../../tldraw-instance-manager';
import { WhiteboardFileManager } from '../../../whiteboard-file-manager';
import { stringArg } from '../internal/core/args';
import { parseSnapshotContent, summarizeSnapshotObject, summarizeSavedSnapshot } from '../internal/summaries/snapshot-summary';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createGetSnapshotSummaryAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_snapshot_summary',
        description: 'Read a safe snapshot summary for a whiteboard. Required args: whiteboardId string. If the whiteboard is open, reads the live editor snapshot; otherwise reads the saved file. Returns counts, approximate JSON size, and up to 50 page records; it does not return full whiteboard JSON.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            try {
                const instance = getInstance(whiteboardId);
                if (instance) return jsonResult(instance.getAgentBoardSnapshotSummary());

                const content = await WhiteboardFileManager.readWhiteboardFile(whiteboardId);
                if (!content) return { error: `Whiteboard file not found: ${whiteboardId}` };
                const data = parseSnapshotContent(content);
                const saved = summarizeSavedSnapshot(whiteboardId, content);
                return jsonResult({
                    ...summarizeSnapshotObject(whiteboardId, data, 'saved-file'),
                    isOpen: false,
                    sampleShapes: saved.sampleShapes,
                });
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
