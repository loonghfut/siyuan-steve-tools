import { Editor, TLShapeId, createShapeId, Vec } from '@tldraw/tldraw'
import { IBezierConnectorShape } from './bezier-connector-types'
import { getConnectorTerminals, createOrUpdateConnectorBinding } from './index'
import { getPortPagePosition, getShapePorts } from './port-utils'

export type NewShapeType = 'card' | 'single-block'

export function createAndBindShape(editor: Editor, connector: TLShapeId | IBezierConnectorShape, terminal: 'start' | 'end', type: NewShapeType): TLShapeId | null {
    try {
        const connectorShape = typeof connector === 'string' ? (editor.getShape(connector) as IBezierConnectorShape) : connector
        if (!connectorShape || connectorShape.type !== 'bezier-connector') return null

        // compute connector terminals and page transform
        const terminals = getConnectorTerminals(editor, connectorShape as IBezierConnectorShape)
        const pageTransform = editor.getShapePageTransform(connectorShape as any)

        const safeApply = (p: any) => {
            try {
                if (!pageTransform || p == null || Number.isNaN(p.x) || Number.isNaN(p.y)) return null
                const pt = pageTransform.applyToPoint(p)
                if (!isFinite(pt.x) || !isFinite(pt.y)) return null
                return pt
            } catch (err) {
                return null
            }
        }
        const startPage = safeApply(terminals.start) || (() => { const vb = editor.getViewportPageBounds(); return { x: (vb.minX + vb.maxX) / 2, y: (vb.minY + vb.maxY) / 2 } })()
        const endPage = safeApply(terminals.end) || (() => { const vb = editor.getViewportPageBounds(); return { x: (vb.minX + vb.maxX) / 2 + 100, y: (vb.minY + vb.maxY) / 2 } })()

        let tPos = terminal === 'start' ? startPage : endPage
        let otherPos = terminal === 'start' ? endPage : startPage
        if (!tPos || !otherPos) {
            const vb = editor.getViewportPageBounds()
            const center = { x: (vb.minX + vb.maxX) / 2, y: (vb.minY + vb.maxY) / 2 }
            if (!tPos) tPos = center
            if (!otherPos) otherPos = { x: center.x + 100, y: center.y }
        }

        // direction and orientation
        let dir = Vec.Sub(tPos, otherPos)
        if (!dir || (dir.x === 0 && dir.y === 0)) dir = { x: 1, y: 0 } as any
        const dx = dir.x
        const dy = dir.y
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)
        const orientation = absDx >= absDy ? 'horizontal' : 'vertical'

        const cardSize = { w: 300, h: 300 }
        const blockSize = { w: 300, h: 50 }
        const size = type === 'card' ? cardSize : blockSize
        const distance = Math.hypot(dx, dy)
        const baseGap = type === 'card' ? 36 : 16
        const gap = Math.max(baseGap * 0.5, Math.min(baseGap, distance * 0.15))

        let newCenter: { x: number; y: number }
        if (orientation === 'horizontal') {
            const sign = dx >= 0 ? 1 : -1
            newCenter = { x: tPos.x + sign * (size.w / 2 + gap), y: tPos.y }
        } else {
            const sign = dy >= 0 ? 1 : -1
            newCenter = { x: tPos.x, y: tPos.y + sign * (size.h / 2 + gap) }
        }
        if (!isFinite(newCenter.x) || !isFinite(newCenter.y)) {
            const vb = editor.getViewportPageBounds()
            newCenter = { x: (vb.minX + vb.maxX) / 2 + (size.w / 2 + gap), y: (vb.minY + vb.maxY) / 2 }
        }

        const defaultProps = type === 'card'
            ? { w: size.w, h: size.h, color: 'black', showMask: true, blockId: '' }
            : { w: size.w, h: size.h, color: 'black', blockId: '' }

        const newShapeId = createShapeId()
        editor.createShape({ id: newShapeId, type: type as any, x: Number.isFinite(newCenter.x) ? newCenter.x : 0, y: Number.isFinite(newCenter.y) ? newCenter.y : 0, props: defaultProps as any })

        // pick a port
        const ports = getShapePorts(editor, editor.getShape(newShapeId) as any) || {}
        let chosenPortId = Object.keys(ports)[0] || 'input'
        const horizontalPreferred = terminal === 'start' ? ['output', 'bottom', 'input', 'top'] : ['input', 'top', 'output', 'bottom']
        const verticalPreferred = terminal === 'start' ? ['bottom', 'output', 'top', 'input'] : ['top', 'input', 'bottom', 'output']
        const candidates = orientation === 'horizontal' ? horizontalPreferred : verticalPreferred
        let found = false
        for (const pid of candidates) {
            const pdef = ports[pid]
            if (pdef && pdef.terminal === terminal) { chosenPortId = pid; found = true; break }
        }
        if (!found) {
            let bestDist = Infinity
            for (const pid of Object.keys(ports)) {
                const p = ports[pid]
                if (!p) continue
                if (p.terminal !== terminal) continue
                const portPage = getPortPagePosition(editor, newShapeId, pid)
                if (!portPage) continue
                const d = Vec.Dist(portPage, tPos)
                if (d < bestDist) { bestDist = d; chosenPortId = pid }
            }
        }

        const portPage = getPortPagePosition(editor, newShapeId, chosenPortId)
        if (portPage) {
            const dxAlign = tPos.x - portPage.x
            const dyAlign = tPos.y - portPage.y
            if (Math.abs(dxAlign) > 0.001 || Math.abs(dyAlign) > 0.001) {
                const createdShape = editor.getShape(newShapeId)
                if (createdShape) {
                    editor.updateShape({ id: newShapeId, type: createdShape.type as any, x: (createdShape.x as number) + dxAlign, y: (createdShape.y as number) + dyAlign, props: { ...(createdShape as any).props } as any })
                }
            }
        }

        createOrUpdateConnectorBinding(editor, connectorShape.id, newShapeId, { portId: chosenPortId, terminal })
        editor.setSelectedShapes([newShapeId])

        return newShapeId
    } catch (err) {
        console.error('createAndBindShape failed', err)
        return null
    }
}

export default createAndBindShape
