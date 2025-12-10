import { Editor, TLShapeId, Vec, createShapeId } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'
import { createOrUpdateConnectorBinding } from '../BezierConnectorShape'
import { updatePortState } from '../BezierConnectorShape/port-state'
import { getPortPagePosition, getBestPortPair, getShapePorts } from '../BezierConnectorShape/port-utils'
import { settingdata } from '@/index'

// Legacy automatic placement helpers were removed — we now prefer explicit click-to-place.

export const createArrowBetweenShapes = (
    editor: Editor,
    source: ISingleBlockShape,
    target: ISingleBlockShape,
    color: string,
): TLShapeId | null => {
    // Try to read page bounds first; fall back to using shape center + props if needed
    let sourceBounds = editor.getShapePageBounds(source as any)
    let targetBounds = editor.getShapePageBounds(target as any)

    // If bounds are missing (can happen immediately after shape creation), construct approximate bounds
    if (!sourceBounds) {
        sourceBounds = {
            x: (source.x as number) || 0,
            y: (source.y as number) || 0,
            width: (source.props?.w as number) || 100,
            height: (source.props?.h as number) || 60,
            minX: ((source.x as number) || 0) - (((source.props?.w as number) || 100) / 2),
            minY: ((source.y as number) || 0) - (((source.props?.h as number) || 60) / 2),
            maxX: ((source.x as number) || 0) + (((source.props?.w as number) || 100) / 2),
            maxY: ((source.y as number) || 0) + (((source.props?.h as number) || 60) / 2),
            point: { x: ((source.x as number) || 0) - (((source.props?.w as number) || 100) / 2), y: ((source.y as number) || 0) - (((source.props?.h as number) || 60) / 2) },
            size: { x: (source.props?.w as number) || 100, y: (source.props?.h as number) || 60 },
        } as any
    }

    if (!targetBounds) {
        targetBounds = {
            x: (target.x as number) || 0,
            y: (target.y as number) || 0,
            width: (target.props?.w as number) || 100,
            height: (target.props?.h as number) || 60,
            minX: ((target.x as number) || 0) - (((target.props?.w as number) || 100) / 2),
            minY: ((target.y as number) || 0) - (((target.props?.h as number) || 60) / 2),
            maxX: ((target.x as number) || 0) + (((target.props?.w as number) || 100) / 2),
            maxY: ((target.y as number) || 0) + (((target.props?.h as number) || 60) / 2),
            point: { x: ((target.x as number) || 0) - (((target.props?.w as number) || 100) / 2), y: ((target.y as number) || 0) - (((target.props?.h as number) || 60) / 2) },
            size: { x: (target.props?.w as number) || 100, y: (target.props?.h as number) || 60 },
        } as any
    }

    const sourceTransform = editor.getShapePageTransform(source as any)
    const targetTransform = editor.getShapePageTransform(target as any)
    const startRotation = sourceTransform?.rotation ? sourceTransform.rotation() : 0
    const endRotation = targetTransform?.rotation ? targetTransform.rotation() : 0
    const normalizedAnchor = { x: 0.5, y: 0.5 }
    const startPoint = Vec.Add(
        sourceBounds.point,
        Vec.MulV(sourceBounds.size, Vec.Rot(Vec.From(normalizedAnchor), startRotation)),
    )
    const endPoint = Vec.Add(
        targetBounds.point,
        Vec.MulV(targetBounds.size, Vec.Rot(Vec.From(normalizedAnchor), endRotation)),
    )
    const arrowOrigin = Vec.Min(startPoint, endPoint)
    const connectorKind = String(settingdata['tldraw-connector-kind'] || 'bezier') === 'bezier' ? 'bezier' : 'arrow'

    if (connectorKind === 'bezier') {
        const startPoint = Vec.Add(
            sourceBounds.point,
            Vec.MulV(sourceBounds.size, Vec.Rot(Vec.From(normalizedAnchor), startRotation)),
        )
        const endPoint = Vec.Add(
            targetBounds.point,
            Vec.MulV(targetBounds.size, Vec.Rot(Vec.From(normalizedAnchor), endRotation)),
        )

        const connectorId = createShapeId()
        // try to use ports
        const { sourcePortId, targetPortId } = getBestPortPair(editor, source.id, target.id)
        let sourcePagePos = getPortPagePosition(editor, source.id, sourcePortId) || startPoint
        let targetPagePos = getPortPagePosition(editor, target.id, targetPortId) || endPoint

        editor.createShape({
            id: connectorId,
            type: 'bezier-connector',
            x: 0,
            y: 0,
            props: {
                start: { x: sourcePagePos.x, y: sourcePagePos.y },
                end: { x: targetPagePos.x, y: targetPagePos.y },
                color,
                strokeWidth: 3,
            },
        })
        const sourcePorts = getShapePorts(editor, source as any)
        const targetPorts = getShapePorts(editor, target as any)
        const sourceTerminal = (sourcePorts && sourcePorts[sourcePortId] && sourcePorts[sourcePortId].terminal) || 'start'
        const targetTerminal = (targetPorts && targetPorts[targetPortId] && targetPorts[targetPortId].terminal) || 'end'
        if (sourceTerminal === 'end' && targetTerminal === 'start') {
            const tmp = sourcePagePos
            sourcePagePos = targetPagePos
            targetPagePos = tmp
        }
        createOrUpdateConnectorBinding(editor, connectorId, source.id, { portId: sourcePortId, terminal: sourceTerminal as any })
        createOrUpdateConnectorBinding(editor, connectorId, target.id, { portId: targetPortId, terminal: targetTerminal as any })
        try {
            updatePortState(editor, { flashPort: { shapeId: source.id as any, portId: sourcePortId } })
            updatePortState(editor, { flashPort: { shapeId: target.id as any, portId: targetPortId } })
            setTimeout(() => updatePortState(editor, { flashPort: null }), 350)
        } catch (e) {}

        return connectorId
    }

    const arrowId = createShapeId()

    editor.createShape({
        id: arrowId,
        type: 'arrow',
        x: arrowOrigin.x,
        y: arrowOrigin.y,
        props: {
            color,
            start: {
                x: startPoint.x - arrowOrigin.x,
                y: startPoint.y - arrowOrigin.y,
            },
            end: {
                x: endPoint.x - arrowOrigin.x,
                y: endPoint.y - arrowOrigin.y,
            },
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
        },
    })

    editor.createBindings([
        {
            fromId: arrowId,
            toId: source.id,
            type: 'arrow',
            props: {
                terminal: 'start',
                normalizedAnchor,
                isExact: false,
                isPrecise: false,
            },
        },
        {
            fromId: arrowId,
            toId: target.id,
            type: 'arrow',
            props: {
                terminal: 'end',
                normalizedAnchor,
                isExact: false,
                isPrecise: false,
            },
        },
    ])
    try {
        // attempt to find best ports for visual feedback
        const { sourcePortId: sourcePort, targetPortId: targetPort } = getBestPortPair(editor, source.id, target.id)
        updatePortState(editor, { flashPort: { shapeId: source.id as any, portId: sourcePort }, flashConnectorId: arrowId })
        updatePortState(editor, { flashPort: { shapeId: target.id as any, portId: targetPort }, flashConnectorId: arrowId })
        setTimeout(() => updatePortState(editor, { flashPort: null, flashConnectorId: null }), 350)
    } catch (e) {}

    return arrowId
}

export const createConnectedSingleBlockAt = (
    editor: Editor,
    anchorId: TLShapeId,
    pageX: number,
    pageY: number,
) => {
    const anchorShape = editor.getShape(anchorId)
    if (!anchorShape || anchorShape.type !== 'single-block') {
        showMessage('只能在单块上创建关联块', 3000, 'error')
        return
    }

    const anchorBlock = anchorShape as ISingleBlockShape
    // use provided pageX/pageY as center for the new shape
    const width = Math.max(editor.getShapePageBounds(anchorBlock)?.width ?? anchorBlock.props.w ?? 300, anchorBlock.props.w ?? 300)
    const height = Math.max(editor.getShapePageBounds(anchorBlock)?.height ?? anchorBlock.props.h ?? 50, anchorBlock.props.h ?? 50)

    editor.run(() => {
        const shapeId = createShapeId()
        editor.createShape({
            id: shapeId,
            type: 'single-block',
            x: pageX,
            y: pageY,
            props: {
                w: width,
                h: height,
                color: anchorBlock.props.color ?? 'black',
                isNewlyCreated: true,
                blockId: '',
            },
        })

        const createdShape = editor.getShape(shapeId)
        if (createdShape && createdShape.type === 'single-block') {
            createArrowBetweenShapes(editor, anchorBlock, createdShape as ISingleBlockShape, anchorBlock.props.color ?? 'black')
            editor.setSelectedShapes([createdShape.id])
        }
    })

    showMessage('已在指定位置添加单块并生成连线', 2000, 'info')
}

// keep file focused: createConnectedSingleBlockAt is the canonical API for placement + binding
