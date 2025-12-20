import { Editor, TLShapeId, Vec, createShapeId, toRichText } from '@tldraw/tldraw'
import {
	IBezierConnectorShape,
	createOrUpdateConnectorBinding,
	getConnectorTerminals,
} from '../BezierConnectorShape'
import {
	getBestPortPair,
	getPortPagePosition,
	getShapePorts,
} from '../BezierConnectorShape/port-utils'

type ArrowBindingLike = {
	toId: TLShapeId
	props?: {
		terminal?: 'start' | 'end'
		normalizedAnchor?: { x: number; y: number }
	}
}

type ArrowShapeLike = {
	id: TLShapeId
	type: 'arrow'
	x: number
	y: number
	props?: {
		color?: string
		richText?: any
		labelPosition?: number
		start?: { x: number; y: number }
		end?: { x: number; y: number }
		arrowheadStart?: string
		arrowheadEnd?: string
	}
}

function clamp01(n: number) {
	if (!Number.isFinite(n)) return 0.5
	return Math.max(0, Math.min(1, n))
}

function getArrowBindings(editor: Editor, arrowId: TLShapeId) {
	const arrow = editor.getShape(arrowId) as any
	const bindings = editor.getBindingsFromShape(arrow, 'arrow') as ArrowBindingLike[]
	const startBinding = bindings?.find((b) => b.props?.terminal === 'start')
	const endBinding = bindings?.find((b) => b.props?.terminal === 'end')
	return { bindings, startBinding, endBinding }
}

function getArrowEndpointInPage(editor: Editor, arrow: ArrowShapeLike, terminal: 'start' | 'end') {
	const local = terminal === 'start' ? arrow.props?.start : arrow.props?.end
	if (!local) return null
	try {
		const tx = editor.getShapePageTransform(arrow as any)
		return tx.applyToPoint(local)
	} catch {
		return { x: arrow.x + local.x, y: arrow.y + local.y }
	}
}

function computeNormalizedAnchorFromPort(editor: Editor, shapeId: TLShapeId, portId?: string) {
	if (!portId) return { x: 0.5, y: 0.5 }
	const shape = editor.getShape(shapeId) as any
	if (!shape) return { x: 0.5, y: 0.5 }
	const ports = getShapePorts(editor, shape)
	const port = ports?.[portId]
	if (!port) return { x: 0.5, y: 0.5 }
	const bounds = editor.getShapeGeometry(shape).bounds
	const w = bounds.width || 1
	const h = bounds.height || 1
	return { x: clamp01(port.x / w), y: clamp01(port.y / h) }
}

export function convertArrowToBezier(editor: Editor, arrowId: TLShapeId): TLShapeId | null {
	const arrow = editor.getShape(arrowId) as ArrowShapeLike | undefined
	if (!arrow || arrow.type !== 'arrow') return null

	const { startBinding, endBinding } = getArrowBindings(editor, arrowId)

	const arrowheadTarget: 'start' | 'end' = arrow.props?.arrowheadStart === 'arrow' ? 'start' : 'end'
	const arrowheadSource: 'start' | 'end' = arrowheadTarget === 'start' ? 'end' : 'start'

	const sourceShapeId = (arrowheadSource === 'start' ? startBinding?.toId : endBinding?.toId) as TLShapeId | undefined
	const targetShapeId = (arrowheadTarget === 'start' ? startBinding?.toId : endBinding?.toId) as TLShapeId | undefined

	const fallbackStart = getArrowEndpointInPage(editor, arrow, 'start')
	const fallbackEnd = getArrowEndpointInPage(editor, arrow, 'end')
	if (!fallbackStart || !fallbackEnd) return null

	let sourcePortId: string | undefined
	let targetPortId: string | undefined
	if (sourceShapeId && targetShapeId) {
		const best = getBestPortPair(editor, sourceShapeId, targetShapeId)
		sourcePortId = best.sourcePortId
		targetPortId = best.targetPortId
	}

	let sourcePagePos = (sourceShapeId && sourcePortId)
		? getPortPagePosition(editor, sourceShapeId, sourcePortId)
		: null
	let targetPagePos = (targetShapeId && targetPortId)
		? getPortPagePosition(editor, targetShapeId, targetPortId)
		: null

	// fallback to arrow endpoints
	if (!sourcePagePos) sourcePagePos = fallbackStart
	if (!targetPagePos) targetPagePos = fallbackEnd

	const connectorId = createShapeId()
	const color = arrow.props?.color || 'black'
	const richText = arrow.props?.richText ?? toRichText('')
	const labelPosition = typeof arrow.props?.labelPosition === 'number' ? arrow.props.labelPosition : 0.5

	// Determine terminals based on port definitions
	let startPagePos = sourcePagePos
	let endPagePos = targetPagePos
	let startTerminal: 'start' | 'end' = 'start'
	let endTerminal: 'start' | 'end' = 'end'

	if (sourceShapeId && sourcePortId) {
		const ports = getShapePorts(editor, editor.getShape(sourceShapeId) as any) || {}
		startTerminal = (ports[sourcePortId]?.terminal as any) || 'start'
	}
	if (targetShapeId && targetPortId) {
		const ports = getShapePorts(editor, editor.getShape(targetShapeId) as any) || {}
		endTerminal = (ports[targetPortId]?.terminal as any) || 'end'
	}

	// If the computed terminals are inverted, swap geometry so connector's start/end align.
	if (startTerminal === 'end' && endTerminal === 'start') {
		const tmp = startPagePos
		startPagePos = endPagePos
		endPagePos = tmp
	}

	editor.createShape({
		id: connectorId,
		type: 'bezier-connector',
		x: 0,
		y: 0,
		props: {
			start: { x: startPagePos.x, y: startPagePos.y },
			end: { x: endPagePos.x, y: endPagePos.y },
			color,
			strokeWidth: 3,
			strokeStyle: 'solid',
			richText,
			labelPosition,
		},
	})

	// Create bindings if we know both endpoints
	if (sourceShapeId && targetShapeId && sourcePortId && targetPortId) {
		createOrUpdateConnectorBinding(editor, connectorId, sourceShapeId, {
			portId: sourcePortId,
			terminal: startTerminal as any,
		})
		createOrUpdateConnectorBinding(editor, connectorId, targetShapeId, {
			portId: targetPortId,
			terminal: endTerminal as any,
		})
	}

	editor.deleteShapes([arrowId])
	editor.setSelectedShapes([connectorId])
	try {
		editor.sendToBack([connectorId])
	} catch {}
	return connectorId
}

export function convertBezierToArrow(editor: Editor, connectorId: TLShapeId): TLShapeId | null {
	const connector = editor.getShape(connectorId) as IBezierConnectorShape | undefined
	if (!connector || connector.type !== 'bezier-connector') return null

	const terminals = getConnectorTerminals(editor, connector)
	const connectorTx = editor.getShapePageTransform(connector as any)

	const startFallbackPage = connectorTx.applyToPoint(terminals.start)
	const endFallbackPage = connectorTx.applyToPoint(terminals.end)

	const startPagePos = (terminals.startShapeId && terminals.startPortId)
		? (getPortPagePosition(editor, terminals.startShapeId, terminals.startPortId) || startFallbackPage)
		: startFallbackPage
	const endPagePos = (terminals.endShapeId && terminals.endPortId)
		? (getPortPagePosition(editor, terminals.endShapeId, terminals.endPortId) || endFallbackPage)
		: endFallbackPage

	const arrowOrigin = Vec.Min(startPagePos, endPagePos)
	const arrowId = createShapeId()
	const color = (connector.props as any)?.color || 'black'
	const richText = (connector.props as any)?.richText ?? toRichText('')
	const labelPosition = typeof (connector.props as any)?.labelPosition === 'number' ? (connector.props as any).labelPosition : 0.5

	editor.createShape({
		id: arrowId,
		type: 'arrow',
		x: arrowOrigin.x,
		y: arrowOrigin.y,
		props: {
			color,
			start: { x: startPagePos.x - arrowOrigin.x, y: startPagePos.y - arrowOrigin.y },
			end: { x: endPagePos.x - arrowOrigin.x, y: endPagePos.y - arrowOrigin.y },
			richText,
			labelPosition,
			arrowheadStart: 'none',
			arrowheadEnd: 'arrow',
		},
	})

	// Bind ends when possible
	const bindingsToCreate: any[] = []
	if (terminals.startShapeId) {
		bindingsToCreate.push({
			fromId: arrowId,
			toId: terminals.startShapeId,
			type: 'arrow',
			props: {
				terminal: 'start',
				normalizedAnchor: computeNormalizedAnchorFromPort(editor, terminals.startShapeId, terminals.startPortId),
				isExact: false,
				isPrecise: false,
			},
		})
	}
	if (terminals.endShapeId) {
		bindingsToCreate.push({
			fromId: arrowId,
			toId: terminals.endShapeId,
			type: 'arrow',
			props: {
				terminal: 'end',
				normalizedAnchor: computeNormalizedAnchorFromPort(editor, terminals.endShapeId, terminals.endPortId),
				isExact: false,
				isPrecise: false,
			},
		})
	}
	if (bindingsToCreate.length) {
		editor.createBindings(bindingsToCreate)
	}

	editor.deleteShapes([connectorId])
	editor.setSelectedShapes([arrowId])
	try {
		editor.sendToBack([arrowId])
	} catch {}
	return arrowId
}

export function convertConnectorsToBezier(editor: Editor, shapeIds: TLShapeId[]): TLShapeId[] {
	const nextIds: TLShapeId[] = []
	for (const id of shapeIds) {
		const shape = editor.getShape(id) as any
		if (!shape) continue
		if (shape.type === 'bezier-connector') {
			nextIds.push(id)
			continue
		}
		if (shape.type === 'arrow') {
			const next = convertArrowToBezier(editor, id)
			if (next) nextIds.push(next)
		}
	}
	if (nextIds.length) {
		editor.setSelectedShapes(nextIds)
		try { editor.sendToBack(nextIds) } catch {}
	}
	return nextIds
}

export function convertConnectorsToArrow(editor: Editor, shapeIds: TLShapeId[]): TLShapeId[] {
	const nextIds: TLShapeId[] = []
	for (const id of shapeIds) {
		const shape = editor.getShape(id) as any
		if (!shape) continue
		if (shape.type === 'arrow') {
			nextIds.push(id)
			continue
		}
		if (shape.type === 'bezier-connector') {
			const next = convertBezierToArrow(editor, id)
			if (next) nextIds.push(next)
		}
	}
	if (nextIds.length) {
		editor.setSelectedShapes(nextIds)
		try { editor.sendToBack(nextIds) } catch {}
	}
	return nextIds
}
