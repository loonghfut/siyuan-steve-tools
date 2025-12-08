import React from 'react'
import {
	CubicBezier2d,
	Editor,
	IndexKey,
	Mat,
	SvgExportContext,
	ShapeUtil,
	SVGContainer,
	TLHandle,
	TLHandleDragInfo,
	TLShapeId,
	Vec,
	VecLike,
	clamp,
	useEditor,
	useValue,
	getDefaultColorTheme,
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
 * 存储拖拽过程中最新检测到的目标端口信息
 * 只在松手时（onHandleDragEnd）真正写入 binding，避免在 drag 回调中嵌套更新 store
 */
export type PendingBindingTarget =
	| { kind: 'set'; targetId: TLShapeId; portId: string; terminal: PortTerminal }
	| { kind: 'remove'; terminal: PortTerminal }

const pendingBindingTargets = new Map<TLShapeId, PendingBindingTarget>()

/**
 * 计算贝塞尔曲线的控制点
 */
function getConnectionControlPoints(start: VecLike, end: VecLike): [Vec, Vec] {
	const dx = end.x - start.x
	const dy = end.y - start.y

	// 根据主要轴向选择控制点方向：水平优先，否则使用垂直控制点
	if (Math.abs(dx) >= Math.abs(dy)) {
		// 水平主导：沿 X 方向偏移控制点（与之前逻辑一致，但使用绝对距离以避免符号问题）
		const distance = dx
		const adjustedDistance = Math.max(
			30,
			distance > 0 ? distance / 3 : clamp(Math.abs(distance) + 30, 0, 100)
		)
		return [
			new Vec(start.x + adjustedDistance, start.y), // 控制点1：起点右侧或左侧（取决于 distance 符号）
			new Vec(end.x - adjustedDistance, end.y), // 控制点2：终点左侧或右侧
		]
	} else {
		// 垂直主导：沿 Y 方向偏移控制点，生成更自然的上下连线
		const distance = dy
		const absDist = Math.abs(distance)
		const adjustedDistance = Math.max(30, Math.min(absDist / 3, 100))
		const sign = distance >= 0 ? 1 : -1
		return [
			new Vec(start.x, start.y + sign * adjustedDistance), // 控制点1：起点下方/上方
			new Vec(end.x, end.y - sign * adjustedDistance), // 控制点2：终点上方/下方
		]
	}
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
	const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
	const { start, end } = useValue(
		'terminals',
		() => getConnectorTerminals(editor, connector),
		[editor, connector]
	)

	return (
		<SVGContainer className="BezierConnectorShape">
			{renderConnectorPathAndEndpoints(start, end, connector.props, theme)}
		</SVGContainer>
	)
}

/**
 * 抽取出的渲染函数：在 component 和 toSvg 中复用，避免样式/行为不同步
 */
function renderConnectorPathAndEndpoints(
	start: VecLike,
	end: VecLike,
	props: IBezierConnectorShape['props'],
	theme: ReturnType<typeof getDefaultColorTheme>
) {
    const d = getConnectionPath(start, end)
    const r = Math.max(3, (props.strokeWidth || 2) + 1)
	const color = theme[props.color].solid
    return (
        <>
			<path d={d} stroke={color} strokeWidth={props.strokeWidth} strokeLinecap="round" fill="none" />
            {start && (
				<circle cx={start.x} cy={start.y} r={r} fill={color} stroke="none" />
            )}
            {end && (
				<circle cx={end.x} cy={end.y} r={r} fill={color} stroke="none" />
            )}
        </>
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
			color: 'grey',
			strokeWidth: 3,
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

	/**
	 * 处理手柄拖拽（纯函数，不写 store）
	 * 只计算坐标并记录待绑定的目标，真正的 binding 在 onHandleDragEnd 落盘
	 */
	onHandleDrag(
		connector: IBezierConnectorShape,
		{ handle }: TLHandleDragInfo<IBezierConnectorShape>
	): IBezierConnectorShape {
		const draggingTerminal = handle.id as PortTerminal
		const connectorId = connector.id

		// 计算手柄在页面空间中的位置
		const shapeTransform = this.editor.getShapePageTransform(connector)
		const inverseShapeTransform = Mat.Inverse(shapeTransform)
		const handlePagePosition = shapeTransform.applyToPoint(handle)

		// 查找该位置的端口
		const target = getPortAtPoint(this.editor, handlePagePosition, {
			margin: 8,
			terminal: draggingTerminal,
		})

		// 如果找到可用端口，记录待绑定目标
		if (target) {
			const targetShape = this.editor.getShape(target.shapeId)
			if (targetShape) {
				const targetPortInPage = this.editor
					.getShapePageTransform(targetShape)
					.applyToPoint(target.port)
				const targetPortOnConnector = Mat.applyToPoint(inverseShapeTransform, targetPortInPage)

				// 只存储目标信息，不写 store
				pendingBindingTargets.set(connectorId, {
					kind: 'set',
					targetId: target.shapeId,
					portId: target.port.id,
					terminal: draggingTerminal,
				})

				return {
					...connector,
					props: {
						...connector.props,
						[handle.id]: { x: targetPortOnConnector.x, y: targetPortOnConnector.y },
					},
				}
			}
		}

		// 没有找到端口，记录待移除
		pendingBindingTargets.set(connectorId, {
			kind: 'remove',
			terminal: draggingTerminal,
		})
		return {
			...connector,
			props: {
				...connector.props,
				[handle.id]: { x: handle.x, y: handle.y },
			},
		}
	}

	/**
	 * 拖拽结束时真正提交 binding 变更
	 */
	onHandleDragEnd(
		connector: IBezierConnectorShape,
		_info: TLHandleDragInfo<IBezierConnectorShape>
	): void {
		const pending = pendingBindingTargets.get(connector.id)
		pendingBindingTargets.delete(connector.id)
		if (!pending) return

		if (pending.kind === 'remove') {
			removeConnectorBinding(this.editor, connector.id, pending.terminal)
		} else {
			createOrUpdateConnectorBinding(this.editor, connector.id, pending.targetId, {
				portId: pending.portId,
				terminal: pending.terminal,
			})
		}
	}

	// 渲染连接组件
	component(connector: IBezierConnectorShape) {
		return <BezierConnectorComponent connector={connector} />
	}

	// 导出为 SVG（用于导出/序列化）
	override toSvg(connector: IBezierConnectorShape, ctx: SvgExportContext) {
		const { start, end } = getConnectorTerminals(this.editor, connector)
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		return <g>{renderConnectorPathAndEndpoints(start, end, connector.props, theme)}</g>
	}

	// 渲染选中指示器
	indicator(connector: IBezierConnectorShape) {
		const { start, end } = getConnectorTerminals(this.editor, connector)
		const theme = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
		const color = theme[connector.props.color].solid
		return (
			<path
				d={getConnectionPath(start, end)}
				strokeWidth={Math.max(0.5, (connector.props.strokeWidth || 0) - 1.5)}
				strokeLinecap="round"
				fill="none"
				stroke={color}
			/>
		)
	}
}
