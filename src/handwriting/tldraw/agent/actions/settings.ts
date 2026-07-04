import { settingdata } from '@/index';
import { DEFAULT_TLDRAW_AGENT_ACTION_NAMES } from './metadata';

export const TLDRAW_AGENT_ENABLED_ACTIONS_KEY = 'tldraw-agent-enabled-actions';

export function normalizeTldrawAgentActionNames(value: unknown): string[] {
    if (Array.isArray(value)) {
        return uniqueKnownActions(value);
    }
    if (typeof value === 'string') {
        return uniqueKnownActions(value.split(/[\s,;]+/));
    }
    return [...DEFAULT_TLDRAW_AGENT_ACTION_NAMES];
}

export function getEnabledTldrawAgentActionNames(): string[] {
    return normalizeTldrawAgentActionNames(settingdata?.[TLDRAW_AGENT_ENABLED_ACTIONS_KEY]);
}

export function isTldrawAgentActionEnabled(name: string): boolean {
    return getEnabledTldrawAgentActionNames().includes(name);
}

function uniqueKnownActions(names: unknown[]): string[] {
    const known = new Set(DEFAULT_TLDRAW_AGENT_ACTION_NAMES);
    return Array.from(new Set(names
        .map((name) => typeof name === 'string' ? name.trim() : '')
        .filter((name) => known.has(name))));
}

