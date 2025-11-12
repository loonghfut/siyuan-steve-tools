import { BaseBoxShapeTool } from '@tldraw/tldraw'

export class SingleBlockShapeTool extends BaseBoxShapeTool {
	static override id = 'single-block'
	static override initial = 'idle'
	override shapeType = 'single-block'
}
