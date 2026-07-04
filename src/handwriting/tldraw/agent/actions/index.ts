import type { Plugin } from 'siyuan';
import { createApplyPlanAction } from './planning/apply-plan';
import { createBackupWhiteboardAction } from './whiteboards/backup-whiteboard';
import { createCreateSummaryDocWhiteboardAction } from './documents/create-summary-doc-whiteboard';
import { createDeleteWhiteboardFileAction } from './whiteboards/delete-whiteboard-file';
import { createDeleteShapesAction } from './shapes/delete-shapes';
import { createGetAgentCapabilitiesAction } from './system/get-agent-capabilities';
import { createGetInteractionContextAction } from './system/get-interaction-context';
import { createGetShapeDetailsAction } from './shapes/get-shape-details';
import { createGetSnapshotSummaryAction } from './whiteboards/get-snapshot-summary';
import { createGetSummaryAction } from './whiteboards/get-summary';
import { createListBackupsAction } from './whiteboards/list-backups';
import { createListWhiteboardsAction } from './whiteboards/list-whiteboards';
import { createInsertDocOutlineMindmapAction } from './documents/insert-doc-outline-mindmap';
import { createNavigateToBlockAction } from './documents/navigate-to-block';
import { createOpenWhiteboardAction } from './whiteboards/open-whiteboard';
import { createPreviewBackupAction } from './whiteboards/preview-backup';
import { createReadDocOutlineAction } from './documents/read-doc-outline';
import { createSaveWhiteboardAction } from './whiteboards/save-whiteboard';
import { createSelectShapeAction } from './shapes/select-shape';
import { createShapeCommandAction } from './shapes/shape-command';
import { DEFAULT_TLDRAW_AGENT_ACTION_NAMES } from './metadata';
import type { AgentActionContext, AgentActionDefinition } from './shared';
import { createZoomToShapesAction } from './shapes/zoom-to-shapes';

export function getTldrawAgentActions(plugin: Plugin): AgentActionDefinition[] {
    const context: AgentActionContext = { plugin };
    const actionDefinitions = [
        createGetAgentCapabilitiesAction(),
        createGetInteractionContextAction(),
        createShapeCommandAction(),
        createApplyPlanAction(),
        createDeleteShapesAction(),
        createListWhiteboardsAction(),
        createOpenWhiteboardAction(context),
        createGetSummaryAction(),
        createReadDocOutlineAction(),
        createInsertDocOutlineMindmapAction(),
        createCreateSummaryDocWhiteboardAction(context),
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
    const actionsByName = new Map(actionDefinitions.map((action) => [action.name, action]));
    return DEFAULT_TLDRAW_AGENT_ACTION_NAMES
        .map((name) => actionsByName.get(name))
        .filter((action): action is AgentActionDefinition => !!action)
        .map(withInteractionContextRequirement);
}

function withInteractionContextRequirement(action: AgentActionDefinition): AgentActionDefinition {
    if (
        action.name === 'tldraw_get_interaction_context' ||
        action.name === 'tldraw_get_agent_capabilities' ||
        action.name === 'tldraw_shape_command'
    ) {
        return action;
    }

    return {
        ...action,
        description: `${action.description} Before calling this action, call tldraw_get_interaction_context to sense the focused whiteboard and current selection; use focusedWhiteboardId as whiteboardId unless the user explicitly requested another target.`,
    };
}
