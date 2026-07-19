import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { IBranchShape } from './branch-shape-types'

export function getBranchShapeDefaultProps(): IBranchShape['props'] {
	return {
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
		version: 7,
	}
}

export const branchShapeProps: RecordProps<IBranchShape> = {
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
	leftChildIds: T.optional(T.arrayOf(T.string)),
	rightChildIds: T.arrayOf(T.string),
	rootShapeId: T.optional(T.string),
	rootX: T.optional(T.number),
	direction: T.string,
	horizontalGap: T.number,
	verticalGap: T.number,
	lineWidth: T.number,
	lineStyle: T.optional(T.literalEnum('curve-solid', 'elbow-solid', 'straight-solid', 'curve-dashed', 'frame-floating', 'tree-table')),
	snapDistance: T.number,
	showBackground: T.optional(T.boolean),
	version: T.optional(T.number),
}
