import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape, BranchChildShape } from './branch-shape-types'
import { BranchInteractionHint, setBranchInteractionHint } from './branch-interaction-state'

const CONNECTABLE_TYPES = new Set(['card', 'single-block', 'branch'])
const DEFAULT_NODE_WIDTH = 300
const DEFAULT_NODE_HEIGHT = 80
const ROOT_RADIUS = 7
const ROOT_DIAMETER = ROOT_RADIUS * 2
const DETACH_DISTANCE_MULTIPLIER = 0.01
const ATTACH_DELAY_MS = 500
const AUTO_FRAME_MIN_CHILDREN = 2
const ENHANCED_FRAME_PADDING = 24
const ROOT_ATTACH_DISTANCE_MULTIPLIER = 0.45
const activeBranchDragShapeIds = new Set<string>()
const pendingBranchDragShapes = new Map<string, TLShape>()
const syncingRootContentMoveIds = new Set<string>()
const delayedAttachCandidates = new Map<
	string,
	{
		key: string
		since: number
		branchId: string
		side?: BranchSide
		slot?: BranchAttachmentSlot
		targetShapeId?: string
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

export type BranchSide = 'left' | 'right'
type BranchAttachmentSlot = 'root' | 'side'

export type SingleBranchParentInfo = {
	branch: IBranchShape
	side: BranchSide
	index: number
}

type BranchChildEntry = { shape: BranchChildShape; bounds: Bounds }

type BranchParentAttachment = {
	branch: IBranchShape
	side: BranchSide
}

type BranchAttachToBranchCandidate = {
	mode: 'attach-to-branch'
	branch: IBranchShape
	side: BranchSide
	distance: number
}

type BranchAbsorbShapeCandidate = {
	mode: 'attach-shape-to-dragging-branch'
	branch: IBranchShape
	side: BranchSide
	targetShape: TLShape
	distance: number
}

type BranchRootAttachCandidate = {
	mode: 'attach-root-to-branch'
	branch: IBranchShape
	targetShape?: TLShape
	distance: number
}

type BranchDragPreview =
	| {
			mode: 'attach'
			branch: IBranchShape
			side?: BranchSide
			slot?: BranchAttachmentSlot
			targetShapeId?: string
	  }
	| {
			mode: 'detach'
			branch: IBranchShape
	  }

type BranchDragPreviewOptions = {
	scheduleAttachHint?: boolean
	draggingShapeId?: string
	branches?: IBranchShape[]
	pageShapes?: TLShape[]
	parentsByChildId?: Map<string, IBranchShape[]>
}

function usesManualFrameStyle(branch: IBranchShape) {
	return branch.props.lineStyle === 'frame-floating'
}

export function isBranchConnectableShape(shape: TLShape | undefined): boolean {
	return !!shape && CONNECTABLE_TYPES.has(shape.type) && typeof (shape as any).props?.w === 'number'
}

function getCurrentBranches(editor: Editor) {
	return editor
		.getCurrentPageShapes()
		.filter((candidate) => candidate.type === 'branch') as IBranchShape[]
}

function getActiveBranchDragPreviewOptions(editor: Editor): BranchDragPreviewOptions {
	const branches = getCurrentBranches(editor)
	return {
		branches,
		pageShapes: editor.getCurrentPageShapes(),
		parentsByChildId: buildBranchParentIndex(branches),
	}
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

function getBranchDescendantIds(editor: Editor, branch: IBranchShape, visited = new Set<string>()) {
	for (const childId of getAllBranchAttachedShapeIds(branch)) {
		if (visited.has(childId)) continue
		visited.add(childId)

		const child = editor.getShape(childId as TLShapeId)
		if (child?.type === 'branch') {
			getBranchDescendantIds(editor, child as IBranchShape, visited)
		}
	}

	return visited
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

function getAttachCandidateKey(
	attach:
		| BranchAttachToBranchCandidate
		| BranchAbsorbShapeCandidate
		| BranchRootAttachCandidate
		| { branch: IBranchShape; side?: BranchSide; slot?: BranchAttachmentSlot; mode?: 'attach-to-branch'; targetShapeId?: string }
) {
	const mode = attach.mode ?? 'attach-to-branch'
	const targetShapeId =
		'targetShape' in attach ? attach.targetShape.id : 'targetShapeId' in attach ? attach.targetShapeId : undefined
	const side = 'side' in attach ? attach.side : undefined
	const slot = 'slot' in attach ? attach.slot : undefined
	return targetShapeId
		? `${mode}:${attach.branch.id}:${side ?? slot ?? 'root'}:${targetShapeId}`
		: `${mode}:${attach.branch.id}:${side ?? slot ?? 'root'}`
}

function isDelayedAttachReady(
	shape: TLShape,
	attach: BranchAttachToBranchCandidate | BranchAbsorbShapeCandidate | BranchRootAttachCandidate,
	scheduleHint: boolean,
	draggingShapeId = shape.id as string
) {
	const shapeId = draggingShapeId
	const key = getAttachCandidateKey(attach)
	const current = delayedAttachCandidates.get(shapeId)
	const now = nowMs()
	const targetShapeId =
		attach.mode === 'attach-shape-to-dragging-branch' || (attach.mode === 'attach-root-to-branch' && attach.targetShape)
			? (attach.targetShape.id as string)
			: undefined
	const slot: BranchAttachmentSlot = attach.mode === 'attach-root-to-branch' ? 'root' : 'side'

	if (!current || current.key !== key) {
		if (current?.timeoutId) clearTimeout(current.timeoutId)
		const nextCandidate = {
			key,
			since: now,
			branchId: attach.branch.id as string,
			side: 'side' in attach ? attach.side : undefined,
			slot,
			targetShapeId,
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
					slot: latest.slot,
					targetShapeId: latest.targetShapeId,
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

function getNearestAttachCandidate(
	editor: Editor,
	shape: TLShape,
	branches = getCurrentBranches(editor),
	shapeBounds = getPageBounds(editor, shape)
): BranchAttachToBranchCandidate | null {
	let nearestAttach: BranchAttachToBranchCandidate | null = null

	for (const branch of branches) {
		if (!canAttachShapeToBranch(editor, branch, shape)) continue
		const side = getBranchSideForShape(editor, branch, shape, shapeBounds)
		const distance = distanceToBranchRoot(editor, branch, shape, side, shapeBounds)
		const snapDistance = Math.max(branch.props.snapDistance || 140, 40)
		if (distance <= snapDistance && (!nearestAttach || distance < nearestAttach.distance)) {
			nearestAttach = { mode: 'attach-to-branch', branch, side, distance }
		}
	}

	return nearestAttach
}

function isBranchAbsorbableShape(shape: TLShape | undefined): boolean {
	return !!shape && (shape.type === 'card' || shape.type === 'single-block') && typeof (shape as any).props?.w === 'number'
}

function isBranchRootContentShape(shape: TLShape | undefined): boolean {
	return isBranchAbsorbableShape(shape)
}

function getBranchRootContent(editor: Editor, branch: IBranchShape) {
	const rootShapeId = branch.props.rootShapeId
	if (!rootShapeId) return null

	const shape = editor.getShape(rootShapeId as TLShapeId)
	if (!isBranchRootContentShape(shape)) return null

	const bounds = getPageBounds(editor, shape)
	if (!bounds) return null

	return { shape, bounds }
}

function canBranchWrapRootShape(branch: IBranchShape, shape: TLShape | undefined) {
	if (!isBranchRootContentShape(shape)) return false
	if (branch.id === shape.id) return false
	if (branch.props.rootShapeId && branch.props.rootShapeId !== shape.id) return false
	return true
}

export function getBranchRootParent(editor: Editor, shapeId: TLShapeId | string, branches = getCurrentBranches(editor)) {
	const id = shapeId as string
	return branches.find((branch) => branch.props.rootShapeId === id) || null
}

function distanceBetweenPoints(a: { x: number; y: number }, b: { x: number; y: number }) {
	return Math.hypot(a.x - b.x, a.y - b.y)
}

function getBranchRootShapeCandidate(
	editor: Editor,
	shape: TLShape,
	branches = getCurrentBranches(editor),
	shapeBounds = getPageBounds(editor, shape)
): BranchRootAttachCandidate | null {
	if (!isBranchRootContentShape(shape) || !shapeBounds) return null
	if (getBranchRootParent(editor, shape.id, branches)) return null

	let nearestAttach: BranchRootAttachCandidate | null = null
	const shapeCenter = { x: shapeBounds.centerX, y: shapeBounds.centerY }

	for (const branch of branches) {
		if (!canBranchWrapRootShape(branch, shape)) continue

		const currentRootShapeId = branch.props.rootShapeId
		const alreadyRoot = currentRootShapeId === shape.id
		if (currentRootShapeId && !alreadyRoot) continue

		const root = getBranchRootPagePoint(branch)
		const distance = distanceBetweenPoints(shapeCenter, root)
		const snapDistance = Math.max((branch.props.snapDistance || 140) * ROOT_ATTACH_DISTANCE_MULTIPLIER, 36)
		if (distance <= snapDistance && (!nearestAttach || distance < nearestAttach.distance)) {
			nearestAttach = { mode: 'attach-root-to-branch', branch, distance }
		}
	}

	return nearestAttach
}

function getNearestShapeForDraggingBranch(
	editor: Editor,
	draggingBranch: IBranchShape,
	pageShapes = editor.getCurrentPageShapes()
): BranchAbsorbShapeCandidate | null {
	const branchId = draggingBranch.id as string
	const selectedDragIds = new Set(activeBranchDragShapeIds)
	selectedDragIds.add(branchId)
	const descendantIds = getBranchDescendantIds(editor, draggingBranch)

	let nearestAttach: BranchAbsorbShapeCandidate | null = null

	for (const candidate of pageShapes) {
		if (!isBranchAbsorbableShape(candidate)) continue
		if (selectedDragIds.has(candidate.id as string)) continue
		if (descendantIds.has(candidate.id as string)) continue

		const candidateBounds = getPageBounds(editor, candidate)
		const side = getBranchSideForShape(editor, draggingBranch, candidate, candidateBounds)
		if (!canBranchAbsorbShapeOnSide(editor, draggingBranch, side)) continue
		const distance = distanceToBranchRoot(editor, draggingBranch, candidate, side, candidateBounds)
		const snapDistance = Math.max(draggingBranch.props.snapDistance || 140, 40)
		if (distance > snapDistance) continue

		if (!nearestAttach || distance < nearestAttach.distance) {
			nearestAttach = {
				mode: 'attach-shape-to-dragging-branch',
				branch: draggingBranch,
				side,
				targetShape: candidate,
				distance,
			}
		}
	}

	return nearestAttach
}

function getNearestRootShapeForDraggingBranch(
	editor: Editor,
	draggingBranch: IBranchShape,
	pageShapes = editor.getCurrentPageShapes()
): BranchRootAttachCandidate | null {
	if (draggingBranch.props.rootShapeId) return null

	const branchId = draggingBranch.id as string
	const selectedDragIds = new Set(activeBranchDragShapeIds)
	selectedDragIds.add(branchId)
	const descendantIds = getBranchDescendantIds(editor, draggingBranch)
	const root = getBranchRootPagePoint(draggingBranch)
	let nearestAttach: BranchRootAttachCandidate | null = null

	for (const candidate of pageShapes) {
		if (!canBranchWrapRootShape(draggingBranch, candidate)) continue
		if (selectedDragIds.has(candidate.id as string)) continue
		if (descendantIds.has(candidate.id as string)) continue
		if (getBranchRootParent(editor, candidate.id)) continue

		const candidateBounds = getPageBounds(editor, candidate)
		if (!candidateBounds) continue

		const distance = distanceBetweenPoints(root, { x: candidateBounds.centerX, y: candidateBounds.centerY })
		const snapDistance = Math.max((draggingBranch.props.snapDistance || 140) * ROOT_ATTACH_DISTANCE_MULTIPLIER, 36)
		if (distance > snapDistance) continue

		if (!nearestAttach || distance < nearestAttach.distance) {
			nearestAttach = {
				mode: 'attach-root-to-branch',
				branch: draggingBranch,
				targetShape: candidate,
				distance,
			}
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

function getBranchSideForShape(editor: Editor, branch: IBranchShape, child: TLShape, childBounds = getPageBounds(editor, child)): BranchSide {
	const root = getBranchRootPagePoint(branch)
	if (!childBounds) return 'right'
	return childBounds.centerX < root.x ? 'left' : 'right'
}

function getSideChildIds(branch: IBranchShape, side: BranchSide) {
	if (side === 'left') return branch.props.leftChildIds || []
	return branch.props.rightChildIds || branch.props.childIds || []
}

function getChildSideInBranch(branch: IBranchShape, childId: string): BranchSide | null {
	if ((branch.props.leftChildIds || []).includes(childId)) return 'left'
	if ((branch.props.rightChildIds || branch.props.childIds || []).includes(childId)) return 'right'
	return null
}

export function getSingleBranchParent(editor: Editor, singleId: TLShapeId): SingleBranchParentInfo | null {
	const matches = getCurrentBranches(editor)
		.map((branch) => {
			const side = getChildSideInBranch(branch, singleId as string)
			if (!side) return null

			const sideChildIds = getSideChildIds(branch, side)
			const index = sideChildIds.indexOf(singleId as string)
			if (index === -1) return null

			return {
				branch,
				side,
				index,
			}
		})
		.filter(Boolean) as SingleBranchParentInfo[]

	if (matches.length !== 1) return null
	return matches[0]
}

function getOppositeBranchSide(side: BranchSide): BranchSide {
	return side === 'left' ? 'right' : 'left'
}

function getParentBranchAttachment(editor: Editor, branch: IBranchShape): BranchParentAttachment | null {
	const childId = branch.id as string
	for (const candidate of getCurrentBranches(editor)) {
		if (candidate.id === branch.id) continue
		const side = getChildSideInBranch(candidate, childId)
		if (side) {
			return {
				branch: candidate,
				side,
			}
		}
	}

	return null
}

export function getAllBranchChildIds(branch: IBranchShape) {
	return Array.from(new Set([...(branch.props.leftChildIds || []), ...(branch.props.rightChildIds || branch.props.childIds || [])]))
}

export function getAllBranchAttachedShapeIds(branch: IBranchShape) {
	return Array.from(new Set([...getAllBranchChildIds(branch), ...(branch.props.rootShapeId ? [branch.props.rootShapeId] : [])]))
}

export function getBranchAutoFrameState(editor: Editor, branch: IBranchShape) {
	const parentAttachment = getParentBranchAttachment(editor, branch)
	if (!parentAttachment) {
		return {
			enabled: false,
			padding: 0,
			parentBranchId: null,
			attachedSide: null as BranchSide | null,
			attachedSideChildCount: 0,
		}
	}

	const attachedSide = getOppositeBranchSide(parentAttachment.side)
	const attachedSideChildCount = normalizeSideChildIds(editor, branch, attachedSide).length
	const enabled = attachedSideChildCount >= AUTO_FRAME_MIN_CHILDREN

	return {
		enabled,
		padding: enabled ? ENHANCED_FRAME_PADDING : 0,
		parentBranchId: parentAttachment.branch.id as string,
		attachedSide,
		attachedSideChildCount,
	}
}

function distanceToBranchRoot(
	editor: Editor,
	branch: IBranchShape,
	child: TLShape,
	side?: BranchSide,
	childBounds = getPageBounds(editor, child)
) {
	if (!childBounds) return Number.POSITIVE_INFINITY

	const root = getBranchRootPagePoint(branch)
	const resolvedSide = side ?? getBranchSideForShape(editor, branch, child, childBounds)
	const edgeX = resolvedSide === 'left' ? childBounds.x + childBounds.w : childBounds.x
	const clampedY = Math.max(childBounds.y, Math.min(root.y, childBounds.y + childBounds.h))
	const dx = edgeX - root.x
	const dy = clampedY - root.y
	return Math.hypot(dx, dy)
}

function distanceToBranchWorkArea(editor: Editor, branch: IBranchShape, child: TLShape, childBounds = getPageBounds(editor, child)) {
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
	const rootShapeId = branch.props.rootShapeId

	const unique = Array.from(new Set(ids)).filter((id) => {
		const shape = editor.getShape(id as TLShapeId)
		return isBranchConnectableShape(shape) && shape?.id !== branch.id && id !== rootShapeId
	})

	return unique
}

function normalizeSideChildIds(editor: Editor, branch: IBranchShape, side: BranchSide, extraId?: TLShapeId | string) {
	const ids = [...getSideChildIds(branch, side)]
	if (extraId && !ids.includes(extraId)) ids.push(extraId as string)
	const rootShapeId = branch.props.rootShapeId
	return Array.from(new Set(ids)).filter((id) => {
		const shape = editor.getShape(id as TLShapeId)
		return isBranchConnectableShape(shape) && shape?.id !== branch.id && id !== rootShapeId
	})
}

function getBranchSideChildIdsForAttachCheck(
	editor: Editor,
	branch: IBranchShape,
	side: BranchSide,
	draft?: BranchIdsDraft
) {
	if (draft) return side === 'left' ? draft.leftChildIds : draft.rightChildIds
	return normalizeSideChildIds(editor, branch, side)
}

function canBranchAbsorbShapeOnSide(
	editor: Editor,
	branch: IBranchShape,
	side: BranchSide,
	options?: {
		draft?: BranchIdsDraft
		allowedExistingChildId?: string
	}
) {
	const sideChildIds = getBranchSideChildIdsForAttachCheck(editor, branch, side, options?.draft)
	return sideChildIds.every((id) => id === options?.allowedExistingChildId)
}

function getBranchChildren(editor: Editor, ids: string[]) {
	return ids
		.map((id) => {
			const shape = editor.getShape(id as TLShapeId)
			if (!shape || !isBranchConnectableShape(shape)) return null
			const bounds = getPageBounds(editor, shape)
			if (!bounds) return null
			return { shape: shape as BranchChildShape, bounds }
		})
		.filter(Boolean)
		.sort((a, b) => a!.bounds.centerY - b!.bounds.centerY) as BranchChildEntry[]
}

export function addBranchDescendantMoveUpdates(
	editor: Editor,
	branch: IBranchShape,
	dx: number,
	dy: number,
	updates: any[],
	movedIds: Set<string>
) {
	for (const childId of getAllBranchAttachedShapeIds(branch)) {
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

export function syncBranchMoveForRootContent(editor: Editor, prev: TLShape, next: TLShape) {
	if (!isBranchRootContentShape(next)) return false
	if (syncingRootContentMoveIds.has(next.id as string)) return false
	if (prev.x === next.x && prev.y === next.y) return false

	const branch = getBranchRootParent(editor, next.id)
	if (!branch) return false

	const dx = next.x - prev.x
	const dy = next.y - prev.y
	if (Math.abs(dx) <= 0.001 && Math.abs(dy) <= 0.001) return false

	const updates: Array<{ id: any; type: any; x: number; y: number }> = [
		{
			id: branch.id,
			type: branch.type,
			x: branch.x + dx,
			y: branch.y + dy,
		},
	]
	const movedIds = new Set<string>([branch.id as string, next.id as string])
	addBranchDescendantMoveUpdates(editor, branch, dx, dy, updates, movedIds)

	syncingRootContentMoveIds.add(next.id as string)
	try {
		editor.updateShapes(updates)
	} finally {
		syncingRootContentMoveIds.delete(next.id as string)
	}

	return true
}

export function runWithSuppressedRootContentMoveIds<T>(shapeIds: Iterable<string>, fn: () => T): T {
	for (const shapeId of shapeIds) syncingRootContentMoveIds.add(shapeId)
	try {
		return fn()
	} finally {
		for (const shapeId of shapeIds) syncingRootContentMoveIds.delete(shapeId)
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

function sameNumber(a: number | undefined, b: number, tolerance = 0.001) {
	return Math.abs((a ?? 0) - b) <= tolerance
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
	const rootContent = getBranchRootContent(editor, branch)
	const nextRootShapeId = rootContent ? (rootContent.shape.id as string) : undefined
	const autoFrame = getBranchAutoFrameState(editor, branch)
	const shouldShowBackground = branch.props.showBackground === true
	const shouldPadForFrame = (children.length > 0 || !!rootContent) && (autoFrame.enabled || shouldShowBackground || usesManualFrameStyle(branch))
	const framePadding = shouldPadForFrame ? ENHANCED_FRAME_PADDING : 0

	if (children.length === 0 && !rootContent) {
		const oldRootPage = getBranchRootPagePoint(branch)
		const nextX = oldRootPage.x - ROOT_RADIUS
		const nextY = oldRootPage.y - ROOT_RADIUS
		const nextChildIds: string[] = []
		const isUnchanged =
			sameNumber(branch.x, nextX) &&
			sameNumber(branch.y, nextY) &&
			sameNumber(branch.props.w, ROOT_DIAMETER) &&
			sameNumber(branch.props.h, ROOT_DIAMETER) &&
			sameNumber(branch.props.rootX, ROOT_RADIUS) &&
			sameIds(branch.props.childIds || [], nextChildIds) &&
			sameIds(branch.props.leftChildIds || [], nextChildIds) &&
			sameIds(branch.props.rightChildIds || [], nextChildIds) &&
			!branch.props.rootShapeId

		if (isUnchanged) return

		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			x: nextX,
			y: nextY,
			props: {
				...branch.props,
				w: ROOT_DIAMETER,
				h: ROOT_DIAMETER,
				childIds: nextChildIds,
				leftChildIds: nextChildIds,
				rightChildIds: nextChildIds,
				rootShapeId: undefined,
				rootX: ROOT_RADIUS,
			},
		})
		return
	}

	const horizontalGap = Math.max(branch.props.horizontalGap || 80, 20)
	const verticalGap = Math.max(branch.props.verticalGap || 24, 8)
	const rootWidth = rootContent ? rootContent.bounds.w : ROOT_DIAMETER
	const rootHeight = rootContent ? rootContent.bounds.h : ROOT_DIAMETER
	const leftWidth = leftChildren.length > 0 ? Math.max(...leftChildren.map(({ bounds }) => bounds.w)) + horizontalGap : 0
	const rightWidth = rightChildren.length > 0 ? Math.max(...rightChildren.map(({ bounds }) => bounds.w)) + horizontalGap : 0
	const leftHeight = leftChildren.reduce((sum, { bounds }) => sum + bounds.h, 0) + verticalGap * Math.max(leftChildren.length - 1, 0)
	const rightHeight = rightChildren.reduce((sum, { bounds }) => sum + bounds.h, 0) + verticalGap * Math.max(rightChildren.length - 1, 0)
	const contentHeight = Math.max(leftHeight, rightHeight, rootHeight)
	const branchHeight = contentHeight + framePadding * 2
	const oldRootPage = rootContent
		? { x: rootContent.bounds.centerX, y: rootContent.bounds.centerY }
		: getBranchRootPagePoint(branch)
	const rootLocalX = Math.max(leftWidth, ROOT_RADIUS) + framePadding + rootWidth / 2
	const branchWidth = rootLocalX + rootWidth / 2 + Math.max(rightWidth, ROOT_RADIUS) + framePadding
	const branchX = oldRootPage.x - rootLocalX
	const branchY = oldRootPage.y - branchHeight / 2
	const rootX = oldRootPage.x
	const rootY = branchY + branchHeight / 2
	const updates: any[] = []
	const movedIds = new Set<string>([branch.id as string])
	if (rootContent) movedIds.add(rootContent.shape.id as string)

	const placeChildren = (side: BranchSide, sideChildren: BranchChildEntry[], totalHeight: number) => {
		const rootEdgeX = side === 'left' ? rootX - rootWidth / 2 : rootX + rootWidth / 2
		const nodeEdgeX = side === 'left' ? rootEdgeX - horizontalGap : rootEdgeX + horizontalGap
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

	const nextLeftChildIds = leftChildren.map(({ shape }) => shape.id)
	const nextRightChildIds = rightChildren.map(({ shape }) => shape.id)
	const branchChanged =
		!sameNumber(branch.x, branchX) ||
		!sameNumber(branch.y, branchY) ||
		!sameNumber(branch.props.w, branchWidth) ||
		!sameNumber(branch.props.h, branchHeight) ||
		!sameNumber(branch.props.rootX, rootLocalX) ||
		!sameIds(branch.props.childIds || [], nextRightChildIds) ||
		!sameIds(branch.props.leftChildIds || [], nextLeftChildIds) ||
		!sameIds(branch.props.rightChildIds || branch.props.childIds || [], nextRightChildIds) ||
		branch.props.rootShapeId !== nextRootShapeId

	if (branchChanged) {
		updates.push({
			id: branch.id,
			type: 'branch',
			x: branchX,
			y: branchY,
			props: {
				...branch.props,
				w: branchWidth,
				h: branchHeight,
				childIds: nextRightChildIds,
				leftChildIds: nextLeftChildIds,
				rightChildIds: nextRightChildIds,
				rootShapeId: nextRootShapeId,
				rootX: rootLocalX,
			},
		})
	}

	if (updates.length > 0) editor.updateShapes(updates)
}

type BranchIdsDraft = {
	branch: IBranchShape
	leftChildIds: string[]
	rightChildIds: string[]
	rootShapeId?: string
}

function getBranchDraft(editor: Editor, drafts: Map<TLShapeId, BranchIdsDraft>, branch: IBranchShape) {
	let draft = drafts.get(branch.id)
	if (!draft) {
		draft = {
			branch,
			leftChildIds: normalizeSideChildIds(editor, branch, 'left'),
			rightChildIds: normalizeSideChildIds(editor, branch, 'right'),
			rootShapeId: getBranchRootContent(editor, branch)?.shape.id as string | undefined,
		}
		drafts.set(branch.id, draft)
	}
	return draft
}

function draftContainsChild(draft: BranchIdsDraft, childId: string) {
	return draft.leftChildIds.includes(childId) || draft.rightChildIds.includes(childId) || draft.rootShapeId === childId
}

function removeChildFromDraft(draft: BranchIdsDraft, childId: string) {
	const leftChildIds = draft.leftChildIds.filter((id) => id !== childId)
	const rightChildIds = draft.rightChildIds.filter((id) => id !== childId)
	const rootShapeId = draft.rootShapeId === childId ? undefined : draft.rootShapeId
	const changed =
		!sameIds(leftChildIds, draft.leftChildIds) ||
		!sameIds(rightChildIds, draft.rightChildIds) ||
		rootShapeId !== draft.rootShapeId
	if (changed) {
		draft.leftChildIds = leftChildIds
		draft.rightChildIds = rightChildIds
		draft.rootShapeId = rootShapeId
	}
	return changed
}

function applyDraftToBranch(editor: Editor, draft: BranchIdsDraft) {
	const { branch, leftChildIds, rightChildIds, rootShapeId } = draft
	if (
		sameIds(leftChildIds, branch.props.leftChildIds || []) &&
		sameIds(rightChildIds, branch.props.rightChildIds || branch.props.childIds || []) &&
		sameIds(rightChildIds, branch.props.childIds || []) &&
		rootShapeId === branch.props.rootShapeId
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
			rootShapeId,
		},
	})
	return true
}

function sortBranchesForLayout(editor: Editor, branchIds: Iterable<TLShapeId>) {
	const branches = Array.from(new Set(Array.from(branchIds)))
		.map((branchId) => editor.getShape<IBranchShape>(branchId))
		.filter((branch): branch is IBranchShape => !!branch && branch.type === 'branch')

	branches.sort((a, b) => {
		if (a.id === b.id) return 0
		if (isDescendantBranch(editor, a.id as string, b.id as string)) return 1
		if (isDescendantBranch(editor, b.id as string, a.id as string)) return -1
		return 0
	})

	return branches
}

export function attachShapeToNearestBranch(editor: Editor, shape: TLShape) {
	if (!isBranchConnectableShape(shape)) return false

	const branches = getCurrentBranches(editor)
	const preview = getBranchDragPreview(editor, shape, {
		scheduleAttachHint: false,
		branches,
		pageShapes: editor.getCurrentPageShapes(),
		parentsByChildId: buildBranchParentIndex(branches),
	})
	if (preview?.mode !== 'attach') return false

	return updateBranchAttachmentsAfterDrag(editor, [shape])
}

function updateBranchAttachmentsAfterDrag(editor: Editor, shapes: TLShape[]) {
	const currentBranches = getCurrentBranches(editor)
	if (currentBranches.length === 0) return false

	const pageShapes = editor.getCurrentPageShapes()
	const parentsByChildId = buildBranchParentIndex(currentBranches)
	const drafts = new Map<TLShapeId, BranchIdsDraft>()
	const affectedBranchIds = new Set<TLShapeId>()
	let didHandle = false

	for (const shape of shapes) {
		if (!isBranchConnectableShape(shape)) continue
		const rootParentBranch = getBranchRootParent(editor, shape.id, currentBranches)
		const previewShape = rootParentBranch || shape
		const childId = previewShape.id as string
		const shapeBounds = getPageBounds(editor, previewShape)
		const preview = getBranchDragPreview(editor, previewShape, {
			scheduleAttachHint: false,
			draggingShapeId: shape.id as string,
			branches: currentBranches,
			pageShapes,
			parentsByChildId,
		})

		if (preview?.mode === 'attach') {
			if (previewShape.type === 'branch') affectedBranchIds.add(previewShape.id)
			const nearest = preview.branch
			const attachTargetShapeId = preview.targetShapeId
			const attachTargetShape = attachTargetShapeId ? editor.getShape(attachTargetShapeId as TLShapeId) : null
			if (attachTargetShapeId && !attachTargetShape) continue
			const childShape = attachTargetShape ?? previewShape
			const attachChildId = (attachTargetShape?.id as string) || childId

			if (preview.slot === 'root') {
				if (!canBranchWrapRootShape(nearest, childShape)) continue
				const nearestDraft = getBranchDraft(editor, drafts, nearest)
				if (nearestDraft.rootShapeId && nearestDraft.rootShapeId !== attachChildId) continue
				if (nearestDraft.rootShapeId === attachChildId) {
					affectedBranchIds.add(nearest.id)
					didHandle = true
					continue
				}

				for (const branch of currentBranches) {
					const draft = getBranchDraft(editor, drafts, branch)
					if (!draftContainsChild(draft, attachChildId)) continue
					if (removeChildFromDraft(draft, attachChildId)) affectedBranchIds.add(branch.id)
				}

				nearestDraft.rootShapeId = attachChildId
				nearestDraft.leftChildIds = nearestDraft.leftChildIds.filter((id) => id !== attachChildId)
				nearestDraft.rightChildIds = nearestDraft.rightChildIds.filter((id) => id !== attachChildId)
				affectedBranchIds.add(nearest.id)
				didHandle = true
				continue
			}

			if (!preview.side) continue
			if (!canAttachShapeToBranch(editor, nearest, childShape)) continue
			const nearestDraft = getBranchDraft(editor, drafts, nearest)
			if (attachTargetShape) {
				if (
					!canBranchAbsorbShapeOnSide(editor, nearest, preview.side, {
						draft: nearestDraft,
						allowedExistingChildId: attachChildId,
					})
				) {
					continue
				}
			}
			const containingBranches = parentsByChildId.get(attachChildId) || []
			const sourceBranch = attachTargetShape
				? containingBranches.find((branch) => branch.id !== nearest.id) || null
				: null
			const isOnlyInNearest = containingBranches.length === 1 && containingBranches[0].id === nearest.id
			const isAlreadyOnSameSide =
				preview.side === 'left'
					? nearestDraft.leftChildIds.includes(attachChildId)
					: nearestDraft.rightChildIds.includes(attachChildId)

			if (attachTargetShape && isOnlyInNearest && isAlreadyOnSameSide) {
				continue
			}

			for (const branch of currentBranches) {
				const draft = getBranchDraft(editor, drafts, branch)
				if (!draftContainsChild(draft, attachChildId)) continue
				if (removeChildFromDraft(draft, attachChildId)) affectedBranchIds.add(branch.id)
			}

			const alreadyOnLeft = nearestDraft.leftChildIds.includes(attachChildId)
			const alreadyOnRight = nearestDraft.rightChildIds.includes(attachChildId)
			if ((preview.side === 'left' && !alreadyOnLeft) || (preview.side === 'right' && !alreadyOnRight)) {
				if (preview.side === 'left') nearestDraft.leftChildIds.push(attachChildId)
				else nearestDraft.rightChildIds.push(attachChildId)
			}
			affectedBranchIds.add(nearest.id)

			if (attachTargetShape && sourceBranch && canAttachShapeToBranch(editor, sourceBranch, nearest)) {
				const sourceDraft = getBranchDraft(editor, drafts, sourceBranch)
				const sourceSide = getChildSideInBranch(sourceBranch, attachChildId) || getBranchSideForShape(editor, sourceBranch, nearest)
				const nearestBranchId = nearest.id as string
				const nearestAlreadyOnSourceSide =
					sourceSide === 'left'
						? sourceDraft.leftChildIds.includes(nearestBranchId)
						: sourceDraft.rightChildIds.includes(nearestBranchId)
				const nearestContainingBranches = parentsByChildId.get(nearestBranchId) || []
				const nearestOnlyInSource =
					nearestContainingBranches.length === 1 && nearestContainingBranches[0].id === sourceBranch.id

				if (!(nearestOnlyInSource && nearestAlreadyOnSourceSide)) {
					for (const branch of currentBranches) {
						const draft = getBranchDraft(editor, drafts, branch)
						if (!draftContainsChild(draft, nearestBranchId)) continue
						if (removeChildFromDraft(draft, nearestBranchId)) affectedBranchIds.add(branch.id)
					}

					if (sourceSide === 'left') {
						if (!sourceDraft.leftChildIds.includes(nearestBranchId)) sourceDraft.leftChildIds.push(nearestBranchId)
					} else {
						if (!sourceDraft.rightChildIds.includes(nearestBranchId)) sourceDraft.rightChildIds.push(nearestBranchId)
					}
					affectedBranchIds.add(sourceBranch.id)
				}
			}

			didHandle = true
			continue
		}

		for (const branch of currentBranches) {
			const draft = getBranchDraft(editor, drafts, branch)
			if (!draftContainsChild(draft, childId)) continue

			const detachDistance = Math.max(branch.props.snapDistance || 160, 80) * DETACH_DISTANCE_MULTIPLIER
			const distance = distanceToBranchWorkArea(editor, branch, previewShape, shapeBounds)
			if (distance > detachDistance) {
				if (removeChildFromDraft(draft, childId)) affectedBranchIds.add(branch.id)
				if (previewShape.type === 'branch') affectedBranchIds.add(previewShape.id)
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

	const laidOutBranchIds: TLShapeId[] = []
	for (const branch of sortBranchesForLayout(editor, affectedBranchIds)) {
		layoutBranchChildren(editor, branch)
		laidOutBranchIds.push(branch.id)
	}

	if (laidOutBranchIds.length > 0) {
		relayoutBranchesContainingShapes(editor, laidOutBranchIds)
	}

	return didHandle
}

export function getBranchDragPreview(editor: Editor, shape: TLShape, options?: BranchDragPreviewOptions): BranchDragPreview | null {
	if (!isBranchConnectableShape(shape)) return null

	const scheduleAttachHint = options?.scheduleAttachHint ?? true
	const draggingShapeId = options?.draggingShapeId ?? (shape.id as string)
	const branches = options?.branches ?? getCurrentBranches(editor)
	const pageShapes = options?.pageShapes ?? editor.getCurrentPageShapes()
	const parentsByChildId = options?.parentsByChildId
	const shapeBounds = getPageBounds(editor, shape)

	const nearestRootAttachToBranch = getBranchRootShapeCandidate(editor, shape, branches, shapeBounds)
	const nearestSideAttachToBranch = getNearestAttachCandidate(editor, shape, branches, shapeBounds)
	const nearestAttachToBranch =
		nearestRootAttachToBranch && nearestSideAttachToBranch
			? nearestRootAttachToBranch.distance <= nearestSideAttachToBranch.distance
				? nearestRootAttachToBranch
				: nearestSideAttachToBranch
			: nearestRootAttachToBranch || nearestSideAttachToBranch
	const nearestShapeToDraggingBranch =
		shape.type === 'branch'
			? getNearestRootShapeForDraggingBranch(editor, shape as IBranchShape, pageShapes) || getNearestShapeForDraggingBranch(editor, shape as IBranchShape, pageShapes)
			: null

	const nearestAttach =
		nearestAttachToBranch && nearestShapeToDraggingBranch
			? nearestAttachToBranch.distance <= nearestShapeToDraggingBranch.distance
				? nearestAttachToBranch
				: nearestShapeToDraggingBranch
			: nearestAttachToBranch || nearestShapeToDraggingBranch

	if (nearestAttach) {
		if (!isDelayedAttachReady(shape, nearestAttach, scheduleAttachHint, draggingShapeId)) return null

		if (nearestAttach.mode === 'attach-root-to-branch') {
			return {
				mode: 'attach',
				branch: nearestAttach.branch,
				slot: 'root',
				targetShapeId: nearestAttach.targetShape?.id as string | undefined,
			}
		}

		return nearestAttach.mode === 'attach-shape-to-dragging-branch'
			? {
					mode: 'attach',
					branch: nearestAttach.branch,
					side: nearestAttach.side,
					slot: 'side',
					targetShapeId: nearestAttach.targetShape.id as string,
			  }
			: {
					mode: 'attach',
					branch: nearestAttach.branch,
					side: nearestAttach.side,
					slot: 'side',
			  }
	}

	clearDelayedAttachCandidate(draggingShapeId)

	const containingBranches =
		parentsByChildId?.get(shape.id as string) ??
		branches.filter((branch) => getAllBranchAttachedShapeIds(branch).includes(shape.id as string))

	for (const branch of containingBranches) {
		if (branch.props.rootShapeId === shape.id) continue
		const detachDistance = Math.max(branch.props.snapDistance || 160, 80) * DETACH_DISTANCE_MULTIPLIER
		const distance = distanceToBranchWorkArea(editor, branch, shape, shapeBounds)
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
	const rootParentBranch = getBranchRootParent(editor, shape.id)
	const previewShape = rootParentBranch || shape
	const preview = getBranchDragPreview(
		editor,
		previewShape,
		activeBranchDragShapeIds.has(shape.id as string)
			? {
					...getActiveBranchDragPreviewOptions(editor),
					draggingShapeId: shape.id as string,
			  }
			: undefined
	)
	if (!preview) return null

	if (preview.mode === 'attach') {
		return {
			mode: 'attach',
			draggingShapeId: shape.id as string,
			branchId: preview.branch.id,
			side: preview.side,
			slot: preview.slot,
			targetShapeId: preview.targetShapeId,
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

function buildBranchParentIndex(branches: IBranchShape[]) {
	const parentsByChildId = new Map<string, IBranchShape[]>()
	for (const branch of branches) {
		for (const childId of getAllBranchAttachedShapeIds(branch)) {
			const parents = parentsByChildId.get(childId)
			if (parents) parents.push(branch)
			else parentsByChildId.set(childId, [branch])
		}
	}
	return parentsByChildId
}

export function relayoutBranchesContainingShapes(editor: Editor, shapeIds: TLShapeId[], visited = new Set<string>()) {
	const branches = getCurrentBranches(editor)
	if (branches.length === 0) return

	const parentsByChildId = buildBranchParentIndex(branches)
	const queue = Array.from(new Set(shapeIds.map((id) => id as string)))
	const laidOutBranchIds = new Set<string>()

	for (let index = 0; index < queue.length; index++) {
		const shapeId = queue[index]
		if (visited.has(shapeId)) continue
		visited.add(shapeId)

		const parentBranches = parentsByChildId.get(shapeId)
		if (!parentBranches) continue

		for (const parentBranch of parentBranches) {
			const branchId = parentBranch.id as string
			if (laidOutBranchIds.has(branchId)) continue

			const latestBranch = editor.getShape<IBranchShape>(parentBranch.id)
			if (!latestBranch || latestBranch.type !== 'branch') continue

			laidOutBranchIds.add(branchId)
			layoutBranchChildren(editor, latestBranch)
			if (!visited.has(branchId)) queue.push(branchId)
		}
	}
}

export function relayoutBranchesContainingShape(editor: Editor, shapeId: TLShapeId, visited = new Set<string>()) {
	relayoutBranchesContainingShapes(editor, [shapeId], visited)
}

export function isShapeInBranch(editor: Editor, shapeId: TLShapeId) {
	return getCurrentBranches(editor)
		.some((shape) => shape.type === 'branch' && getAllBranchAttachedShapeIds(shape as IBranchShape).includes(shapeId as string))
}

export function pruneShapeFromBranches(editor: Editor, shapeId: TLShapeId) {
	const branches = getCurrentBranches(editor)
		.filter((shape) => shape.type === 'branch' && getAllBranchAttachedShapeIds(shape as IBranchShape).includes(shapeId as string)) as IBranchShape[]
	const relayoutSourceIds = new Set<TLShapeId>()

	for (const branch of branches) {
		const nextIds = removeChildIdFromBranch(branch, shapeId as string)
		const nextRootShapeId = branch.props.rootShapeId === shapeId ? undefined : branch.props.rootShapeId
		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: {
				...branch.props,
				...nextIds,
				rootShapeId: nextRootShapeId,
			},
		})
		const updatedBranch = editor.getShape<IBranchShape>(branch.id)
		if (updatedBranch) {
			layoutBranchChildren(editor, updatedBranch)
			relayoutSourceIds.add(updatedBranch.id)
			if (updatedBranch.props.rootShapeId) relayoutSourceIds.add(updatedBranch.props.rootShapeId as TLShapeId)
		}
	}

	if (relayoutSourceIds.size > 0) {
		relayoutBranchesContainingShapes(editor, Array.from(relayoutSourceIds))
	}
}

export function detachBranchCompletely(editor: Editor, branchId: TLShapeId) {
	const branch = editor.getShape<IBranchShape>(branchId)
	if (!branch || branch.type !== 'branch') return

	const affectedBranchIds = new Set<TLShapeId>()

	pruneShapeFromBranches(editor, branchId)

	const latestBranch = editor.getShape<IBranchShape>(branchId)
	if (!latestBranch || latestBranch.type !== 'branch') return

	const childIds = getAllBranchChildIds(latestBranch)
	const rootShapeId = latestBranch.props.rootShapeId
	if (childIds.length === 0 && !rootShapeId) return

	editor.updateShape<IBranchShape>({
		id: latestBranch.id,
		type: 'branch',
		props: {
			...latestBranch.props,
			childIds: [],
			leftChildIds: [],
			rightChildIds: [],
			rootShapeId: undefined,
		},
	})
	affectedBranchIds.add(latestBranch.id)

	for (const childId of childIds) {
		affectedBranchIds.add(childId as TLShapeId)
	}
	if (rootShapeId) affectedBranchIds.add(rootShapeId as TLShapeId)

	for (const affectedBranch of sortBranchesForLayout(editor, affectedBranchIds)) {
		layoutBranchChildren(editor, affectedBranch)
	}
}

export function detachBranchRootShape(editor: Editor, branchId: TLShapeId) {
	const branch = editor.getShape<IBranchShape>(branchId)
	if (!branch || branch.type !== 'branch' || !branch.props.rootShapeId) return false

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		props: {
			...branch.props,
			rootShapeId: undefined,
		},
	})

	const updatedBranch = editor.getShape<IBranchShape>(branch.id)
	if (updatedBranch?.type === 'branch') {
		layoutBranchChildren(editor, updatedBranch)
		relayoutBranchesContainingShapes(editor, [updatedBranch.id])
	}

	return true
}

export function getBranchRenderInfo(editor: Editor, branch: IBranchShape) {
	const rootX = getBranchRootLocalX(branch)
	const rootY = branch.props.h / 2
	const autoFrame = getBranchAutoFrameState(editor, branch)
	const rootContent = getBranchRootContent(editor, branch)
	const rootBounds = rootContent
		? {
				x: rootContent.bounds.x - branch.x,
				y: rootContent.bounds.y - branch.y,
				w: rootContent.bounds.w,
				h: rootContent.bounds.h,
		  }
		: null
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
			const sourceX = rootBounds
				? side === 'left'
					? rootBounds.x
					: rootBounds.x + rootBounds.w
				: rootX
			return {
				id,
				side,
				sourceX,
				sourceY: rootY,
				targetX,
				targetY: childLocal.centerY,
				midX: sourceX + (targetX - sourceX) * 0.42,
			}
		})
		.filter(Boolean) as Array<{ id: string; side: BranchSide; sourceX: number; sourceY: number; targetX: number; targetY: number; midX: number }>

	return {
		rootX,
		rootY,
		rootRadius: ROOT_RADIUS,
		rootShapeId: rootContent?.shape.id as string | undefined,
		rootBounds,
		autoFrame,
		children,
	}
}
