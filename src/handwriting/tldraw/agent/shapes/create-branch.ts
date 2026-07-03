import { type Editor, type TLShapeId, createShapeId } from '@tldraw/tldraw'
import { isBranchConnectableShape, layoutBranchChildren, relayoutBranchesContainingShapes } from '../../BranchShape/branch-layout'
import type { IBranchShape } from '../../BranchShape/branch-shape-types'
import { markExplicitCreatedBranchRelations } from '../../BranchShape/keep-branch-layouts-updated'
import type { AgentBranchChildRef, AgentBranchCreateArgs, AgentBranchSide } from '../core/types'
import { createAgentCardShape } from './create-card'
import { createAgentSingleBlockShape } from './create-single-block'
import type { AgentCreateContext } from '../core/context'
import { recordAgentCreatedNode } from '../core/context'
import { AGENT_SHAPE_BOUNDS, getAgentBranchDefaults, getAgentCardDefaults, getAgentSingleBlockDefaults } from '../core/defaults'
import { finiteNumberInRange } from '../core/schema'
import { finiteNumber } from './create-card'

type NormalizedBranchChild = {
	side: AgentBranchSide
	ref: AgentBranchChildRef
	defaults: {
		x: number
		y: number
		color?: AgentBranchCreateArgs['color']
	}
}

export function createAgentBranchShape(
	editor: Editor,
	options: AgentBranchCreateArgs,
	context: AgentCreateContext
): TLShapeId {
	const rootPoint = getBranchRootPoint(editor, options)
	const branchId = createShapeId()
	const leftChildIds: string[] = []
	const rightChildIds: string[] = []
	const rootShapeId = getExistingRootShapeId(editor, options.rootShapeId)
	const branchDefaults = getAgentBranchDefaults()

	for (const child of normalizeBranchChildren(options, rootPoint)) {
		const childId = ensureBranchChild(editor, child.ref, child.defaults, context)
		if (!childId) continue
		if (child.side === 'left') leftChildIds.push(childId)
		else rightChildIds.push(childId)
	}

	markExplicitCreatedBranchRelations(editor, [branchId])

	editor.createShape<IBranchShape>({
		id: branchId,
		type: 'branch',
		x: rootPoint.x - (branchDefaults.rootX ?? branchDefaults.w / 2),
		y: rootPoint.y - branchDefaults.h / 2,
		props: {
			...branchDefaults,
			color: options.color ?? branchDefaults.color,
			childIds: [...rightChildIds],
			leftChildIds,
			rightChildIds,
			rootShapeId,
			direction: options.direction ?? branchDefaults.direction,
			horizontalGap: finiteNumberInRange(
				options.horizontalGap,
				branchDefaults.horizontalGap,
				AGENT_SHAPE_BOUNDS.minBranchHorizontalGap,
				AGENT_SHAPE_BOUNDS.maxBranchHorizontalGap
			),
			verticalGap: finiteNumberInRange(
				options.verticalGap,
				branchDefaults.verticalGap,
				AGENT_SHAPE_BOUNDS.minBranchVerticalGap,
				AGENT_SHAPE_BOUNDS.maxBranchVerticalGap
			),
			lineWidth: finiteNumberInRange(
				options.lineWidth,
				branchDefaults.lineWidth,
				AGENT_SHAPE_BOUNDS.minBranchLineWidth,
				AGENT_SHAPE_BOUNDS.maxBranchLineWidth
			),
			lineStyle: options.lineStyle ?? branchDefaults.lineStyle,
			snapDistance: finiteNumberInRange(
				options.snapDistance,
				branchDefaults.snapDistance,
				AGENT_SHAPE_BOUNDS.minBranchSnapDistance,
				AGENT_SHAPE_BOUNDS.maxBranchSnapDistance
			),
			showBackground: options.showBackground ?? branchDefaults.showBackground,
			version: branchDefaults.version,
		},
	})
	recordAgentCreatedNode(context, branchId, 'branch')

	const branch = editor.getShape<IBranchShape>(branchId)
	if (branch?.type === 'branch') {
		layoutBranchChildren(editor, branch)
	}

	relayoutBranchesContainingShapes(editor, [
		branchId,
		...leftChildIds.map(toShapeId),
		...rightChildIds.map(toShapeId),
	])

	return branchId
}

function normalizeBranchChildren(
	options: AgentBranchCreateArgs,
	rootPoint: { x: number; y: number }
): NormalizedBranchChild[] {
	const branchDefaults = getAgentBranchDefaults()
	const singleDefaults = getAgentSingleBlockDefaults()
	const left = options.leftChildren || []
	const right = options.rightChildren || []
	const directChildren = (options.childIds || []).map((shapeId) => ({ shapeId }))
	const generic = options.children || []
	const direction = options.direction || 'right'
	const items: Array<{ side: AgentBranchSide; ref: AgentBranchChildRef }> = [
		...left.map((ref) => ({ side: 'left' as const, ref })),
		...right.map((ref) => ({ side: 'right' as const, ref })),
		...directChildren.map((ref) => ({ side: direction, ref })),
		...generic.map((ref) => ({ side: getChildSide(ref) || direction, ref })),
	]

	const sideIndexes: Record<AgentBranchSide, number> = { left: 0, right: 0 }
	return items.map((item) => {
		const sideIndex = sideIndexes[item.side]++
		return {
			...item,
			defaults: {
				x: rootPoint.x + (item.side === 'left'
					? -branchDefaults.horizontalGap - singleDefaults.w
					: branchDefaults.horizontalGap),
				y: rootPoint.y + sideIndex * (singleDefaults.h + branchDefaults.verticalGap),
				color: options.color,
			},
		}
	})
}

function ensureBranchChild(
	editor: Editor,
	ref: AgentBranchChildRef,
	defaults: { x: number; y: number; color?: AgentBranchCreateArgs['color'] },
	context: AgentCreateContext
): string | undefined {
	if (typeof ref === 'string') {
		const shape = editor.getShape(ref as TLShapeId)
		if (!shape) return undefined
		if (!isBranchConnectableShape(shape)) {
			throw new Error(`Branch child shape must be card, single-block, or branch: ${ref}`)
		}
		return ref
	}

	if (ref.shapeId) {
		const shape = editor.getShape(ref.shapeId as TLShapeId)
		if (!shape) {
			throw new Error(`Child shape not found: ${ref.shapeId}`)
		}
		if (!isBranchConnectableShape(shape)) {
			throw new Error(`Branch child shape must be card, single-block, or branch: ${ref.shapeId}`)
		}
		return ref.shapeId
	}

	const kind = ref.kind || 'single-block'
	if (kind === 'card') {
		const id = createAgentCardShape(editor, {
			kind: 'card',
			x: finiteNumber(ref.x, defaults.x),
			y: finiteNumber(ref.y, defaults.y),
			w: ref.w,
			h: ref.h,
			color: ref.color ?? defaults.color,
			blockId: ref.blockId,
			isMain: ref.isMain,
			isCollapsed: ref.isCollapsed,
			showMask: ref.showMask,
			select: false,
			zoom: false,
		})
		recordAgentCreatedNode(context, id, 'card', ref.blockId)
		return String(id)
	}

	const id = createAgentSingleBlockShape(editor, {
		kind: 'single-block',
		x: finiteNumber(ref.x, defaults.x),
		y: finiteNumber(ref.y, defaults.y),
		w: ref.w,
		h: ref.h,
		color: ref.color ?? defaults.color,
		blockId: ref.blockId,
		select: false,
		zoom: false,
	})
	recordAgentCreatedNode(context, id, 'single-block', ref.blockId)
	return String(id)
}

function getBranchRootPoint(editor: Editor, options: AgentBranchCreateArgs): { x: number; y: number } {
	if ((options.x === undefined || options.y === undefined) && options.rootShapeId) {
		const center = getShapeCenter(editor, options.rootShapeId)
		if (center) {
			return {
				x: finiteNumber(options.x, center.x),
				y: finiteNumber(options.y, center.y),
			}
		}
	}

	return { x: finiteNumber(options.x, 0), y: finiteNumber(options.y, 0) }
}

function getExistingRootShapeId(editor: Editor, rootShapeId?: string): string | undefined {
	if (!rootShapeId) return undefined
	const shape = editor.getShape(rootShapeId as TLShapeId)
	if (!shape) {
		throw new Error(`Root shape not found: ${rootShapeId}`)
	}
	if (shape.type !== 'card' && shape.type !== 'single-block') {
		throw new Error(`Branch root shape must be card or single-block: ${rootShapeId}`)
	}
	return rootShapeId
}

function getShapeCenter(editor: Editor, shapeId: string): { x: number; y: number } | null {
	const shape = editor.getShape(shapeId as TLShapeId)
	if (!shape) return null

	const bounds = editor.getShapePageBounds(shape.id)
	if (bounds) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }

	const cardDefaults = getAgentCardDefaults()
	const singleDefaults = getAgentSingleBlockDefaults()
	const props = (shape as any).props || {}
	const w = Number(props.w) || (shape.type === 'single-block' ? singleDefaults.w : cardDefaults.w)
	const h = Number(props.h) || (shape.type === 'single-block' ? singleDefaults.h : cardDefaults.h)
	return { x: shape.x + w / 2, y: shape.y + h / 2 }
}

function getChildSide(ref: AgentBranchChildRef): AgentBranchSide | undefined {
	return typeof ref === 'object' && ref ? ref.side : undefined
}

function toShapeId(id: string): TLShapeId {
	return id as TLShapeId
}
