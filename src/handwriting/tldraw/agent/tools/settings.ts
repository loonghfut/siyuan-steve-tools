import { settingdata } from '@/index';
import { DEFAULT_TLDRAW_AGENT_ACTION_NAMES, TLDRAW_AGENT_ACTIONS_META } from './metadata';

export const TLDRAW_AGENT_ENABLED_ACTIONS_KEY = 'tldraw-agent-enabled-actions';

/** Normalizes persisted setting values into known tldraw Agent action names. */
export function normalizeTldrawAgentActionNames(value: unknown): string[] {
    if (Array.isArray(value)) {
        return uniqueKnownActions(value);
    }
    if (typeof value === 'string') {
        return uniqueKnownActions(value.split(/[\s,;]+/));
    }
    return [...DEFAULT_TLDRAW_AGENT_ACTION_NAMES];
}

/** Reads the current enabled tldraw Agent action list from plugin settings. */
export function getEnabledTldrawAgentActionNames(): string[] {
    return normalizeTldrawAgentActionNames(settingdata?.[TLDRAW_AGENT_ENABLED_ACTIONS_KEY]);
}

/** Checks whether a tool/action is currently allowed to run. */
export function isTldrawAgentActionEnabled(name: string): boolean {
    return getEnabledTldrawAgentActionNames().includes(name);
}

function uniqueKnownActions(names: unknown[]): string[] {
    const known = new Set(TLDRAW_AGENT_ACTIONS_META.map((action) => action.name));
    return Array.from(new Set(names
        .map((name) => typeof name === 'string' ? name.trim() : '')
        .filter((name) => known.has(name))));
}

