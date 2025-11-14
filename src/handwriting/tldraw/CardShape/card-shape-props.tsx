import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { ICardShape } from './card-shape-types'

// Validation for our custom card shape's props, using one of tldraw's default styles
export const cardShapeProps: RecordProps<ICardShape> = {
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
	showMask: T.boolean,
	blockId: T.string,
	isNewlyCreated: T.optional(T.boolean),
	fontSize: T.optional(T.number),
	isMain: T.optional(T.boolean),
	version: T.optional(T.number), // 添加 vision 属性
	refreshNonce: T.optional(T.number), // 添加 refreshNonce 属性
	isCollapsed: T.optional(T.boolean), // 添加折叠状态属性
}

// To generate your own custom styles, check out the custom styles example.