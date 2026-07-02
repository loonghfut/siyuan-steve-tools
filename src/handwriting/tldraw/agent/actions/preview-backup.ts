import { WHITEBOARD_TRASH_DIR, WhiteboardFileManager } from '../../whiteboard-file-manager';
import { stringArg } from '../args';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from './shared';

export function createPreviewBackupAction(): AgentActionDefinition {
    return {
        name: 'tldraw_preview_backup',
        description: 'Preview a tldraw backup file without restoring it. Required args: backupPath string. Returns page/shape counts and simplified samples.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const backupPath = stringArg(args.backupPath || args.path);
            if (!backupPath) return { error: 'missing required argument: backupPath' };
            if (!backupPath.startsWith(`${WHITEBOARD_TRASH_DIR}/`)) {
                return { error: 'backupPath must be inside the STtools tldraw trash/backup directory' };
            }
            try {
                const preview = await WhiteboardFileManager.getBackupPreview(backupPath);
                return jsonResult(preview);
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
