import type { TLDefaultColorStyle } from '@tldraw/tldraw'
import type { BranchLineStyle } from '../../BranchShape/branch-shape-types'

export type AgentCreateKind = 'card' | 'single-block' | 'branch'
export type AgentBranchSide = 'left' | 'right'
export type AgentNodeKind = AgentCreateKind
export type AgentBasicShapeKind = 'text' | 'note' | 'geo' | 'arrow' | 'line' | 'draw' | 'highlight' | 'frame' | 'bezier-connector' | 'slide' | 'mind-map' | 'js-shape'
export type AgentConnectorKind = 'arrow' | 'bezier-connector'

export type AgentSafetyOptions = {
	confirm?: boolean
	dryRun?: boolean
}

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
	contentMarkdown?: string
	title?: string
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
		contentMarkdown?: string
		title?: string
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

export type AgentShapeSummary = {
	id: string
	type: string
	x: number
	y: number
	bounds?: {
		x: number
		y: number
		w: number
		h: number
	}
	rotation?: number
	parentId?: string
	index?: string
	props: Record<string, unknown>
	bindings?: unknown[]
}

export type AgentBasicShapeCreateArgs = AgentSelectionOptions & {
	kind: AgentBasicShapeKind
	x?: number
	y?: number
	w?: number
	h?: number
	color?: TLDefaultColorStyle
	text?: string
	geo?: string
	name?: string
	blockId?: string
	direction?: 'right' | 'left' | 'both'
	theme?: string
}

export type AgentConnectorCreateArgs = AgentSelectionOptions & {
	kind?: AgentConnectorKind
	startShapeId?: string
	endShapeId?: string
	shapeIds?: string[]
	start?: { x: number; y: number }
	end?: { x: number; y: number }
	color?: TLDefaultColorStyle
	text?: string
	strokeWidth?: number
}

export type AgentShapeUpdatePatch = AgentSelectionOptions & {
	shapeId: string
	x?: number
	y?: number
	w?: number
	h?: number
	color?: string
	isCollapsed?: boolean
	text?: string
	name?: string
}

export type AgentArrangeOperation = 'front' | 'back' | 'forward' | 'backward'
export type AgentAlignOperation = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom' | 'distribute-x' | 'distribute-y'
