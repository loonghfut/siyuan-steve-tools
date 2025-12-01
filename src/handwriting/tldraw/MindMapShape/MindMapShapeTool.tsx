import { BaseBoxShapeTool } from '@tldraw/tldraw'

export class MindMapShapeTool extends BaseBoxShapeTool {
    static override id = 'mind-map'
    static override initial = 'idle'
    override shapeType = 'mind-map'
}
