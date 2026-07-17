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
 * 连接线类形状：自身不能作为连接目标
 * （否则拖拽端点经过曲线自身时会绑定到自己，几何计算陷入无限递归）
 */
const CONNECTOR_SHAPE_TYPES = new Set(['bezier-connector', 'arrow'])

/**
 * 端口"远距吸附"白名单：只有这些形状会在拖拽时以端口半径参与命中测试。
 * 与实际渲染端口 overlay 的形状保持一致，避免吸附到不可见端口。
 * 其他形状仍可通过"指针落在形状内部"的方式连接（见 getConnectionTargetAtPoint）。
 */
const PORT_SNAP_SHAPE_TYPES = new Set(['card', 'single-block', 'branch', 'mind-map'])

/**
 * 形状级命中测试排除类型：连接线自身，以及 frame/slide 这类大容器
 * （容器内部点击命中会把整个画框当成磁铁，体验极差）
 */
const SHAPE_HIT_EXCLUDED_TYPES = new Set(['bezier-connector', 'arrow', 'frame', 'slide'])

/**
 * 该形状是否以端口半径参与远距吸附
 */
export function isPortSnappableShape(shape: TLShape): boolean {
	return PORT_SNAP_SHAPE_TYPES.has(shape.type)
}

/**
 * 该形状是否可作为形状级命中测试目标（指针在形状内部时）
 */
export function isShapeHitTargetable(shape: TLShape): boolean {
	return !SHAPE_HIT_EXCLUDED_TYPES.has(shape.type)
}

/**
 * 获取形状的端口定义
 * 端口位于形状的左侧（输入）和右侧（输出）
 */
export function getShapePorts(editor: Editor, shape: TLShape): Record<string, ShapePort> | null {
	// 连接线类形状不提供端口（防止连接器互连/自连导致的递归）
	if (CONNECTOR_SHAPE_TYPES.has(shape.type)) return null

	// 思维导图形状：返回每个节点的端口
	if (shape.type === 'mind-map') {
		return getMindMapShapePorts(editor, shape as IMindMapShape)
	}

	const bounds = editor.getShapeGeometry(shape).bounds
	const portOutset = 4

	// 获取形状的中心坐标
	const centerY = bounds.height / 2
	const centerX = bounds.width / 2

	// 支持上下左右四个端口：端口外移，避免在形状框内误触
	return {
		input: {
			id: 'input',
			x: -portOutset,
			y: centerY,
			terminal: 'end', // 输入端口对应连接的终点
		},
		output: {
			id: 'output',
			x: bounds.width + portOutset,
			y: centerY,
			terminal: 'start', // 输出端口对应连接的起点
		},
		top: {
			id: 'top',
			x: centerX,
			y: -portOutset,
			terminal: 'end',
		},
		bottom: {
			id: 'bottom',
			x: centerX,
			y: bounds.height + portOutset,
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
	// 除连接线类形状外，所有形状均可被视作支持端口
	return !CONNECTOR_SHAPE_TYPES.has(shape.type)
}
