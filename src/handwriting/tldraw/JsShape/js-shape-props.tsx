import { DefaultColorStyle, RecordProps, T } from '@tldraw/tldraw'
import { IJsShape } from './js-shape-types'

export const jsShapeProps: RecordProps<IJsShape> = {
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
	script: T.string,
	// Deprecated: autoRun is no longer used, preserved for compatibility
	autoRun: T.optional(T.boolean),
	interactive: T.optional(T.boolean),
}
