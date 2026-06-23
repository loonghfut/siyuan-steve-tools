import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { IBranchShape } from './branch-shape-types'

export const branchShapeProps: RecordProps<IBranchShape> = {
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
	childIds: T.arrayOf(T.string),
	direction: T.string,
	horizontalGap: T.number,
	verticalGap: T.number,
	lineWidth: T.number,
	snapDistance: T.number,
	version: T.optional(T.number),
}
