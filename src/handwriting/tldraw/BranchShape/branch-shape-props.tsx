import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { IBranchShape } from './branch-shape-types'

export const branchShapeProps: RecordProps<IBranchShape> = {
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
	childIds: T.arrayOf(T.string),
	leftChildIds: T.optional(T.arrayOf(T.string)),
	rightChildIds: T.optional(T.arrayOf(T.string)),
	rootShapeId: T.optional(T.string),
	rootX: T.optional(T.number),
	direction: T.string,
	horizontalGap: T.number,
	verticalGap: T.number,
	lineWidth: T.number,
	lineStyle: T.optional(T.literalEnum('curve-solid', 'elbow-solid', 'straight-solid', 'curve-dashed', 'frame-floating')),
	snapDistance: T.number,
	showBackground: T.optional(T.boolean),
	version: T.optional(T.number),
}
