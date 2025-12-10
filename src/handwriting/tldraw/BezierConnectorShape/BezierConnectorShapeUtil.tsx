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
import { getPortState, setEligiblePortsIfChanged, setHintingPortIfChanged, setHighlightConnectorIfChanged } from './port-state'

/**
 * 存储拖拽过程中最新检测到的目标端口信息
 * 只在松手时（onHandleDragEnd）真正写入 binding，避免在 drag 回调中嵌套更新 store
 */
export type PendingBindingTarget =
	| { kind: 'set'; targetId: TLShapeId; portId: string; terminal: PortTerminal }
	| { kind: 'remove'; terminal: PortTerminal }

const pendingBindingTargets = new Map<TLShapeId, PendingBindingTarget>()
// 缓存上一次 handlePagePosition 字符化值，避免大量重复计算
const handleLastDragKey = new Map<TLShapeId, string>()

/**
 * 计算贝塞尔曲线的控制点
 */
function getConnectionControlPoints(
	start: VecLike,
	end: VecLike,
	startPortId?: string,
	endPortId?: string
): [Vec, Vec] {
	const dx = end.x - start.x
	const dy = end.y - start.y

	// 先识别端口方向（若已绑定端口，则优先使用端口方向）
	const startIsVertical = startPortId === 'top' || startPortId === 'bottom'
	const startIsHorizontal = startPortId === 'input' || startPortId === 'output'
	const endIsVertical = endPortId === 'top' || endPortId === 'bottom'
	const endIsHorizontal = endPortId === 'input' || endPortId === 'output'

	// 计算水平/垂直偏移大小
	const distanceX = dx
	const absX = Math.abs(distanceX)
	const adjustedDistanceX = Math.max(30, distanceX > 0 ? distanceX / 3 : clamp(absX + 30, 0, 100))

	const distanceY = dy
	const absY = Math.abs(distanceY)
	const adjustedDistanceY = Math.max(30, Math.min(absY / 3, 100))
	const signY = distanceY >= 0 ? 1 : -1

	// 计算控制点：分别独立处理每个端点，优先使用端口方向
	let cp1: Vec
	let cp2: Vec

	// 起点控制点
	if (startIsHorizontal) {
		cp1 = new Vec(start.x + (startPortId === 'output' ? adjustedDistanceX : -adjustedDistanceX), start.y)
	} else if (startIsVertical) {
		cp1 = new Vec(start.x, start.y + (startPortId === 'bottom' ? adjustedDistanceY : -adjustedDistanceY))
	} else {
		// 根据主轴选择偏移方向
		if (Math.abs(dx) >= Math.abs(dy)) {
			cp1 = new Vec(start.x + (distanceX > 0 ? adjustedDistanceX : -adjustedDistanceX), start.y)
		} else {
			cp1 = new Vec(start.x, start.y + signY * adjustedDistanceY)
		}
	}

	// 终点控制点
	if (endIsHorizontal) {
		// 默认让控制点在端口外侧。
		cp2 = new Vec(end.x + (endPortId === 'output' ? adjustedDistanceX : -adjustedDistanceX), end.y)
	} else if (endIsVertical) {
		cp2 = new Vec(end.x, end.y + (endPortId === 'bottom' ? adjustedDistanceY : -adjustedDistanceY))
	} else {
		if (Math.abs(dx) >= Math.abs(dy)) {
			cp2 = new Vec(end.x + (distanceX > 0 ? -adjustedDistanceX : adjustedDistanceX), end.y)
		} else {
			cp2 = new Vec(end.x, end.y + (signY < 0 ? adjustedDistanceY : -adjustedDistanceY))
		}
	}

	return [cp1, cp2]
}

/**
 * 生成 SVG 路径
 */
function getConnectionPath(start: VecLike, end: VecLike, startPortId?: string, endPortId?: string): string {
	const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)
	return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`
}

/**
 * 获取连接的实际端点（考虑绑定关系）
 */
export function getConnectorTerminals(
	editor: Editor,
	connector: IBezierConnectorShape
): {
	start: VecLike
	end: VecLike
	startShapeId?: TLShapeId
	endShapeId?: TLShapeId
	startPortId?: string
	endPortId?: string
	/** 是否两端都有绑定 */
	hasBothBindings: boolean
} {
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

	// 从绑定中提取形状/端口信息（可用于决定控制点方向）
	let startShapeId: TLShapeId | undefined
	let endShapeId: TLShapeId | undefined
	let startPortId: string | undefined
	let endPortId: string | undefined
	if (bindings.start) {
		startShapeId = bindings.start.toId
		startPortId = bindings.start.props.portId
	}
	if (bindings.end) {
		endShapeId = bindings.end.toId
		endPortId = bindings.end.props.portId
	}

	// 在拖拽过程中，优先使用未提交的 pendingBindingTargets 提供的端口信息以便实时显示
	const pending = pendingBindingTargets.get(connector.id)
	if (pending) {
		if (pending.kind === 'set') {
			if (pending.terminal === 'start') {
				startShapeId = pending.targetId
				startPortId = pending.portId
			} else {
				endShapeId = pending.targetId
				endPortId = pending.portId
			}
		} else if (pending.kind === 'remove') {
			if (pending.terminal === 'start') {
				startShapeId = undefined
				startPortId = undefined
			} else {
				endShapeId = undefined
				endPortId = undefined
			}
		}
	}

	const hasBothBindings = Boolean(startShapeId && endShapeId)
	return { start, end, startShapeId, endShapeId, startPortId, endPortId, hasBothBindings }
}

// Navigation buttons are handled in the style panel now; keep component minimal.

/**
 * 贝塞尔连接器组件
 */
function BezierConnectorComponent({ connector }: { connector: IBezierConnectorShape }) {
	const editor = useEditor()
	// 订阅 editor.user 的 isDarkMode，以便在主题切换时触发组件重渲染
	const isDarkMode = useValue('isDarkMode', () => editor.user.getIsDarkMode(), [editor])
	const theme = getDefaultColorTheme({ isDarkMode })
	const { start, end, startPortId, endPortId } = useValue(
		'terminals',
		() => getConnectorTerminals(editor, connector),
		[editor, connector]
	)
	const { highlightConnectorId, flashConnectorId } = useValue('connector-highlights', () => {
		const s = getPortState(editor)
		return { highlightConnectorId: s.highlightConnectorId, flashConnectorId: s.flashConnectorId }
	}, [editor])
	const isHighlighted = highlightConnectorId === connector.id
	const isFlashing = flashConnectorId === connector.id

	return (
		<SVGContainer className="BezierConnectorShape">
			{renderConnectorPathAndEndpoints(start, end, connector.props, theme, startPortId, endPortId, isHighlighted, isFlashing)}
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
	theme: ReturnType<typeof getDefaultColorTheme>,
	startPortId?: string,
	endPortId?: string
	, isHighlighted: boolean = false, isFlashing: boolean = false
) {
	const d = getConnectionPath(start, end, startPortId, endPortId)
	const r = Math.max(3, (props.strokeWidth || 2) + 1)
	const color = (theme && theme[props.color] && theme[props.color].solid) || props.color || theme.black.solid
	// 如果需要高亮或闪烁，先画一条宽的半透明路径作为 glow/halo
	const highlight = isHighlighted || isFlashing
	const highlightWidth = Math.max(0, (props.strokeWidth || 2) + (isHighlighted ? 3 : 0) + (isFlashing ? 2 : 0))
	const highlightOpacity = isFlashing ? 0.6 : 0.28

	return (
		<>
			{highlight && <path d={d} stroke={color} strokeWidth={highlightWidth} strokeLinecap="round" fill="none" strokeOpacity={highlightOpacity} />}
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
		const { start, end, startPortId, endPortId } = getConnectorTerminals(this.editor, connector)
		const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)
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

			// 简单节流：若位置未发生实际变化，则跳过后续的计算与状态写入
			const key = `${Math.round(handlePagePosition.x)}:${Math.round(handlePagePosition.y)}:${draggingTerminal}`
			const lastKey = handleLastDragKey.get(connectorId)
			if (lastKey === key) {
				return connector
			}
			handleLastDragKey.set(connectorId, key)

		// 查找该位置的端口
		// 不再按 terminal (start/end) 过滤目标端口，允许任意端口互连
		// 将 handle 拖动视为连接模式的一部分：显示 eligible ports
		setEligiblePortsIfChanged(this.editor, {
			terminal: undefined,
			excludeShapeIds: new Set([connector.id]),
		})

		const target = getPortAtPoint(this.editor, handlePagePosition, {
			margin: 28,
		})

		// 如果找到可用端口，记录待绑定目标，并设置高亮当前 connector
		if (target) {
			const targetShape = this.editor.getShape(target.shapeId)
			if (targetShape) {
				const targetPortInPage = this.editor
					.getShapePageTransform(targetShape)
					.applyToPoint(target.port)
				const targetPortOnConnector = Mat.applyToPoint(inverseShapeTransform, targetPortInPage)

				// 更新 hinting 状态以便端口可视化高亮
				setHintingPortIfChanged(this.editor, { shapeId: target.shapeId, portId: target.port.id })
				// 高亮当前连接器用于视觉引导
				setHighlightConnectorIfChanged(this.editor, connectorId)
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
		// 清除 hinting 状态
		setHintingPortIfChanged(this.editor, null)
		setHighlightConnectorIfChanged(this.editor, null)
		// clear eligible ports when not matching
		setEligiblePortsIfChanged(this.editor, null)
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

		// 清理 hinting，并清除 connector highlight
		setHintingPortIfChanged(this.editor, null)
		setHighlightConnectorIfChanged(this.editor, null)
		// 清理 eligiblePorts 以隐藏端口 overlay
		setEligiblePortsIfChanged(this.editor, null)

	// 清理位置节流缓存
	handleLastDragKey.delete(connector.id)
	}

	// 渲染连接组件
	component(connector: IBezierConnectorShape) {
		return <BezierConnectorComponent connector={connector} />
	}

	// 导出为 SVG（用于导出/序列化）
	override toSvg(connector: IBezierConnectorShape, ctx: SvgExportContext) {
		const { start, end, startPortId, endPortId } = getConnectorTerminals(this.editor, connector)
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		return <g>{renderConnectorPathAndEndpoints(start, end, connector.props, theme, startPortId, endPortId, false, false)}</g>
	}

	// 渲染选中指示器
	indicator(connector: IBezierConnectorShape) {
		const { start, end, startPortId, endPortId } = getConnectorTerminals(this.editor, connector)
		return (
			<path
				d={getConnectionPath(start, end, startPortId, endPortId)}
				strokeWidth={Math.max(0.5, (connector.props.strokeWidth || 0) - 1.5)}
				strokeLinecap="round"
				fill="none"
			/>
		)
	}
}
