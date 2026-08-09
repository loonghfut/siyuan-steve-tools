import { Box, Editor, TLShapeId, VecLike, createComputedCache } from '@tldraw/tldraw'
import { ShapePort, PortTerminal } from './bezier-connector-types'
import { getShapePorts, isPortSnappableShape, isShapeHitTargetable } from './shape-ports'

// 重新导出便于其他模块使用
export { getShapePorts, getPortPagePosition, isConnectableShape } from './shape-ports'

/**
 * 缓存每个 shape 的 page-space 端口位置与 bbox
 * 通过 createComputedCache 实现，当 shape 改变时自动失效
 */
const MAX_PORT_HIT_MARGIN = 200

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

			// 计算在页面空间的包围盒（考虑旋转/缩放），并包含外移后的端口位置
			const corners = [
				transform.applyToPoint({ x: bounds.x, y: bounds.y }),
				transform.applyToPoint({ x: bounds.x + bounds.width, y: bounds.y }),
				transform.applyToPoint({ x: bounds.x, y: bounds.y + bounds.height }),
				transform.applyToPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }),
			]
			const bboxPoints = [...corners, ...Object.values(pagePorts)]
			const xs = bboxPoints.map((c) => c.x)
			const ys = bboxPoints.map((c) => c.y)
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
		excludeShapeIds?: Set<TLShapeId>
	}
): {
	shapeId: TLShapeId
	port: ShapePort
} | null {
	// 默认基础识别范围（当无法计算形状大小时回退使用）
	const baseMargin = opts?.margin ?? 28

	// 获取当前画布缩放级别，用于缩放 margin 以保持屏幕空间的 hit area 一致性
	const zoom = editor.getZoomLevel()

	// Use tldraw's R-tree index to avoid walking the entire page on every
	// pointer move. shapeMargin is capped at MAX_PORT_HIT_MARGIN below, so every
	// potentially matching port belongs to a shape intersecting this search box.
	const candidateShapeIds = editor.getShapeIdsInsideBounds(
		new Box(
			point.x - MAX_PORT_HIT_MARGIN,
			point.y - MAX_PORT_HIT_MARGIN,
			MAX_PORT_HIT_MARGIN * 2,
			MAX_PORT_HIT_MARGIN * 2
		)
	)

	// 找到最近的端口（用平方距离避免开根号）
	let bestResult: {
		shapeId: TLShapeId
		port: ShapePort
		distanceSq: number
	} | null = null

	for (const shapeId of candidateShapeIds) {
		const shape = editor.getShape(shapeId)
		if (!shape) continue
		// 跳过排除的形状
		if (opts?.excludeShapeId && shape.id === opts.excludeShapeId) continue
		if (opts?.excludeShapeIds?.has(shape.id)) continue

		// 只吸附"会渲染端口 overlay"的形状，避免吸附到不可见端口
		if (!isPortSnappableShape(shape)) continue

		// 通过缓存获取该 shape 的 page-space 端口位置与 bbox
		const cache = shapePagePortsCache.get(editor, shape.id)
		if (!cache) continue
		const { pagePorts, bbox, portDefs } = cache as { pagePorts: Record<string, VecLike>; bbox: { minX: number; minY: number; maxX: number; maxY: number } | null; portDefs: Record<string, ShapePort> }
		if (!pagePorts || Object.keys(pagePorts).length === 0) continue

		// 根据形状大小动态计算识别范围（与端口 CSS hit area 保持一致的比例）
		// 然后按 zoom 缩放：缩小画布时放大 page-space margin，放大画布时缩小
		// clamp 8~200 避免极端缩放时 hit area 过大或过小
		const rawMargin = bbox
			? Math.max(baseMargin, Math.min(Math.sqrt((bbox.maxX - bbox.minX) ** 2 + (bbox.maxY - bbox.minY) ** 2) * 0.13, 38))
			: baseMargin
		const shapeMargin = Math.max(8, Math.min(rawMargin / zoom, MAX_PORT_HIT_MARGIN))

		// 快速过滤：若点不在 bbox + margin 内，跳过该 shape
		if (bbox) {
			if (
				point.x < bbox.minX - shapeMargin ||
				point.x > bbox.maxX + shapeMargin ||
				point.y < bbox.minY - shapeMargin ||
				point.y > bbox.maxY + shapeMargin
			) {
				continue
			}
		}

		const marginSq = shapeMargin * shapeMargin

		// 迭代 port
		const shapePorts = portDefs || getShapePorts(editor, shape) || {}
		for (const [portId, port] of Object.entries(pagePorts)) {
			// 若传入了 terminal 过滤条件，则仅匹配对应类型
			if (opts?.terminal) {
				const shapePortDef = shapePorts?.[portId]
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

	return {
		shapeId: bestResult.shapeId,
		port: bestResult.port,
	}
}

/**
 * 连接目标查找结果
 * precise=true 表示鼠标精确命中了某个端口；false 表示只是落在形状内部/边缘，
 * 端口由相对位置自动推断（后续形状移动时也应保持自动换边）。
 */
export interface ConnectionTarget {
	shapeId: TLShapeId
	port: ShapePort
	/** 是否精确命中端口 */
	precise: boolean
}

/**
 * 查找某个页面坐标处的连接目标：
 * 1. 优先精确匹配端口（getPortAtPoint）
 * 2. 否则命中形状本体（含少量外扩 margin），自动选择离指针最近的端口
 *
 * 这让用户把线拖到目标形状"任意位置"即可连接，无需精确对准端口小圆点。
 */
export function getConnectionTargetAtPoint(
	editor: Editor,
	point: VecLike,
	opts?: {
		margin?: number
		excludeShapeIds?: Set<TLShapeId>
	}
): ConnectionTarget | null {
	const excludeShapeIds = opts?.excludeShapeIds

	// 1. 精确端口命中
	const portHit = getPortAtPoint(editor, point, {
		margin: opts?.margin ?? 28,
		excludeShapeIds,
	})
	if (portHit) {
		return { ...portHit, precise: true }
	}

	// 2. 形状本体命中（含外扩 margin，随缩放调整）
	const zoom = editor.getZoomLevel()
	const hitShape = editor.getShapeAtPoint(point, {
		hitInside: true,
		margin: 8 / zoom,
		filter: (shape) => {
			if (excludeShapeIds?.has(shape.id)) return false
			if (!isShapeHitTargetable(shape)) return false
			// 必须有端口才能作为连接目标
			const ports = getShapePorts(editor, shape)
			return !!ports && Object.keys(ports).length > 0
		},
	})
	if (!hitShape) return null

	// 在命中的形状上选择离指针最近的端口
	const cache = shapePagePortsCache.get(editor, hitShape.id) as
		| { pagePorts: Record<string, VecLike>; portDefs: Record<string, ShapePort> }
		| undefined
	if (!cache || !cache.pagePorts) return null

	let bestPortId: string | null = null
	let bestDistSq = Infinity
	for (const [portId, pagePos] of Object.entries(cache.pagePorts)) {
		const dx = point.x - pagePos.x
		const dy = point.y - pagePos.y
		const distSq = dx * dx + dy * dy
		if (distSq < bestDistSq) {
			bestDistSq = distSq
			bestPortId = portId
		}
	}
	if (!bestPortId) return null

	const port = cache.portDefs?.[bestPortId]
	if (!port) return null

	return { shapeId: hitShape.id, port, precise: false }
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
