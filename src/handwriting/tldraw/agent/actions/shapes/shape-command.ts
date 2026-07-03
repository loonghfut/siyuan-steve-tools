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
                    'whiteboardId', 'id', 'rootId', 'intent', 'target', 'shapeKind', 'patch',
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
                    target: args.target as AgentShapeCommandRequest['target'],
                    shapeKind: stringArg(args.shapeKind),
                    patch: shapeCommandPatchArg(args.patch),
                    node: shapeCommandObjectArg(args.node) as AgentShapeCommandRequest['node'],
                    nodes: shapeCommandArrayArg(args.nodes) as AgentShapeCommandRequest['nodes'],
                    from: args.from as AgentShapeCommandRequest['from'],
                    to: args.to as AgentShapeCommandRequest['to'],
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
}

function shapeCommandArrayArg(value: unknown): unknown[] | undefined {
    return Array.isArray(value) ? value : undefined;
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
