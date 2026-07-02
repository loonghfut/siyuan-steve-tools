import { getFocusedInstanceId, getInstance } from '../../tldraw-instance-manager';
import { assertKnownArgs, booleanArg, stringArg } from '../args';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from './shared';
import type { AgentPlanApplyOptions } from '../plan-runner';

export function createApplyPlanAction(): AgentActionDefinition {
    return {
        name: 'tldraw_apply_plan',
        description: 'Preferred high-level STtools tldraw Agent entrypoint. Apply a safe JSON whiteboard plan to the focused/open whiteboard. Optional args: whiteboardId string defaults to focused whiteboard, goal string, dryRun boolean, select boolean, zoom boolean, save boolean. Required args: steps array. Supported step ops: create, connect, update, layout, focus, save. Supports references like "$selection", "$selection[0]", "$created.name", and "$last". This action does not execute JavaScript, raw store mutation, deletion, or direct SiYuan block content edits.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'goal', 'steps', 'dryRun', 'select', 'zoom', 'save'], 'tldraw_apply_plan');
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

            try {
                const options: AgentPlanApplyOptions = {
                    whiteboardId,
                    goal: stringArg(args.goal),
                    steps: Array.isArray(args.steps) ? args.steps : undefined,
                    dryRun: booleanArg(args.dryRun),
                    select: booleanArg(args.select),
                    zoom: booleanArg(args.zoom),
                    save: booleanArg(args.save),
                };
                return jsonResult(await instance.applyAgentPlan(options));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
