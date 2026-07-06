import type { Plugin } from 'siyuan';
import { settingdata } from '@/index';
import { getInstance } from '../../tldraw-instance-manager';
import { stringArg } from './internal/core/args';

/** Result shape required by SiYuan Agent tool handlers. */
export type AgentToolResult = Promise<{ result?: string; error?: string }>;

/** A semantic tldraw tool that can be registered through an AI adapter. */
export type AgentToolDefinition = {
    name: string;
    description: string;
    handler: (args: Record<string, unknown>, app: unknown) => AgentToolResult;
};

/** Shared dependencies needed by tool factories. */
export type AgentToolContext = {
    plugin: Plugin;
};

/** Compatibility aliases for existing tool files that still use AgentAction names. */
export type AgentActionResult = AgentToolResult;
export type AgentActionDefinition = AgentToolDefinition;
export type AgentActionContext = AgentToolContext;

type OpenWhiteboardResult =
    | { error: string; whiteboardId?: undefined; instance?: undefined }
    | { error?: undefined; whiteboardId: string; instance: NonNullable<ReturnType<typeof getInstance>> };

/** Returns a standard disabled response when the global tldraw Agent switch is off. */
export function disabledResult(): { error: string } | null {
    return settingdata['tldraw-agent-actions-enable'] === true
        ? null
        : { error: 'STtools tldraw agent actions are disabled in plugin settings.' };
}

/** Resolves the target whiteboard and returns an error when it is not open. */
export function requireOpenWhiteboard(args: Record<string, unknown>): OpenWhiteboardResult {
    const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
    if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
    const instance = getInstance(whiteboardId);
    if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };
    return { whiteboardId, instance };
}

/** Converts unknown caught errors into short strings that can be returned to Agent. */
export function stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Serializes structured tool results using the Agent API's string result field. */
export function jsonResult(value: unknown): { result: string } {
    return { result: JSON.stringify(value) };
}
