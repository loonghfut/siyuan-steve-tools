import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape } from './branch-shape-types'
import {
	branchRelationsEqual,
	clearBranchClipboardMarker,
	getBranchBindings,
	hasBranchClipboardMarker,
	reconcileBranchRelationsFromBindings,
	syncBranchBindingsFromLegacyProps,
} from './branch-binding'
import {
	getAllBranchChildIds,
	layoutBranchChildren,
	pruneShapesFromBranches,
	repairBranchStructure,
	relayoutBranchesContainingShapes,
} from './branch-layout'

const BRANCH_CHILD_TYPES = new Set(['card', 'single-block', 'branch'])
const REGISTERED_EDITORS = new WeakSet<Editor>()

// tldraw exposes this internally on HistoryManager, but deliberately omits it
// from its public TypeScript declaration. Keep the compatibility boundary here.
function isReplayingHistory(editor: Editor) {
	const history = (editor as unknown as { history?: { isReplaying?: () => boolean } }).history
	return history?.isReplaying?.() === true
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
			const laidOutParent = editor.getShape<IBranchShape>(updatedParent.id)
			if (laidOutParent?.type === 'branch') syncBranchBindingsFromLegacyProps(editor, laidOutParent)
		}
	}

	if (affectedParentIds.size > 0) {
		relayoutBranchesContainingShapes(editor, [promotedChildId as TLShapeId, ...Array.from(affectedParentIds)])
	}
}

function getBranchDepth(editor: Editor, branch: IBranchShape, visiting = new Set<string>()): number {
	const branchId = branch.id as string
	if (visiting.has(branchId)) return 0

	visiting.add(branchId)
	let depth = 0
	for (const childId of getAllBranchChildIds(branch)) {
		const child = editor.getShape<IBranchShape>(childId as TLShapeId)
		if (child?.type === 'branch') {
			depth = Math.max(depth, getBranchDepth(editor, child, visiting) + 1)
		}
	}
	visiting.delete(branchId)
	return depth
}

function deleteBranchesWhoseRootsWereDeleted(editor: Editor, deletedShapeIds: Set<string>) {
	const branchIds = editor
		.getCurrentPageShapes()
		.filter(
			(shape): shape is IBranchShape =>
				shape.type === 'branch' && !!(shape as IBranchShape).props.rootShapeId && deletedShapeIds.has((shape as IBranchShape).props.rootShapeId!)
		)
		.map((branch) => branch.id as TLShapeId)

	if (branchIds.length > 0) editor.deleteShapes(branchIds)
	return branchIds
}

/**
 * A branch is rendered by a separate shape, so its SVG must live under the
 * same parent as its root and descendants. Frame auto-parenting only moves the
 * shape currently dragged/selected, which otherwise leaves clipped connectors
 * behind in the old frame.
 */
function getConnectedBranchShapeIds(editor: Editor, initialShapeIds: Iterable<string>) {
	const branches = editor.getCurrentPageShapes().filter((shape): shape is IBranchShape => shape.type === 'branch')
	const ids = new Set(initialShapeIds)
	let didAdd = true

	while (didAdd) {
		didAdd = false
		for (const branch of branches) {
			const attachedIds = getAllBranchChildIds(branch)
			if (branch.props.rootShapeId) attachedIds.push(branch.props.rootShapeId)
			if (!ids.has(branch.id as string) && !attachedIds.some((id) => ids.has(id))) continue

			for (const id of [branch.id as string, ...attachedIds]) {
				if (!ids.has(id)) {
					ids.add(id)
					didAdd = true
				}
			}
		}
	}

	return ids
}

type BranchParentChange = {
	previousParentId: string
	nextParentId: string
}

function isFrameParent(editor: Editor, parentId: string) {
	return editor.getShape(parentId as TLShapeId)?.type === 'frame'
}

function isFrameToPageRootMove(editor: Editor, change: BranchParentChange) {
	return (
		isFrameParent(editor, change.nextParentId) ||
		(isFrameParent(editor, change.previousParentId) && change.nextParentId === editor.getCurrentPageId())
	)
}

function moveConnectedBranchesToParent(editor: Editor, parentChanges: Map<string, BranchParentChange>) {
	for (const [shapeId, change] of parentChanges) {
		if (!isFrameToPageRootMove(editor, change)) continue

		const parentId = change.nextParentId
		const connectedIds = getConnectedBranchShapeIds(editor, [shapeId])
		if (connectedIds.size <= 1) continue

		const shapesToMove = Array.from(connectedIds)
			.map((id) => editor.getShape(id as TLShapeId))
			.filter((shape): shape is TLShape => !!shape && shape.parentId !== parentId)
		if (shapesToMove.length === 0) continue

		editor.reparentShapes(shapesToMove, parentId as any)
		Array.from(connectedIds)
			.map((id) => editor.getShape<IBranchShape>(id as TLShapeId))
			.filter((branch): branch is IBranchShape => branch?.type === 'branch')
			.sort((a, b) => getBranchDepth(editor, b) - getBranchDepth(editor, a))
			.forEach((branch) => {
				const latest = editor.getShape<IBranchShape>(branch.id)
				if (latest?.type === 'branch') layoutBranchChildren(editor, latest)
			})
	}
}

export function migrateBranchBindings(editor: Editor) {
	// Bindings are authoritative for migrated documents. Only old documents that
	// have no branch bindings at all may use their legacy ID arrays as input.
	for (const page of editor.getPages()) {
		for (const shapeId of editor.getPageShapeIds(page.id)) {
			const shape = editor.getShape(shapeId)
			if (shape?.type !== 'branch') continue

			const branch = shape as IBranchShape
			if (getBranchBindings(editor, branch).length > 0) reconcileBranchRelationsFromBindings(editor, branch)
			else syncBranchBindingsFromLegacyProps(editor, branch)
		}
	}
}

function layoutBranches(editor: Editor, branchIds: Iterable<TLShapeId | string>) {
	const branches = Array.from(new Set(Array.from(branchIds).map(String)))
		.map((id) => editor.getShape<IBranchShape>(id as TLShapeId))
		.filter((branch): branch is IBranchShape => branch?.type === 'branch')
		.sort((a, b) => getBranchDepth(editor, b) - getBranchDepth(editor, a))

	for (const branch of branches) {
		const latest = editor.getShape<IBranchShape>(branch.id)
		if (!latest?.type || latest.type !== 'branch') continue
		layoutBranchChildren(editor, latest)
		const laidOut = editor.getShape<IBranchShape>(latest.id)
		if (laidOut?.type === 'branch') syncBranchBindingsFromLegacyProps(editor, laidOut)
	}
}

export function keepBranchLayoutsUpdated(editor: Editor) {
	if (REGISTERED_EDITORS.has(editor)) return
	REGISTERED_EDITORS.add(editor)
	migrateBranchBindings(editor)
	repairBranchStructure(editor)
	// The repair step intentionally normalizes legacy cache fields. Persist that
	// normalized structure back into bindings once, after bindings were hydrated.
	for (const shape of editor.getCurrentPageShapes()) {
		if (shape.type === 'branch') syncBranchBindingsFromLegacyProps(editor, shape as IBranchShape)
	}

	let pendingShapeIds = new Set<string>()
	let pendingDeletedShapes = new Map<string, TLShape>()
	let pendingCreatedBranchIds = new Set<string>()
	let pendingPastedBranchIds = new Set<string>()
	let pendingRelationBranchIds = new Set<string>()
	let pendingBindingBranchIds = new Set<string>()
	let pendingParentChanges = new Map<string, BranchParentChange>()
	let isUpdating = false

	const shouldIgnore = (_source: string) => isUpdating || isReplayingHistory(editor)

	editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (shouldIgnore(source)) return
		if (shape.type !== 'branch') return

		pendingCreatedBranchIds.add(shape.id as string)
		if (hasBranchClipboardMarker(shape as IBranchShape)) pendingPastedBranchIds.add(shape.id as string)
	})

	editor.sideEffects.registerAfterChangeHandler('shape', (prev, next, source) => {
		if (shouldIgnore(source)) return
		if (prev.parentId !== next.parentId) {
			pendingParentChanges.set(next.id as string, {
				previousParentId: prev.parentId as string,
				nextParentId: next.parentId as string,
			})
		}
		if (prev.type === 'branch' && next.type === 'branch' && !branchRelationsEqual(prev as IBranchShape, next as IBranchShape)) {
			pendingRelationBranchIds.add(next.id as string)
		}
		if (didRelevantBoundsChange(prev, next)) pendingShapeIds.add(next.id as string)
	})

	editor.sideEffects.registerAfterDeleteHandler('shape', (shape, source) => {
		if (shouldIgnore(source) || !BRANCH_CHILD_TYPES.has(shape.type)) return
		pendingDeletedShapes.set(shape.id as string, shape)
	})

	const markBindingChange = (binding: { type: string; fromId: TLShapeId | string }, source: string) => {
		if (shouldIgnore(source) || binding.type !== 'branch-child') return
		pendingBindingBranchIds.add(binding.fromId as string)
	}
	editor.sideEffects.registerAfterCreateHandler('binding', markBindingChange)
	editor.sideEffects.registerAfterChangeHandler('binding', (_prev, next, source) => markBindingChange(next, source))
	editor.sideEffects.registerAfterDeleteHandler('binding', markBindingChange)

	editor.sideEffects.registerOperationCompleteHandler(() => {
		if (
			isUpdating ||
			(
				pendingShapeIds.size === 0 &&
				pendingDeletedShapes.size === 0 &&
				pendingCreatedBranchIds.size === 0 &&
				pendingPastedBranchIds.size === 0 &&
				pendingRelationBranchIds.size === 0 &&
				pendingBindingBranchIds.size === 0 &&
				pendingParentChanges.size === 0
			)
		) {
			return
		}

		const shapeIds = Array.from(pendingShapeIds)
		const deletedShapes = Array.from(pendingDeletedShapes.values())
		const createdBranchIds = new Set(pendingCreatedBranchIds)
		const pastedBranchIds = new Set(pendingPastedBranchIds)
		const relationBranchIds = new Set(pendingRelationBranchIds)
		const bindingBranchIds = new Set(pendingBindingBranchIds)
		const parentChanges = new Map(pendingParentChanges)
		pendingShapeIds = new Set()
		pendingDeletedShapes = new Map()
		pendingCreatedBranchIds = new Set()
		pendingPastedBranchIds = new Set()
		pendingRelationBranchIds = new Set()
		pendingBindingBranchIds = new Set()
		pendingParentChanges = new Map()
		isUpdating = true

		try {
			moveConnectedBranchesToParent(editor, parentChanges)
			const branchesToLayout = new Set<TLShapeId | string>()

			for (const branchId of createdBranchIds) {
				const branch = editor.getShape<IBranchShape>(branchId as TLShapeId)
				if (!branch?.type || branch.type !== 'branch') continue

				if (pastedBranchIds.has(branchId) || bindingBranchIds.has(branchId)) {
					const hydrated = reconcileBranchRelationsFromBindings(editor, branch)
					clearBranchClipboardMarker(editor, hydrated)
					branchesToLayout.add(branchId)
				} else {
					syncBranchBindingsFromLegacyProps(editor, branch)
				}
			}

			const rootDeletedBranchIds = deleteBranchesWhoseRootsWereDeleted(
				editor,
				new Set(deletedShapes.map((shape) => shape.id as string))
			)
			const deletedBranchIds = new Set(rootDeletedBranchIds.map((id) => id as string))
			for (const shape of deletedShapes) {
				if (shape.type === 'branch' && !deletedBranchIds.has(shape.id as string)) {
					promoteOnlyChildOfDeletedBranch(editor, shape as IBranchShape)
				}
			}
			if (deletedShapes.length > 0 || rootDeletedBranchIds.length > 0) {
				pruneShapesFromBranches(editor, [
					...deletedShapes.map((shape) => shape.id as TLShapeId),
					...rootDeletedBranchIds,
				])
			}

			for (const branchId of new Set([...relationBranchIds, ...bindingBranchIds])) {
				const branch = editor.getShape<IBranchShape>(branchId as TLShapeId)
				if (!branch?.type || branch.type !== 'branch') continue

				if (bindingBranchIds.has(branchId)) reconcileBranchRelationsFromBindings(editor, branch)
				else syncBranchBindingsFromLegacyProps(editor, branch)
				branchesToLayout.add(branchId)
			}

			if (shapeIds.length > 0) relayoutBranchesContainingShapes(editor, shapeIds as TLShapeId[])
			layoutBranches(editor, branchesToLayout)
		} finally {
			isUpdating = false
		}
	})
}
