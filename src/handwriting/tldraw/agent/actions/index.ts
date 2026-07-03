import type { Plugin } from 'siyuan';
import { createAlignShapesAction } from './shapes/align-shapes';
import { createApplyPlanAction } from './planning/apply-plan';
import { createEditBoardAction } from './planning/edit-board';
import { createArrangeShapesAction } from './shapes/arrange-shapes';
import { createBackupWhiteboardAction } from './whiteboards/backup-whiteboard';
import { createBatchUpdateShapesAction } from './shapes/batch-update-shapes';
import { createConvertConnectorsAction } from './shapes/convert-connectors';
import { createCreateBasicShapeAction } from './shapes/create-basic-shape';
import { createCreateConnectorAction } from './shapes/create-connector';
import { createCreateShapeAction } from './shapes/create-shape';
import { createCreateSummaryDocWhiteboardAction } from './documents/create-summary-doc-whiteboard';
import { createDeleteShapesAction } from './shapes/delete-shapes';
import { createDeleteWhiteboardFileAction } from './whiteboards/delete-whiteboard-file';
import { createDuplicateShapesAction } from './shapes/duplicate-shapes';
import { createGetAgentCapabilitiesAction } from './system/get-agent-capabilities';
import { createGetInteractionContextAction } from './system/get-interaction-context';
import { createGetShapeDetailsAction } from './shapes/get-shape-details';
import { createGetSnapshotSummaryAction } from './whiteboards/get-snapshot-summary';
import { createGetSummaryAction } from './whiteboards/get-summary';
import { createGroupShapesAction } from './shapes/group-shapes';
import { createInsertDocOutlineMindmapAction } from './documents/insert-doc-outline-mindmap';
import { createListBackupsAction } from './whiteboards/list-backups';
import { createListWhiteboardsAction } from './whiteboards/list-whiteboards';
import { createLockShapesAction } from './shapes/lock-shapes';
import { createNavigateToBlockAction } from './documents/navigate-to-block';
import { createOpenWhiteboardAction } from './whiteboards/open-whiteboard';
import { createPreviewBackupAction } from './whiteboards/preview-backup';
import { createReadDocOutlineAction } from './documents/read-doc-outline';
import { createSaveWhiteboardAction } from './whiteboards/save-whiteboard';
import { createSelectShapeAction } from './shapes/select-shape';
import type { AgentActionContext, AgentActionDefinition } from './shared';
import { createUpdateShapeAction } from './shapes/update-shape';
import { createZoomToShapesAction } from './shapes/zoom-to-shapes';

export function getTldrawAgentActions(plugin: Plugin): AgentActionDefinition[] {
    const context: AgentActionContext = { plugin };
    const actions = [
        createGetAgentCapabilitiesAction(),
        createGetInteractionContextAction(),
        createEditBoardAction(),
        createApplyPlanAction(),
        createListWhiteboardsAction(),
        createOpenWhiteboardAction(context),
        createGetSummaryAction(),
        createReadDocOutlineAction(),
        createInsertDocOutlineMindmapAction(),
        createCreateSummaryDocWhiteboardAction(context),
        createCreateShapeAction(),
        createGetShapeDetailsAction(),
        createGetSnapshotSummaryAction(),
        createBackupWhiteboardAction(),
        createListBackupsAction(),
        createPreviewBackupAction(),
        createDeleteWhiteboardFileAction(),
        createCreateBasicShapeAction(),
        createCreateConnectorAction(),
        createUpdateShapeAction(),
        createSaveWhiteboardAction(),
        createNavigateToBlockAction(),
        createZoomToShapesAction(),
        createBatchUpdateShapesAction(),
        createDeleteShapesAction(),
        createDuplicateShapesAction(),
        createArrangeShapesAction(),
        createAlignShapesAction(),
        createGroupShapesAction(),
        createLockShapesAction(),
        createConvertConnectorsAction(),
        createSelectShapeAction(),
    ];
    return actions.map(withInteractionContextRequirement);
}

function withInteractionContextRequirement(action: AgentActionDefinition): AgentActionDefinition {
    if (
        action.name === 'tldraw_get_interaction_context' ||
        action.name === 'tldraw_get_agent_capabilities' ||
        action.name === 'tldraw_edit_board' ||
        action.name === 'tldraw_apply_plan'
    ) {
        return action;
    }

    return {
        ...action,
        description: `${action.description} Before calling this action, call tldraw_get_interaction_context to sense the focused whiteboard and current selection; use focusedWhiteboardId as whiteboardId unless the user explicitly requested another target.`,
    };
}
