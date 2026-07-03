import { getFocusedInstanceId, getInstance } from '../../../tldraw-instance-manager';
import { assertKnownArgs, booleanArg, numberArg, stringArg } from '../../core/args';
import type { AgentBoardEditResultMode, AgentShapeCommandIntent, AgentShapeCommandRequest } from '../../core/types';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createShapeCommandAction(): AgentActionDefinition {
    return {
        name: 'tldraw_shape_command',
        description: 'Semantic STtools tldraw shape tool. Omit whiteboardId to use the focused whiteboard. Required intent: readSelectedContent, inspectEditable, updateShape, createShapes, connectShapes, layoutShapes, or focusShapes. target defaults to "$selection" and supports "$selection", "$selection[0]", "$block.<blockId>", "$kind.card", shapeId string, shapeIds array, or {shapeId|shapeIds|blockId|kind}. For createShapes pass node or nodes like {kind:"single-block",text:"..."} plus optional layoutStyle "nearSelection"|"rightOf"|"below"|"grid"|"tree"|"mindmap"|"frameAround". For connectShapes pass from/to or select two shapes; connectionKind is "relation" or "branch". For layoutShapes pass target and layoutStyle. For updateShape pass patch with editable fields returned by inspectEditable.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, [
                    'whiteboardId', 'id', 'rootId', 'intent', 'target', 'shapeId', 'shapeIds', 'shapeKind', 'patch',
                    'node', 'nodes', 'from', 'to', 'connectionKind', 'text', 'color', 'strokeWidth', 'lineWidth',
                    'layoutStyle', 'layout', 'columns', 'gap', 'horizontalGap', 'verticalGap', 'side',
                    'x', 'y', 'w', 'h', 'name', 'save', 'select', 'zoom', 'result',
                ], 'tldraw_shape_command');
            } catch (error) {
                return { error: stringifyError(error) };
            }

            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId) || getFocusedInstanceId();
            if (!whiteboardId) {
                return { error: 'No focused whiteboard. Focus/open a whiteboard, or pass whiteboardId.' };
            }

            const instance = getInstance(whiteboardId);
            if (!instance) {
                return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` };
            }

            const intent = shapeCommandIntentArg(args.intent);
            if (!intent) {
                return { error: 'intent must be one of readSelectedContent, inspectEditable, updateShape, createShapes, connectShapes, layoutShapes, focusShapes' };
            }

            try {
                const request: AgentShapeCommandRequest = {
                    whiteboardId,
                    intent,
                    target: shapeCommandTargetArg(args.target ?? args.shapeIds ?? args.shapeId),
                    shapeKind: stringArg(args.shapeKind),
                    patch: shapeCommandPatchArg(args.patch) ?? shapeCommandPatchFromTopLevelArgs(args),
                    node: shapeCommandObjectArg(args.node) as AgentShapeCommandRequest['node'],
                    nodes: shapeCommandArrayArg(args.nodes) as AgentShapeCommandRequest['nodes'],
                    from: shapeCommandTargetArg(args.from),
                    to: shapeCommandTargetArg(args.to),
                    connectionKind: shapeCommandConnectionKindArg(args.connectionKind),
                    text: stringArg(args.text),
                    color: stringArg(args.color),
                    strokeWidth: numberArg(args.strokeWidth),
                    lineWidth: numberArg(args.lineWidth),
                    layoutStyle: shapeCommandLayoutStyleArg(args.layoutStyle),
                    layout: shapeCommandObjectArg(args.layout) as AgentShapeCommandRequest['layout'],
                    columns: numberArg(args.columns),
                    gap: numberArg(args.gap),
                    horizontalGap: numberArg(args.horizontalGap),
                    verticalGap: numberArg(args.verticalGap),
                    side: shapeCommandSideArg(args.side),
                    x: numberArg(args.x),
                    y: numberArg(args.y),
                    w: numberArg(args.w),
                    h: numberArg(args.h),
                    name: stringArg(args.name),
                    save: booleanArg(args.save),
                    select: booleanArg(args.select),
                    zoom: booleanArg(args.zoom),
                    result: shapeCommandResultArg(args.result),
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

function shapeCommandResultArg(value: unknown): AgentBoardEditResultMode | undefined {
    const raw = stringArg(value);
    if (raw === 'minimal' || raw === 'debug') return raw;
    return undefined;
}
