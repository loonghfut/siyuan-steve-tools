import { Editor, TLShapeId, VecLike, createComputedCache } from '@tldraw/tldraw'
import { ShapePort, PortTerminal } from './bezier-connector-types'
import { getShapeConnections } from './bezier-connector-binding'
import { getShapePorts } from './shape-ports'

// 重新导出便于其他模块使用
export { getShapePorts, getPortPagePosition, isConnectableShape } from './shape-ports'

/**
 * 缓存每个 shape 的 page-space 端口位置与 bbox
 * 通过 createComputedCache 实现，当 shape 改变时自动失效
 */
const shapePagePortsCache = createComputedCache(
	'shape page ports',
	(editor: Editor, shapeOrId: any) => {
		const shapeId = typeof shapeOrId === 'string' ? shapeOrId : shapeOrId?.id
		const shape = editor.getShape(shapeId)
		if (!shape) return { pagePorts: {}, bbox: null }

		const geometry = editor.getShapeGeometry(shape)
		const bounds = geometry.bounds
		const transform = editor.getShapePageTransform(shape)

		const ports = getShapePorts(editor, shape) || {}
		const pagePorts: Record<string, VecLike> = {}
		for (const p of Object.values(ports)) {
			pagePorts[p.id] = transform.applyToPoint(p)
		}

		// 计算在页面空间的包围盒（考虑旋转/缩放）
		const corners = [
			transform.applyToPoint({ x: bounds.x, y: bounds.y }),
			transform.applyToPoint({ x: bounds.x + bounds.width, y: bounds.y }),
			transform.applyToPoint({ x: bounds.x, y: bounds.y + bounds.height }),
			transform.applyToPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }),
		]
		const xs = corners.map((c) => c.x)
		const ys = corners.map((c) => c.y)
		const bbox = {
			minX: Math.min(...xs),
			minY: Math.min(...ys),
			maxX: Math.max(...xs),
			maxY: Math.max(...ys),
		}
		return { pagePorts, bbox, portDefs: ports }
	}
)

export function getPortAtPoint(
	editor: Editor,
	point: VecLike,
	opts?: {
		terminal?: PortTerminal
		margin?: number
		excludeShapeId?: TLShapeId
	}
): {
	shapeId: TLShapeId
	port: ShapePort
	existingConnections: ReturnType<typeof getShapeConnections>
} | null {
	const margin = opts?.margin ?? 8
	const marginSq = margin * margin

	// 获取当前页面的所有形状
	const shapes = editor.getCurrentPageShapes()

	// 找到最近的端口（用平方距离避免开根号）
	let bestResult: {
		shapeId: TLShapeId
		port: ShapePort
		distanceSq: number
	} | null = null

	for (const shape of shapes) {
		// 跳过排除的形状
		if (opts?.excludeShapeId && shape.id === opts.excludeShapeId) continue

		// 通过缓存获取该 shape 的 page-space 端口位置与 bbox
		const cache = shapePagePortsCache.get(editor, shape.id)
		if (!cache) continue
		const { pagePorts, bbox, portDefs } = cache as { pagePorts: Record<string, VecLike>; bbox: { minX: number; minY: number; maxX: number; maxY: number } | null; portDefs: Record<string, ShapePort> }
		if (!pagePorts || Object.keys(pagePorts).length === 0) continue

		// 快速过滤：若点不在 bbox + margin 内，跳过该 shape
		if (bbox) {
			if (
				point.x < bbox.minX - margin ||
				point.x > bbox.maxX + margin ||
				point.y < bbox.minY - margin ||
				point.y > bbox.maxY + margin
			) {
				continue
			}
		}

		// 迭代 port
		const shapePorts = portDefs || getShapePorts(editor, shape) || {}
		for (const [portId, port] of Object.entries(pagePorts)) {
			// 若传入了 terminal 过滤条件，则仅匹配对应类型
			if (opts?.terminal) {
				// 端口类型信息不在 pagePorts 中，因此需要直接 getShapePorts once
				const shapePortDef = shapePorts?.[portId]
				// 如果没找到定义或类型不匹配则跳过
				if (!shapePortDef || shapePortDef.terminal !== opts.terminal) continue
			}

			const dx = point.x - port.x
			const dy = point.y - port.y
			const distSq = dx * dx + dy * dy
						if (distSq < marginSq && (!bestResult || distSq < bestResult.distanceSq)) {
								bestResult = {
									shapeId: shape.id,
									port: (shapePorts || {})[portId] as ShapePort,
									distanceSq: distSq,
								}
							}
		}
	}

	if (!bestResult) return null

	// 获取现有连接
	const existingConnections = getShapeConnections(editor, bestResult.shapeId).filter((c) => c.ownPortId === bestResult!.port.id)

	return {
		shapeId: bestResult.shapeId,
		port: bestResult.port,
		existingConnections,
	}
}

/**
 * 根据两个形状的相对位置判断最佳端口对（sourcePort/targetPort）。
 * 规则：
 * - 若水平距离更大（|dx| > |dy|），则使用左右端口。若 target 在 source 的右侧，则 source.output -> target.input 否则反向
 * - 若垂直距离更大，则使用上下端口。若 target 在 source 下方，则 source.bottom -> target.top 否则反向
 * - 在重叠或极近时使用左右优先（作为默认），并在需要时回退到 output/input
 */
export function getBestPortPair(
	editor: Editor,
	sourceId: TLShapeId,
	targetId: TLShapeId
): { sourcePortId: string; targetPortId: string } {
	// get center/page bbox
	const sourceCache = shapePagePortsCache.get(editor, sourceId) as any
	const targetCache = shapePagePortsCache.get(editor, targetId) as any
	// fallback to page transforms
	const sBbox = sourceCache?.bbox
	const tBbox = targetCache?.bbox
	const sCenter = sBbox
		? { x: (sBbox.minX + sBbox.maxX) / 2, y: (sBbox.minY + sBbox.maxY) / 2 }
		: (() => {
			  const pb = editor.getShapePageBounds(sourceId as any)
			  return pb ? { x: pb.point.x + pb.size.x / 2, y: pb.point.y + pb.size.y / 2 } : undefined
		  })()
	const tCenter = tBbox
		? { x: (tBbox.minX + tBbox.maxX) / 2, y: (tBbox.minY + tBbox.maxY) / 2 }
		: (() => {
			  const pb = editor.getShapePageBounds(targetId as any)
			  return pb ? { x: pb.point.x + pb.size.x / 2, y: pb.point.y + pb.size.y / 2 } : undefined
		  })()

	let dx = 0
	let dy = 0
	if (sCenter && tCenter) {
		dx = tCenter.x - sCenter.x
		dy = tCenter.y - sCenter.y
	}

	const absDx = Math.abs(dx)
	const absDy = Math.abs(dy)
	// 默认端口
	let sourcePort = 'output'
	let targetPort = 'input'

	if (absDx >= absDy) {
		// 水平主轴
		if (dx >= 0) {
			sourcePort = 'output'
			targetPort = 'input'
		} else {
			sourcePort = 'input'
			targetPort = 'output'
		}
	} else {
		// 垂直主轴
		if (dy >= 0) {
			sourcePort = 'bottom'
			targetPort = 'top'
		} else {
			sourcePort = 'top'
			targetPort = 'bottom'
		}
	}

	return { sourcePortId: sourcePort, targetPortId: targetPort }
}
