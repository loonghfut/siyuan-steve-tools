import type { TLShapeId } from '@tldraw/tldraw'
import type { AgentCreatedNode, AgentCreateShapeResult, AgentNodeKind, AgentSelectionOptions } from './types'

export type AgentCreateContext = {
	createdShapeIds: TLShapeId[]
	createdNodes: AgentCreatedNode[]
}

export function createAgentCreateContext(): AgentCreateContext {
	return {
		createdShapeIds: [],
		createdNodes: [],
	}
}

export function recordAgentCreatedNode(
	context: AgentCreateContext,
	id: TLShapeId,
	kind: AgentNodeKind,
	blockId?: string
) {
	context.createdShapeIds.push(id)
	context.createdNodes.push({
		id: String(id),
		kind,
		blockId: blockId || undefined,
	})
}

export function buildBaseCreateResult(
	context: AgentCreateContext,
	focusedId: TLShapeId,
	options: AgentSelectionOptions
): AgentCreateShapeResult {
	const selectedShapeIds = options.select === false ? [] : [String(focusedId)]
	return {
		createdShapeIds: context.createdShapeIds.map(String),
		selectedShapeIds,
		focusedShapeId: String(focusedId),
		createdNodes: context.createdNodes,
	}
}
