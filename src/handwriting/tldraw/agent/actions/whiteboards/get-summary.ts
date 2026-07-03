import { getInstance } from '../../../tldraw-instance-manager';
import { WhiteboardFileManager } from '../../../whiteboard-file-manager';
import { assertKnownArgs, booleanArgWithFallback, clampNumber, stringArg } from '../../core/args';
import { summarizeSavedSnapshot } from '../../summaries/snapshot-summary';
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared';

export function createGetSummaryAction(): AgentActionDefinition {
    return {
        name: 'tldraw_get_summary',
        description: 'Get a compact summary of an STtools tldraw whiteboard. Required args: whiteboardId string. Optional args: includeShapeSamples boolean default false, sampleLimit number default 20. If the whiteboard is open, returns live editor state; otherwise reads the saved snapshot file. Request shape samples only when bounds are needed for planning/debugging.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'includeShapeSamples', 'sampleLimit'], 'tldraw_get_summary');
            } catch (error) {
                return { error: stringifyError(error) };
            }
            const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId);
            if (!whiteboardId) return { error: 'missing required argument: whiteboardId' };
            try {
                const instance = getInstance(whiteboardId);
                if (instance) {
                    return jsonResult(instance.getAgentSummary({
                        includeShapeSamples: booleanArgWithFallback(args.includeShapeSamples, false),
                        sampleLimit: clampNumber(args.sampleLimit, 0, 200, 20),
                    }));
                }

                const content = await WhiteboardFileManager.readWhiteboardFile(whiteboardId);
                if (!content) return { error: `Whiteboard file not found: ${whiteboardId}` };
                return jsonResult(summarizeSavedSnapshot(whiteboardId, content, {
                    includeShapeSamples: booleanArgWithFallback(args.includeShapeSamples, false),
                    sampleLimit: clampNumber(args.sampleLimit, 0, 200, 20),
                }));
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
