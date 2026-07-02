import { listWhiteboardsForAgent } from '../whiteboard-list';
import { disabledResult, type AgentActionDefinition } from './shared';

export function createListWhiteboardsAction(): AgentActionDefinition {
    return {
        name: 'tldraw_list_whiteboards',
        description: 'List STtools tldraw whiteboards with safe planning metadata. Optional args: limit number, query string, sortBy "updated"|"title"|"id"|"shapeCount", sortOrder "asc"|"desc", includeDocMetadata boolean default true, includeSnapshotSummary boolean default true, includeShapeSamples boolean default false, summaryLimit number. Returns IDs, links, open state, related SiYuan doc metadata, safe counts/type summaries, and never returns full whiteboard JSON.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            return listWhiteboardsForAgent(args);
        },
    };
}
