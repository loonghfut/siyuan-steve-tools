import { WhiteboardFileManager } from '../../../whiteboard-file-manager';
import { clampNumber, stringArg } from '../internal/core/args';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createListBackupsAction(): AgentActionDefinition {
    return {
        name: 'tldraw_list_backups',
        description: 'List STtools tldraw backup/trash files. Optional args: whiteboardId string to filter, limit number. Returns safe metadata only.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
                const limit = clampNumber(args.limit, 1, 100, 30);
                const backups = (await WhiteboardFileManager.getBackupList())
                    .filter((backup) => !whiteboardId || backup.drawingId === whiteboardId)
                    .slice(0, limit)
                    .map((backup) => ({
                        name: backup.name,
                        drawingId: backup.drawingId,
                        path: backup.path,
                        date: backup.date.toISOString(),
                        title: backup.title,
                    }));
                return jsonResult({ backups });
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
