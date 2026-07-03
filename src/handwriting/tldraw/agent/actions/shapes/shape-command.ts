import { getFocusedInstanceId, getInstance } from '../../../tldraw-instance-manager';
import { assertKnownArgs, booleanArg, stringArg } from '../../core/args';
import type { AgentBoardEditResultMode, AgentShapeCommandIntent, AgentShapeCommandRequest } from '../../core/types';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createShapeCommandAction(): AgentActionDefinition {
    return {
        name: 'tldraw_shape_command',
        description: 'Semantic STtools tldraw shape tool for simple custom-shape reads and edits. Omit whiteboardId to use the focused whiteboard. Required: intent "readSelectedContent"|"inspectEditable"|"updateShape". target defaults to "$selection" and supports "$selection", "$selection[0]", "$block.<blockId>", "$kind.card", shapeId string, shapeIds array, or {shapeId|shapeIds|blockId|kind}. Use inspectEditable to get exact fields. Common editable fields: card color/isCollapsed/showMask/isMain/renderMode/collapsedTextSize/collapsedTextAlign; single-block transparentBackground/allowBinding/connectOnEnter; branch lineStyle/lineWidth/horizontalGap/verticalGap/showBackground; bezier-connector strokeWidth/strokeStyle/labelPosition/text; mind-map theme/direction/fontSize/nodeWidth/nodeHeight/lineWidth/gaps/text; slide name/borderStyle; js-shape interactive/restrictDom. For updateShape pass patch with editable fields returned by inspectEditable. Best use: read selected content with {intent:"readSelectedContent"}; inspect with {intent:"inspectEditable",target:"$selection[0]"}; update with {intent:"updateShape",patch:{color:"blue",isCollapsed:true},save:true}.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'intent', 'target', 'shapeKind', 'patch', 'save', 'select', 'zoom', 'result'], 'tldraw_shape_command');
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
                return { error: 'intent must be one of readSelectedContent, inspectEditable, updateShape' };
            }

            try {
                const request: AgentShapeCommandRequest = {
                    whiteboardId,
                    intent,
                    target: args.target as AgentShapeCommandRequest['target'],
                    shapeKind: stringArg(args.shapeKind),
                    patch: shapeCommandPatchArg(args.patch),
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
    if (raw === 'readSelectedContent' || raw === 'inspectEditable' || raw === 'updateShape') return raw;
    return undefined;
}

function shapeCommandPatchArg(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
}

function shapeCommandResultArg(value: unknown): AgentBoardEditResultMode | undefined {
    const raw = stringArg(value);
    if (raw === 'minimal' || raw === 'debug') return raw;
    return undefined;
}
