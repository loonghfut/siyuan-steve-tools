import { getTldrawAgentCapabilities } from '../../core/capabilities';
import { disabledResult, jsonResult, type AgentActionDefinition } from '../shared';

export function createGetAgentCapabilitiesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_agent_capabilities',
        description: 'List STtools tldraw frontend actions available to SiYuan Agent, including safety rules and intentionally blocked high-risk operations.',
        handler: async () => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            return jsonResult(getTldrawAgentCapabilities());
        },
    };
}
