import type { Plugin } from 'siyuan';
import { settingdata } from '@/index';
import { getInstance } from '../../tldraw-instance-manager';
import { stringArg } from '../args';

export type AgentActionResult = Promise<{ result?: string; error?: string }>;

export type AgentActionDefinition = {
    name: string;
    description: string;
    handler: (args: Record<string, unknown>, app: unknown) => AgentActionResult;
};

export type AgentActionContext = {
    plugin: Plugin;
};

type OpenWhiteboardResult =
    | { error: string; whiteboardId?: undefined; instance?: undefined }
    | { error?: undefined; whiteboardId: string; instance: NonNullable<ReturnType<typeof getInstance>> };

export function disabledResult(): { error: string } | null {
    return settingdata['tldraw-agent-actions-enable'] === true
        ? null
        : { error: 'STtools tldraw agent actions are disabled in plugin settings.' };
}

export function requireOpenWhiteboard(args: Record<string, unknown>): OpenWhiteboardResult {
    const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
    if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
    const instance = getInstance(whiteboardId);
    if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };
    return { whiteboardId, instance };
}

export function stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function jsonResult(value: unknown): { result: string } {
    return { result: JSON.stringify(value, null, 2) };
}
