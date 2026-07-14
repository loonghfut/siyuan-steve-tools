import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape, BranchChildShape } from './branch-shape-types'
import { BranchInteractionHint, setBranchInteractionHint } from './branch-interaction-state'

const CONNECTABLE_TYPES = new Set(['card', 'single-block', 'branch'])
const DEFAULT_NODE_WIDTH = 300
const DEFAULT_NODE_HEIGHT = 80
const ROOT_RADIUS = 7
const ROOT_DIAMETER = ROOT_RADIUS * 2
const EMPTY_BRANCH_RADIUS = 12
const EMPTY_BRANCH_DIAMETER = EMPTY_BRANCH_RADIUS * 2
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

type BranchRootAttachCandidate = {
	mode: 'attach-root-to-branch'
	branch: IBranchShape
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

export function canAttachShapeToBranch(editor: Editor, branch: IBranchShape, shape: TLShape) {
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

function getAttachCandidateKey(
	attach:
		| BranchAttachToBranchCandidate
		| BranchRootAttachCandidate
		| { branch: IBranchShape; side?: BranchSide; slot?: BranchAttachmentSlot; mode?: 'attach-to-branch'; targetShapeId?: string }
) {
	const mode = attach.mode ?? 'attach-to-branch'
	const targetShapeId =
		'targetShapeId' in attach ? attach.targetShapeId : undefined
	const side = 'side' in attach ? attach.side : undefined
	const slot = 'slot' in attach ? attach.slot : undefined
	return targetShapeId
		? `${mode}:${attach.branch.id}:${side ?? slot ?? 'root'}:${targetShapeId}`
		: `${mode}:${attach.branch.id}:${side ?? slot ?? 'root'}`
}

function isDelayedAttachReady(
	shape: TLShape,
	attach: BranchAttachToBranchCandidate | BranchRootAttachCandidate,
	scheduleHint: boolean,
	draggingShapeId = shape.id as string
) {
	const shapeId = draggingShapeId
	const key = getAttachCandidateKey(attach)
	const current = delayedAttachCandidates.get(shapeId)
	const now = nowMs()
	const slot: BranchAttachmentSlot = attach.mode === 'attach-root-to-branch' ? 'root' : 'side'

	if (!current || current.key !== key) {
		if (current?.timeoutId) clearTimeout(current.timeoutId)
		const nextCandidate = {
			key,
			since: now,
			branchId: attach.branch.id as string,
			side: 'side' in attach ? attach.side : undefined,
			slot,
			targetShapeId: undefined,
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
	const rootOwner = getBranchRootParent(editor, rootShapeId)
	if (!rootOwner || rootOwner.id !== branch.id) return null

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

/**
 * A branch's root content is presentation only. Once a card or single-block
 * owns a center branch, all structural branch relationships must point to that
 * branch, never to the root content shape itself.
 */
function getCanonicalBranchChildId(editor: Editor, branch: IBranchShape, childId: TLShapeId | string) {
	const child = editor.getShape(childId as TLShapeId)
	if (!isBranchConnectableShape(child)) return null

	const rootBranch = isBranchRootContentShape(child) ? getBranchRootParent(editor, child.id) : null
	const canonicalChild = rootBranch || child
	if (canonicalChild.id === branch.id) return null
	if (!canAttachShapeToBranch(editor, branch, canonicalChild)) return null

	return canonicalChild.id as string
}

function normalizeBranchChildIds(editor: Editor, branch: IBranchShape, ids: Iterable<TLShapeId | string>) {
	const normalized: string[] = []
	for (const id of ids) {
		const canonicalId = getCanonicalBranchChildId(editor, branch, id)
		if (canonicalId && !normalized.includes(canonicalId)) normalized.push(canonicalId)
	}
	return normalized
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
	const shapeCenter = getPageShapeCenter(editor, shape)

	for (const branch of branches) {
		if (!canBranchWrapRootShape(branch, shape)) continue

		const currentRootShapeId = branch.props.rootShapeId
		const alreadyRoot = currentRootShapeId === shape.id
		if (currentRootShapeId && !alreadyRoot) continue

		const root = getBranchRootPagePoint(editor, branch)
		const distance = distanceBetweenPoints(shapeCenter, root)
		const snapDistance = Math.max((branch.props.snapDistance || 140) * ROOT_ATTACH_DISTANCE_MULTIPLIER, 36)
		if (distance <= snapDistance && (!nearestAttach || distance < nearestAttach.distance)) {
			nearestAttach = { mode: 'attach-root-to-branch', branch, distance }
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
	const pagePoint = getShapePagePoint(editor, shape)
	return {
		x: pagePoint.x,
		y: pagePoint.y,
		w,
		h,
		centerX: pagePoint.x + w / 2,
		centerY: pagePoint.y + h / 2,
	}
}

/**
 * `TLShape.x/y` are relative to the parent. Branch relationships, however,
 * are visual relationships and must always be calculated in page space.
 */
function getShapePagePoint(editor: Editor, shape: TLShape) {
	const transform = editor.getShapePageTransform(shape)
	if (transform) return transform.point()
	return { x: shape.x, y: shape.y }
}

function getPointInShapeParentSpace(editor: Editor, shape: TLShape, pagePoint: { x: number; y: number }) {
	const parent = editor.getShapeParent(shape)
	return parent ? editor.getPointInShapeSpace(parent, pagePoint) : pagePoint
}

function getPagePositionUpdate(editor: Editor, shape: TLShape, pageX: number, pageY: number) {
	const local = getPointInShapeParentSpace(editor, shape, { x: pageX, y: pageY })
	return { id: shape.id, type: shape.type, x: local.x, y: local.y }
}

function getPageShapeCenter(editor: Editor, shape: TLShape) {
	const geometry = editor.getShapeGeometry(shape)
	return editor.getShapePageTransform(shape).applyToPoint(geometry.bounds.center)
}

function getPagePositionUpdateForBounds(editor: Editor, shape: TLShape, nextX: number, nextY: number, currentBounds: Bounds) {
	// A rotated shape's page bounds are axis-aligned. Translate its page origin
	// by the bounds delta so the resulting bounds, rather than the origin, lands
	// at the layout position.
	const currentPagePoint = getShapePagePoint(editor, shape)
	return getPagePositionUpdate(
		editor,
		shape,
		currentPagePoint.x + nextX - currentBounds.x,
		currentPagePoint.y + nextY - currentBounds.y
	)
}

function getBranchRootPagePoint(editor: Editor, branch: IBranchShape) {
	return editor.getShapePageTransform(branch).applyToPoint({
		x: getBranchRootLocalX(branch),
		y: branch.props.h / 2,
	})
}

function getBranchRootLocalX(branch: IBranchShape) {
	return branch.props.rootX ?? branch.props.w / 2
}

function getBranchSideForShape(editor: Editor, branch: IBranchShape, child: TLShape, childBounds = getPageBounds(editor, child)): BranchSide {
	const root = getBranchRootPagePoint(editor, branch)
	if (!childBounds) return 'right'
	const childCenter = child.type === 'branch' ? getBranchRootPagePoint(editor, child as IBranchShape) : getPageShapeCenter(editor, child)
	return childCenter.x < root.x ? 'left' : 'right'
}

function getSideChildIds(branch: IBranchShape, side: BranchSide) {
	if (side === 'left') return branch.props.leftChildIds || []
	return branch.props.rightChildIds
}

function getChildSideInBranch(branch: IBranchShape, childId: string): BranchSide | null {
	if ((branch.props.leftChildIds || []).includes(childId)) return 'left'
	if (branch.props.rightChildIds.includes(childId)) return 'right'
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
	return Array.from(new Set([...(branch.props.leftChildIds || []), ...branch.props.rightChildIds]))
}

export function getAllBranchAttachedShapeIds(branch: IBranchShape) {
	return Array.from(new Set([...getAllBranchChildIds(branch), ...(branch.props.rootShapeId ? [branch.props.rootShapeId] : [])]))
}

export function isShapeInBranchTree(
	editor: Editor,
	branchId: TLShapeId | string,
	targetShapeId: TLShapeId | string,
	visited = new Set<string>()
) {
	const id = branchId as string
	const targetId = targetShapeId as string
	if (visited.has(id)) return false
	visited.add(id)

	const branch = editor.getShape<IBranchShape>(branchId as TLShapeId)
	if (!branch || branch.type !== 'branch') return false

	for (const attachedId of getAllBranchAttachedShapeIds(branch)) {
		if (attachedId === targetId) return true
		const attachedShape = editor.getShape(attachedId as TLShapeId)
		if (attachedShape?.type === 'branch' && isShapeInBranchTree(editor, attachedShape.id, targetShapeId, visited)) {
			return true
		}
	}

	return false
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

	const root = getBranchRootPagePoint(editor, branch)
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
	const branchPageBounds = editor.getShapePageBounds(branch.id)
	const branchBounds = branchPageBounds
		? { x: branchPageBounds.x, y: branchPageBounds.y, w: branchPageBounds.width, h: branchPageBounds.height }
		: { x: getShapePagePoint(editor, branch).x, y: getShapePagePoint(editor, branch).y, w: branch.props.w, h: branch.props.h }
	const minX = branchBounds.x - padding
	const minY = branchBounds.y - padding
	const maxX = branchBounds.x + branchBounds.w + padding
	const maxY = branchBounds.y + branchBounds.h + padding
	const clampedX = Math.max(minX, Math.min(childBounds.centerX, maxX))
	const clampedY = Math.max(minY, Math.min(childBounds.centerY, maxY))
	return Math.hypot(childBounds.centerX - clampedX, childBounds.centerY - clampedY)
}

function normalizeChildIds(editor: Editor, branch: IBranchShape, extraId?: TLShapeId | string) {
	const ids = getAllBranchChildIds(branch)
	if (extraId && !ids.includes(extraId)) ids.push(extraId)
	return normalizeBranchChildIds(editor, branch, ids)
}

function normalizeSideChildIds(editor: Editor, branch: IBranchShape, side: BranchSide, extraId?: TLShapeId | string) {
	const ids = [...getSideChildIds(branch, side)]
	if (extraId && !ids.includes(extraId)) ids.push(extraId as string)
	return normalizeBranchChildIds(editor, branch, ids)
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
		const childPagePoint = getShapePagePoint(editor, child)
		updates.push(getPagePositionUpdate(editor, child, childPagePoint.x + dx, childPagePoint.y + dy))

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
	// When the root and its branch are selected together, tldraw translates
	// both records in the same drag. The branch's onBeforeUpdate handler also
	// translates its unselected descendants, so syncing the branch here would
	// apply the same drag delta a second time.
	if (editor.getSelectedShapeIds().some((shapeId) => shapeId === branch.id)) return false

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

function removeChildIdsFromBranch(branch: IBranchShape, childIds: Set<string>) {
	const leftChildIds = (branch.props.leftChildIds || []).filter((id) => !childIds.has(id))
	const rightChildIds = branch.props.rightChildIds.filter((id) => !childIds.has(id))
	return {
		leftChildIds,
		rightChildIds,
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
	const childSet = new Set(normalizeBranchChildIds(editor, branch, childIds))
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
		const oldRootPage = getBranchRootPagePoint(editor, branch)
		const nextX = oldRootPage.x - EMPTY_BRANCH_RADIUS
		const nextY = oldRootPage.y - EMPTY_BRANCH_RADIUS
		const nextPosition = getPointInShapeParentSpace(editor, branch, { x: nextX, y: nextY })
		const nextChildIds: string[] = []
		const isUnchanged =
			sameNumber(branch.x, nextPosition.x) &&
			sameNumber(branch.y, nextPosition.y) &&
			sameNumber(branch.props.w, EMPTY_BRANCH_DIAMETER) &&
			sameNumber(branch.props.h, EMPTY_BRANCH_DIAMETER) &&
			sameNumber(branch.props.rootX, EMPTY_BRANCH_RADIUS) &&
			sameIds(branch.props.leftChildIds || [], nextChildIds) &&
			sameIds(branch.props.rightChildIds || [], nextChildIds) &&
			!branch.props.rootShapeId

		if (isUnchanged) return

		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			x: nextPosition.x,
			y: nextPosition.y,
			props: {
				...branch.props,
				w: EMPTY_BRANCH_DIAMETER,
				h: EMPTY_BRANCH_DIAMETER,
				leftChildIds: nextChildIds,
				rightChildIds: nextChildIds,
				rootShapeId: undefined,
				rootX: EMPTY_BRANCH_RADIUS,
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
		? getPageShapeCenter(editor, rootContent.shape)
		: getBranchRootPagePoint(editor, branch)
	const rootLocalX = Math.max(leftWidth, ROOT_RADIUS) + framePadding + rootWidth / 2
	const branchWidth = rootLocalX + rootWidth / 2 + Math.max(rightWidth, ROOT_RADIUS) + framePadding
	const branchX = oldRootPage.x - rootLocalX
	const branchY = oldRootPage.y - branchHeight / 2
	const branchPosition = getPointInShapeParentSpace(editor, branch, { x: branchX, y: branchY })
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

			if (Math.abs(bounds.x - nextX) > 0.5 || Math.abs(bounds.y - nextY) > 0.5) {
				const dx = nextX - bounds.x
				const dy = nextY - bounds.y
				movedIds.add(shape.id as string)
				updates.push(getPagePositionUpdateForBounds(editor, shape as TLShape, nextX, nextY, bounds))

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
		!sameNumber(branch.x, branchPosition.x) ||
		!sameNumber(branch.y, branchPosition.y) ||
		!sameNumber(branch.props.w, branchWidth) ||
		!sameNumber(branch.props.h, branchHeight) ||
		!sameNumber(branch.props.rootX, rootLocalX) ||
		!sameIds(branch.props.leftChildIds || [], nextLeftChildIds) ||
		!sameIds(branch.props.rightChildIds, nextRightChildIds) ||
		branch.props.rootShapeId !== nextRootShapeId

	if (branchChanged) {
		updates.push({
			id: branch.id,
			type: 'branch',
			x: branchPosition.x,
			y: branchPosition.y,
			props: {
				...branch.props,
				w: branchWidth,
				h: branchHeight,
				leftChildIds: nextLeftChildIds,
				rightChildIds: nextRightChildIds,
				rootShapeId: nextRootShapeId,
				rootX: rootLocalX,
			},
		})
	}

	if (updates.length > 0) editor.updateShapes(updates)
}

/**
 * Repairs branch props that reference a center branch's root content instead
 * of the branch itself. This is safe to run after any programmatic branch
 * relation update and only touches malformed relationships.
 */
export function repairBranchStructure(editor: Editor) {
	const branches = getCurrentBranches(editor)

	for (const branch of branches) {
		if (!needsBranchStructureRepair(editor, branch, branches)) continue
		const latestBranch = editor.getShape<IBranchShape>(branch.id)
		if (latestBranch?.type === 'branch') layoutBranchChildren(editor, latestBranch)
	}
}

function needsBranchStructureRepair(editor: Editor, branch: IBranchShape, branches: IBranchShape[]) {
	if (branch.props.rootShapeId) {
		const rootOwner = getBranchRootParent(editor, branch.props.rootShapeId, branches)
		if (!rootOwner || rootOwner.id !== branch.id) return true
	}

	return getAllBranchChildIds(branch).some((childId) => {
		const child = editor.getShape(childId as TLShapeId)
		if (child?.type !== 'card' && child?.type !== 'single-block') return false

		return !!getBranchRootParent(editor, child.id, branches)
	})
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
		sameIds(rightChildIds, branch.props.rightChildIds) &&
		rootShapeId === branch.props.rootShapeId
	) {
		return false
	}

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		props: {
			...branch.props,
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
	const nearestAttach = nearestAttachToBranch

	if (nearestAttach) {
		if (!isDelayedAttachReady(shape, nearestAttach, scheduleAttachHint, draggingShapeId)) return null

		if (nearestAttach.mode === 'attach-root-to-branch') {
			return {
				mode: 'attach',
				branch: nearestAttach.branch,
				slot: 'root',
			}
		}

		return {
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

export function alignBranchToRootContent(editor: Editor, branch: IBranchShape) {
	if (!branch.props.rootShapeId) return false

	const rootContent = getBranchRootContent(editor, branch)
	if (!rootContent) return false

	const rootCenter = getPageShapeCenter(editor, rootContent.shape)
	const currentRoot = getBranchRootPagePoint(editor, branch)
	const currentBranchOrigin = getShapePagePoint(editor, branch)
	const expectedPosition = getPointInShapeParentSpace(editor, branch, {
		x: currentBranchOrigin.x + rootCenter.x - currentRoot.x,
		y: currentBranchOrigin.y + rootCenter.y - currentRoot.y,
	})
	if (Math.abs(branch.x - expectedPosition.x) <= 0.5 && Math.abs(branch.y - expectedPosition.y) <= 0.5) return false

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		x: expectedPosition.x,
		y: expectedPosition.y,
	})

	return true
}

export function isShapeInBranch(editor: Editor, shapeId: TLShapeId) {
	return getCurrentBranches(editor)
		.some((shape) => shape.type === 'branch' && getAllBranchAttachedShapeIds(shape as IBranchShape).includes(shapeId as string))
}

export function pruneShapesFromBranches(editor: Editor, shapeIds: TLShapeId[]) {
	const deletedIds = new Set(shapeIds.map((shapeId) => shapeId as string))
	if (deletedIds.size === 0) return

	const branches = getCurrentBranches(editor)
		.filter((shape) =>
			shape.type === 'branch' && getAllBranchAttachedShapeIds(shape as IBranchShape).some((id) => deletedIds.has(id))
		) as IBranchShape[]
	const relayoutSourceIds = new Set<TLShapeId>()

	for (const branch of branches) {
		const nextIds = removeChildIdsFromBranch(branch, deletedIds)
		const nextRootShapeId = branch.props.rootShapeId && deletedIds.has(branch.props.rootShapeId)
			? undefined
			: branch.props.rootShapeId
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
		}
	}

	if (relayoutSourceIds.size > 0) {
		relayoutBranchesContainingShapes(editor, Array.from(relayoutSourceIds))
	}
}

export function pruneShapeFromBranches(editor: Editor, shapeId: TLShapeId) {
	pruneShapesFromBranches(editor, [shapeId])
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
	const autoFrame = getBranchAutoFrameState(editor, branch)
	const rootContent = getBranchRootContent(editor, branch)
	const toBranchLocal = (pagePoint: { x: number; y: number }) => editor.getPointInShapeSpace(branch, pagePoint)
	const rootBounds = rootContent
		? (() => {
				const local = toBranchLocal(rootContent.bounds)
				return {
					x: local.x,
					y: local.y,
					w: rootContent.bounds.w,
					h: rootContent.bounds.h,
				}
			})()
		: null
	const rootCenter = rootContent ? toBranchLocal(getPageShapeCenter(editor, rootContent.shape)) : null
	const rootX = rootCenter ? rootCenter.x : getBranchRootLocalX(branch)
	const rootY = rootCenter ? rootCenter.y : branch.props.h / 2
	const children = normalizeChildIds(editor, branch)
		.map((id) => {
			const child = editor.getShape(id as TLShapeId)
			if (!child || !isBranchConnectableShape(child)) return null
			const childPageBounds = getPageBounds(editor, child)
			if (!childPageBounds) return null
			const local = toBranchLocal(childPageBounds)
			const childCenter = toBranchLocal(
				child.type === 'branch' ? getBranchRootPagePoint(editor, child as IBranchShape) : getPageShapeCenter(editor, child)
			)
			const childLocal = {
				x: local.x,
				y: local.y,
				w: childPageBounds.w,
				h: childPageBounds.h,
				centerY: childCenter.y,
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
