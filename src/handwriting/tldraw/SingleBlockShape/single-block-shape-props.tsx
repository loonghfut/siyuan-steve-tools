import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { ISingleBlockShape } from './single-block-shape-types'

export const singleBlockShapeProps: RecordProps<ISingleBlockShape> = {
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
	blockId: T.string,
	isNewlyCreated: T.optional(T.boolean),
	fontSize: T.optional(T.number),
	refreshNonce: T.optional(T.number),
	connectOnEnter: T.optional(T.boolean),
	allowBinding: T.optional(T.boolean),
}
