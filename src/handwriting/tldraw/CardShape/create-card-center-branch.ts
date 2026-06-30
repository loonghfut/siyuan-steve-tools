import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import {
	getBranchRootParent,
	layoutBranchChildren,
	markExplicitCreatedBranchRelations,
	relayoutBranchesContainingShapes,
} from '../BranchShape'
import type { IBranchShape } from '../BranchShape/branch-shape-types'
import type { ICardShape } from './card-shape-types'

const DEFAULT_BRANCH_PROPS: IBranchShape['props'] = {
	w: 80,
	h: 40,
	color: 'black',
	childIds: [],
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
	version: 5,
}

function uniqueIds(ids: string[]) {
	return Array.from(new Set(ids))
}

function getCardCenter(editor: Editor, card: ICardShape) {
	const bounds = editor.getShapePageBounds(card.id)
	if (bounds) {
		return {
			x: bounds.center.x,
			y: bounds.center.y,
		}
	}

	return {
		x: card.x + (card.props.w || 0) / 2,
		y: card.y + (card.props.h || 0) / 2,
	}
}

function createBranchShapeForCard(id: TLShapeId, card: ICardShape, center: { x: number; y: number }) {
	const props: IBranchShape['props'] = {
		...DEFAULT_BRANCH_PROPS,
		rootShapeId: card.id as string,
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
	return branch.props.rightChildIds || branch.props.childIds || []
}

function getSideParentBranches(editor: Editor, cardId: string) {
	const parents: IBranchShape[] = []
	for (const shape of editor.getCurrentPageShapes()) {
		if (shape.type !== 'branch') continue

		const branch = shape as IBranchShape
		const isLeftChild = (branch.props.leftChildIds || []).includes(cardId)
		const isRightChild = getRightChildIds(branch).includes(cardId)
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
			childIds: rightChildIds,
			leftChildIds,
			rightChildIds,
		},
	})
}

export function createCenterBranchForCard(editor: Editor, card: ICardShape): TLShapeId | null {
	const latestCard = editor.getShape<ICardShape>(card.id)
	if (!latestCard || latestCard.type !== 'card') return null
	if (getBranchRootParent(editor, latestCard.id)) return null

	const branchId = createShapeId()
	const sideParentBranches = getSideParentBranches(editor, latestCard.id as string)
	const center = getCardCenter(editor, latestCard)
	const branchShape = createBranchShapeForCard(branchId, latestCard, center)

	markExplicitCreatedBranchRelations(editor, [branchId])

	editor.run(() => {
		editor.createShape(branchShape)

		for (const parentBranch of sideParentBranches) {
			const latestParentBranch = editor.getShape<IBranchShape>(parentBranch.id)
			if (latestParentBranch?.type === 'branch') {
				replaceSideChildInBranch(editor, latestParentBranch, latestCard.id as string, branchId as string)
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

		editor.select(latestCard.id)
	})

	return branchId
}
