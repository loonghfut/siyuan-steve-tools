import { Editor, TLShapeId } from '@tldraw/tldraw'
import type { IBranchShape } from '../BranchShape/branch-shape-types'
import { createAgentCardShape } from './create-card'
import { createAgentSingleBlockShape } from './create-single-block'
import { createAgentBranchShape } from './create-branch'
import { buildBaseCreateResult, createAgentCreateContext, recordAgentCreatedNode } from './context'
import type { AgentCreateShapeArgs, AgentCreateShapeResult } from './types'

export function createAgentBusinessShape(editor: Editor, options: AgentCreateShapeArgs): AgentCreateShapeResult {
	const context = createAgentCreateContext()

	if (options.kind === 'card') {
		const id = createAgentCardShape(editor, options)
		recordAgentCreatedNode(context, id, 'card', options.blockId)
		finalizeSelection(editor, id, options)
		return buildBaseCreateResult(context, id, options)
	}

	if (options.kind === 'single-block') {
		const id = createAgentSingleBlockShape(editor, options)
		recordAgentCreatedNode(context, id, 'single-block', options.blockId)
		finalizeSelection(editor, id, options)
		return buildBaseCreateResult(context, id, options)
	}

	let branchId: TLShapeId | undefined
	editor.run(() => {
		branchId = createAgentBranchShape(editor, options, context)
	})

	if (!branchId) throw new Error('Failed to create branch shape.')
	finalizeSelection(editor, branchId, options)

	const branch = editor.getShape<IBranchShape>(branchId)
	return {
		...buildBaseCreateResult(context, branchId, options),
		branchId: String(branchId),
		rootShapeId: branch?.props.rootShapeId,
		leftChildIds: branch?.props.leftChildIds || [],
		rightChildIds: branch?.props.rightChildIds || branch?.props.childIds || [],
	}
}

function finalizeSelection(editor: Editor, focusedId: TLShapeId, options: { select?: boolean; zoom?: boolean }) {
	if (options.select !== false) {
		editor.setSelectedShapes([focusedId])
	}
	if (options.zoom) {
		editor.zoomToSelection({ animation: { duration: 300 } })
	}
}
