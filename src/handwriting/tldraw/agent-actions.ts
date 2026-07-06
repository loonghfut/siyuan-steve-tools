import { Plugin } from 'siyuan';
import { settingdata } from '@/index';
import { getTldrawAgentActions } from './agent/actions';
import { isTldrawAgentActionEnabled } from './agent/actions/settings';
import type { AgentActionResult } from './agent/actions/shared';
import { getFocusedInstanceId, getInstance } from './tldraw-instance-manager';

type AddAgentActionObject = (options: {
    name: string;
    description: string;
    handler: (args: Record<string, unknown>, app: unknown) => AgentActionResult;
}) => string;

const registeredActionNames = new Set<string>();

export function registerTldrawAgentActions(plugin: Plugin) {
    if (settingdata['tldraw-agent-actions-enable'] !== true) {
        return;
    }
    const addAgentAction = plugin.addAgentAction as AddAgentActionObject | undefined;
    if (typeof addAgentAction !== 'function') {
        console.info('SiYuan addAgentAction API is unavailable; skip tldraw agent actions.');
        return;
    }

    for (const action of getTldrawAgentActions(plugin).filter((action) => isTldrawAgentActionEnabled(action.name))) {
        if (registeredActionNames.has(action.name)) {
            continue;
        }
        const handler = async (args: Record<string, unknown>, app: unknown) => {
            if (!isTldrawAgentActionEnabled(action.name)) {
                return { error: `STtools tldraw agent action ${action.name} is disabled in plugin settings.` };
            }
            const cleanedArgs = stripFrontendActionArgs(args);
            console.log('[tldraw agent action] call', {
                name: action.name,
                args: cleanedArgs,
                rawArgs: args,
            });
            const endAgentActivity = beginAgentActivityForArgs(cleanedArgs);
            try {
                const result = await action.handler(cleanedArgs, app);
                console.log('[tldraw agent action] response', {
                    name: action.name,
                    result,
                });
                return result;
            } catch (error) {
                console.log('[tldraw agent action] error', {
                    name: action.name,
                    error,
                });
                throw error;
            } finally {
                endAgentActivity();
            }
        };
        addAgentAction.call(plugin, {
            name: action.name,
            description: action.description,
            handler,
        });
        registeredActionNames.add(action.name);
    }
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
    const whiteboardId = stringValue(args.whiteboardId || args.id || args.rootId) || getFocusedInstanceId();
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
