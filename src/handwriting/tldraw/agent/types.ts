import type { TLDefaultColorStyle } from '@tldraw/tldraw'
import type { BranchLineStyle } from '../BranchShape/branch-shape-types'

export type AgentCreateKind = 'card' | 'single-block' | 'branch'
export type AgentBranchSide = 'left' | 'right'
export type AgentNodeKind = AgentCreateKind

export type AgentSelectionOptions = {
	select?: boolean
	zoom?: boolean
}

export type AgentCardCreateArgs = AgentSelectionOptions & {
	kind: 'card'
	x?: number
	y?: number
	w?: number
	h?: number
	color?: TLDefaultColorStyle
	blockId?: string
	isMain?: boolean
	isCollapsed?: boolean
	showMask?: boolean
}

export type AgentSingleBlockCreateArgs = AgentSelectionOptions & {
	kind: 'single-block'
	x?: number
	y?: number
	w?: number
	h?: number
	color?: TLDefaultColorStyle
	blockId?: string
}

export type AgentBranchChildRef =
	| string
	| {
		shapeId?: string
		kind?: 'card' | 'single-block'
		x?: number
		y?: number
		w?: number
		h?: number
		color?: TLDefaultColorStyle
		blockId?: string
		isMain?: boolean
		isCollapsed?: boolean
		showMask?: boolean
		side?: AgentBranchSide
	}

export type AgentBranchCreateArgs = AgentSelectionOptions & {
	kind: 'branch'
	x?: number
	y?: number
	rootShapeId?: string
	childIds?: string[]
	children?: AgentBranchChildRef[]
	leftChildren?: AgentBranchChildRef[]
	rightChildren?: AgentBranchChildRef[]
	direction?: AgentBranchSide
	horizontalGap?: number
	verticalGap?: number
	lineStyle?: BranchLineStyle
	lineWidth?: number
	snapDistance?: number
	showBackground?: boolean
	color?: TLDefaultColorStyle
}

export type AgentCreateShapeArgs =
	| AgentCardCreateArgs
	| AgentSingleBlockCreateArgs
	| AgentBranchCreateArgs

export type AgentCreateShapeResult = {
	createdShapeIds: string[]
	selectedShapeIds: string[]
	focusedShapeId?: string
	branchId?: string
	rootShapeId?: string
	leftChildIds?: string[]
	rightChildIds?: string[]
	createdNodes: AgentCreatedNode[]
}

export type AgentCreatedNode = {
	id: string
	kind: AgentNodeKind
	blockId?: string
}
