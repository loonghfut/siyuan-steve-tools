import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from './shared';

export function createGetSnapshotSummaryAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_snapshot_summary',
        description: 'Read a safe snapshot summary for an open whiteboard. Required args: whiteboardId string. Returns counts, approximate JSON size, and up to 50 page records; it does not return full whiteboard JSON.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                return jsonResult(target.instance.getAgentBoardSnapshotSummary());
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
