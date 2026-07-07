import { getFocusedInstanceId, getInstance } from '../../../tldraw-instance-manager'
import { assertKnownArgs, booleanArg, stringArg } from '../internal/core/args'
import { disabledResult, jsonResult, stringifyError, type AgentActionDefinition } from '../shared'

export function createImportMermaidAction(): AgentActionDefinition {
	return {
		name: 'tldraw_import_mermaid',
		description: 'Import Mermaid diagram text into an open STtools tldraw whiteboard. Optional args: whiteboardId string defaults to focused whiteboard, mermaid/text/code string, select boolean default true, zoom boolean default true, save boolean default false. Supports flowchart, mindmap, sequenceDiagram, stateDiagram, classDiagram, erDiagram, gantt, pie, gitGraph, journey, and timeline.',
		handler: async (args) => {
			const disabled = disabledResult()
			if (disabled) return disabled

			try {
				assertKnownArgs(args, ['whiteboardId', 'id', 'rootId', 'mermaid', 'text', 'code', 'select', 'zoom', 'save'], 'tldraw_import_mermaid')
			} catch (error) {
				return { error: stringifyError(error) }
			}

			const whiteboardId = stringArg(args.whiteboardId || args.id || args.rootId) || getFocusedInstanceId()
			if (!whiteboardId) {
				return { error: 'No focused whiteboard. Focus/open a whiteboard, or pass whiteboardId.' }
			}

			const instance = getInstance(whiteboardId)
			if (!instance) {
				return { error: `Whiteboard ${whiteboardId} is not open. Call tldraw_open_whiteboard first.` }
			}

			const mermaidText = stringArg(args.mermaid || args.text || args.code)
			if (!mermaidText?.trim()) {
				return { error: 'missing required argument: mermaid' }
			}

			try {
				const result = await instance.importAgentMermaid({
					mermaidText,
					select: booleanArg(args.select),
					zoom: booleanArg(args.zoom),
					save: booleanArg(args.save),
				})
				return jsonResult(result)
			} catch (error) {
				return { error: stringifyError(error) }
			}
		},
	}
}
