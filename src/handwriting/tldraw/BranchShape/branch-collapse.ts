import { computed, Editor, EditorAtom, TLShape, TLShapeId } from '@tldraw/tldraw'
import { settingdata } from '@/index'
import { IBranchShape } from './branch-shape-types'
import { getAllBranchChildIds, layoutBranchChildren, relayoutBranchesContainingShapes } from './branch-layout'
import { beginBranchResize, endBranchResize } from './keep-branch-layouts-updated'

// The timing is deliberately a little slower than a toolbar click. This makes
// nested branches read as a single tree folding into, or growing from, its root.
const BRANCH_TRANSITION_DURATION = 300
const animatingBranchIds = new Set<string>()
const branchLayoutAnimation = {
	duration: BRANCH_TRANSITION_DURATION,
	easing: (progress: number) => 1 - Math.pow(1 - progress, 3),
}

type ShapeSnapshot = Pick<TLShape, 'id' | 'type' | 'x' | 'y' | 'props'>

function addBranchDescendantShapeIds(
	branch: IBranchShape,
	descendants: Set<string>,
	getChildBranch: (childId: string) => IBranchShape | undefined
) {
	const visitedBranchIds = new Set<string>()
	const rootBranchId = branch.id as string

	const visitBranch = (current: IBranchShape) => {
		const currentId = current.id as string
		if (visitedBranchIds.has(currentId)) return
		visitedBranchIds.add(currentId)

		for (const childId of getAllBranchChildIds(current)) {
			// Malformed cyclic branch data must not hide the branch that owns the
			// collapse control itself.
			if (childId !== rootBranchId) descendants.add(childId)

			const child = getChildBranch(childId)
			if (!child) continue

			if (child.props.rootShapeId && child.props.rootShapeId !== rootBranchId) {
				descendants.add(child.props.rootShapeId)
			}
			visitBranch(child)
		}
	}

	visitBranch(branch)
}

/**
 * Returns every visual descendant of a branch. A branch's own root content is
 * intentionally excluded, while root content belonging to nested branches is
 * included as part of the descendant subtree.
 */
export function getBranchDescendantShapeIds(editor: Editor, branch: IBranchShape) {
	const descendants = new Set<string>()
	addBranchDescendantShapeIds(branch, descendants, (childId) => {
		const child = editor.getShape<IBranchShape>(childId as TLShapeId)
		return child?.type === 'branch' ? child : undefined
	})
	return descendants
}

/** Applies one collapsed state to a branch and every nested branch below it. */
function setBranchSubtreeCollapsed(editor: Editor, branchId: TLShapeId | string, isCollapsed: boolean) {
	const rootBranch = editor.getShape<IBranchShape>(branchId as TLShapeId)
	if (!rootBranch || rootBranch.type !== 'branch') return false

	if (isCollapsed) {
		const descendants = getBranchDescendantShapeIds(editor, rootBranch)
		const selectedDescendants = editor
			.getSelectedShapeIds()
			.filter((shapeId) => descendants.has(shapeId as string))
		if (selectedDescendants.length > 0) editor.deselect(...selectedDescendants)
	}

	const visited = new Set<string>()
	const branchesInLayoutOrder: TLShapeId[] = []
	const collectBranches = (branch: IBranchShape) => {
		const id = branch.id as string
		if (visited.has(id)) return
		visited.add(id)

		for (const childId of getAllBranchChildIds(branch)) {
			const child = editor.getShape<IBranchShape>(childId as TLShapeId)
			if (child?.type === 'branch') collectBranches(child)
		}
		// Children first ensures every parent measures the updated nested layout.
		branchesInLayoutOrder.push(branch.id)
	}
	collectBranches(rootBranch)

	editor.run(() => {
		for (const id of branchesInLayoutOrder) {
			const branch = editor.getShape<IBranchShape>(id)
			if (!branch || branch.type !== 'branch' || branch.props.isCollapsed === isCollapsed) continue
			editor.updateShape<IBranchShape>({
				id: branch.id,
				type: 'branch',
				props: { ...branch.props, isCollapsed },
			})
		}

		for (const id of branchesInLayoutOrder) {
			const branch = editor.getShape<IBranchShape>(id)
			if (branch?.type === 'branch') layoutBranchChildren(editor, branch)
		}
		relayoutBranchesContainingShapes(editor, [rootBranch.id], new Set())
	})

	return true
}

/**
 * Bulk operations are committed in one history step and deliberately skip
 * per-branch animations, avoiding a queue of competing nested transitions.
 */
export function collapseBranchSubtree(editor: Editor, branchId: TLShapeId | string) {
	return setBranchSubtreeCollapsed(editor, branchId, true)
}

export function expandBranchSubtree(editor: Editor, branchId: TLShapeId | string) {
	return setBranchSubtreeCollapsed(editor, branchId, false)
}

export function toggleBranchSubtreeCollapsed(editor: Editor, branchId: TLShapeId | string) {
	const branch = editor.getShape<IBranchShape>(branchId as TLShapeId)
	if (!branch || branch.type !== 'branch') return false
	return setBranchSubtreeCollapsed(editor, branch.id, !branch.props.isCollapsed)
}

// Keep the branch-type index and the derived hidden set scoped to an Editor.
// This avoids sharing state between whiteboards while letting tldraw invalidate
// only on page or Branch-record changes.
const BranchShapeIds = new EditorAtom('branch shape ids', (editor) => editor.store.query.index('shape', 'type'))

const CollapsedBranchDescendantShapeIds = new EditorAtom('collapsed branch descendant shape ids', (editor) =>
	computed('collapsed branch descendant shape ids', () => {
		const hiddenShapeIds = new Set<string>()
		const currentPageShapeIds = editor.getCurrentPageShapeIds()
		const branchShapeIds = BranchShapeIds.get(editor).get().get('branch')
		if (!branchShapeIds) return hiddenShapeIds

		for (const branchId of branchShapeIds) {
			if (!currentPageShapeIds.has(branchId as TLShapeId)) continue
			const branch = editor.getShape<IBranchShape>(branchId as TLShapeId)
			if (branch?.type !== 'branch' || !branch.props.isCollapsed) continue

			addBranchDescendantShapeIds(branch, hiddenShapeIds, (childId) => {
				if (!branchShapeIds.has(childId as TLShapeId)) return undefined
				const child = editor.getShape<IBranchShape>(childId as TLShapeId)
				return child?.type === 'branch' ? child : undefined
			})
		}

		return hiddenShapeIds
	})
)

export function isShapeHiddenByCollapsedBranch(editor: Editor, shape: TLShape) {
	return CollapsedBranchDescendantShapeIds.get(editor).get().has(shape.id as string)
}

/** Provides tldraw's rendering and hit-testing visibility for collapsed trees. */
export function getBranchShapeVisibility(shape: TLShape, editor: Editor) {
	return isShapeHiddenByCollapsedBranch(editor, shape) ? 'hidden' : 'inherit'
}

function capturePageShapes(editor: Editor) {
	return new Map<string, ShapeSnapshot>(
		editor.getCurrentPageShapes().map((shape) => [
			shape.id as string,
			{ id: shape.id, type: shape.type, x: shape.x, y: shape.y, props: shape.props },
		])
	)
}

function runWithoutHistory(editor: Editor, callback: () => void) {
	editor.run(callback, { history: 'ignore' })
}

function getBranchRootPagePoint(editor: Editor, branch: IBranchShape) {
	const root = branch.props.rootShapeId ? editor.getShape(branch.props.rootShapeId as TLShapeId) : null
	const rootBounds = root ? editor.getShapePageBounds(root.id) : null
	if (rootBounds) {
		return { x: rootBounds.x + rootBounds.width / 2, y: rootBounds.y + rootBounds.height / 2 }
	}

	return editor.getShapePageTransform(branch).applyToPoint({
		x: branch.props.rootX ?? branch.props.w / 2,
		y: branch.props.h / 2,
	})
}

function getPositionAtPageCenter(editor: Editor, shape: TLShape, pageCenter: { x: number; y: number }) {
	const bounds = editor.getShapePageBounds(shape.id)
	const pageX = pageCenter.x - (bounds?.width ?? (shape.props as any).w ?? 1) / 2
	const pageY = pageCenter.y - (bounds?.height ?? (shape.props as any).h ?? 1) / 2
	const parent = editor.getShapeParent(shape)
	const local = parent ? editor.getPointInShapeSpace(parent, { x: pageX, y: pageY }) : { x: pageX, y: pageY }
	return { id: shape.id, type: shape.type, x: local.x, y: local.y }
}

function restoreShapeSnapshots(editor: Editor, snapshots: Map<string, ShapeSnapshot>) {
	if (snapshots.size > 0) editor.updateShapes(Array.from(snapshots.values()) as any[])
}

function isBranchCollapseAnimationEnabled() {
	// Keep existing installations animated until the new preference is saved.
	return settingdata['tldraw-branch-collapse-animation'] !== false
}

function applyCollapsedState(editor: Editor, branch: IBranchShape, isCollapsed: boolean, animateLayout = true) {
	editor.run(() => {
		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: {
				...branch.props,
				isCollapsed,
			},
		})

		const updatedBranch = editor.getShape<IBranchShape>(branch.id)
		if (!updatedBranch || updatedBranch.type !== 'branch') return

		const options = animateLayout ? { animation: branchLayoutAnimation } : undefined
		layoutBranchChildren(editor, updatedBranch, undefined, options)
		relayoutBranchesContainingShapes(editor, [updatedBranch.id], new Set(), options)
	})
}

function animateShapeUpdates(editor: Editor, updates: any[]) {
	if (updates.length === 0) return
	runWithoutHistory(editor, () => editor.animateShapes(updates, { animation: branchLayoutAnimation }))
}

function finishBranchAnimation(editor: Editor, branchId: TLShapeId, delay = BRANCH_TRANSITION_DURATION) {
	window.setTimeout(() => {
		endBranchResize(editor, branchId)
		animatingBranchIds.delete(branchId as string)
	}, delay)
}

function collapseBranch(editor: Editor, branch: IBranchShape, descendants: Set<string>) {
	const beforeLayout = capturePageShapes(editor)
	const root = getBranchRootPagePoint(editor, branch)
	beginBranchResize(editor, branch.id)

	// First calculate the compact layout without letting the browser paint it.
	// Rewinding to the current state lets the branch box, enclosing branches and
	// nodes all animate towards their compact targets on the same timeline.
	runWithoutHistory(editor, () => {
		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: { ...branch.props, isCollapsed: true },
		})
		const compactBranch = editor.getShape<IBranchShape>(branch.id)
		if (!compactBranch || compactBranch.type !== 'branch') return
		layoutBranchChildren(editor, compactBranch)
		relayoutBranchesContainingShapes(editor, [compactBranch.id], new Set())
	})
	const compactTargets = capturePageShapes(editor)

	runWithoutHistory(editor, () => restoreShapeSnapshots(editor, beforeLayout))

	const updates: any[] = []
	for (const [id, target] of compactTargets) {
		const current = editor.getShape(id as TLShapeId)
		if (!current) continue

		if (descendants.has(id)) {
			// Shapes really travel back through the connector paths. This keeps the
			// branch SVG live during the transition instead of faking it with a fade.
			updates.push(getPositionAtPageCenter(editor, current, root))
			continue
		}

		// The final state is collapsed, but retaining the expanded renderer until
		// the final frame makes the branch lines visibly contract with the layout.
		updates.push({
			...target,
			props: id === (branch.id as string) ? { ...target.props, isCollapsed: false } : target.props,
		})
	}

	animateShapeUpdates(editor, updates)

	window.setTimeout(() => {
		try {
			// Recreate the normal document transition synchronously at the final
			// frame. The compact scene was only an animation preview; restoring first
			// ensures undo returns to the original expanded layout, never to a set of
			// temporarily converged node coordinates.
			runWithoutHistory(editor, () => restoreShapeSnapshots(editor, beforeLayout))
			const latestBranch = editor.getShape<IBranchShape>(branch.id)
			if (latestBranch?.type === 'branch') applyCollapsedState(editor, latestBranch, true, false)
		} finally {
			finishBranchAnimation(editor, branch.id, 0)
		}
	}, BRANCH_TRANSITION_DURATION)
}

function expandBranch(editor: Editor, branch: IBranchShape, descendants: Set<string>) {
	const beforeLayout = capturePageShapes(editor)
	const root = getBranchRootPagePoint(editor, branch)
	beginBranchResize(editor, branch.id)

	// Calculate the eventual full layout while descendants remain hidden. We
	// then rewind the visual state and animate one coherent set of targets.
	applyCollapsedState(editor, branch, false, false)
	const targets = capturePageShapes(editor)
	const descendantSet = new Set(descendants)
	const startUpdates: any[] = []

	for (const [id] of targets) {
		const current = editor.getShape(id as TLShapeId)
		if (!current) continue

		if (descendantSet.has(id)) {
			startUpdates.push(getPositionAtPageCenter(editor, current, root))
			continue
		}

		const previous = beforeLayout.get(id)
		if (!previous) continue
		const isExpandingBranch = id === (branch.id as string)
		startUpdates.push({
			...previous,
			props: isExpandingBranch ? { ...previous.props, isCollapsed: false } : previous.props,
		})
	}

	runWithoutHistory(editor, () => {
		if (startUpdates.length > 0) editor.updateShapes(startUpdates)
	})

	window.requestAnimationFrame(() => {
		const animationTargets = Array.from(targets.values()).filter((target) => editor.getShape(target.id))
		animateShapeUpdates(editor, animationTargets)
		finishBranchAnimation(editor, branch.id)
	})
}

export function toggleBranchCollapsed(editor: Editor, branchId: TLShapeId | string) {
	const branch = editor.getShape<IBranchShape>(branchId as TLShapeId)
	if (!branch || branch.type !== 'branch') return false
	const id = branch.id as string
	if (animatingBranchIds.has(id)) return false

	const isCollapsed = !branch.props.isCollapsed
	const descendants = getBranchDescendantShapeIds(editor, branch)
	if (isCollapsed) {
		const selectedDescendants = editor
			.getSelectedShapeIds()
			.filter((shapeId) => descendants.has(shapeId as string))
		if (selectedDescendants.length > 0) editor.deselect(...selectedDescendants)
	}

	if (!isBranchCollapseAnimationEnabled()) {
		applyCollapsedState(editor, branch, isCollapsed, false)
		return true
	}

	if (isCollapsed) {
		animatingBranchIds.add(id)
		collapseBranch(editor, branch, descendants)
		return true
	}

	animatingBranchIds.add(id)
	expandBranch(editor, branch, descendants)
	return true
}
