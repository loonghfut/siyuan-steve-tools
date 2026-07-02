import type { Plugin } from 'siyuan';
import { createAlignShapesAction } from './align-shapes';
import { createApplyPlanAction } from './apply-plan';
import { createArrangeShapesAction } from './arrange-shapes';
import { createBackupWhiteboardAction } from './backup-whiteboard';
import { createBatchUpdateShapesAction } from './batch-update-shapes';
import { createConvertConnectorsAction } from './convert-connectors';
import { createCreateBasicShapeAction } from './create-basic-shape';
import { createCreateConnectorAction } from './create-connector';
import { createCreateShapeAction } from './create-shape';
import { createCreateSummaryChildDocWhiteboardAction } from './create-summary-child-doc-whiteboard';
import { createDeleteShapesAction } from './delete-shapes';
import { createDeleteWhiteboardFileAction } from './delete-whiteboard-file';
import { createDuplicateShapesAction } from './duplicate-shapes';
import { createGetAgentCapabilitiesAction } from './get-agent-capabilities';
import { createGetInteractionContextAction } from './get-interaction-context';
import { createGetShapeDetailsAction } from './get-shape-details';
import { createGetSnapshotSummaryAction } from './get-snapshot-summary';
import { createGetSummaryAction } from './get-summary';
import { createGroupShapesAction } from './group-shapes';
import { createInsertDocOutlineMindmapAction } from './insert-doc-outline-mindmap';
import { createListBackupsAction } from './list-backups';
import { createListWhiteboardsAction } from './list-whiteboards';
import { createLockShapesAction } from './lock-shapes';
import { createNavigateToBlockAction } from './navigate-to-block';
import { createOpenWhiteboardAction } from './open-whiteboard';
import { createPreviewBackupAction } from './preview-backup';
import { createReadDocOutlineAction } from './read-doc-outline';
import { createSaveWhiteboardAction } from './save-whiteboard';
import { createSelectShapeAction } from './select-shape';
import type { AgentActionContext, AgentActionDefinition } from './shared';
import { createUpdateShapeAction } from './update-shape';
import { createZoomToShapesAction } from './zoom-to-shapes';

export function getTldrawAgentActions(plugin: Plugin): AgentActionDefinition[] {
    const context: AgentActionContext = { plugin };
    const actions = [
        createGetAgentCapabilitiesAction(),
        createGetInteractionContextAction(),
        createApplyPlanAction(),
        createListWhiteboardsAction(),
        createOpenWhiteboardAction(context),
        createGetSummaryAction(),
        createReadDocOutlineAction(),
        createInsertDocOutlineMindmapAction(),
        createCreateSummaryChildDocWhiteboardAction(context),
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
        action.name === 'tldraw_apply_plan'
    ) {
        return action;
    }

    return {
        ...action,
        description: `${action.description} Before calling this action, call tldraw_get_interaction_context to sense the focused whiteboard and current selection; use focusedWhiteboardId as whiteboardId unless the user explicitly requested another target.`,
    };
}
