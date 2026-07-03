import type { TLDefaultColorStyle } from '@tldraw/tldraw'
import type { BranchLineStyle } from '../../BranchShape/branch-shape-types'

export type AgentCreateKind = 'card' | 'single-block' | 'branch'
export type AgentBranchSide = 'left' | 'right'
export type AgentNodeKind = AgentCreateKind
export type AgentBasicShapeKind = 'text' | 'note' | 'geo' | 'arrow' | 'line' | 'draw' | 'highlight' | 'frame' | 'bezier-connector' | 'slide' | 'mind-map' | 'js-shape'
export type AgentConnectorKind = 'arrow' | 'bezier-connector' | 'branch'
export type AgentResultMode = 'compact' | 'full'

export type AgentSafetyOptions = {
	confirm?: boolean
	dryRun?: boolean
}

export type AgentSelectionOptions = {
	select?: boolean
	zoom?: boolean
	resultMode?: AgentResultMode
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
	contentMarkdown?: string
	title?: string
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

export type AgentLinkedBlockContent = {
	id: string
	type?: string
	subType?: string
	title?: string
	content?: string
	markdown?: string
	childCount?: number
	children?: AgentLinkedBlockChildContent[]
	childrenText?: string
	childrenTruncated?: boolean
	hpath?: string
	truncated?: boolean
	missing?: boolean
	error?: string
}

export type AgentLinkedBlockChildContent = {
	id: string
	type?: string
	subType?: string
	content?: string
	markdown?: string
	truncated?: boolean
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

export type AgentBoardEditMode = 'commit' | 'preview'
export type AgentBoardEditResultMode = 'minimal' | 'debug'
export type AgentBoardEditHandle =
	| string
	| string[]
	| {
		shapeId?: string
		shapeIds?: string[]
		blockId?: string
		kind?: string
	}

export type AgentBoardLayoutStyle =
	| 'nearSelection'
	| 'rightOf'
	| 'below'
	| 'grid'
	| 'tree'
	| 'mindmap'
	| 'frameAround'

export type AgentBoardLayoutIntent = {
	style?: AgentBoardLayoutStyle
	target?: AgentBoardEditHandle
	anchor?: AgentBoardEditHandle
	side?: AgentBranchSide
	columns?: number
	gap?: number
	horizontalGap?: number
	verticalGap?: number
	x?: number
	y?: number
	w?: number
	h?: number
	as?: string
	name?: string
	color?: TLDefaultColorStyle
}

export type AgentBoardNodeCreate = {
	as?: string
	kind: 'card' | 'single-block' | 'text' | 'frame'
	x?: number
	y?: number
	w?: number
	h?: number
	color?: TLDefaultColorStyle
	blockId?: string
	contentMarkdown?: string
	text?: string
	title?: string
	name?: string
	isMain?: boolean
	isCollapsed?: boolean
	showMask?: boolean
}

export type AgentBoardNodePatch = {
	target?: AgentBoardEditHandle
	shapeId?: string
	shapeIds?: string[]
	x?: number
	y?: number
	w?: number
	h?: number
	color?: string
	isCollapsed?: boolean
	text?: string
	name?: string
}

export type AgentBoardEditOperation =
	| {
		op: 'createNodes'
		nodes: AgentBoardNodeCreate[]
		layout?: AgentBoardLayoutIntent
	}
	| {
		op: 'connect'
		kind?: 'branch' | 'relation'
		from: AgentBoardEditHandle
		to: AgentBoardEditHandle
		text?: string
		color?: TLDefaultColorStyle
		strokeWidth?: number
		lineWidth?: number
		layout?: AgentBoardLayoutIntent
		as?: string
	}
	| ({
		op: 'layout'
		target?: AgentBoardEditHandle
	} & AgentBoardLayoutIntent)
	| {
		op: 'updateNodes'
		target?: AgentBoardEditHandle
		patches?: AgentBoardNodePatch[]
		nodes?: AgentBoardNodePatch[]
		x?: number
		y?: number
		w?: number
		h?: number
		color?: string
		isCollapsed?: boolean
		text?: string
		name?: string
	}
	| {
		op: 'focus'
		target?: AgentBoardEditHandle
		zoom?: boolean
	}
	| {
		op: 'save'
	}

export type AgentBoardEditRequest = {
	whiteboardId?: string
	goal?: string
	mode?: AgentBoardEditMode
	operations?: AgentBoardEditOperation[]
	selection?: AgentBoardEditHandle
	result?: AgentBoardEditResultMode
	save?: boolean
}

export type AgentBoardEditCounts = {
	createdShapes: number
	updatedShapes: number
	connectors: number
	branches: number
}

export type AgentBoardEditResult = {
	ok: boolean
	operationId: string
	mode: AgentBoardEditMode
	committed: boolean
	created: Record<string, string[]>
	counts: AgentBoardEditCounts
	focusedShapeIds: string[]
	selectedShapeIds: string[]
	committedShapeIds: string[]
	externalCreatedBlockIds: string[]
	saved: boolean
	errors: string[]
	summary?: unknown
}

export type AgentArrangeOperation = 'front' | 'back' | 'forward' | 'backward'
export type AgentAlignOperation = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom' | 'distribute-x' | 'distribute-y'
