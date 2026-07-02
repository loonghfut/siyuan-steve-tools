import { openTab, Plugin } from 'siyuan';
import * as api from '@/api/api';
import { settingdata } from '@/index';
import { WHITEBOARD_STORAGE_DIR, WHITEBOARD_TRASH_DIR, WhiteboardFileManager } from './whiteboard-file-manager';
import { getAllInstanceIds, getInstance } from './tldraw-instance-manager';
import { buildTldrawLink } from './utils/link-builder';
import {
    booleanArgWithFallback,
    clampNumber,
    numberArg,
    parseCreateBasicShapeArgs,
    parseCreateConnectorArgs,
    parseCreateShapeArgs,
    parseShapeUpdatePatch,
    shapeIdArrayArg,
    stringArg,
} from './agent/args';
import { loadOutlineForDoc } from './doc-outline/doc-outline-data';
import { summarizeOutline } from './agent/doc-to-board';

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
        name: 'tldraw_get_agent_capabilities',
        description: 'List STtools tldraw frontend actions available to SiYuan Agent, including safety rules and intentionally blocked high-risk operations.',
        handler: async () => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            return { result: JSON.stringify(getTldrawAgentCapabilities(), null, 2) };
        },
    });

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
        name: 'siyuan_read_doc_outline_for_tldraw',
        description: 'Read a SiYuan document outline for planning a tldraw mindmap. Required args: docId string. Optional args: maxNodes number. Returns heading/block IDs, titles, depth, type, and subType. Use these block IDs when creating cards or branches.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const docId = stringArg(args.docId || args.id || args.rootId || args.whiteboardId);
            if (!docId) return { error: 'missing required argument: docId' };

            try {
                const maxNodes = clampNumber(args.maxNodes, 1, 500, 120);
                const outline = await loadOutlineForDoc(docId);
                return {
                    result: JSON.stringify({
                        docId,
                        outlineNodeCount: countOutlineNodes(outline),
                        outline: summarizeOutline(outline, maxNodes),
                    }, null, 2),
                };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_insert_doc_outline_mindmap',
        description: 'Insert the outline blocks of a SiYuan document into its open STtools tldraw whiteboard as a branch/mindmap layout. Required args: docId string. Optional args: whiteboardId string defaults to docId, mainShapeId string, select boolean, zoom boolean. If the document main card is missing, the plugin creates it. Existing block cards are skipped.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const docId = stringArg(args.docId || args.blockId || args.rootId || args.id);
            if (!docId) return { error: 'missing required argument: docId' };
            const whiteboardId = stringArg(args.whiteboardId) || docId;
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const inserted = await instance.insertDocOutlineMindmapForAgent({
                    docId,
                    mainShapeId: stringArg(args.mainShapeId || args.shapeId),
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, true),
                });
                return { result: JSON.stringify(inserted, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_create_shape',
        description: 'Create STtools tldraw business shapes on an open whiteboard. Required args: whiteboardId string, kind "card"|"single-block"|"branch". Card args: x, y, w, h, color, blockId, isMain, isCollapsed, showMask, select, zoom. Single-block args: x, y, w, h, color, blockId, select, zoom. Branch args: x, y, rootShapeId, childIds, children, leftChildren, rightChildren, direction, horizontalGap, verticalGap, lineStyle, lineWidth, snapDistance, showBackground, color, select, zoom. Branch children may be existing shape IDs or objects like {shapeId} / {kind:"card"|"single-block", blockId, side}. No legacy aliases are supported.',
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
        name: 'tldraw_get_shape_details',
        description: 'Read safe details for shapes on an open STtools tldraw whiteboard. Required args: whiteboardId string. Optional args: shapeId string or shapeIds string[], type string, limit number, includeBindings boolean. Script/data/screenshot-like fields are redacted.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
                const details = instance.getAgentShapeDetails({
                    shapeIds: shapeIds.length ? shapeIds : undefined,
                    type: stringArg(args.type),
                    limit: clampNumber(args.limit, 1, 200, 40),
                    includeBindings: booleanArgWithFallback(args.includeBindings, false),
                });
                return { result: JSON.stringify(details, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_get_snapshot_summary',
        description: 'Read a safe snapshot summary for an open whiteboard. Required args: whiteboardId string. Returns counts, approximate JSON size, and up to 50 page records; it does not return full whiteboard JSON.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                return { result: JSON.stringify(instance.getAgentBoardSnapshotSummary(), null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_backup_whiteboard',
        description: 'Create a backup file for an open whiteboard before risky agent operations. Required args: whiteboardId string. Optional args: reason string. Returns the backup file operation result and a safe snapshot summary.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const backedUp = await instance.backupAgentWhiteboard({ reason: stringArg(args.reason) });
                return { result: JSON.stringify(backedUp, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_list_backups',
        description: 'List STtools tldraw backup/trash files. Optional args: whiteboardId string to filter, limit number. Returns safe metadata only.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
                const limit = clampNumber(args.limit, 1, 100, 30);
                const backups = (await WhiteboardFileManager.getBackupList())
                    .filter((backup) => !whiteboardId || backup.drawingId === whiteboardId)
                    .slice(0, limit)
                    .map((backup) => ({
                        name: backup.name,
                        drawingId: backup.drawingId,
                        path: backup.path,
                        date: backup.date.toISOString(),
                        title: backup.title,
                    }));
                return { result: JSON.stringify({ backups }, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_preview_backup',
        description: 'Preview a tldraw backup file without restoring it. Required args: backupPath string. Returns page/shape counts and simplified samples.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const backupPath = stringArg(args.backupPath || args.path);
            if (!backupPath) return { error: 'missing required argument: backupPath' };
            if (!backupPath.startsWith(`${WHITEBOARD_TRASH_DIR}/`)) {
                return { error: 'backupPath must be inside the STtools tldraw trash/backup directory' };
            }
            try {
                const preview = await WhiteboardFileManager.getBackupPreview(backupPath);
                return { result: JSON.stringify(preview, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_delete_whiteboard_file',
        description: 'Dry-run or move a closed whiteboard file to the STtools trash directory. Required args: whiteboardId string. By default this is a dry run; pass confirm true to execute. Refuses to delete currently open whiteboards.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            if (getInstance(whiteboardId)) {
                return { error: `Whiteboard ${whiteboardId} is currently open; close it before deleting its file.` };
            }
            try {
                const exists = await WhiteboardFileManager.whiteboardFileExists(whiteboardId);
                const fileSize = exists ? await WhiteboardFileManager.getWhiteboardFileSize(whiteboardId) : 0;
                if (!exists) return { error: `Whiteboard file not found: ${whiteboardId}` };
                if (booleanArgWithFallback(args.confirm, false) !== true) {
                    return {
                        result: JSON.stringify({
                            dryRun: true,
                            whiteboardId,
                            fileSize,
                            message: 'Pass confirm:true to move this whiteboard file to trash.',
                        }, null, 2),
                    };
                }

                const deleted = await WhiteboardFileManager.deleteWhiteboardFile(whiteboardId, {
                    reason: stringArg(args.reason) || 'agent-delete',
                    includeTimestamp: true,
                });
                return { result: JSON.stringify({ dryRun: false, whiteboardId, fileSize, ...deleted }, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_create_basic_shape',
        description: 'Create safe non-business tldraw shapes on an open whiteboard. Required args: whiteboardId string, kind "text"|"note"|"geo"|"arrow"|"line"|"draw"|"highlight"|"frame"|"bezier-connector"|"slide"|"mind-map"|"js-shape". Optional args: x, y, w, h, color, text, geo, name, direction, theme, select, zoom. Line is implemented as an arrow shape without arrowheads. JS shape creation uses a restricted placeholder; custom script content is not accepted.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const created = instance.createAgentBasicShape(parseCreateBasicShapeArgs(args));
                return { result: JSON.stringify(created, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_create_connector',
        description: 'Create a safe connector on an open whiteboard. Required args: whiteboardId string and either start/end points or startShapeId/endShapeId. Optional args: kind "arrow"|"bezier-connector" default "bezier-connector", color, text, strokeWidth, select, zoom. Binds to ports when shape IDs are provided.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const created = instance.createAgentConnector(parseCreateConnectorArgs(args));
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
        name: 'tldraw_save_whiteboard',
        description: 'Immediately save the currently open whiteboard snapshot. Required args: whiteboardId string. Low-risk persistence action.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const saved = await instance.saveAgentWhiteboard();
                return { result: JSON.stringify(saved, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_navigate_to_block',
        description: 'Find/select a tldraw shape linked to a SiYuan block on an open whiteboard. Required args: whiteboardId string, blockId string. Optional args: shapeId string, zoom boolean.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            const blockId = stringArg(args.blockId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            if (!blockId) return { error: 'missing required argument: blockId' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const result = instance.navigateAgentToBlock({
                    blockId,
                    shapeId: stringArg(args.shapeId),
                    zoom: booleanArgWithFallback(args.zoom, true),
                });
                return { result: JSON.stringify(result, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_zoom_to_shapes',
        description: 'Select and zoom to up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[].',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const zoomed = instance.zoomAgentToShapes({ shapeIds });
                return { result: JSON.stringify(zoomed, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_batch_update_shapes',
        description: 'Safely batch update up to 50 shapes on an open whiteboard. Required args: whiteboardId string, patches array of {shapeId,x,y,w,h,color,text,name}. Text updates are only applied to text/note/arrow/bezier-connector/mind-map, and name only to slide. Optional args: select boolean, zoom boolean.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            if (!Array.isArray(args.patches)) return { error: 'missing required argument: patches array' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const patches = args.patches.slice(0, 50).map((patch) => {
                    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
                        throw new Error('each patch must be an object');
                    }
                    return parseShapeUpdatePatch(patch as Record<string, unknown>);
                });
                const updated = instance.updateAgentShapesBatch({
                    patches,
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
        name: 'tldraw_delete_shapes',
        description: 'Dry-run or delete up to 50 shapes from an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. By default this is a dry run; pass confirm true to execute. Linked SiYuan block shapes are blocked unless allowLinkedBlockShapes true.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const deleted = instance.deleteAgentShapes({
                    shapeIds,
                    confirm: booleanArgWithFallback(args.confirm, false),
                    allowLinkedBlockShapes: booleanArgWithFallback(args.allowLinkedBlockShapes, false),
                });
                return { result: JSON.stringify(deleted, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_duplicate_shapes',
        description: 'Duplicate up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. Optional args: offsetX, offsetY, select, zoom. Complex bindings may not be preserved when the editor duplicate API is unavailable.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const duplicated = instance.duplicateAgentShapes({
                    shapeIds,
                    offsetX: numberArg(args.offsetX),
                    offsetY: numberArg(args.offsetY),
                    select: booleanArgWithFallback(args.select, true),
                    zoom: booleanArgWithFallback(args.zoom, false),
                });
                return { result: JSON.stringify(duplicated, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_arrange_shapes',
        description: 'Adjust z-order for up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[], operation "front"|"back"|"forward"|"backward".',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const operation = stringArg(args.operation);
            if (operation !== 'front' && operation !== 'back' && operation !== 'forward' && operation !== 'backward') {
                return { error: 'operation must be "front", "back", "forward", or "backward"' };
            }
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const arranged = instance.arrangeAgentShapes({ shapeIds, operation });
                return { result: JSON.stringify(arranged, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_align_shapes',
        description: 'Align or distribute 2-50 shapes on an open whiteboard. Required args: whiteboardId string, shapeIds string[], operation "left"|"center-x"|"right"|"top"|"center-y"|"bottom"|"distribute-x"|"distribute-y". This only changes x/y positions.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (shapeIds.length < 2) return { error: 'shapeIds must contain at least 2 shapes' };
            const operation = stringArg(args.operation);
            const allowed = new Set(['left', 'center-x', 'right', 'top', 'center-y', 'bottom', 'distribute-x', 'distribute-y']);
            if (!operation || !allowed.has(operation)) {
                return { error: 'operation must be one of left, center-x, right, top, center-y, bottom, distribute-x, distribute-y' };
            }
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const aligned = instance.alignAgentShapes({ shapeIds, operation: operation as any });
                return { result: JSON.stringify(aligned, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_group_shapes',
        description: 'Group or ungroup up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. Optional args: ungroup boolean, select boolean. Uses tldraw editor group APIs only when available.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const grouped = instance.groupAgentShapes({
                    shapeIds,
                    ungroup: booleanArgWithFallback(args.ungroup, false),
                    select: booleanArgWithFallback(args.select, true),
                });
                return { result: JSON.stringify(grouped, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_lock_shapes',
        description: 'Lock or unlock up to 50 shapes on an open whiteboard. Required args: whiteboardId string, shapeId string or shapeIds string[]. Optional args: locked boolean, defaults true.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const locked = instance.lockAgentShapes({
                    shapeIds,
                    locked: booleanArgWithFallback(args.locked, true),
                });
                return { result: JSON.stringify(locked, null, 2) };
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    });

    addAgentAction.call(plugin, {
        name: 'tldraw_convert_connectors',
        description: 'Convert selected connector shapes between arrow and bezier-connector. Required args: whiteboardId string, shapeId string or shapeIds string[], to "arrow"|"bezier-connector". Max 50 shapes.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            const shapeIds = shapeIdArrayArg(args.shapeIds || args.shapeId);
            if (!shapeIds.length) return { error: 'missing required argument: shapeId or shapeIds' };
            const to = stringArg(args.to);
            if (to !== 'arrow' && to !== 'bezier-connector') return { error: 'to must be "arrow" or "bezier-connector"' };
            const instance = getInstance(whiteboardId);
            if (!instance) return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };

            try {
                const converted = instance.convertAgentConnectors({ shapeIds, to });
                return { result: JSON.stringify(converted, null, 2) };
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

function countOutlineNodes(nodes: Array<{ blocks?: any[] }>): number {
    let count = 0;
    const visit = (node: { blocks?: any[] }) => {
        count += 1;
        node.blocks?.forEach(visit);
    };
    nodes.forEach(visit);
    return count;
}

function stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function disabledResult(): { error: string } | null {
    return settingdata['tldraw-agent-actions-enable'] === true
        ? null
        : { error: 'STtools tldraw agent actions are disabled in plugin settings.' };
}

function getTldrawAgentCapabilities() {
    return {
        version: 1,
        enabled: true,
        read: [
            'tldraw_list_whiteboards',
            'tldraw_get_summary',
            'tldraw_get_shape_details',
            'tldraw_get_snapshot_summary',
            'tldraw_list_backups',
            'tldraw_preview_backup',
            'siyuan_read_doc_outline_for_tldraw',
        ],
        openNavigateSave: [
            'tldraw_open_whiteboard',
            'tldraw_select_shape',
            'tldraw_zoom_to_shapes',
            'tldraw_navigate_to_block',
            'tldraw_save_whiteboard',
        ],
        createEditLayout: [
            'tldraw_create_shape',
            'tldraw_create_basic_shape',
            'tldraw_create_connector',
            'tldraw_update_shape',
            'tldraw_batch_update_shapes',
            'tldraw_duplicate_shapes',
            'tldraw_arrange_shapes',
            'tldraw_align_shapes',
            'tldraw_group_shapes',
            'tldraw_lock_shapes',
            'tldraw_convert_connectors',
            'tldraw_insert_doc_outline_mindmap',
        ],
        destructive: [
            'tldraw_delete_shapes',
            'tldraw_delete_whiteboard_file',
        ],
        safetyRules: [
            'Agent actions must be enabled in plugin settings.',
            'Most write actions require the whiteboard to be open, so the user can observe the change.',
            'Batch shape operations are capped at 50 items.',
            'Shape deletion is dry-run by default and requires confirm:true to execute.',
            'Linked SiYuan block shapes are protected from deletion unless allowLinkedBlockShapes:true is explicitly passed.',
            'Whiteboard file deletion is dry-run by default, requires confirm:true, and refuses to run while the whiteboard is open.',
            'Snapshot reads return summaries, not full whiteboard JSON.',
            'Backup preview returns simplified counts/samples, not full backup contents.',
            'JS shape creation uses a restricted placeholder; agent-supplied script content is not accepted.',
        ],
        intentionallyBlocked: [
            'Restoring/importing a whiteboard backup through Agent is blocked because it overwrites current data.',
            'Arbitrary raw store/props mutation is blocked.',
            'Agent-supplied JavaScript execution is blocked.',
            'Full snapshot JSON exfiltration is blocked; create a backup file instead.',
            'Direct SiYuan block content deletion/update through tldraw actions is blocked.',
            'External asset insertion is blocked until upload, size, and type validation are implemented.',
        ],
    };
}
