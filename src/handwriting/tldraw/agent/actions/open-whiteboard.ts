import { openTab } from 'siyuan';
import { stringArg } from '../args';
import { disabledResult, stringifyError, type AgentActionContext, type AgentActionDefinition } from './shared';

export function createOpenWhiteboardAction(context: AgentActionContext): AgentActionDefinition {
    return {
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
                    app: context.plugin.app,
                    custom: {
                        id: context.plugin.name + 'steveTool-whiteboard',
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
    };
}
