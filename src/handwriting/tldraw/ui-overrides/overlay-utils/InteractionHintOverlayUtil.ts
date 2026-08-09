import { Box, Editor, OverlayUtil, TLOverlay, TLShapeId } from '@tldraw/tldraw'
import { getPortPagePosition } from '../../BezierConnectorShape/port-utils'
import { getPortState } from '../../BezierConnectorShape/port-state'
import {
	getPendingConnectedSingleBlockState,
} from '../../utils/pendingConnectedSingleBlockState'

type InteractionOverlay =
	| TLOverlay<{
			kind: 'port'
			x: number
			y: number
			radius: number
			color: string
			fill: string
	  }>
	| TLOverlay<{
			kind: 'bounds'
			box: Box
			color: string
			lineDash?: number[]
			fill?: string
			label?: string
	  }>

function getShapeBounds(editor: Editor, shapeId: TLShapeId | null) {
	if (!shapeId) return null
	const shape = editor.getShape(shapeId)
	if (!shape) return null
	return editor.getShapePageBounds(shape)
}

export class InteractionHintOverlayUtil extends OverlayUtil<InteractionOverlay> {
	static override type = 'st-interaction-hints'

	override options = {
		zIndex: 425,
	}

	override isActive(): boolean {
		const portState = getPortState(this.editor)
		const pendingState = getPendingConnectedSingleBlockState(this.editor)
		return Boolean(
				portState.hintingPort ||
				portState.flashPort ||
				pendingState.anchorId
			)
	}

	override getOverlays(): InteractionOverlay[] {
		const overlays: InteractionOverlay[] = []
		const portState = getPortState(this.editor)
		const pendingState = getPendingConnectedSingleBlockState(this.editor)

		if (portState.hintingPort) {
			const point = getPortPagePosition(this.editor, portState.hintingPort.shapeId as TLShapeId, portState.hintingPort.portId)
			if (point) {
				overlays.push({
					id: `st-port-hint:${portState.hintingPort.shapeId}:${portState.hintingPort.portId}`,
					type: InteractionHintOverlayUtil.type,
					props: {
						kind: 'port',
						x: point.x,
						y: point.y,
						radius: 12,
						color: '#3b82f6',
						fill: 'rgba(59, 130, 246, 0.12)',
					},
				})
			}
		}

		if (portState.flashPort) {
			const point = getPortPagePosition(this.editor, portState.flashPort.shapeId as TLShapeId, portState.flashPort.portId)
			if (point) {
				overlays.push({
					id: `st-port-flash:${portState.flashPort.shapeId}:${portState.flashPort.portId}`,
					type: InteractionHintOverlayUtil.type,
					props: {
						kind: 'port',
						x: point.x,
						y: point.y,
						radius: 16,
						color: '#22c55e',
						fill: 'rgba(34, 197, 94, 0.16)',
					},
				})
			}
		}

		if (pendingState.anchorId) {
			const anchorBounds = getShapeBounds(this.editor, pendingState.anchorId)
			if (anchorBounds) {
				overlays.push({
					id: `st-pending-anchor:${pendingState.anchorId}`,
					type: InteractionHintOverlayUtil.type,
					props: {
						kind: 'bounds',
						box: anchorBounds.clone().expandBy(10 / this.editor.getZoomLevel()),
						color: '#f59e0b',
						lineDash: [10 / this.editor.getZoomLevel(), 6 / this.editor.getZoomLevel()],
						fill: 'rgba(245, 158, 11, 0.08)',
						label: '关联单块',
					},
				})
			}

			if (anchorBounds && pendingState.previewPoint) {
				const previewBox = new Box(
					pendingState.previewPoint.x,
					pendingState.previewPoint.y,
					Math.max(anchorBounds.width, 300),
					Math.max(anchorBounds.height, 50)
				)
				overlays.push({
					id: `st-pending-preview:${pendingState.anchorId}`,
					type: InteractionHintOverlayUtil.type,
					props: {
						kind: 'bounds',
						box: previewBox,
						color: '#f59e0b',
						lineDash: [12 / this.editor.getZoomLevel(), 6 / this.editor.getZoomLevel()],
						fill: 'rgba(245, 158, 11, 0.10)',
					},
				})
			}
		}

		return overlays
	}

	override render(ctx: CanvasRenderingContext2D, overlays: InteractionOverlay[]) {
		const zoom = this.editor.getZoomLevel()
		const fontSize = 12 / zoom

		for (const overlay of overlays) {
			if (overlay.props.kind === 'port') {
				const { x, y, radius, color, fill } = overlay.props
				ctx.save()
				ctx.beginPath()
				ctx.fillStyle = fill
				ctx.strokeStyle = color
				ctx.lineWidth = 2 / zoom
				ctx.arc(x, y, radius / zoom, 0, Math.PI * 2)
				ctx.fill()
				ctx.stroke()
				ctx.restore()
				continue
			}

			const { box, color, lineDash, fill, label } = overlay.props
			ctx.save()
			ctx.strokeStyle = color
			ctx.fillStyle = fill ?? 'transparent'
			ctx.lineWidth = 2 / zoom
			ctx.setLineDash(lineDash ?? [])
			ctx.beginPath()
			ctx.roundRect(box.x, box.y, box.w, box.h, 10 / zoom)
			if (fill) ctx.fill()
			ctx.stroke()

			if (label) {
				ctx.font = `600 ${fontSize}px sans-serif`
				ctx.fillStyle = color
				ctx.setLineDash([])
				ctx.fillText(label, box.x, box.y - 8 / zoom)
			}
			ctx.restore()
		}
	}
}
