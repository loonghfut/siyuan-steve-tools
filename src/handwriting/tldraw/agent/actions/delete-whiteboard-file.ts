import { getInstance } from '../../tldraw-instance-manager';
import { WhiteboardFileManager } from '../../whiteboard-file-manager';
import { booleanArgWithFallback, stringArg } from '../args';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from './shared';

export function createDeleteWhiteboardFileAction(): AgentActionDefinition {
    return {
        name: 'tldraw_delete_whiteboard_file',
        description: 'Dry-run or move a closed whiteboard file to the STtools trash directory. Required args: whiteboardId string. By default this is a dry run; pass confirm true to execute. Refuses to delete currently open whiteboards.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            if (getInstance(whiteboardId)) {
                return { error: `Whiteboard ${whiteboardId} is currently open; close it before deleting its file.` };
            }
            try {
                const exists = await WhiteboardFileManager.whiteboardFileExists(whiteboardId);
                const fileSize = exists ? await WhiteboardFileManager.getWhiteboardFileSize(whiteboardId) : 0;
                if (!exists) return { error: `Whiteboard file not found: ${whiteboardId}` };
                if (booleanArgWithFallback(args.confirm, false) !== true) {
                    return jsonResult({
                        dryRun: true,
                        whiteboardId,
                        fileSize,
                        message: 'Pass confirm:true to move this whiteboard file to trash.',
                    });
                }

                const deleted = await WhiteboardFileManager.deleteWhiteboardFile(whiteboardId, {
                    reason: stringArg(args.reason) || 'agent-delete',
                    includeTimestamp: true,
                });
                return jsonResult({ dryRun: false, whiteboardId, fileSize, ...deleted });
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
