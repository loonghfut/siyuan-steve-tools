import { Plugin } from 'siyuan';
import { settingdata } from '@/index';
import { getTldrawAgentActions } from './agent/actions';
import type { AgentActionResult } from './agent/actions/shared';
import { getInstance } from './tldraw-instance-manager';

type AddAgentActionObject = (options: {
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

    const addAgentAction = (plugin as any).addAgentAction as AddAgentActionObject | undefined;
    if (typeof addAgentAction !== 'function') {
        console.info('SiYuan addAgentAction API is unavailable; skip tldraw agent actions.');
        return;
    }

    for (const action of getTldrawAgentActions(plugin)) {
        const handler = async (args: Record<string, unknown>, app: unknown) => {
            const cleanedArgs = stripFrontendActionArgs(args);
            const endAgentActivity = beginAgentActivityForArgs(cleanedArgs);
            try {
                return await action.handler(cleanedArgs, app);
            } finally {
                endAgentActivity();
            }
        };
        addAgentAction.call(plugin, {
            name: action.name,
            description: action.description,
            handler,
        });
    }

    registered = true;
}

export function syncTldrawAgentActions(plugin: Plugin) {
    registerTldrawAgentActions(plugin);
}

function stripFrontendActionArgs(args: Record<string, unknown>): Record<string, unknown> {
    if (!args || typeof args !== 'object') return {};
    const cleaned = { ...args };
    delete cleaned.action;
    return cleaned;
}

function beginAgentActivityForArgs(args: Record<string, unknown>): () => void {
    const whiteboardId = stringValue(args.whiteboardId || args.id || args.rootId);
    if (!whiteboardId) return noop;

    const instance = getInstance(whiteboardId) as unknown as {
        beginAgentActivity?: () => () => void;
    } | undefined;
    if (!instance || typeof instance.beginAgentActivity !== 'function') return noop;

    try {
        return instance.beginAgentActivity();
    } catch (error) {
        console.warn('Failed to show tldraw agent activity indicator', error);
        return noop;
    }
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function noop() {}
