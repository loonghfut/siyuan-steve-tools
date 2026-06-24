import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape, BranchChildShape } from './branch-shape-types'
import { BranchInteractionHint, setBranchInteractionHint } from './branch-interaction-state'

const CONNECTABLE_TYPES = new Set(['card', 'single-block', 'branch'])
const DEFAULT_NODE_WIDTH = 300
const DEFAULT_NODE_HEIGHT = 80
const ROOT_RADIUS = 7
const MIN_BRANCH_WIDTH = 80
const MIN_BRANCH_HEIGHT = 40
const BRANCH_EDGE_PADDING_X = 0
const BRANCH_EDGE_PADDING_Y = 0
const DETACH_DISTANCE_MULTIPLIER = 0.01
const ATTACH_DELAY_MS = 500
const activeBranchDragShapeIds = new Set<string>()
const pendingBranchDragShapes = new Map<string, TLShape>()
const delayedAttachCandidates = new Map<
	string,
	{
		key: string
		since: number
		branchId: string
		side: BranchSide
		timeoutId: ReturnType<typeof setTimeout> | null
	}
>()

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

function isDescendantBranch(editor: Editor, ancestorBranchId: string, candidateId: string, visited = new Set<string>()): boolean {
	if (ancestorBranchId === candidateId) return true
	if (visited.has(ancestorBranchId)) return false
	visited.add(ancestorBranchId)

	const ancestor = editor.getShape<IBranchShape>(ancestorBranchId as TLShapeId)
	if (!ancestor || ancestor.type !== 'branch') return false

	for (const childId of getAllBranchChildIds(ancestor)) {
		if (childId === candidateId) return true
		const child = editor.getShape(childId as TLShapeId)
		if (child?.type === 'branch' && isDescendantBranch(editor, child.id as string, candidateId, visited)) {
			return true
		}
	}

	return false
}

function canAttachShapeToBranch(editor: Editor, branch: IBranchShape, shape: TLShape) {
	if (branch.id === shape.id) return false
	if (shape.type !== 'branch') return true

	return !isDescendantBranch(editor, shape.id as string, branch.id as string)
}

function nowMs() {
	return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function clearDelayedAttachCandidate(shapeId?: string) {
	const clearOne = (id: string) => {
		const current = delayedAttachCandidates.get(id)
		if (current?.timeoutId) clearTimeout(current.timeoutId)
		delayedAttachCandidates.delete(id)
	}

	if (shapeId) {
		clearOne(shapeId)
		return
	}

	for (const id of delayedAttachCandidates.keys()) {
		clearOne(id)
	}
}

function getAttachCandidateKey(attach: { branch: IBranchShape; side: BranchSide }) {
	return `${attach.branch.id}:${attach.side}`
}

function isDelayedAttachReady(shape: TLShape, attach: { branch: IBranchShape; side: BranchSide }, scheduleHint: boolean) {
	const shapeId = shape.id as string
	const key = getAttachCandidateKey(attach)
	const current = delayedAttachCandidates.get(shapeId)
	const now = nowMs()

	if (!current || current.key !== key) {
		if (current?.timeoutId) clearTimeout(current.timeoutId)
		const nextCandidate = {
			key,
			since: now,
			branchId: attach.branch.id as string,
			side: attach.side,
			timeoutId: null as ReturnType<typeof setTimeout> | null,
		}

		if (scheduleHint) {
			nextCandidate.timeoutId = setTimeout(() => {
				const latest = delayedAttachCandidates.get(shapeId)
				if (!latest || latest.key !== key) return
				latest.timeoutId = null
				if (!activeBranchDragShapeIds.has(shapeId)) return
				setBranchInteractionHint({
					mode: 'attach',
					draggingShapeId: shapeId,
					branchId: latest.branchId,
					side: latest.side,
				})
			}, ATTACH_DELAY_MS)
		}

		delayedAttachCandidates.set(shapeId, nextCandidate)
		return false
	}

	if (!scheduleHint && current.timeoutId) {
		clearTimeout(current.timeoutId)
		current.timeoutId = null
	}

	return now - current.since >= ATTACH_DELAY_MS
}

function getNearestAttachCandidate(editor: Editor, shape: TLShape) {
	const branches = editor
		.getCurrentPageShapes()
		.filter((candidate) => candidate.type === 'branch') as IBranchShape[]

	let nearestAttach: { branch: IBranchShape; side: BranchSide; distance: number } | null = null

	for (const branch of branches) {
		if (!canAttachShapeToBranch(editor, branch, shape)) continue
		const side = getBranchSideForShape(editor, branch, shape)
		const distance = distanceToBranchRoot(editor, branch, shape, side)
		const snapDistance = Math.max(branch.props.snapDistance || 140, 40)
		if (distance <= snapDistance && (!nearestAttach || distance < nearestAttach.distance)) {
			nearestAttach = { branch, side, distance }
		}
	}

	return nearestAttach
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
		return isBranchConnectableShape(shape) && shape?.id !== branch.id
	})

	return unique
}

function normalizeSideChildIds(editor: Editor, branch: IBranchShape, side: BranchSide, extraId?: TLShapeId | string) {
	const ids = [...getSideChildIds(branch, side)]
	if (extraId && !ids.includes(extraId)) ids.push(extraId as string)
	return Array.from(new Set(ids)).filter((id) => {
		const shape = editor.getShape(id as TLShapeId)
		return isBranchConnectableShape(shape) && shape?.id !== branch.id
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

function addBranchDescendantMoveUpdates(
	editor: Editor,
	branch: IBranchShape,
	dx: number,
	dy: number,
	updates: any[],
	movedIds: Set<string>
) {
	for (const childId of getAllBranchChildIds(branch)) {
		if (movedIds.has(childId)) continue
		const child = editor.getShape(childId as TLShapeId)
		if (!child) continue

		movedIds.add(childId)
		updates.push({
			id: child.id,
			type: child.type,
			x: child.x + dx,
			y: child.y + dy,
		})

		if (child.type === 'branch') {
			addBranchDescendantMoveUpdates(editor, child as IBranchShape, dx, dy, updates, movedIds)
		}
	}
}

function removeChildIdFromBranch(branch: IBranchShape, childId: string) {
	const leftChildIds = (branch.props.leftChildIds || []).filter((id) => id !== childId)
	const rightChildIds = (branch.props.rightChildIds || branch.props.childIds || []).filter((id) => id !== childId)
	return {
		leftChildIds,
		rightChildIds,
		childIds: rightChildIds,
	}
}

function sameIds(a: string[], b: string[]) {
	if (a.length !== b.length) return false
	return a.every((id, index) => id === b[index])
}

export function beginBranchAttachmentDrag(editor: Editor, shape: TLShape) {
	if (!isBranchConnectableShape(shape)) return
	if (activeBranchDragShapeIds.size === 0) {
		pendingBranchDragShapes.clear()
		clearDelayedAttachCandidate()
	}

	const selectedShapes = editor.getSelectedShapes()
	const dragShapes = selectedShapes.some((selectedShape) => selectedShape.id === shape.id)
		? selectedShapes
		: [shape]

	for (const dragShape of dragShapes) {
		if (isBranchConnectableShape(dragShape)) activeBranchDragShapeIds.add(dragShape.id as string)
	}
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
	const leftWidth = leftChildren.length > 0 ? Math.max(...leftChildren.map(({ bounds }) => bounds.w), DEFAULT_NODE_WIDTH) + horizontalGap + BRANCH_EDGE_PADDING_X : 40
	const rightWidth = rightChildren.length > 0 ? Math.max(...rightChildren.map(({ bounds }) => bounds.w), DEFAULT_NODE_WIDTH) + horizontalGap + BRANCH_EDGE_PADDING_X : 40
	const leftHeight = leftChildren.reduce((sum, { bounds }) => sum + bounds.h, 0) + verticalGap * Math.max(leftChildren.length - 1, 0)
	const rightHeight = rightChildren.reduce((sum, { bounds }) => sum + bounds.h, 0) + verticalGap * Math.max(rightChildren.length - 1, 0)
	const branchHeight = Math.max(leftHeight, rightHeight, MIN_BRANCH_HEIGHT) + BRANCH_EDGE_PADDING_Y * 2
	const branchWidth = Math.max(leftWidth + rightWidth, MIN_BRANCH_WIDTH)
	const oldRootPage = getBranchRootPagePoint(branch)
	const rootLocalX = leftWidth
	const branchX = oldRootPage.x - rootLocalX
	const branchY = oldRootPage.y - branchHeight / 2
	const rootX = oldRootPage.x
	const rootY = branchY + branchHeight / 2
	const updates: any[] = []
	const movedIds = new Set<string>([branch.id as string])

	const placeChildren = (side: BranchSide, sideChildren: Array<{ shape: BranchChildShape; bounds: Bounds }>, totalHeight: number) => {
		const nodeEdgeX = side === 'left' ? rootX - horizontalGap : rootX + horizontalGap
		let cursorY = rootY - totalHeight / 2
		for (const { shape, bounds } of sideChildren) {
			const nextY = cursorY
			const nextX = side === 'left' ? nodeEdgeX - bounds.w : nodeEdgeX
			cursorY += bounds.h + verticalGap

			if (Math.abs(shape.x - nextX) > 0.5 || Math.abs(shape.y - nextY) > 0.5) {
				const dx = nextX - shape.x
				const dy = nextY - shape.y
				movedIds.add(shape.id as string)
				updates.push({
					id: shape.id,
					type: shape.type,
					x: nextX,
					y: nextY,
				})

				if (shape.type === 'branch') {
					addBranchDescendantMoveUpdates(editor, shape as IBranchShape, dx, dy, updates, movedIds)
				}
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

type BranchIdsDraft = {
	branch: IBranchShape
	leftChildIds: string[]
	rightChildIds: string[]
}

function getBranchDraft(editor: Editor, drafts: Map<TLShapeId, BranchIdsDraft>, branch: IBranchShape) {
	let draft = drafts.get(branch.id)
	if (!draft) {
		draft = {
			branch,
			leftChildIds: normalizeSideChildIds(editor, branch, 'left'),
			rightChildIds: normalizeSideChildIds(editor, branch, 'right'),
		}
		drafts.set(branch.id, draft)
	}
	return draft
}

function draftContainsChild(draft: BranchIdsDraft, childId: string) {
	return draft.leftChildIds.includes(childId) || draft.rightChildIds.includes(childId)
}

function removeChildFromDraft(draft: BranchIdsDraft, childId: string) {
	const leftChildIds = draft.leftChildIds.filter((id) => id !== childId)
	const rightChildIds = draft.rightChildIds.filter((id) => id !== childId)
	const changed = !sameIds(leftChildIds, draft.leftChildIds) || !sameIds(rightChildIds, draft.rightChildIds)
	if (changed) {
		draft.leftChildIds = leftChildIds
		draft.rightChildIds = rightChildIds
	}
	return changed
}

function applyDraftToBranch(editor: Editor, draft: BranchIdsDraft) {
	const { branch, leftChildIds, rightChildIds } = draft
	if (
		sameIds(leftChildIds, branch.props.leftChildIds || []) &&
		sameIds(rightChildIds, branch.props.rightChildIds || branch.props.childIds || []) &&
		sameIds(rightChildIds, branch.props.childIds || [])
	) {
		return false
	}

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		props: {
			...branch.props,
			childIds: rightChildIds,
			leftChildIds,
			rightChildIds,
		},
	})
	return true
}

export function attachShapeToNearestBranch(editor: Editor, shape: TLShape) {
	if (!isBranchConnectableShape(shape)) return false

	const preview = getBranchDragPreview(editor, shape, { scheduleAttachHint: false })
	if (preview?.mode !== 'attach') return false

	return updateBranchAttachmentsAfterDrag(editor, [shape])
}

function updateBranchAttachmentsAfterDrag(editor: Editor, shapes: TLShape[]) {
	const currentBranches = editor
		.getCurrentPageShapes()
		.filter((candidate) => candidate.type === 'branch') as IBranchShape[]
	if (currentBranches.length === 0) return false

	const drafts = new Map<TLShapeId, BranchIdsDraft>()
	const affectedBranchIds = new Set<TLShapeId>()
	let didHandle = false

	for (const shape of shapes) {
		if (!isBranchConnectableShape(shape)) continue
		const childId = shape.id as string
		const preview = getBranchDragPreview(editor, shape, { scheduleAttachHint: false })

		if (preview?.mode === 'attach') {
			const nearest = preview.branch
			if (!canAttachShapeToBranch(editor, nearest, shape)) continue
			const nearestDraft = getBranchDraft(editor, drafts, nearest)

			for (const branch of currentBranches) {
				const draft = getBranchDraft(editor, drafts, branch)
				if (!draftContainsChild(draft, childId)) continue
				if (removeChildFromDraft(draft, childId)) affectedBranchIds.add(branch.id)
			}

			if (preview.side === 'left') nearestDraft.leftChildIds.push(childId)
			else nearestDraft.rightChildIds.push(childId)
			affectedBranchIds.add(nearest.id)
			didHandle = true
			continue
		}

		for (const branch of currentBranches) {
			const draft = getBranchDraft(editor, drafts, branch)
			if (!draftContainsChild(draft, childId)) continue

			const detachDistance = Math.max(branch.props.snapDistance || 160, 80) * DETACH_DISTANCE_MULTIPLIER
			const distance = distanceToBranchWorkArea(editor, branch, shape)
			if (distance > detachDistance) {
				if (removeChildFromDraft(draft, childId)) affectedBranchIds.add(branch.id)
			} else {
				affectedBranchIds.add(branch.id)
			}
			didHandle = true
		}
	}

	for (const draft of drafts.values()) {
		applyDraftToBranch(editor, draft)
	}

	for (const shape of shapes) {
		clearDelayedAttachCandidate(shape.id as string)
	}

	for (const branchId of affectedBranchIds) {
		const branch = editor.getShape<IBranchShape>(branchId)
		if (branch) layoutBranchChildren(editor, branch)
	}

	return didHandle
}

export function getBranchDragPreview(editor: Editor, shape: TLShape, options?: { scheduleAttachHint?: boolean }): BranchDragPreview | null {
	if (!isBranchConnectableShape(shape)) return null

	const scheduleAttachHint = options?.scheduleAttachHint ?? true
	const branches = editor
		.getCurrentPageShapes()
		.filter((candidate) => candidate.type === 'branch') as IBranchShape[]

	const nearestAttach = getNearestAttachCandidate(editor, shape)

	if (nearestAttach) {
		if (!isDelayedAttachReady(shape, nearestAttach, scheduleAttachHint)) return null

		return {
			mode: 'attach',
			branch: nearestAttach.branch,
			side: nearestAttach.side,
		}
	}

	clearDelayedAttachCandidate(shape.id as string)

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

	const shapeId = shape.id as string
	const isTrackedDrag = activeBranchDragShapeIds.has(shapeId)

	if (isTrackedDrag) {
		pendingBranchDragShapes.set(shapeId, shape)
		activeBranchDragShapeIds.delete(shapeId)

		if (activeBranchDragShapeIds.size > 0) {
			return true
		}

		const shapes = Array.from(pendingBranchDragShapes.values())
		pendingBranchDragShapes.clear()
		return updateBranchAttachmentsAfterDrag(editor, shapes)
	}

	return updateBranchAttachmentsAfterDrag(editor, [shape])
}

export function relayoutBranchesContainingShape(editor: Editor, shapeId: TLShapeId, visited = new Set<string>()) {
	if (visited.has(shapeId as string)) return
	visited.add(shapeId as string)

	const branches = editor
		.getCurrentPageShapes()
		.filter((shape) => shape.type === 'branch' && getAllBranchChildIds(shape as IBranchShape).includes(shapeId as string)) as IBranchShape[]

	for (const branch of branches) {
		if (visited.has(branch.id as string)) continue
		layoutBranchChildren(editor, branch)
		relayoutBranchesContainingShape(editor, branch.id, visited)
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
		const nextIds = removeChildIdFromBranch(branch, shapeId as string)
		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: {
				...branch.props,
				...nextIds,
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
