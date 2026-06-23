import { BaseBoxShapeTool } from '@tldraw/tldraw'

export class BranchShapeTool extends BaseBoxShapeTool {
	static override id = 'branch'
	static override initial = 'idle'
	override shapeType = 'branch'
}
