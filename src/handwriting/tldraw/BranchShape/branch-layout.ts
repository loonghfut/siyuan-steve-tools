import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape, BranchChildShape } from './branch-shape-types'

const CONNECTABLE_TYPES = new Set(['card', 'single-block'])
const DEFAULT_NODE_WIDTH = 300
const DEFAULT_NODE_HEIGHT = 80
const ROOT_RADIUS = 7
const MIN_BRANCH_WIDTH = 80
const MIN_BRANCH_HEIGHT = 40
const DETACH_DISTANCE_MULTIPLIER = 1.7

type Bounds = {
	x: number
	y: number
	w: number
	h: number
	centerX: number
	centerY: number
}

export function isBranchConnectableShape(shape: TLShape | undefined): boolean {
	return !!shape && CONNECTABLE_TYPES.has(shape.type) && typeof (shape as any).props?.w === 'number'
}

function getPageBounds(editor: Editor, shape: TLShape): Bounds | null {
	const pageBounds = editor.getShapePageBounds(shape.id)
	if (pageBounds) {
		return {
			x: pageBounds.x,
			y: pageBounds.y,
			w: pageBounds.width,
			h: pageBounds.height,
			centerX: pageBounds.x + pageBounds.width / 2,
			centerY: pageBounds.y + pageBounds.height / 2,
		}
	}

	const props = (shape as any).props || {}
	const w = Math.max(Number(props.w) || DEFAULT_NODE_WIDTH, 1)
	const h = Math.max(Number(props.h) || DEFAULT_NODE_HEIGHT, 1)
	return {
		x: shape.x,
		y: shape.y,
		w,
		h,
		centerX: shape.x + w / 2,
		centerY: shape.y + h / 2,
	}
}

function getBranchRootPagePoint(branch: IBranchShape) {
	const rootX = branch.props.direction === 'left' ? branch.x + branch.props.w - ROOT_RADIUS * 2 : branch.x + ROOT_RADIUS * 2
	return {
		x: rootX,
		y: branch.y + branch.props.h / 2,
	}
}

function distanceToBranchRoot(editor: Editor, branch: IBranchShape, child: TLShape) {
	const childBounds = getPageBounds(editor, child)
	if (!childBounds) return Number.POSITIVE_INFINITY

	const root = getBranchRootPagePoint(branch)
	const edgeX = branch.props.direction === 'left' ? childBounds.x + childBounds.w : childBounds.x
	const clampedY = Math.max(childBounds.y, Math.min(root.y, childBounds.y + childBounds.h))
	const dx = edgeX - root.x
	const dy = clampedY - root.y
	return Math.hypot(dx, dy)
}

function distanceToBranchWorkArea(editor: Editor, branch: IBranchShape, child: TLShape) {
	const childBounds = getPageBounds(editor, child)
	if (!childBounds) return Number.POSITIVE_INFINITY

	const padding = Math.max(branch.props.snapDistance || 160, 80)
	const minX = branch.x - padding
	const minY = branch.y - padding
	const maxX = branch.x + branch.props.w + padding
	const maxY = branch.y + branch.props.h + padding
	const clampedX = Math.max(minX, Math.min(childBounds.centerX, maxX))
	const clampedY = Math.max(minY, Math.min(childBounds.centerY, maxY))
	return Math.hypot(childBounds.centerX - clampedX, childBounds.centerY - clampedY)
}

function normalizeChildIds(editor: Editor, branch: IBranchShape, extraId?: TLShapeId | string) {
	const ids = [...(branch.props.childIds || [])]
	if (extraId && !ids.includes(extraId)) ids.push(extraId)

	const unique = Array.from(new Set(ids)).filter((id) => {
		const shape = editor.getShape(id as TLShapeId)
		return isBranchConnectableShape(shape)
	})

	return unique
}

function sortedChildIds(editor: Editor, ids: string[]) {
	return [...ids].sort((a, b) => {
		const shapeA = editor.getShape(a as TLShapeId)
		const shapeB = editor.getShape(b as TLShapeId)
		if (!shapeA || !shapeB) return 0
		const boundsA = getPageBounds(editor, shapeA)
		const boundsB = getPageBounds(editor, shapeB)
		return (boundsA?.centerY ?? shapeA.y) - (boundsB?.centerY ?? shapeB.y)
	})
}

export function layoutBranchChildren(editor: Editor, branch: IBranchShape, childIds = branch.props.childIds) {
	const validIds = sortedChildIds(editor, normalizeChildIds(editor, branch).filter((id) => childIds.includes(id)))
	const children = validIds
		.map((id) => {
			const shape = editor.getShape(id as TLShapeId)
			if (!shape || !isBranchConnectableShape(shape)) return null
			const bounds = getPageBounds(editor, shape)
			if (!bounds) return null
			return { shape: shape as BranchChildShape, bounds }
		})
		.filter(Boolean) as Array<{ shape: BranchChildShape; bounds: Bounds }>

	if (children.length === 0) {
		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: {
				...branch.props,
				w: MIN_BRANCH_WIDTH,
				h: MIN_BRANCH_HEIGHT,
				childIds: [],
			},
		})
		return
	}

	const horizontalGap = Math.max(branch.props.horizontalGap || 80, 20)
	const verticalGap = Math.max(branch.props.verticalGap || 24, 8)
	const direction = branch.props.direction || 'right'
	const maxChildWidth = Math.max(...children.map(({ bounds }) => bounds.w), DEFAULT_NODE_WIDTH)
	const totalHeight = children.reduce((sum, { bounds }) => sum + bounds.h, 0) + verticalGap * Math.max(children.length - 1, 0)
	const branchHeight = Math.max(totalHeight + verticalGap * 2, MIN_BRANCH_HEIGHT)
	const branchWidth = Math.max(horizontalGap + maxChildWidth + 48, MIN_BRANCH_WIDTH)
	const branchY = branch.y + branch.props.h / 2 - branchHeight / 2
	const branchX = direction === 'left' ? branch.x + branch.props.w - branchWidth : branch.x
	const rootX = direction === 'left' ? branchX + branchWidth - ROOT_RADIUS * 2 : branchX + ROOT_RADIUS * 2
	const rootY = branchY + branchHeight / 2
	const nodeEdgeX = direction === 'left' ? rootX - horizontalGap : rootX + horizontalGap

	let cursorY = rootY - totalHeight / 2
	const updates: any[] = []

	for (const { shape, bounds } of children) {
		const nextY = cursorY
		const nextX = direction === 'left' ? nodeEdgeX - bounds.w : nodeEdgeX
		cursorY += bounds.h + verticalGap

		if (Math.abs(shape.x - nextX) > 0.5 || Math.abs(shape.y - nextY) > 0.5) {
			updates.push({
				id: shape.id,
				type: shape.type,
				x: nextX,
				y: nextY,
			})
		}
	}

	updates.push({
		id: branch.id,
		type: 'branch',
		x: branchX,
		y: branchY,
		props: {
			...branch.props,
			w: branchWidth,
			h: branchHeight,
			childIds: children.map(({ shape }) => shape.id),
		},
	})

	editor.updateShapes(updates)
}

export function attachShapeToNearestBranch(editor: Editor, shape: TLShape) {
	if (!isBranchConnectableShape(shape)) return false

	const branches = editor
		.getCurrentPageShapes()
		.filter((candidate) => candidate.type === 'branch') as IBranchShape[]

	let nearest: IBranchShape | null = null
	let nearestDistance = Number.POSITIVE_INFINITY

	for (const branch of branches) {
		const distance = distanceToBranchRoot(editor, branch, shape)
		const snapDistance = Math.max(branch.props.snapDistance || 140, 40)
		if (distance <= snapDistance && distance < nearestDistance) {
			nearest = branch
			nearestDistance = distance
		}
	}

	if (!nearest) return false

	const childIds = normalizeChildIds(editor, nearest, shape.id)
	editor.updateShape<IBranchShape>({
		id: nearest.id,
		type: 'branch',
		props: {
			...nearest.props,
			childIds,
		},
	})

	const updatedBranch = editor.getShape<IBranchShape>(nearest.id)
	if (updatedBranch) {
		layoutBranchChildren(editor, updatedBranch, childIds)
	}

	return true
}

export function updateBranchAttachmentAfterDrag(editor: Editor, shape: TLShape) {
	if (!isBranchConnectableShape(shape)) return false

	if (attachShapeToNearestBranch(editor, shape)) return true

	const branches = editor
		.getCurrentPageShapes()
		.filter((candidate) => candidate.type === 'branch' && ((candidate as IBranchShape).props.childIds || []).includes(shape.id as string)) as IBranchShape[]

	if (branches.length === 0) return false

	let didHandle = false
	for (const branch of branches) {
		const detachDistance = Math.max(branch.props.snapDistance || 160, 80) * DETACH_DISTANCE_MULTIPLIER
		const distance = distanceToBranchWorkArea(editor, branch, shape)
		if (distance > detachDistance) {
			const nextChildIds = (branch.props.childIds || []).filter((id) => id !== shape.id)
			editor.updateShape<IBranchShape>({
				id: branch.id,
				type: 'branch',
				props: {
					...branch.props,
					childIds: nextChildIds,
				},
			})
			const updatedBranch = editor.getShape<IBranchShape>(branch.id)
			if (updatedBranch) layoutBranchChildren(editor, updatedBranch, nextChildIds)
		} else {
			layoutBranchChildren(editor, branch)
		}
		didHandle = true
	}

	return didHandle
}

export function relayoutBranchesContainingShape(editor: Editor, shapeId: TLShapeId) {
	const branches = editor
		.getCurrentPageShapes()
		.filter((shape) => shape.type === 'branch' && (((shape as IBranchShape).props.childIds || []).includes(shapeId as string))) as IBranchShape[]

	for (const branch of branches) {
		layoutBranchChildren(editor, branch)
	}
}

export function isShapeInBranch(editor: Editor, shapeId: TLShapeId) {
	return editor
		.getCurrentPageShapes()
		.some((shape) => shape.type === 'branch' && ((shape as IBranchShape).props.childIds || []).includes(shapeId as string))
}

export function pruneShapeFromBranches(editor: Editor, shapeId: TLShapeId) {
	const branches = editor
		.getCurrentPageShapes()
		.filter((shape) => shape.type === 'branch' && (((shape as IBranchShape).props.childIds || []).includes(shapeId as string))) as IBranchShape[]

	for (const branch of branches) {
		const nextChildIds = (branch.props.childIds || []).filter((id) => id !== shapeId)
		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: {
				...branch.props,
				childIds: nextChildIds,
			},
		})
		const updatedBranch = editor.getShape<IBranchShape>(branch.id)
		if (updatedBranch) layoutBranchChildren(editor, updatedBranch, nextChildIds)
	}
}

export function getBranchRenderInfo(editor: Editor, branch: IBranchShape) {
	const rootX = branch.props.direction === 'left' ? branch.props.w - ROOT_RADIUS * 2 : ROOT_RADIUS * 2
	const rootY = branch.props.h / 2
	const children = normalizeChildIds(editor, branch)
		.map((id) => {
			const child = editor.getShape(id as TLShapeId)
			if (!child || !isBranchConnectableShape(child)) return null
			const childPageBounds = getPageBounds(editor, child)
			if (!childPageBounds) return null
			const childLocal = {
				x: childPageBounds.x - branch.x,
				y: childPageBounds.y - branch.y,
				w: childPageBounds.w,
				h: childPageBounds.h,
				centerY: childPageBounds.centerY - branch.y,
			}
			const targetX = branch.props.direction === 'left' ? childLocal.x + childLocal.w : childLocal.x
			return {
				id,
				targetX,
				targetY: childLocal.centerY,
				midX: rootX + (targetX - rootX) * 0.42,
			}
		})
		.filter(Boolean) as Array<{ id: string; targetX: number; targetY: number; midX: number }>

	return {
		rootX,
		rootY,
		rootRadius: ROOT_RADIUS,
		children,
	}
}
