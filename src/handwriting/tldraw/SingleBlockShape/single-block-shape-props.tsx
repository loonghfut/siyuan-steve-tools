import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { ISingleBlockShape } from './single-block-shape-types'

export const singleBlockShapeProps: RecordProps<ISingleBlockShape> = {
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
	blockId: T.string,
	fontSize: T.optional(T.number),
	refreshNonce: T.optional(T.number),
}
