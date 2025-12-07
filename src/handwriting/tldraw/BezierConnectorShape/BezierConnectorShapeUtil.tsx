import React from 'react'
import {
	CubicBezier2d,
	Editor,
	IndexKey,
	Mat,
	ShapeUtil,
	SVGContainer,
	TLHandle,
	TLHandleDragInfo,
	Vec,
	VecLike,
	clamp,
	useEditor,
	useValue,
} from '@tldraw/tldraw'
import { bezierConnectorShapeProps } from './bezier-connector-props'
import { bezierConnectorShapeMigrations } from './bezier-connector-migrations'
import { IBezierConnectorShape, PortTerminal } from './bezier-connector-types'
import {
	getConnectorBindings,
	getConnectorBindingPositionInPageSpace,
	createOrUpdateConnectorBinding,
	removeConnectorBinding,
} from './bezier-connector-binding'
import { getPortAtPoint } from './port-utils'

/**
 * 计算贝塞尔曲线的控制点
 */
function getConnectionControlPoints(start: VecLike, end: VecLike): [Vec, Vec] {
	const distance = end.x - start.x
	// 根据水平距离计算控制点偏移量
	const adjustedDistance = Math.max(
		30,
		distance > 0 ? distance / 3 : clamp(Math.abs(distance) + 30, 0, 100)
	)
	return [
		new Vec(start.x + adjustedDistance, start.y), // 控制点1：起点右侧
		new Vec(end.x - adjustedDistance, end.y), // 控制点2：终点左侧
	]
}

/**
 * 生成 SVG 路径
 */
function getConnectionPath(start: VecLike, end: VecLike): string {
	const [cp1, cp2] = getConnectionControlPoints(start, end)
	return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`
}

/**
 * 获取连接的实际端点（考虑绑定关系）
 */
export function getConnectorTerminals(
	editor: Editor,
	connector: IBezierConnectorShape
): { start: VecLike; end: VecLike } {
	let start: VecLike | undefined
	let end: VecLike | undefined

	const bindings = getConnectorBindings(editor, connector)
	const shapeTransform = Mat.Inverse(editor.getShapePageTransform(connector))

	// 从绑定获取位置
	if (bindings.start) {
		const inPageSpace = getConnectorBindingPositionInPageSpace(editor, bindings.start)
		if (inPageSpace) {
			start = Mat.applyToPoint(shapeTransform, inPageSpace)
		}
	}
	if (bindings.end) {
		const inPageSpace = getConnectorBindingPositionInPageSpace(editor, bindings.end)
		if (inPageSpace) {
			end = Mat.applyToPoint(shapeTransform, inPageSpace)
		}
	}

	// 回退到形状属性
	if (!start) start = connector.props.start
	if (!end) end = connector.props.end

	return { start, end }
}

/**
 * 贝塞尔连接器组件
 */
function BezierConnectorComponent({ connector }: { connector: IBezierConnectorShape }) {
	const editor = useEditor()
	const { start, end } = useValue(
		'terminals',
		() => getConnectorTerminals(editor, connector),
		[editor, connector]
	)

	return (
		<SVGContainer className="BezierConnectorShape">
			<path
				d={getConnectionPath(start, end)}
				stroke={connector.props.color}
				strokeWidth={connector.props.strokeWidth}
				strokeLinecap="round"
				fill="none"
			/>
		</SVGContainer>
	)
}

/**
 * 贝塞尔连接器形状工具类
 */
export class BezierConnectorShapeUtil extends ShapeUtil<IBezierConnectorShape> {
	static override type = 'bezier-connector' as const
	static override props = bezierConnectorShapeProps
	static override migrations = bezierConnectorShapeMigrations

	getDefaultProps(): IBezierConnectorShape['props'] {
		return {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 100 },
			color: '#666666',
			strokeWidth: 2,
		}
	}

	// 禁用编辑、调整大小、旋转等
	override canEdit() {
		return false
	}
	override canResize() {
		return false
	}
	override hideResizeHandles() {
		return true
	}
	override hideRotateHandle() {
		return true
	}
	override hideSelectionBoundsBg() {
		return true
	}
	override hideSelectionBoundsFg() {
		return true
	}
	override canSnap() {
		return false
	}
	override getBoundsSnapGeometry() {
		return { points: [] }
	}

	// 定义连接形状的几何形状为三次贝塞尔曲线
	getGeometry(connector: IBezierConnectorShape) {
		const { start, end } = getConnectorTerminals(this.editor, connector)
		const [cp1, cp2] = getConnectionControlPoints(start, end)
		return new CubicBezier2d({
			start: Vec.From(start),
			cp1: Vec.From(cp1),
			cp2: Vec.From(cp2),
			end: Vec.From(end),
		})
	}

	// 定义可拖拽的手柄（起点和终点）
	getHandles(connector: IBezierConnectorShape): TLHandle[] {
		const { start, end } = getConnectorTerminals(this.editor, connector)
		return [
			{
				id: 'start',
				type: 'vertex',
				index: 'a0' as IndexKey,
				x: start.x,
				y: start.y,
			},
			{
				id: 'end',
				type: 'vertex',
				index: 'a1' as IndexKey,
				x: end.x,
				y: end.y,
			},
		]
	}

	// 处理手柄拖拽
	onHandleDrag(
		connector: IBezierConnectorShape,
		{ handle }: TLHandleDragInfo<IBezierConnectorShape>
	): IBezierConnectorShape {
		const draggingTerminal = handle.id as PortTerminal

		// 计算手柄在页面空间中的位置
		const shapeTransform = this.editor.getShapePageTransform(connector)
		const handlePagePosition = shapeTransform.applyToPoint(handle)

		// 查找该位置的端口
		const target = getPortAtPoint(this.editor, handlePagePosition, {
			margin: 8,
			terminal: draggingTerminal,
		})

		// 如果找到可用端口，创建或更新绑定
		if (target) {
			createOrUpdateConnectorBinding(this.editor, connector, target.shapeId, {
				portId: target.port.id,
				terminal: draggingTerminal,
			})
			return connector
		}

		// 没有找到端口，移除绑定并更新位置
		removeConnectorBinding(this.editor, connector, draggingTerminal)
		return {
			...connector,
			props: {
				...connector.props,
				[handle.id]: { x: handle.x, y: handle.y },
			},
		}
	}

	// 渲染连接组件
	component(connector: IBezierConnectorShape) {
		return <BezierConnectorComponent connector={connector} />
	}

	// 渲染选中指示器
	indicator(connector: IBezierConnectorShape) {
		const { start, end } = getConnectorTerminals(this.editor, connector)
		return (
			<path
				d={getConnectionPath(start, end)}
				strokeWidth={connector.props.strokeWidth + 0.5}
				strokeLinecap="round"
				fill="none"
			/>
		)
	}
}
