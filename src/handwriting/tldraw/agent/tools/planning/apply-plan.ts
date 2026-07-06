import { getFocusedInstanceId, getInstance } from '../../../tldraw-instance-manager';
import { assertKnownArgs, booleanArg, resultModeArg, stringArg } from '../internal/core/args';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';
import type { AgentPlanApplyOptions } from '../internal/planning/plan-runner';

export function createApplyPlanAction(): AgentActionDefinition {
    return {
        name: 'tldraw_apply_plan',
        description: 'Preferred high-level STtools tldraw Agent entrypoint. Apply a safe JSON whiteboard plan to the focused/open whiteboard. Optional args: whiteboardId string defaults to focused whiteboard, goal string, dryRun boolean, select boolean, zoom boolean, save boolean, resultMode "compact"|"full" default compact. Required args: steps array. Supported step ops: create, branch, connect, update, layout, focus, save. Supports references like "$selection", "$selection[0]", "$created.name", and "$last". Simplest hierarchy connection: use {op:"connect",kind:"branch",from:"$selection[0]",to:"$selection[1]"}; shapeIds [root, child1, child2] also works. Branch root content must be card/single-block; branch children must be card/single-block/branch; do not branch-connect text/note/geo/frame/slide/mind-map/js-shape/arrow/connector or create cycles/duplicate root branches. Do not add update/layout steps to move branch children before connecting or changing sides; branch auto-arranges children and its main position is controlled by the root/branch center. To move a left branch child to the right, use {op:"connect",kind:"branch",from:"$kind.branch" or root,to:child,layout:{side:"right"}}. Use op "branch" only when creating child nodes inline or setting leftChildren/rightChildren. Use op "connect" without kind:"branch" for ordinary relationship lines. Compact results omit raw shape IDs, per-step results, and shape samples; use full only for debugging. This action does not execute JavaScript, raw store mutation, deletion, or direct SiYuan block content edits.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'goal', 'steps', 'dryRun', 'select', 'zoom', 'save', 'resultMode'], 'tldraw_apply_plan');
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
                    resultMode: resultModeArg(args.resultMode),
                };
                return jsonResult(await instance.applyAgentPlan(options));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
