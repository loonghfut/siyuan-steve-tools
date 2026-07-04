import { getFocusedInstanceId, getInstance } from '../../../tldraw-instance-manager';
import { assertKnownArgs, booleanArg, numberArg, stringArg } from '../../core/args';
import type { AgentBoardEditResultMode, AgentShapeCommandIntent, AgentShapeCommandRequest } from '../../core/types';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createShapeCommandAction(): AgentActionDefinition {
    return {
        name: 'tldraw_shape_command',
        description: 'Semantic STtools tldraw shape tool. Pass intent/target/patch/etc as direct named arguments even if the frontend wrapper only displays action/id/query; do not put the whole JSON payload in id. Omit whiteboardId to use the focused whiteboard. Required intent: readSelectedContent, inspectEditable, updateShape, createShapes, connectShapes, layoutShapes, or focusShapes. target defaults to "$selection" and supports "$selection", "$selection[0]", "$block.<blockId>", "$kind.card", shapeId string, shapeIds array, or {shapeId|shapeIds|blockId|kind}. For updateShape pass patch like {color:"orange"}; for card content edits pass contentMarkdown or patch:{contentMarkdown:"..."} and only after explicit user confirmation pass confirmContentUpdate:true. Without confirmContentUpdate:true, linked card content writes are refused. The tool updates the linked SiYuan block, keeps generated headings below the bound heading level, and refreshes every card bound to that block. For createShapes pass node or nodes like {kind:"single-block",text:"..."} plus optional layoutStyle "nearSelection"|"rightOf"|"below"|"grid"|"tree"|"mindmap"|"frameAround"; card blockId creation infers isMain from the linked block type unless isMain is explicit. For connectShapes pass from/to or select two shapes; connectionKind is "relation" or "branch". Branch constraints: root content must be card/single-block; children must be card/single-block/branch; never branch-connect text/note/geo/frame/slide/mind-map/js-shape/arrow/connector; avoid cycles and duplicate root branches. For branch hierarchy connections and branch side changes, do not pre-move child shapes or call layout first: branch auto-arranges children from the root/branch center. To move a branch child from left to right, call connectShapes again with the same root/branch as from, that child as to, connectionKind:"branch", side:"right"; this changes branch leftChildIds/rightChildIds and relayouts. For layoutShapes pass target and layoutStyle.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const normalizedArgs = normalizeShapeCommandArgs(args);
            try {
                assertKnownArgs(normalizedArgs, [
                    'whiteboardId', 'id', 'rootId', 'query', 'intent', 'target', 'shapeId', 'shapeIds', 'shapeKind', 'patch',
                    'contentMarkdown', 'contentMode', 'confirmContentUpdate',
                    'node', 'nodes', 'from', 'to', 'connectionKind', 'text', 'color', 'strokeWidth', 'lineWidth',
                    'layoutStyle', 'layout', 'columns', 'gap', 'horizontalGap', 'verticalGap', 'side',
                    'x', 'y', 'w', 'h', 'name', 'save', 'select', 'zoom', 'result',
                ], 'tldraw_shape_command');
            } catch (error) {
                return { error: stringifyError(error) };
            }

            const whiteboardId = stringArg(normalizedArgs.whiteboardId || normalizedArgs.id || normalizedArgs.rootId) || getFocusedInstanceId();
            if (!whiteboardId) {
                return { error: 'No focused whiteboard. Focus/open a whiteboard, or pass whiteboardId.' };
            }

            const instance = getInstance(whiteboardId);
            if (!instance) {
                return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };
            }

            const intent = shapeCommandIntentArg(normalizedArgs.intent);
            if (!intent) {
                return { error: 'intent must be one of readSelectedContent, inspectEditable, updateShape, createShapes, connectShapes, layoutShapes, focusShapes' };
            }

            try {
                const request: AgentShapeCommandRequest = {
                    whiteboardId,
                    intent,
                    target: shapeCommandTargetArg(normalizedArgs.target ?? normalizedArgs.shapeIds ?? normalizedArgs.shapeId),
                    shapeKind: stringArg(normalizedArgs.shapeKind),
                    patch: shapeCommandPatchArg(normalizedArgs.patch) ?? shapeCommandPatchFromTopLevelArgs(normalizedArgs),
                    contentMarkdown: stringOrEmptyArg(normalizedArgs.contentMarkdown),
                    contentMode: shapeCommandContentModeArg(normalizedArgs.contentMode),
                    confirmContentUpdate: booleanArg(normalizedArgs.confirmContentUpdate),
                    node: shapeCommandObjectArg(normalizedArgs.node) as AgentShapeCommandRequest['node'],
                    nodes: shapeCommandArrayArg(normalizedArgs.nodes) as AgentShapeCommandRequest['nodes'],
                    from: shapeCommandTargetArg(normalizedArgs.from),
                    to: shapeCommandTargetArg(normalizedArgs.to),
                    connectionKind: shapeCommandConnectionKindArg(normalizedArgs.connectionKind),
                    text: stringArg(normalizedArgs.text),
                    color: stringArg(normalizedArgs.color),
                    strokeWidth: numberArg(normalizedArgs.strokeWidth),
                    lineWidth: numberArg(normalizedArgs.lineWidth),
                    layoutStyle: shapeCommandLayoutStyleArg(normalizedArgs.layoutStyle),
                    layout: shapeCommandObjectArg(normalizedArgs.layout) as AgentShapeCommandRequest['layout'],
                    columns: numberArg(normalizedArgs.columns),
                    gap: numberArg(normalizedArgs.gap),
                    horizontalGap: numberArg(normalizedArgs.horizontalGap),
                    verticalGap: numberArg(normalizedArgs.verticalGap),
                    side: shapeCommandSideArg(normalizedArgs.side),
                    x: numberArg(normalizedArgs.x),
                    y: numberArg(normalizedArgs.y),
                    w: numberArg(normalizedArgs.w),
                    h: numberArg(normalizedArgs.h),
                    name: stringArg(normalizedArgs.name),
                    save: booleanArg(normalizedArgs.save),
                    select: booleanArg(normalizedArgs.select),
                    zoom: booleanArg(normalizedArgs.zoom),
                    result: shapeCommandResultArg(normalizedArgs.result),
                };
                return jsonResult(await instance.runAgentShapeCommand(request));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}

function shapeCommandIntentArg(value: unknown): AgentShapeCommandIntent | undefined {
    const raw = stringArg(value);
    if (
        raw === 'readSelectedContent' ||
        raw === 'inspectEditable' ||
        raw === 'updateShape' ||
        raw === 'createShapes' ||
        raw === 'connectShapes' ||
        raw === 'layoutShapes' ||
        raw === 'focusShapes'
    ) return raw;
    return undefined;
}

function normalizeShapeCommandArgs(args: Record<string, unknown>): Record<string, unknown> {
    const withoutId = { ...args };
    delete withoutId.id;

    const idPayload = shapeCommandObjectArg(args.id);
    let normalized = idPayload && looksLikeShapeCommandPayload(idPayload)
        ? { ...idPayload, ...withoutId }
        : { ...args };

    const queryPayload = shapeCommandObjectArg(normalized.query);
    if (queryPayload && looksLikeShapeCommandPayload(queryPayload)) {
        const withoutQuery = { ...normalized };
        delete withoutQuery.query;
        normalized = { ...queryPayload, ...withoutQuery };
    }

    return normalized;
}

function looksLikeShapeCommandPayload(value: Record<string, unknown>): boolean {
    return [
        'whiteboardId', 'rootId', 'intent', 'target', 'shapeId', 'shapeIds', 'shapeKind', 'patch', 'contentMarkdown', 'contentMode', 'confirmContentUpdate',
        'node', 'nodes', 'from', 'to', 'connectionKind', 'layoutStyle', 'layout',
    ].some((key) => value[key] !== undefined);
}

function shapeCommandPatchArg(value: unknown): Record<string, unknown> | undefined {
    return shapeCommandObjectArg(value);
}

function shapeCommandObjectArg(value: unknown): Record<string, unknown> | undefined {
    value = parseJsonLikeArg(value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
}

function shapeCommandArrayArg(value: unknown): unknown[] | undefined {
    value = parseJsonLikeArg(value);
    return Array.isArray(value) ? value : undefined;
}

function shapeCommandTargetArg(value: unknown): AgentShapeCommandRequest['target'] {
    const parsed = parseJsonLikeArg(value);
    if (typeof parsed === 'string') return stringArg(parsed);
    if (Array.isArray(parsed)) return parsed.map(stringArg).filter(Boolean) as string[];
    if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const shapeIds = shapeCommandArrayArg(obj.shapeIds)?.map(stringArg).filter(Boolean) as string[] | undefined;
        return {
            shapeId: stringArg(obj.shapeId),
            shapeIds: shapeIds?.length ? shapeIds : undefined,
            blockId: stringArg(obj.blockId),
            kind: stringArg(obj.kind),
        };
    }
    return undefined;
}

function shapeCommandPatchFromTopLevelArgs(args: Record<string, unknown>): Record<string, unknown> | undefined {
    const patch: Record<string, unknown> = {};
    const keys = ['x', 'y', 'w', 'h', 'color', 'text', 'name', 'isCollapsed', 'strokeWidth', 'lineWidth'];
    for (const key of keys) {
        if (args[key] !== undefined) patch[key] = args[key];
    }
    return Object.keys(patch).length ? patch : undefined;
}

function stringOrEmptyArg(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function parseJsonLikeArg(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const raw = value.trim();
    if (!raw || !/^[\[{]/.test(raw)) return value;
    try {
        return JSON.parse(raw);
    } catch {
        return value;
    }
}

function shapeCommandConnectionKindArg(value: unknown): 'branch' | 'relation' | undefined {
    const raw = stringArg(value);
    if (raw === 'branch' || raw === 'relation') return raw;
    return undefined;
}

function shapeCommandLayoutStyleArg(value: unknown): AgentShapeCommandRequest['layoutStyle'] {
    const raw = stringArg(value);
    if (raw === 'nearSelection' || raw === 'rightOf' || raw === 'below' || raw === 'grid' || raw === 'tree' || raw === 'mindmap' || raw === 'frameAround') return raw;
    return undefined;
}

function shapeCommandSideArg(value: unknown): AgentShapeCommandRequest['side'] {
    const raw = stringArg(value);
    if (raw === 'left' || raw === 'right') return raw;
    return undefined;
}

function shapeCommandContentModeArg(value: unknown): AgentShapeCommandRequest['contentMode'] {
    return stringArg(value) as AgentShapeCommandRequest['contentMode'];
}

function shapeCommandResultArg(value: unknown): AgentBoardEditResultMode | undefined {
    const raw = stringArg(value);
    if (raw === 'minimal' || raw === 'debug') return raw;
    return undefined;
}
