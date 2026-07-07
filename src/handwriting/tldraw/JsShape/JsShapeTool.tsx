import { BaseBoxShapeTool } from '@tldraw/tldraw'

export class JsShapeTool extends BaseBoxShapeTool {
	static override id = 'js-shape'
	static override initial = 'idle'
	override shapeType = 'js-shape' as const
}

