import { BaseBoxShapeTool, TLCompleteEventInfo, TLPointerEventInfo } from '@tldraw/tldraw'
export class CardShapeTool extends BaseBoxShapeTool {
	static override id = 'card'
	static override initial = 'idle'
	override shapeType = 'card'
	// override onComplete(info: TLCompleteEventInfo): void {
	// 	// Handle double click event here
	// 	// For example, you can open a modal or perform some action
	// 	console.log('CardShapeTool double clicked', info)
	// }
	// onMiddleClick(info: TLPointerEventInfo): void {
	// 	// Handle middle click event here
	// 	// For example, you can open a context menu or perform some action
	// 	console.log('CardShapeTool middle clicked', info)
	// }
	// onPointerDown(info: TLPointerEventInfo): void {
	// 	// Handle pointer down event here
	// 	// For example, you can start dragging the shape or perform some action
	// 	console.log('CardShapeTool pointer down', info)
	// }
}
/*
This file contains our custom tool. The tool is a StateNode with the `id` "card".

We get a lot of functionality for free by extending the BaseBoxShapeTool. but we can
handle events in out own way by overriding methods like onDoubleClick. For an example 
of a tool with more custom functionality, check out the screenshot-tool example. 

*/