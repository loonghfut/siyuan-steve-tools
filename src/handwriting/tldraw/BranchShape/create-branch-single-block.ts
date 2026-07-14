import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import type { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'
import type { IBranchShape } from './branch-shape-types'
import { getSingleBranchParent, layoutBranchChildren, relayoutBranchesContainingShapes, type BranchSide } from './branch-layout'

export type BranchChildSide = BranchSide

const DEFAULT_BRANCH_PROPS: IBranchShape['props'] = {
	w: 80,
	h: 40,
	color: 'black',
	leftChildIds: [],
	rightChildIds: [],
	rootX: 40,
	direction: 'right',
	horizontalGap: 96,
	verticalGap: 28,
	lineWidth: 3,
	lineStyle: 'curve-solid',
	snapDistance: 160,
	showBackground: false,
	version: 6,
}

function getSideChildIds(branch: IBranchShape, side: BranchChildSide) {
	return side === 'left' ? branch.props.leftChildIds || [] : branch.props.rightChildIds
}

function getInitialSingleBlockY(
	editor: Editor,
	branch: IBranchShape,
	side: BranchChildSide,
	rootY: number,
	initialHeight: number
) {
	const sideChildIds = getSideChildIds(branch, side)
	const verticalGap = Math.max(branch.props.verticalGap || DEFAULT_BRANCH_PROPS.verticalGap, 8)
	let maxBottom = Number.NEGATIVE_INFINITY

	for (const childId of sideChildIds) {
		const childBounds = editor.getShapePageBounds(childId as TLShapeId)
		if (childBounds) {
			maxBottom = Math.max(maxBottom, childBounds.y + childBounds.height)
			continue
		}

		const child = editor.getShape(childId as TLShapeId)
		if (!child) continue
		const childHeight = Math.max(Number((child as any).props?.h) || 0, 0)
		maxBottom = Math.max(maxBottom, child.y + childHeight)
	}

	if (!Number.isFinite(maxBottom)) return rootY - initialHeight / 2
	return maxBottom + verticalGap
}

function cloneSingleProps(single: ISingleBlockShape): ISingleBlockShape['props'] {
	return {
		w: single.props.w,
		h: single.props.h,
		color: single.props.color,
		blockId: '',
		isNewlyCreated: true,
		fontSize: single.props.fontSize,
		refreshNonce: Date.now(),
		connectOnEnter: single.props.connectOnEnter,
		transparentBackground: single.props.transparentBackground,
		allowBinding: single.props.allowBinding,
	}
}

function createBranchProps(overrides?: Partial<IBranchShape['props']>): IBranchShape['props'] {
	return {
		...DEFAULT_BRANCH_PROPS,
		...overrides,
	}
}

function getSiblingInsertionPosition(_editor: Editor, single: ISingleBlockShape, branch: IBranchShape, side: BranchChildSide) {
	const rootX = branch.x + (branch.props.rootX ?? branch.props.w / 2)
	const horizontalGap = Math.max(branch.props.horizontalGap || DEFAULT_BRANCH_PROPS.horizontalGap, 20)
	const width = single.props.w
	return {
		x: side === 'left' ? rootX - horizontalGap - width : rootX + horizontalGap,
		y: single.y + single.props.h + Math.max(branch.props.verticalGap || DEFAULT_BRANCH_PROPS.verticalGap, 8),
	}
}

export function createSingleBlockForBranch(
	editor: Editor,
	branchId: TLShapeId,
	side: BranchChildSide
): TLShapeId | null {
	const branch = editor.getShape<IBranchShape>(branchId)
	if (!branch || branch.type !== 'branch') return null

	const rootX = branch.x + (branch.props.rootX ?? branch.props.w / 2)
	const rootY = branch.y + branch.props.h / 2
	const initialWidth = 300
	const initialHeight = 50
	const horizontalOffset = side === 'left' ? -initialWidth - 32 : 32
	const initialY = getInitialSingleBlockY(editor, branch, side, rootY, initialHeight)
	const newShapeId = createShapeId()
	const leftChildIds = [...(branch.props.leftChildIds || [])]
	const rightChildIds = [...branch.props.rightChildIds]

	if (side === 'left') leftChildIds.push(newShapeId)
	else rightChildIds.push(newShapeId)

	editor.run(() => {
		editor.createShape({
			id: newShapeId,
			type: 'single-block',
			x: rootX + horizontalOffset,
			y: initialY,
			props: {
				w: initialWidth,
				h: initialHeight,
				color: 'black',
				blockId: '',
				isNewlyCreated: true,
			},
		})

		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: {
				...branch.props,
				leftChildIds,
				rightChildIds,
			},
		})

		const updatedBranch = editor.getShape<IBranchShape>(branch.id)
		if (updatedBranch?.type === 'branch') {
			layoutBranchChildren(editor, updatedBranch)
		}
	})

	return newShapeId
}

export function createSiblingSingleInBranch(editor: Editor, singleId: TLShapeId): TLShapeId | null {
	const parentInfo = getSingleBranchParent(editor, singleId)
	const single = editor.getShape<ISingleBlockShape>(singleId)
	if (!parentInfo || !single || single.type !== 'single-block') return null

	const { branch, side, index } = parentInfo
	const newSingleId = createShapeId()
	const position = getSiblingInsertionPosition(editor, single, branch, side)
	const leftChildIds = [...(branch.props.leftChildIds || [])]
	const rightChildIds = [...branch.props.rightChildIds]
	const sideChildIds = side === 'left' ? leftChildIds : rightChildIds
	sideChildIds.splice(index + 1, 0, newSingleId as string)

	editor.run(() => {
		editor.createShape({
			id: newSingleId,
			type: 'single-block',
			x: position.x,
			y: position.y,
			props: cloneSingleProps(single),
		})

		editor.updateShape<IBranchShape>({
			id: branch.id,
			type: 'branch',
			props: {
				...branch.props,
				leftChildIds,
				rightChildIds,
			},
		})

		const updatedBranch = editor.getShape<IBranchShape>(branch.id)
		if (updatedBranch?.type === 'branch') {
			layoutBranchChildren(editor, updatedBranch)
		}
	})

	return newSingleId
}

export function createChildBranchFromSingle(editor: Editor, singleId: TLShapeId): TLShapeId | null {
	const parentInfo = getSingleBranchParent(editor, singleId)
	const single = editor.getShape<ISingleBlockShape>(singleId)
	if (!parentInfo || !single || single.type !== 'single-block') return null

	const { branch: parentBranch, side, index } = parentInfo
	const newSingleId = createShapeId()
	const newBranchId = createShapeId()
	const childSingleX = single.x + single.props.w + DEFAULT_BRANCH_PROPS.horizontalGap
	const childSingleY = single.y
	const branchCenterX = single.x + single.props.w / 2
	const branchCenterY = single.y + single.props.h / 2
	const leftChildIds = [...(parentBranch.props.leftChildIds || [])]
	const rightChildIds = [...parentBranch.props.rightChildIds]
	const parentSideIds = side === 'left' ? leftChildIds : rightChildIds
	parentSideIds.splice(index, 1, newBranchId as string)

	editor.run(() => {
		editor.createShapes([
			{
				id: newSingleId,
				type: 'single-block',
				x: childSingleX,
				y: childSingleY,
				props: cloneSingleProps(single),
			},
			{
				id: newBranchId,
				type: 'branch',
				x: branchCenterX - DEFAULT_BRANCH_PROPS.w / 2,
				y: branchCenterY - DEFAULT_BRANCH_PROPS.h / 2,
				props: createBranchProps({
					color: parentBranch.props.color,
					leftChildIds: [singleId as string],
					rightChildIds: [newSingleId as string],
				}),
			},
		])

		editor.updateShape<IBranchShape>({
			id: parentBranch.id,
			type: 'branch',
			props: {
				...parentBranch.props,
				leftChildIds,
				rightChildIds,
			},
		})

		const updatedChildBranch = editor.getShape<IBranchShape>(newBranchId)
		if (updatedChildBranch?.type === 'branch') {
			layoutBranchChildren(editor, updatedChildBranch)
		}

		const updatedParentBranch = editor.getShape<IBranchShape>(parentBranch.id)
		if (updatedParentBranch?.type === 'branch') {
			layoutBranchChildren(editor, updatedParentBranch)
			relayoutBranchesContainingShapes(editor, [updatedParentBranch.id])
		}
	})

	return newSingleId
}
