import { Editor, TLShapeId, Vec, VecLike } from '@tldraw/tldraw'
import { ShapePort, PortTerminal } from './bezier-connector-types'
import { getShapeConnections } from './bezier-connector-binding'
import { getShapePorts, CONNECTABLE_SHAPE_TYPES } from './shape-ports'

// 重新导出便于其他模块使用
export { getShapePorts, getPortPagePosition, isConnectableShape } from './shape-ports'
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

	// 获取当前页面的所有形状
	const shapes = editor.getCurrentPageShapes()

	// 找到最近的端口
	let bestResult: {
		shapeId: TLShapeId
		port: ShapePort
		distance: number
	} | null = null

	for (const shape of shapes) {
		// 跳过不支持的类型
		if (!CONNECTABLE_SHAPE_TYPES.includes(shape.type)) continue
		// 跳过排除的形状
		if (opts?.excludeShapeId && shape.id === opts.excludeShapeId) continue

		const ports = getShapePorts(editor, shape)
		if (!ports) continue

		const shapeTransform = editor.getShapePageTransform(shape)

		for (const port of Object.values(ports)) {
			// 如果指定了终端类型，只匹配对应类型的端口
			// 注意：terminal 'start' 表示输出端口，连接的起点
			// 连接的起点需要连到输出端口，连接的终点需要连到输入端口
			if (opts?.terminal) {
				// 拖拽 start 端时，需要连接到 start (output) 端口
				// 拖拽 end 端时，需要连接到 end (input) 端口
				if (port.terminal !== opts.terminal) continue
			}

			const portInPageSpace = shapeTransform.applyToPoint(port)
			const distance = Vec.Dist(point, portInPageSpace)

			if (distance < margin && (!bestResult || distance < bestResult.distance)) {
				bestResult = {
					shapeId: shape.id,
					port,
					distance,
				}
			}
		}
	}

	if (!bestResult) return null

	// 获取现有连接
	const existingConnections = getShapeConnections(editor, bestResult.shapeId).filter(
		(c) => c.ownPortId === bestResult!.port.id
	)

	return {
		shapeId: bestResult.shapeId,
		port: bestResult.port,
		existingConnections,
	}
}
