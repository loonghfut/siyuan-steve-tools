import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import type { IBranchShape } from './branch-shape-types'
import { layoutBranchChildren } from './branch-layout'

export type BranchChildSide = 'left' | 'right'

function getSideChildIds(branch: IBranchShape, side: BranchChildSide) {
	return side === 'left' ? branch.props.leftChildIds || [] : branch.props.rightChildIds || branch.props.childIds || []
}

function getInitialSingleBlockY(
	editor: Editor,
	branch: IBranchShape,
	side: BranchChildSide,
	rootY: number,
	initialHeight: number
) {
	const sideChildIds = getSideChildIds(branch, side)
	const verticalGap = Math.max(branch.props.verticalGap || 24, 8)
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

	const leftChildIds = [...(branch.props.leftChildIds || [])]
	const rightChildIds = [...(branch.props.rightChildIds || branch.props.childIds || [])]
	const newShapeId = createShapeId()

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
				childIds: rightChildIds,
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
