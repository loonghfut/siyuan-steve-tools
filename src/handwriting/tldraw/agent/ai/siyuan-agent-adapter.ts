import { Plugin } from 'siyuan';
import { settingdata } from '@/index';
import { getTldrawAgentTools } from '../tools';
import { isTldrawAgentActionEnabled } from '../tools/settings';
import type { AgentToolDefinition, AgentToolResult } from '../tools/shared';
import { beginAgentActivityForArgs } from './activity';

type AddAgentActionObject = (options: {
    name: string;
    description: string;
    handler: (args: Record<string, unknown>, app: unknown) => AgentToolResult;
}) => string;

const registeredActionNames = new Set<string>();

/**
 * Registers the tldraw tool layer with SiYuan's Agent API.
 * This file is intentionally the only layer that knows about addAgentAction.
 */
export function registerTldrawAgentActions(plugin: Plugin) {
    if (settingdata['tldraw-agent-actions-enable'] !== true) {
        return;
    }
    const addAgentAction = plugin.addAgentAction as AddAgentActionObject | undefined;
    if (typeof addAgentAction !== 'function') {
        console.info('SiYuan addAgentAction API is unavailable; skip tldraw agent actions.');
        return;
    }

    for (const tool of getTldrawAgentTools(plugin).filter((tool) => isTldrawAgentActionEnabled(tool.name))) {
        if (registeredActionNames.has(tool.name)) {
            continue;
        }
        addAgentAction.call(plugin, {
            name: tool.name,
            description: tool.description,
            handler: createSiyuanAgentHandler(tool),
        });
        registeredActionNames.add(tool.name);
    }
}

/**
 * Re-runs registration after settings change.
 * Already registered actions stay guarded by runtime enable checks.
 */
export function syncTldrawAgentActions(plugin: Plugin) {
    registerTldrawAgentActions(plugin);
}

/**
 * Wraps a tool handler with the small bits needed by the SiYuan Agent bridge:
 * setting checks, frontend arg cleanup, logs, and the activity indicator.
 */
function createSiyuanAgentHandler(tool: AgentToolDefinition) {
    return async (args: Record<string, unknown>, app: unknown) => {
        if (!isTldrawAgentActionEnabled(tool.name)) {
            return { error: `STtools tldraw agent action ${tool.name} is disabled in plugin settings.` };
        }
        const cleanedArgs = stripFrontendActionArgs(args);
        console.log('[tldraw agent action] call', {
            name: tool.name,
            args: cleanedArgs,
            rawArgs: args,
        });
        const endAgentActivity = beginAgentActivityForArgs(cleanedArgs);
        try {
            const result = await tool.handler(cleanedArgs, app);
            console.log('[tldraw agent action] response', {
                name: tool.name,
                result,
            });
            return result;
        } catch (error) {
            console.log('[tldraw agent action] error', {
                name: tool.name,
                error,
            });
            throw error;
        } finally {
            endAgentActivity();
        }
    };
}

/**
 * Removes the frontend-only wrapper key that SiYuan may pass alongside tool args.
 * The tool layer should receive only semantic arguments.
 */
function stripFrontendActionArgs(args: Record<string, unknown>): Record<string, unknown> {
    if (!args || typeof args !== 'object') return {};
    const cleaned = { ...args };
    delete cleaned.action;
    return cleaned;
}
