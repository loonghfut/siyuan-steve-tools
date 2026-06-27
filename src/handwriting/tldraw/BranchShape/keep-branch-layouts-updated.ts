import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape } from './branch-shape-types'
import { isBranchConnectableShape, layoutBranchChildren, pruneShapeFromBranches, relayoutBranchesContainingShapes } from './branch-layout'

const BRANCH_CHILD_TYPES = new Set(['card', 'single-block', 'branch'])
const REGISTERED_EDITORS = new WeakSet<Editor>()

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

function findCreatedShapeIdRemaps(
	editor: Editor,
	branch: IBranchShape,
	createdShapeIds: Set<string>
) {
	const referencedChildIds = Array.from(
		new Set([...(branch.props.childIds || []), ...(branch.props.leftChildIds || []), ...(branch.props.rightChildIds || [])])
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
	const remapIds = (ids: string[] | undefined) =>
		(ids || [])
			.map((id) => idRemaps.get(id))
			.filter((id): id is string => !!id && !!editor.getShape(id as TLShapeId))

	const nextChildIds = remapIds(branch.props.childIds)
	const nextLeftChildIds = remapIds(branch.props.leftChildIds)
	const nextRightChildIds = remapIds(branch.props.rightChildIds)

	const didChange =
		nextChildIds.length !== (branch.props.childIds || []).length ||
		nextLeftChildIds.length !== (branch.props.leftChildIds || []).length ||
		nextRightChildIds.length !== (branch.props.rightChildIds || []).length ||
		nextChildIds.some((id, index) => id !== (branch.props.childIds || [])[index]) ||
		nextLeftChildIds.some((id, index) => id !== (branch.props.leftChildIds || [])[index]) ||
		nextRightChildIds.some((id, index) => id !== (branch.props.rightChildIds || [])[index])

	if (!didChange) return false

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		props: {
			...branch.props,
			childIds: nextChildIds,
			leftChildIds: nextLeftChildIds,
			rightChildIds: nextRightChildIds,
		},
	})

	return true
}

export function keepBranchLayoutsUpdated(editor: Editor) {
	if (REGISTERED_EDITORS.has(editor)) return
	REGISTERED_EDITORS.add(editor)

	let pendingShapeIds = new Set<string>()
	let pendingDeletedShapeIds = new Set<string>()
	let pendingCreatedShapeIds = new Set<string>()
	let pendingCreatedBranchIds = new Set<string>()
	let isUpdating = false

	editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source === 'remote' || isUpdating) return

		pendingCreatedShapeIds.add(shape.id as string)
		if (shape.type !== 'branch') return

		const branch = shape as IBranchShape
		if ((branch.props.childIds || []).length === 0 && (branch.props.leftChildIds || []).length === 0 && (branch.props.rightChildIds || []).length === 0) {
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

		pendingDeletedShapeIds.add(shape.id as string)
	})

	editor.sideEffects.registerOperationCompleteHandler(() => {
		if (
			(
				pendingShapeIds.size === 0 &&
				pendingDeletedShapeIds.size === 0 &&
				pendingCreatedShapeIds.size === 0 &&
				pendingCreatedBranchIds.size === 0
			) ||
			isUpdating
		) {
			return
		}

		const shapeIds = Array.from(pendingShapeIds)
		const deletedShapeIds = Array.from(pendingDeletedShapeIds)
		const createdShapeIds = new Set(pendingCreatedShapeIds)
		const createdBranchIds = Array.from(pendingCreatedBranchIds)
		pendingShapeIds = new Set()
		pendingDeletedShapeIds = new Set()
		pendingCreatedShapeIds = new Set()
		pendingCreatedBranchIds = new Set()
		isUpdating = true

		try {
			for (const branchId of createdBranchIds) {
				const branch = editor.getShape<IBranchShape>(branchId as TLShapeId)
				if (!branch || branch.type !== 'branch') continue

				if (remapCreatedBranchChildren(editor, branch, createdShapeIds)) {
					const updatedBranch = editor.getShape<IBranchShape>(branch.id)
					if (updatedBranch?.type === 'branch') {
						layoutBranchChildren(editor, updatedBranch)
					}
				}
			}

			for (const shapeId of deletedShapeIds) {
				pruneShapeFromBranches(editor, shapeId as TLShapeId)
			}

			if (shapeIds.length > 0) {
				relayoutBranchesContainingShapes(editor, shapeIds as TLShapeId[])
			}
		} finally {
			isUpdating = false
		}
	})
}
