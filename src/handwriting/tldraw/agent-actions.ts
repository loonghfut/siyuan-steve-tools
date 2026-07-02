import { Plugin } from 'siyuan';
import { settingdata } from '@/index';
import { getTldrawAgentActions } from './agent/actions';
import type { AgentActionDefinition, AgentActionResult } from './agent/actions/shared';

type AddAgentAction = (options: {
    name: string;
    description: string;
    handler: (args: Record<string, unknown>, app: unknown) => AgentActionResult;
}) => string;

let registered = false;

export function registerTldrawAgentActions(plugin: Plugin) {
    if (settingdata['tldraw-agent-actions-enable'] !== true) {
        return;
    }
    if (registered) {
        return;
    }

    const addAgentAction = (plugin as any).addAgentAction as AddAgentAction | undefined;
    if (typeof addAgentAction !== 'function') {
        console.info('SiYuan addAgentAction API is unavailable; skip tldraw agent actions.');
        return;
    }

    for (const action of getTldrawAgentActions(plugin)) {
        addAgentAction.call(plugin, action as AgentActionDefinition);
    }

    registered = true;
}

export function syncTldrawAgentActions(plugin: Plugin) {
    registerTldrawAgentActions(plugin);
}
