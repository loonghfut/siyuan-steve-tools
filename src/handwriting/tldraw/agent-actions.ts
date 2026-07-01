import { openTab, Plugin } from 'siyuan';
import * as api from '@/api/api';
import { settingdata } from '@/index';
import { WHITEBOARD_STORAGE_DIR, WhiteboardFileManager } from './whiteboard-file-manager';
import { getAllInstanceIds, getInstance } from './tldraw-instance-manager';
import { buildTldrawLink } from './utils/link-builder';
import { booleanArgWithFallback, clampNumber, numberArg, parseCreateShapeArgs, stringArg } from './agent/args';

type AgentActionResult = Promise<{ result?: string; error?: string }>;
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

    addAgentAction.call(plugin, {
        name: 'tldraw_list_whiteboards',
        description: 'List STtools tldraw whiteboards. Optional args: limit number. Returns whiteboard IDs, storage files, whether each whiteboard is currently open, and a tldraw link.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                const limit = clampNumber(args.limit, 1, 100, 30);
                const files = (await api.readDir(WHITEBOARD_STORAGE_DIR)) as unknown as IResReadDir[];
                const openIds = new Set(getAllInstanceIds());
                const whiteboards = (files || [])
                    .filter((file) => !file.isDir && file.name.startsWith('tldraw-data-') && file.name.endsWith('.json'))
                    .slice(0, limit)
                    .map((file) => {
                        const id = extractWhiteboardId(file.name);
                        return {
                            id,
                            fileName: file.name,
                            isOpen: openIds.has(id),
                            link: buildTldrawLink(id, undefined, id),
                        };
                    });
                return { result: JSON.stringify({ whiteboards }, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_open_whiteboard',
        description: 'Open an STtools tldraw whiteboard tab by document/root block ID. Required args: whiteboardId string. Optional args: title string.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            try {
                const title = stringArg(args.title) || `Whiteboard ${whiteboardId}`;
                await openTab({
                    app: plugin.app,
                    custom: {
                        id: plugin.name + 'steveTool-whiteboard',
                        title,
                        icon: 'iconSTWhiteboard',
                        data: {
                            text: 'steveTool-whiteboard' + whiteboardId,
                            rootid: whiteboardId,
                        },
                    },
                    position: 'right',
                });
                return { result: `Opened tldraw whiteboard ${whiteboardId}.` };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_get_summary',
        description: 'Get a summary of an STtools tldraw whiteboard. Required args: whiteboardId string. If the whiteboard is open, returns live editor state; otherwise reads the saved snapshot file.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            try {
                const instance = getInstance(whiteboardId);
                if (instance) {
                    return { result: JSON.stringify(instance.getAgentSummary(), null, 2) };
                }

                const content = await WhiteboardFileManager.readWhiteboardFile(whiteboardId);
                if (!content) {
                    return { error: `Whiteboard file not found: ${whiteboardId}` };
                }
                return { result: JSON.stringify(summarizeSavedSnapshot(whiteboardId, content), null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_create_shape',
        description: 'Create STtools tldraw business shapes on an open whiteboard. Required args: whiteboardId string, kind "card"|"single-block"|"branch". For card/single-block optional args: blockId, x, y, w, h, color, select, zoom. Color must be one of black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, light-red, red, white; unsupported colors are normalized. For branch optional args: x, y, rootShapeId or root, childShapeIds, children, leftChildren, rightChildren, direction, horizontalGap, verticalGap, lineStyle, lineWidth, snapDistance, showBackground. lineStyle must be curve-solid, elbow-solid, straight-solid, curve-dashed, or frame-floating. Children may be existing shape IDs or objects like {shapeId} / {kind:"card"|"single-block"|"branch", blockId, side}. The plugin creates missing business nodes, attaches them to the branch, lays out branch children, selects the branch, and returns all created/attached IDs.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const created = instance.createAgentShape(parseCreateShapeArgs(args));
                return { result: JSON.stringify(created, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_update_shape',
        description: 'Update position and supported visual props of an STtools business shape on an open tldraw whiteboard. Required args: whiteboardId string, shapeId string. Optional args: x, y, w, h, color, select boolean, zoom boolean. Color must be a tldraw color name; unsupported colors are normalized. Do not pass text for card, single-block, or branch; their content comes from bound SiYuan blocks.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            const shapeId = stringArg(args.shapeId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            if (!shapeId) return { error: 'missing required argument: shapeId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const updated = instance.updateAgentShape({
                    shapeId,
                    x: numberArg(args.x),
                    y: numberArg(args.y),
                    w: numberArg(args.w),
                    h: numberArg(args.h),
                    color: stringArg(args.color),
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, false),
                });
                return { result: JSON.stringify(updated, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_select_shape',
        description: 'Select and optionally zoom to a shape on an open STtools tldraw whiteboard. Required args: whiteboardId string, shapeId string. Optional args: zoom boolean.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            const shapeId = stringArg(args.shapeId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            if (!shapeId) return { error: 'missing required argument: shapeId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const selected = instance.selectAgentShape(shapeId, booleanArgWithFallback(args.zoom, true));
                return { result: JSON.stringify(selected, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    registered = true;
}

export function syncTldrawAgentActions(plugin: Plugin) {
    registerTldrawAgentActions(plugin);
}

function extractWhiteboardId(fileName: string): string {
    return fileName.replace(/^tldraw-data-/, '').replace(/\.json$/, '');
}

function summarizeSavedSnapshot(whiteboardId: string, content: string) {
    const data = JSON.parse(content);
    const store = data?.store || {};
    const records = Object.values(store) as any[];
    const shapes = records.filter((record) => record?.typeName === 'shape' || String(record?.id || '').startsWith('shape:'));
    const pages = records.filter((record) => record?.typeName === 'page' || String(record?.id || '').startsWith('page:'));
    const assets = records.filter((record) => record?.typeName === 'asset' || String(record?.id || '').startsWith('asset:'));
    const shapeTypeCounts = shapes.reduce<Record<string, number>>((acc, shape: any) => {
        const type = String(shape.type || 'unknown');
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});
    return {
        id: whiteboardId,
        isOpen: false,
        pageCount: pages.length,
        shapeCount: shapes.length,
        assetCount: assets.length,
        shapeTypeCounts,
        sampleShapes: shapes.slice(0, 20).map((shape: any) => ({
            id: String(shape.id),
            type: String(shape.type),
            x: Number(shape.x || 0),
            y: Number(shape.y || 0),
            props: summarizeProps(shape.props),
        })),
    };
}

function summarizeProps(props: any): Record<string, unknown> {
    if (!props || typeof props !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const key of ['w', 'h', 'color', 'geo', 'blockId', 'name', 'text']) {
        if (props[key] !== undefined) out[key] = props[key];
    }
    if (props.richText) out.richText = '[richText]';
    return out;
}

function stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function disabledResult(): { error: string } | null {
    return settingdata['tldraw-agent-actions-enable'] === true
        ? null
        : { error: 'STtools tldraw agent actions are disabled in plugin settings.' };
}
