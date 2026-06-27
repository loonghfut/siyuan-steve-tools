import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import type { IBranchShape } from './branch-shape-types'
import { layoutBranchChildren } from './branch-layout'

export type BranchChildSide = 'left' | 'right'

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
			y: rootY - initialHeight / 2,
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
