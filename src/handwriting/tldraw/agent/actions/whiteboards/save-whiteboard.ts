import { disabledResult, jsonResult, requireOpenWhiteboard, stringifyError, type AgentActionDefinition } from '../shared';

export function createSaveWhiteboardAction(): AgentActionDefinition {
    return {
        name: 'tldraw_save_whiteboard',
        description: 'Immediately save the currently open whiteboard snapshot. Required args: whiteboardId string. Low-risk persistence action.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            const target = requireOpenWhiteboard(args);
            if (target.error) return { error: target.error };
            try {
                return jsonResult(await target.instance.saveAgentWhiteboard());
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}
