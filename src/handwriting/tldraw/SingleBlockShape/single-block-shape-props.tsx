import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { ISingleBlockShape } from './single-block-shape-types'

export function getSingleBlockShapeDefaultProps(): ISingleBlockShape['props'] {
	return {
		w: 300,
		h: 50,
		color: 'black',
		blockId: '',
		previewText: '',
		isNewlyCreated: true,
		fontSize: 22,
		refreshNonce: Date.now(),
		connectOnEnter: false,
		transparentBackground: false,
		allowBinding: true,
	}
}

export const singleBlockShapeProps: RecordProps<ISingleBlockShape> = {
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
	blockId: T.string,
	previewText: T.optional(T.string),
	isNewlyCreated: T.optional(T.boolean),
	fontSize: T.optional(T.number),
	refreshNonce: T.optional(T.number),
	connectOnEnter: T.optional(T.boolean),
	allowBinding: T.optional(T.boolean),
	transparentBackground: T.optional(T.boolean),
}
