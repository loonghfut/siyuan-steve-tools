import { Editor, TLShape, TLShapeId, VecLike } from '@tldraw/tldraw'
import { ShapePort } from './bezier-connector-types'

/**
 * 支持端口连接的形状类型
 */
export const CONNECTABLE_SHAPE_TYPES = ['card', 'single-block']

/**
 * 获取形状的端口定义
 * 端口位于形状的左侧（输入）和右侧（输出）
 */
export function getShapePorts(
	editor: Editor,
	shape: TLShape
): Record<string, ShapePort> | null {
	if (!CONNECTABLE_SHAPE_TYPES.includes(shape.type)) {
		return null
	}

	const bounds = editor.getShapeGeometry(shape).bounds

	// 获取形状的中心坐标
	const centerY = bounds.height / 2
	const centerX = bounds.width / 2

	// 支持上下左右四个端口：left/right 保持原有语义；top/bottom 新增
	return {
		input: {
			id: 'input',
			x: 0, // 左边缘
			y: centerY,
			terminal: 'end', // 输入端口对应连接的终点
		},
		output: {
			id: 'output',
			x: bounds.width, // 右边缘
			y: centerY,
			terminal: 'start', // 输出端口对应连接的起点
		},
		top: {
			id: 'top',
			x: centerX,
			y: 0,
			terminal: 'end',
		},
		bottom: {
			id: 'bottom',
			x: centerX,
			y: bounds.height,
			terminal: 'start',
		},
	}
}

/**
 * 获取端口的页面坐标
 */
export function getPortPagePosition(
	editor: Editor,
	shapeId: TLShapeId,
	portId: string
): VecLike | null {
	const shape = editor.getShape(shapeId)
	if (!shape) return null

	const ports = getShapePorts(editor, shape)
	if (!ports || !ports[portId]) return null

	const port = ports[portId]
	return editor.getShapePageTransform(shape).applyToPoint(port)
}

/**
 * 检查形状是否支持端口连接
 */
export function isConnectableShape(shape: TLShape): boolean {
	return CONNECTABLE_SHAPE_TYPES.includes(shape.type)
}
