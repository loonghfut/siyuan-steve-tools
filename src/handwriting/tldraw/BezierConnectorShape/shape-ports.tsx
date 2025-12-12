import { Editor, TLShape, TLShapeId, VecLike } from '@tldraw/tldraw'
import { ShapePort } from './bezier-connector-types'
import { IMindMapShape } from '../MindMapShape/mind-map-shape-types'
import { getMindMapShapePorts } from '../MindMapShape/mind-map-ports'

/**
 * 支持端口连接的形状类型
 */
/**
 * NOTE: 原来仅允许特定类型的形状支持端口（card / single-block）。
 * 我们移除该限制，使得任何形状都具有端口，进而支持任意端口互连。
 */
export const CONNECTABLE_SHAPE_TYPES: string[] = []

/**
 * 获取形状的端口定义
 * 端口位于形状的左侧（输入）和右侧（输出）
 */
export function getShapePorts(editor: Editor, shape: TLShape): Record<string, ShapePort> | null {
	// 思维导图形状：返回每个节点的端口
	if (shape.type === 'mind-map') {
		return getMindMapShapePorts(editor, shape as IMindMapShape)
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
export function isConnectableShape(_shape: TLShape): boolean {
	// 所有形状均可被视作支持端口，移除原有基于 shape.type 的限制
	return true
}
