import type { Plugin } from 'siyuan';
import { createEditBoardAction } from './planning/edit-board';
import { createBackupWhiteboardAction } from './whiteboards/backup-whiteboard';
import { createDeleteWhiteboardFileAction } from './whiteboards/delete-whiteboard-file';
import { createGetAgentCapabilitiesAction } from './system/get-agent-capabilities';
import { createGetInteractionContextAction } from './system/get-interaction-context';
import { createGetShapeDetailsAction } from './shapes/get-shape-details';
import { createGetSnapshotSummaryAction } from './whiteboards/get-snapshot-summary';
import { createGetSummaryAction } from './whiteboards/get-summary';
import { createListBackupsAction } from './whiteboards/list-backups';
import { createListWhiteboardsAction } from './whiteboards/list-whiteboards';
import { createNavigateToBlockAction } from './documents/navigate-to-block';
import { createOpenWhiteboardAction } from './whiteboards/open-whiteboard';
import { createPreviewBackupAction } from './whiteboards/preview-backup';
import { createReadDocOutlineAction } from './documents/read-doc-outline';
import { createSaveWhiteboardAction } from './whiteboards/save-whiteboard';
import { createSelectShapeAction } from './shapes/select-shape';
import type { AgentActionContext, AgentActionDefinition } from './shared';
import { createZoomToShapesAction } from './shapes/zoom-to-shapes';

export function getTldrawAgentActions(plugin: Plugin): AgentActionDefinition[] {
    const context: AgentActionContext = { plugin };
    const actions = [
        createGetAgentCapabilitiesAction(),
        createGetInteractionContextAction(),
        createEditBoardAction(),
        createListWhiteboardsAction(),
        createOpenWhiteboardAction(context),
        createGetSummaryAction(),
        createReadDocOutlineAction(),
        createGetShapeDetailsAction(),
        createGetSnapshotSummaryAction(),
        createBackupWhiteboardAction(),
        createListBackupsAction(),
        createPreviewBackupAction(),
        createDeleteWhiteboardFileAction(),
        createSaveWhiteboardAction(),
        createNavigateToBlockAction(),
        createZoomToShapesAction(),
        createSelectShapeAction(),
    ];
    return actions.map(withInteractionContextRequirement);
}

function withInteractionContextRequirement(action: AgentActionDefinition): AgentActionDefinition {
    if (
        action.name === 'tldraw_get_interaction_context' ||
        action.name === 'tldraw_get_agent_capabilities' ||
        action.name === 'tldraw_edit_board'
    ) {
        return action;
    }

    return {
        ...action,
        description: `${action.description} Before calling this action, call tldraw_get_interaction_context to sense the focused whiteboard and current selection; use focusedWhiteboardId as whiteboardId unless the user explicitly requested another target.`,
    };
}
