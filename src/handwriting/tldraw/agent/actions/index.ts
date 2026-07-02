import type { Plugin } from 'siyuan';
import { createAlignShapesAction } from './align-shapes';
import { createArrangeShapesAction } from './arrange-shapes';
import { createBackupWhiteboardAction } from './backup-whiteboard';
import { createBatchUpdateShapesAction } from './batch-update-shapes';
import { createConvertConnectorsAction } from './convert-connectors';
import { createCreateBasicShapeAction } from './create-basic-shape';
import { createCreateConnectorAction } from './create-connector';
import { createCreateShapeAction } from './create-shape';
import { createDeleteShapesAction } from './delete-shapes';
import { createDeleteWhiteboardFileAction } from './delete-whiteboard-file';
import { createDuplicateShapesAction } from './duplicate-shapes';
import { createGetAgentCapabilitiesAction } from './get-agent-capabilities';
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
    return [
        createGetAgentCapabilitiesAction(),
        createListWhiteboardsAction(),
        createOpenWhiteboardAction(context),
        createGetSummaryAction(),
        createReadDocOutlineAction(),
        createInsertDocOutlineMindmapAction(),
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
}
