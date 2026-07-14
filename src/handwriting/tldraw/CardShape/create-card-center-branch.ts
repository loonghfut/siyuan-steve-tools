import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import {
	getAllBranchChildIds,
	getBranchRootParent,
	layoutBranchChildren,
	markExplicitCreatedBranchRelations,
	relayoutBranchesContainingShapes,
} from '../BranchShape'
import type { IBranchShape } from '../BranchShape/branch-shape-types'
import type { ICardShape } from './card-shape-types'
import type { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'

type CenterBranchRootShape = ICardShape | ISingleBlockShape

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

function uniqueIds(ids: string[]) {
	return Array.from(new Set(ids))
}

function getShapeCenter(editor: Editor, shape: CenterBranchRootShape) {
	const bounds = editor.getShapePageBounds(shape.id)
	if (bounds) {
		return {
			x: bounds.center.x,
			y: bounds.center.y,
		}
	}

	return {
		x: shape.x + (shape.props.w || 0) / 2,
		y: shape.y + (shape.props.h || 0) / 2,
	}
}

function createBranchShapeForRootShape(id: TLShapeId, shape: CenterBranchRootShape, center: { x: number; y: number }) {
	const props: IBranchShape['props'] = {
		...DEFAULT_BRANCH_PROPS,
		rootShapeId: shape.id as string,
	}

	return {
		id,
		type: 'branch' as const,
		x: center.x - (props.rootX ?? props.w / 2),
		y: center.y - props.h / 2,
		props,
	}
}

function getRightChildIds(branch: IBranchShape) {
	return branch.props.rightChildIds
}

function getSideParentBranches(editor: Editor, childId: string) {
	const parents: IBranchShape[] = []
	for (const shape of editor.getCurrentPageShapes()) {
		if (shape.type !== 'branch') continue

		const branch = shape as IBranchShape
		const isLeftChild = (branch.props.leftChildIds || []).includes(childId)
		const isRightChild = getRightChildIds(branch).includes(childId)
		if (isLeftChild || isRightChild) parents.push(branch)
	}
	return parents
}

function replaceChildId(ids: string[] | undefined, oldChildId: string, newChildId: string) {
	return uniqueIds((ids || []).map((id) => (id === oldChildId ? newChildId : id)))
}

function replaceSideChildInBranch(editor: Editor, branch: IBranchShape, oldChildId: string, newChildId: string) {
	const leftChildIds = replaceChildId(branch.props.leftChildIds, oldChildId, newChildId)
	const rightChildIds = replaceChildId(getRightChildIds(branch), oldChildId, newChildId)

	editor.updateShape<IBranchShape>({
		id: branch.id,
		type: 'branch',
		props: {
			...branch.props,
			leftChildIds,
			rightChildIds,
		},
	})
}

function hasExistingSideChildren(editor: Editor, branch: IBranchShape) {
	return getAllBranchChildIds(branch).some((childId) => !!editor.getShape(childId as TLShapeId))
}

export function getEmptyCenterBranchForCard(editor: Editor, card: ICardShape): IBranchShape | null {
	const latestCard = editor.getShape<ICardShape>(card.id)
	if (!latestCard || latestCard.type !== 'card') return null

	const rootParentBranch = getBranchRootParent(editor, latestCard.id)
	if (!rootParentBranch || hasExistingSideChildren(editor, rootParentBranch)) return null

	return rootParentBranch
}

export function createCenterBranchForShape(editor: Editor, shape: CenterBranchRootShape): TLShapeId | null {
	const latestShape = editor.getShape<CenterBranchRootShape>(shape.id)
	if (!latestShape || (latestShape.type !== 'card' && latestShape.type !== 'single-block')) return null
	if (getBranchRootParent(editor, latestShape.id)) return null

	const branchId = createShapeId()
	const sideParentBranches = getSideParentBranches(editor, latestShape.id as string)
	const center = getShapeCenter(editor, latestShape)
	const branchShape = createBranchShapeForRootShape(branchId, latestShape, center)

	markExplicitCreatedBranchRelations(editor, [branchId])

	editor.run(() => {
		editor.createShape(branchShape)

		for (const parentBranch of sideParentBranches) {
			const latestParentBranch = editor.getShape<IBranchShape>(parentBranch.id)
			if (latestParentBranch?.type === 'branch') {
				replaceSideChildInBranch(editor, latestParentBranch, latestShape.id as string, branchId as string)
			}
		}

		const latestBranch = editor.getShape<IBranchShape>(branchId)
		if (latestBranch?.type === 'branch') {
			layoutBranchChildren(editor, latestBranch)
		}

		const relayoutIds: TLShapeId[] = [branchId]
		for (const parentBranch of sideParentBranches) {
			const latestParentBranch = editor.getShape<IBranchShape>(parentBranch.id)
			if (latestParentBranch?.type === 'branch') {
				layoutBranchChildren(editor, latestParentBranch)
				relayoutIds.push(latestParentBranch.id)
			}
		}

		if (relayoutIds.length > 1) {
			relayoutBranchesContainingShapes(editor, relayoutIds)
		}

		editor.select(latestShape.id)
	})

	return branchId
}

export function createCenterBranchForCard(editor: Editor, card: ICardShape): TLShapeId | null {
	return createCenterBranchForShape(editor, card)
}

export function deleteEmptyCenterBranchForCard(editor: Editor, card: ICardShape): TLShapeId | null {
	const latestCard = editor.getShape<ICardShape>(card.id)
	if (!latestCard || latestCard.type !== 'card') return null

	const centerBranch = getEmptyCenterBranchForCard(editor, latestCard)
	if (!centerBranch) return null

	const centerBranchId = centerBranch.id as string
	const sideParentBranches = getSideParentBranches(editor, centerBranchId)

	editor.run(() => {
		for (const parentBranch of sideParentBranches) {
			const latestParentBranch = editor.getShape<IBranchShape>(parentBranch.id)
			if (latestParentBranch?.type === 'branch') {
				replaceSideChildInBranch(editor, latestParentBranch, centerBranchId, latestCard.id as string)
			}
		}

		editor.deleteShape(centerBranch.id)

		const relayoutIds: TLShapeId[] = []
		for (const parentBranch of sideParentBranches) {
			const latestParentBranch = editor.getShape<IBranchShape>(parentBranch.id)
			if (latestParentBranch?.type === 'branch') {
				layoutBranchChildren(editor, latestParentBranch)
				relayoutIds.push(latestParentBranch.id)
			}
		}

		if (relayoutIds.length > 0) {
			relayoutBranchesContainingShapes(editor, relayoutIds)
		}

		editor.select(latestCard.id)
	})

	return centerBranch.id
}
