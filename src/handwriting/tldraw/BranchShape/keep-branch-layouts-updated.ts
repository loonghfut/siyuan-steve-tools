import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape } from './branch-shape-types'
import {
	getAllBranchChildIds,
	isBranchConnectableShape,
	layoutBranchChildren,
	pruneShapesFromBranches,
	relayoutBranchesContainingShapes,
} from './branch-layout'

const BRANCH_CHILD_TYPES = new Set(['card', 'single-block', 'branch'])
const REGISTERED_EDITORS = new WeakSet<Editor>()
const EXPLICIT_CREATED_BRANCH_RELATIONS = new WeakMap<Editor, Set<string>>()

export function markExplicitCreatedBranchRelations(editor: Editor, branchIds: Iterable<TLShapeId | string>) {
	let ids = EXPLICIT_CREATED_BRANCH_RELATIONS.get(editor)
	if (!ids) {
		ids = new Set<string>()
		EXPLICIT_CREATED_BRANCH_RELATIONS.set(editor, ids)
	}
	for (const branchId of branchIds) ids.add(branchId as string)
}

function consumeExplicitCreatedBranchRelation(editor: Editor, branchId: TLShapeId | string) {
	const ids = EXPLICIT_CREATED_BRANCH_RELATIONS.get(editor)
	if (!ids?.has(branchId as string)) return false

	ids.delete(branchId as string)
	if (ids.size === 0) EXPLICIT_CREATED_BRANCH_RELATIONS.delete(editor)
	return true
}

function getShapeWidth(shape: TLShape) {
	return typeof (shape as any).props?.w === 'number' ? (shape as any).props.w : null
}

function getShapeHeight(shape: TLShape) {
	return typeof (shape as any).props?.h === 'number' ? (shape as any).props.h : null
}

function getBranchRootX(shape: TLShape) {
	if (shape.type !== 'branch') return null
	const props = (shape as IBranchShape).props
	return props.rootX ?? props.w / 2
}

function didRelevantBoundsChange(prev: TLShape, next: TLShape) {
	if (!BRANCH_CHILD_TYPES.has(next.type)) return false

	if (getShapeWidth(prev) !== getShapeWidth(next)) return true
	if (getShapeHeight(prev) !== getShapeHeight(next)) return true
	if (getBranchRootX(prev) !== getBranchRootX(next)) return true

	return false
}

function getShapeSignature(shape: TLShape) {
	return `${shape.type}:${getShapeWidth(shape) ?? ''}:${getShapeHeight(shape) ?? ''}:${getBranchRootX(shape) ?? ''}`
}

function getRoundedDeltaKey(dx: number, dy: number) {
	return `${Math.round(dx * 1000) / 1000}:${Math.round(dy * 1000) / 1000}`
}

function getShapeBounds(shape: TLShape) {
	const w = getShapeWidth(shape)
	const h = getShapeHeight(shape)
	if (w == null || h == null) return null
	return {
		x: shape.x,
		y: shape.y,
		w,
		h,
		centerY: shape.y + h / 2,
	}
}

function isPromotableBranchChild(shape: TLShape | undefined) {
	return !!shape && (shape.type === 'card' || shape.type === 'single-block')
}

function replaceChildId(ids: string[] | undefined, deletedId: string, replacementId: string) {
	const sourceIds = ids || []
	const nextIds: string[] = []
	let didReplace = false

	for (const id of sourceIds) {
		if (id === deletedId) {
			if (!nextIds.includes(replacementId)) nextIds.push(replacementId)
			didReplace = true
			continue
		}

		if (id === replacementId && nextIds.includes(replacementId)) continue
		nextIds.push(id)
	}

	return { nextIds, didReplace }
}

function promoteOnlyChildOfDeletedBranch(editor: Editor, deletedBranch: IBranchShape) {
	const childIds = getAllBranchChildIds(deletedBranch)
	if (childIds.length !== 1) return

	const promotedChildId = childIds[0]
	const promotedChild = editor.getShape(promotedChildId as TLShapeId)
	if (!isPromotableBranchChild(promotedChild)) return

	const affectedParentIds = new Set<TLShapeId>()
	const deletedBranchId = deletedBranch.id as string

	for (const candidate of editor.getCurrentPageShapes()) {
		if (candidate.type !== 'branch' || candidate.id === deletedBranch.id) continue

		const parentBranch = candidate as IBranchShape
		const leftResult = replaceChildId(parentBranch.props.leftChildIds, deletedBranchId, promotedChildId)
		const rightResult = replaceChildId(
			parentBranch.props.rightChildIds || parentBranch.props.childIds || [],
			deletedBranchId,
			promotedChildId
		)

		if (!leftResult.didReplace && !rightResult.didReplace) continue

		editor.updateShape<IBranchShape>({
			id: parentBranch.id,
			type: 'branch',
			props: {
				...parentBranch.props,
				childIds: rightResult.nextIds,
				leftChildIds: leftResult.nextIds,
				rightChildIds: rightResult.nextIds,
			},
		})
		affectedParentIds.add(parentBranch.id)
	}

	for (const parentId of affectedParentIds) {
		const updatedParent = editor.getShape<IBranchShape>(parentId)
		if (updatedParent?.type === 'branch') {
			layoutBranchChildren(editor, updatedParent)
		}
	}

	if (affectedParentIds.size > 0) {
		relayoutBranchesContainingShapes(editor, [promotedChildId as TLShapeId, ...Array.from(affectedParentIds)])
	}
}

function inferCreatedBranchChildrenFromLayout(
	editor: Editor,
	branch: IBranchShape,
	createdShapeIds: Set<string>
) {
	const branchRootX = branch.x + getBranchRootX(branch)!
	const horizontalGap = Math.max(branch.props.horizontalGap || 80, 20)
	const expectedLeftEdgeX = branchRootX - horizontalGap
	const expectedRightEdgeX = branchRootX + horizontalGap
	const tolerance = Math.max(2, horizontalGap * 0.05)
	const leftCandidates: Array<{ id: string; centerY: number }> = []
	const rightCandidates: Array<{ id: string; centerY: number }> = []

	for (const id of createdShapeIds) {
		if (id === branch.id) continue
		const shape = editor.getShape(id as TLShapeId)
		if (!shape || !isBranchConnectableShape(shape)) continue

		const bounds = getShapeBounds(shape)
		if (!bounds) continue
		const isInBranchYRange = bounds.centerY >= branch.y - tolerance && bounds.centerY <= branch.y + branch.props.h + tolerance
		if (!isInBranchYRange) continue

		if (Math.abs(bounds.x + bounds.w - expectedLeftEdgeX) <= tolerance) {
			leftCandidates.push({ id, centerY: bounds.centerY })
		} else if (Math.abs(bounds.x - expectedRightEdgeX) <= tolerance) {
			rightCandidates.push({ id, centerY: bounds.centerY })
		}
	}

	const byCenterY = (a: { centerY: number }, b: { centerY: number }) => a.centerY - b.centerY
	leftCandidates.sort(byCenterY)
	rightCandidates.sort(byCenterY)

	return {
		leftChildIds: leftCandidates.map(({ id }) => id),
		rightChildIds: rightCandidates.map(({ id }) => id),
	}
}

function findCreatedShapeIdRemaps(
	editor: Editor,
	branch: IBranchShape,
	createdShapeIds: Set<string>
) {
	const referencedChildIds = Array.from(
		new Set([
			...(branch.props.childIds || []),
			...(branch.props.leftChildIds || []),
			...(branch.props.rightChildIds || []),
			...(branch.props.rootShapeId ? [branch.props.rootShapeId] : []),
		])
	)
	const createdCandidates = Array.from(createdShapeIds)
		.filter((id) => id !== branch.id)
		.map((id) => editor.getShape(id as TLShapeId))
		.filter((shape): shape is TLShape => !!shape && isBranchConnectableShape(shape))

	const deltaCounts = new Map<string, number>()
	for (const childId of referencedChildIds) {
		const sourceShape = editor.getShape(childId as TLShapeId)
		if (!sourceShape || !isBranchConnectableShape(sourceShape)) continue

		const sourceSignature = getShapeSignature(sourceShape)
		for (const candidate of createdCandidates) {
			if (getShapeSignature(candidate) !== sourceSignature) continue
			const deltaKey = getRoundedDeltaKey(candidate.x - sourceShape.x, candidate.y - sourceShape.y)
			deltaCounts.set(deltaKey, (deltaCounts.get(deltaKey) || 0) + 1)
		}
	}

	let bestDeltaKey: string | null = null
	let bestDeltaCount = 0
	for (const [deltaKey, count] of deltaCounts) {
		if (count > bestDeltaCount) {
			bestDeltaKey = deltaKey
			bestDeltaCount = count
		}
	}

	if (!bestDeltaKey) return new Map<string, string>()

	const [dxText, dyText] = bestDeltaKey.split(':')
	const dx = Number(dxText)
	const dy = Number(dyText)
	const remainingCandidates = new Map<string, TLShape[]>()

	for (const candidate of createdCandidates) {
		const signature = getShapeSignature(candidate)
		const existing = remainingCandidates.get(signature)
		if (existing) existing.push(candidate)
		else remainingCandidates.set(signature, [candidate])
	}

	const remaps = new Map<string, string>()
	for (const childId of referencedChildIds) {
		const sourceShape = editor.getShape(childId as TLShapeId)
		if (!sourceShape || !isBranchConnectableShape(sourceShape)) continue

		const signature = getShapeSignature(sourceShape)
		const candidates = remainingCandidates.get(signature)
		if (!candidates || candidates.length === 0) continue

		const expectedX = sourceShape.x + dx
		const expectedY = sourceShape.y + dy
		const matchedIndex = candidates.findIndex(
			(candidate) => Math.abs(candidate.x - expectedX) <= 0.001 && Math.abs(candidate.y - expectedY) <= 0.001
		)
		if (matchedIndex === -1) continue

		const [matchedShape] = candidates.splice(matchedIndex, 1)
		remaps.set(childId, matchedShape.id as string)
	}

	return remaps
}

function remapCreatedBranchChildren(
	editor: Editor,
	branch: IBranchShape,
	createdShapeIds: Set<string>
) {
	const idRemaps = findCreatedShapeIdRemaps(editor, branch, createdShapeIds)
	const inferredChildren = idRemaps.size === 0 ? inferCreatedBranchChildrenFromLayout(editor, branch, createdShapeIds) : null
	const remapIds = (
		ids: string[] | undefined,
		fallbackIds: string[] = [],
		options?: { preserveExistingIds?: boolean }
	) => {
		let fallbackIndex = 0
		return (
		(ids || [])
			.map((id) => {
				const remappedId = idRemaps.get(id)
				if (remappedId && editor.getShape(remappedId as TLShapeId)) return remappedId
				if (createdShapeIds.has(id) && editor.getShape(id as TLShapeId)) return id
				if (options?.preserveExistingIds && editor.getShape(id as TLShapeId)) return id
				const fallbackId = fallbackIds[fallbackIndex++]
				if (fallbackId && editor.getShape(fallbackId as TLShapeId)) return fallbackId
				return null
			})
			.filter((id): id is string => !!id)
		)
	}

	const sourceRightChildIds = branch.props.rightChildIds || branch.props.childIds
	const nextChildIds = remapIds(branch.props.childIds, inferredChildren?.rightChildIds)
	const nextLeftChildIds = remapIds(branch.props.leftChildIds, inferredChildren?.leftChildIds)
	const nextRightChildIds = remapIds(sourceRightChildIds, inferredChildren?.rightChildIds)
	const nextRootShapeIds = remapIds(branch.props.rootShapeId ? [branch.props.rootShapeId] : [], [], { preserveExistingIds: true })
	const nextRootShapeId = nextRootShapeIds[0]

	const didChange =
		nextChildIds.length !== (branch.props.childIds || []).length ||
		nextLeftChildIds.length !== (branch.props.leftChildIds || []).length ||
		nextRightChildIds.length !== (sourceRightChildIds || []).length ||
		nextChildIds.some((id, index) => id !== (branch.props.childIds || [])[index]) ||
		nextLeftChildIds.some((id, index) => id !== (branch.props.leftChildIds || [])[index]) ||
		nextRightChildIds.some((id, index) => id !== (sourceRightChildIds || [])[index]) ||
		nextRootShapeId !== branch.props.rootShapeId

	if (!didChange) return false

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		props: {
			...branch.props,
			childIds: nextChildIds,
			leftChildIds: nextLeftChildIds,
			rightChildIds: nextRightChildIds,
			rootShapeId: nextRootShapeId,
		},
	})

	return true
}

export function keepBranchLayoutsUpdated(editor: Editor) {
	if (REGISTERED_EDITORS.has(editor)) return
	REGISTERED_EDITORS.add(editor)

	let pendingShapeIds = new Set<string>()
	let pendingDeletedShapes = new Map<string, TLShape>()
	let pendingCreatedShapeIds = new Set<string>()
	let pendingCreatedBranchIds = new Set<string>()
	let isUpdating = false

	editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source === 'remote' || isUpdating) return

		pendingCreatedShapeIds.add(shape.id as string)
		if (shape.type !== 'branch') return

		const branch = shape as IBranchShape
		if ((branch.props.childIds || []).length === 0 && (branch.props.leftChildIds || []).length === 0 && (branch.props.rightChildIds || []).length === 0 && !branch.props.rootShapeId) {
			return
		}

		pendingCreatedBranchIds.add(shape.id as string)
	})

	editor.sideEffects.registerAfterChangeHandler('shape', (prev, next, source) => {
		if (source === 'remote' || isUpdating) return
		if (!didRelevantBoundsChange(prev, next)) return

		pendingShapeIds.add(next.id as string)
	})

	editor.sideEffects.registerAfterDeleteHandler('shape', (shape, source) => {
		if (source === 'remote' || isUpdating) return
		if (!BRANCH_CHILD_TYPES.has(shape.type)) return

		pendingDeletedShapes.set(shape.id as string, shape)
	})

	editor.sideEffects.registerOperationCompleteHandler(() => {
		if (
			(
				pendingShapeIds.size === 0 &&
				pendingDeletedShapes.size === 0 &&
				pendingCreatedShapeIds.size === 0 &&
				pendingCreatedBranchIds.size === 0
			) ||
			isUpdating
		) {
			return
		}

		const shapeIds = Array.from(pendingShapeIds)
		const deletedShapes = Array.from(pendingDeletedShapes.values())
		const createdShapeIds = new Set(pendingCreatedShapeIds)
		const createdBranchIds = Array.from(pendingCreatedBranchIds)
		pendingShapeIds = new Set()
		pendingDeletedShapes = new Map()
		pendingCreatedShapeIds = new Set()
		pendingCreatedBranchIds = new Set()
		isUpdating = true

		try {
			for (const branchId of createdBranchIds) {
				const branch = editor.getShape<IBranchShape>(branchId as TLShapeId)
				if (!branch || branch.type !== 'branch') continue
				if (consumeExplicitCreatedBranchRelation(editor, branchId)) continue

				if (remapCreatedBranchChildren(editor, branch, createdShapeIds)) {
					const updatedBranch = editor.getShape<IBranchShape>(branch.id)
					if (updatedBranch?.type === 'branch') {
						layoutBranchChildren(editor, updatedBranch)
					}
				}
			}

			for (const shape of deletedShapes) {
				if (shape.type === 'branch') {
					promoteOnlyChildOfDeletedBranch(editor, shape as IBranchShape)
				}
			}

			if (deletedShapes.length > 0) {
				pruneShapesFromBranches(editor, deletedShapes.map((shape) => shape.id as TLShapeId))
			}

			if (shapeIds.length > 0) {
				relayoutBranchesContainingShapes(editor, shapeIds as TLShapeId[])
			}
		} finally {
			isUpdating = false
		}
	})
}
