import { stringArg } from '../internal/core/args';
import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createBackupWhiteboardAction(): AgentActionDefinition {
    return {
        name: 'tldraw_backup_whiteboard',
        description: 'Create a backup file for an open whiteboard before risky agent operations. Required args: whiteboardId string. Optional args: reason string. Returns the backup file operation result and a safe snapshot summary.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                const backedUp = await target.instance.backupAgentWhiteboard({ reason: stringArg(args.reason) });
                return jsonResult(backedUp);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
