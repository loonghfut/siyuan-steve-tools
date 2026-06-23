import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape, BranchChildShape } from './branch-shape-types'
import { BranchInteractionHint } from './branch-interaction-state'

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

type BranchSide = 'left' | 'right'

type BranchDragPreview =
	| {
			mode: 'attach'
			branch: IBranchShape
			side: BranchSide
	  }
	| {
			mode: 'detach'
			branch: IBranchShape
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
	return {
		x: branch.x + getBranchRootLocalX(branch),
		y: branch.y + branch.props.h / 2,
	}
}

function getBranchRootLocalX(branch: IBranchShape) {
	return branch.props.rootX ?? branch.props.w / 2
}

function getBranchSideForShape(editor: Editor, branch: IBranchShape, child: TLShape): BranchSide {
	const childBounds = getPageBounds(editor, child)
	const root = getBranchRootPagePoint(branch)
	if (!childBounds) return 'right'
	return childBounds.centerX < root.x ? 'left' : 'right'
}

function getSideChildIds(branch: IBranchShape, side: BranchSide) {
	if (side === 'left') return branch.props.leftChildIds || []
	return branch.props.rightChildIds || branch.props.childIds || []
}

export function getAllBranchChildIds(branch: IBranchShape) {
	return Array.from(new Set([...(branch.props.leftChildIds || []), ...(branch.props.rightChildIds || branch.props.childIds || [])]))
}

function distanceToBranchRoot(editor: Editor, branch: IBranchShape, child: TLShape, side = getBranchSideForShape(editor, branch, child)) {
	const childBounds = getPageBounds(editor, child)
	if (!childBounds) return Number.POSITIVE_INFINITY

	const root = getBranchRootPagePoint(branch)
	const edgeX = side === 'left' ? childBounds.x + childBounds.w : childBounds.x
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
	const ids = getAllBranchChildIds(branch)
	if (extraId && !ids.includes(extraId)) ids.push(extraId)

	const unique = Array.from(new Set(ids)).filter((id) => {
		const shape = editor.getShape(id as TLShapeId)
		return isBranchConnectableShape(shape)
	})

	return unique
}

function normalizeSideChildIds(editor: Editor, branch: IBranchShape, side: BranchSide, extraId?: TLShapeId | string) {
	const ids = [...getSideChildIds(branch, side)]
	if (extraId && !ids.includes(extraId)) ids.push(extraId as string)
	return Array.from(new Set(ids)).filter((id) => {
		const shape = editor.getShape(id as TLShapeId)
		return isBranchConnectableShape(shape)
	})
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

function getBranchChildren(editor: Editor, ids: string[]) {
	return sortedChildIds(editor, ids)
		.map((id) => {
			const shape = editor.getShape(id as TLShapeId)
			if (!shape || !isBranchConnectableShape(shape)) return null
			const bounds = getPageBounds(editor, shape)
			if (!bounds) return null
			return { shape: shape as BranchChildShape, bounds }
		})
		.filter(Boolean) as Array<{ shape: BranchChildShape; bounds: Bounds }>
}

export function layoutBranchChildren(editor: Editor, branch: IBranchShape, childIds = getAllBranchChildIds(branch)) {
	const childSet = new Set(childIds)
	const leftIds = normalizeSideChildIds(editor, branch, 'left').filter((id) => childSet.has(id))
	const rightIds = normalizeSideChildIds(editor, branch, 'right').filter((id) => childSet.has(id))
	const leftChildren = getBranchChildren(editor, leftIds)
	const rightChildren = getBranchChildren(editor, rightIds)
	const children = [...leftChildren, ...rightChildren]

	if (children.length === 0) {
		const oldRootPage = getBranchRootPagePoint(branch)
		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			x: oldRootPage.x - MIN_BRANCH_WIDTH / 2,
			y: oldRootPage.y - MIN_BRANCH_HEIGHT / 2,
			props: {
				...branch.props,
				w: MIN_BRANCH_WIDTH,
				h: MIN_BRANCH_HEIGHT,
				childIds: [],
				leftChildIds: [],
				rightChildIds: [],
				rootX: MIN_BRANCH_WIDTH / 2,
			},
		})
		return
	}

	const horizontalGap = Math.max(branch.props.horizontalGap || 80, 20)
	const verticalGap = Math.max(branch.props.verticalGap || 24, 8)
	const leftWidth = leftChildren.length > 0 ? Math.max(...leftChildren.map(({ bounds }) => bounds.w), DEFAULT_NODE_WIDTH) + horizontalGap + 48 : 40
	const rightWidth = rightChildren.length > 0 ? Math.max(...rightChildren.map(({ bounds }) => bounds.w), DEFAULT_NODE_WIDTH) + horizontalGap + 48 : 40
	const leftHeight = leftChildren.reduce((sum, { bounds }) => sum + bounds.h, 0) + verticalGap * Math.max(leftChildren.length - 1, 0)
	const rightHeight = rightChildren.reduce((sum, { bounds }) => sum + bounds.h, 0) + verticalGap * Math.max(rightChildren.length - 1, 0)
	const branchHeight = Math.max(leftHeight, rightHeight, MIN_BRANCH_HEIGHT) + verticalGap * 2
	const branchWidth = Math.max(leftWidth + rightWidth, MIN_BRANCH_WIDTH)
	const oldRootPage = getBranchRootPagePoint(branch)
	const rootLocalX = leftWidth
	const branchX = oldRootPage.x - rootLocalX
	const branchY = oldRootPage.y - branchHeight / 2
	const rootX = oldRootPage.x
	const rootY = branchY + branchHeight / 2
	const updates: any[] = []

	const placeChildren = (side: BranchSide, sideChildren: Array<{ shape: BranchChildShape; bounds: Bounds }>, totalHeight: number) => {
		const nodeEdgeX = side === 'left' ? rootX - horizontalGap : rootX + horizontalGap
		let cursorY = rootY - totalHeight / 2
		for (const { shape, bounds } of sideChildren) {
			const nextY = cursorY
			const nextX = side === 'left' ? nodeEdgeX - bounds.w : nodeEdgeX
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
	}
	placeChildren('left', leftChildren, leftHeight)
	placeChildren('right', rightChildren, rightHeight)

	updates.push({
		id: branch.id,
		type: 'branch',
		x: branchX,
		y: branchY,
		props: {
			...branch.props,
			w: branchWidth,
			h: branchHeight,
			childIds: rightChildren.map(({ shape }) => shape.id),
			leftChildIds: leftChildren.map(({ shape }) => shape.id),
			rightChildIds: rightChildren.map(({ shape }) => shape.id),
			rootX: rootLocalX,
		},
	})

	editor.updateShapes(updates)
}

export function attachShapeToNearestBranch(editor: Editor, shape: TLShape) {
	if (!isBranchConnectableShape(shape)) return false

	const preview = getBranchDragPreview(editor, shape)
	if (preview?.mode !== 'attach') return false

	const nearest = preview.branch
	const side = preview.side
	const leftChildIds = normalizeSideChildIds(editor, nearest, 'left').filter((id) => id !== shape.id)
	const rightChildIds = normalizeSideChildIds(editor, nearest, 'right').filter((id) => id !== shape.id)
	if (side === 'left') leftChildIds.push(shape.id as string)
	else rightChildIds.push(shape.id as string)

	editor.updateShape<IBranchShape>({
		id: nearest.id,
		type: 'branch',
		props: {
			...nearest.props,
			childIds: rightChildIds,
			leftChildIds,
			rightChildIds,
		},
	})

	const updatedBranch = editor.getShape<IBranchShape>(nearest.id)
	if (updatedBranch) {
		layoutBranchChildren(editor, updatedBranch)
	}

	return true
}

export function getBranchDragPreview(editor: Editor, shape: TLShape): BranchDragPreview | null {
	if (!isBranchConnectableShape(shape)) return null

	const branches = editor
		.getCurrentPageShapes()
		.filter((candidate) => candidate.type === 'branch') as IBranchShape[]

	let nearestAttach: { branch: IBranchShape; side: BranchSide; distance: number } | null = null

	for (const branch of branches) {
		const side = getBranchSideForShape(editor, branch, shape)
		const distance = distanceToBranchRoot(editor, branch, shape, side)
		const snapDistance = Math.max(branch.props.snapDistance || 140, 40)
		if (distance <= snapDistance && (!nearestAttach || distance < nearestAttach.distance)) {
			nearestAttach = { branch, side, distance }
		}
	}

	if (nearestAttach) {
		return {
			mode: 'attach',
			branch: nearestAttach.branch,
			side: nearestAttach.side,
		}
	}

	for (const branch of branches) {
		if (!getAllBranchChildIds(branch).includes(shape.id as string)) continue
		const detachDistance = Math.max(branch.props.snapDistance || 160, 80) * DETACH_DISTANCE_MULTIPLIER
		const distance = distanceToBranchWorkArea(editor, branch, shape)
		if (distance > detachDistance) {
			return {
				mode: 'detach',
				branch,
			}
		}
	}

	return null
}

export function getBranchInteractionHintForShape(editor: Editor, shape: TLShape): BranchInteractionHint | null {
	const preview = getBranchDragPreview(editor, shape)
	if (!preview) return null

	if (preview.mode === 'attach') {
		return {
			mode: 'attach',
			draggingShapeId: shape.id as string,
			branchId: preview.branch.id,
			side: preview.side,
		}
	}

	return {
		mode: 'detach',
		draggingShapeId: shape.id as string,
		branchId: preview.branch.id,
	}
}

export function updateBranchAttachmentAfterDrag(editor: Editor, shape: TLShape) {
	if (!isBranchConnectableShape(shape)) return false

	if (attachShapeToNearestBranch(editor, shape)) return true

	const branches = editor
		.getCurrentPageShapes()
		.filter((candidate) => candidate.type === 'branch' && getAllBranchChildIds(candidate as IBranchShape).includes(shape.id as string)) as IBranchShape[]

	if (branches.length === 0) return false

	let didHandle = false
	for (const branch of branches) {
		const detachDistance = Math.max(branch.props.snapDistance || 160, 80) * DETACH_DISTANCE_MULTIPLIER
		const distance = distanceToBranchWorkArea(editor, branch, shape)
		if (distance > detachDistance) {
			const nextLeftChildIds = (branch.props.leftChildIds || []).filter((id) => id !== shape.id)
			const nextRightChildIds = (branch.props.rightChildIds || branch.props.childIds || []).filter((id) => id !== shape.id)
			editor.updateShape<IBranchShape>({
				id: branch.id,
				type: 'branch',
				props: {
					...branch.props,
					childIds: nextRightChildIds,
					leftChildIds: nextLeftChildIds,
					rightChildIds: nextRightChildIds,
				},
			})
			const updatedBranch = editor.getShape<IBranchShape>(branch.id)
			if (updatedBranch) layoutBranchChildren(editor, updatedBranch)
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
		.filter((shape) => shape.type === 'branch' && getAllBranchChildIds(shape as IBranchShape).includes(shapeId as string)) as IBranchShape[]

	for (const branch of branches) {
		layoutBranchChildren(editor, branch)
	}
}

export function isShapeInBranch(editor: Editor, shapeId: TLShapeId) {
	return editor
		.getCurrentPageShapes()
		.some((shape) => shape.type === 'branch' && getAllBranchChildIds(shape as IBranchShape).includes(shapeId as string))
}

export function pruneShapeFromBranches(editor: Editor, shapeId: TLShapeId) {
	const branches = editor
		.getCurrentPageShapes()
		.filter((shape) => shape.type === 'branch' && getAllBranchChildIds(shape as IBranchShape).includes(shapeId as string)) as IBranchShape[]

	for (const branch of branches) {
		const nextLeftChildIds = (branch.props.leftChildIds || []).filter((id) => id !== shapeId)
		const nextRightChildIds = (branch.props.rightChildIds || branch.props.childIds || []).filter((id) => id !== shapeId)
		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: {
				...branch.props,
				childIds: nextRightChildIds,
				leftChildIds: nextLeftChildIds,
				rightChildIds: nextRightChildIds,
			},
		})
		const updatedBranch = editor.getShape<IBranchShape>(branch.id)
		if (updatedBranch) layoutBranchChildren(editor, updatedBranch)
	}
}

export function getBranchRenderInfo(editor: Editor, branch: IBranchShape) {
	const rootX = getBranchRootLocalX(branch)
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
			const side: BranchSide = (branch.props.leftChildIds || []).includes(id) ? 'left' : 'right'
			const targetX = side === 'left' ? childLocal.x + childLocal.w : childLocal.x
			return {
				id,
				side,
				targetX,
				targetY: childLocal.centerY,
				midX: rootX + (targetX - rootX) * 0.42,
			}
		})
		.filter(Boolean) as Array<{ id: string; side: BranchSide; targetX: number; targetY: number; midX: number }>

	return {
		rootX,
		rootY,
		rootRadius: ROOT_RADIUS,
		children,
	}
}
