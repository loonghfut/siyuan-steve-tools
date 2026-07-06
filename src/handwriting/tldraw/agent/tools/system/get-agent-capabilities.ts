import { getTldrawAgentCapabilities } from '../internal/core/capabilities';
import { disabledResult, jsonResult, type AgentActionDefinition } from '../shared';
import { getEnabledTldrawAgentActionNames } from '../settings';

export function createGetAgentCapabilitiesAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_agent_capabilities',
        description: 'List STtools tldraw frontend actions available to SiYuan Agent, including safety rules and intentionally blocked high-risk operations.',
        handler: async () => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            return jsonResult({
                ...getTldrawAgentCapabilities(),
                enabledActions: getEnabledTldrawAgentActionNames(),
            });
        },
    };
}
