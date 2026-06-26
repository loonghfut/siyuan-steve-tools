import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { IBranchShape } from './branch-shape-types'
import { pruneShapeFromBranches, relayoutBranchesContainingShapes } from './branch-layout'

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

export function keepBranchLayoutsUpdated(editor: Editor) {
	if (REGISTERED_EDITORS.has(editor)) return
	REGISTERED_EDITORS.add(editor)

	let pendingShapeIds = new Set<string>()
	let pendingDeletedShapeIds = new Set<string>()
	let isUpdating = false

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
		if ((pendingShapeIds.size === 0 && pendingDeletedShapeIds.size === 0) || isUpdating) return

		const shapeIds = Array.from(pendingShapeIds)
		const deletedShapeIds = Array.from(pendingDeletedShapeIds)
		pendingShapeIds = new Set()
		pendingDeletedShapeIds = new Set()
		isUpdating = true

		try {
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
