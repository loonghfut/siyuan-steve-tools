import {
	BindingOnShapeDeleteOptions,
	BindingOnShapeIsolateOptions,
	BindingUtil,
	createComputedCache,
	Editor,
	T,
	TLBaseBinding,
	TLShapeId,
} from '@tldraw/tldraw'
import { IBezierConnectorShape, PortTerminal } from './bezier-connector-types'
import { getShapePorts } from './shape-ports'
import { setFlashWithConnectorIfChanged } from './port-state'

/**
 * 连接器绑定类型定义
 */
export type ConnectorBinding = TLBaseBinding<
	'bezier-connector',
	{
		/** 绑定到的端口 ID */
		portId: string
		/** 是连接的起点还是终点 */
		terminal: PortTerminal
	}
>

/**
 * 连接器绑定工具类
 */
export class BezierConnectorBindingUtil extends BindingUtil<ConnectorBinding> {
	static override type = 'bezier-connector' as const
	static override props = {
		portId: T.string,
		terminal: T.literalEnum('start', 'end'),
	}

	override getDefaultProps() {
		return {
			portId: '',
			terminal: 'start' as PortTerminal,
		}
	}

	// 当复制节点但不复制连接时，删除连接
	override onBeforeIsolateToShape({ binding }: BindingOnShapeIsolateOptions<ConnectorBinding>) {
		this.editor.deleteShapes([binding.fromId])
	}

	// 当删除节点时，删除关联的连接
	override onBeforeDeleteToShape({ binding }: BindingOnShapeDeleteOptions<ConnectorBinding>) {
		this.editor.deleteShapes([binding.fromId])
	}
}

/**
 * 连接器绑定接口
 */
export interface ConnectorBindings {
	start?: ConnectorBinding
	end?: ConnectorBinding
}

/**
 * 获取连接器的绑定（带缓存）
 */
export function getConnectorBindings(
	editor: Editor,
	shape: IBezierConnectorShape | TLShapeId
): ConnectorBindings {
	const shapeId = typeof shape === 'string' ? shape : shape.id
	return connectorBindingsCache.get(editor, shapeId) ?? {}
}

const connectorBindingsCache = createComputedCache(
	'connector bindings',
	(editor: Editor, connector: IBezierConnectorShape) => {
		const bindings = editor.getBindingsFromShape<ConnectorBinding>(connector.id, 'bezier-connector')
		let start: ConnectorBinding | undefined
		let end: ConnectorBinding | undefined
		for (const binding of bindings) {
			if (binding.props.terminal === 'start') {
				start = binding
			} else if (binding.props.terminal === 'end') {
				end = binding
			}
		}
		return { start, end }
	}
)

/**
 * 自动端口 ID：绑定时不锁定具体端口，渲染时按两形状相对位置动态解析。
 * 当形状被移动到另一侧时，连线会自动从合理的一侧进出（"自动换边"）。
 */
export const AUTO_PORT_ID = 'auto'

/**
 * 按目标形状中心与对侧锚点的相对位置，解析 auto 端口对应的实际端口 ID
 */
export function resolveAutoPortId(
	editor: Editor,
	targetShapeId: TLShapeId,
	oppositePoint: { x: number; y: number }
): string {
	const bounds = editor.getShapePageBounds(targetShapeId)
	if (!bounds) return 'input'
	const dx = oppositePoint.x - (bounds.x + bounds.w / 2)
	const dy = oppositePoint.y - (bounds.y + bounds.h / 2)
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'output' : 'input'
	return dy >= 0 ? 'bottom' : 'top'
}

/**
 * 解析绑定的实际端口 ID（将 auto 端口解析为 input/output/top/bottom）。
 * 对侧锚点取对侧绑定形状的中心；若对侧未绑定，则取连接器 props 中的自由端点。
 * 解析只依赖形状中心（而非对侧端口位置），避免两端均为 auto 时的循环依赖。
 */
export function resolveConnectorBindingPortId(editor: Editor, binding: ConnectorBinding): string {
	if (binding.props.portId !== AUTO_PORT_ID) return binding.props.portId

	const connector = editor.getShape<IBezierConnectorShape>(binding.fromId)
	if (!connector) return 'input'

	const otherTerminal: PortTerminal = binding.props.terminal === 'start' ? 'end' : 'start'
	const bindings = getConnectorBindings(editor, connector)
	const other = bindings[otherTerminal]

	let oppositePoint: { x: number; y: number } | undefined
	if (other) {
		const ob = editor.getShapePageBounds(other.toId)
		if (ob) oppositePoint = { x: ob.x + ob.w / 2, y: ob.y + ob.h / 2 }
	}
	if (!oppositePoint) {
		const pt = otherTerminal === 'start' ? connector.props.start : connector.props.end
		oppositePoint = editor.getShapePageTransform(connector).applyToPoint(pt)
	}

	return resolveAutoPortId(editor, binding.toId, oppositePoint)
}

/**
 * 获取绑定位置（页面坐标）
 */
export function getConnectorBindingPositionInPageSpace(
	editor: Editor,
	binding: ConnectorBinding
): { x: number; y: number } | null {
	const targetShape = editor.getShape(binding.toId)
	if (!targetShape) return null

	// 获取目标形状上的端口位置（auto 端口先解析为实际端口）
	const ports = getShapePorts(editor, targetShape)
	const portId = resolveConnectorBindingPortId(editor, binding)
	const port = ports?.[portId]
	if (!port) {
		// 遗留数据保护：目标是连接线类形状时不回退（避免连接器互指造成几何递归）
		if (targetShape.type === 'bezier-connector' || targetShape.type === 'arrow') return null
		// 端口不存在（如思维导图节点被折叠/删除）：
		// 回退到形状中心，保证连线仍然跟随形状移动而不是悬空在旧坐标
		const bounds = editor.getShapePageBounds(binding.toId)
		return bounds ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 } : null
	}

	// 转换为页面坐标
	return editor.getShapePageTransform(targetShape).applyToPoint(port)
}

/**
 * 创建或更新绑定
 */
export function createOrUpdateConnectorBinding(
	editor: Editor,
	connector: IBezierConnectorShape | TLShapeId,
	targetId: TLShapeId,
	props: ConnectorBinding['props']
) {
	const connectorId = typeof connector === 'string' ? connector : connector.id

	const existing = editor
		.getBindingsFromShape<ConnectorBinding>(connectorId, 'bezier-connector')
		.filter((b) => b.props.terminal === props.terminal)

	if (existing.length > 1) {
		editor.deleteBindings(existing.slice(1))
	}

	const current = existing[0]
	if (current) {
		// 如果没有变化则跳过，避免重复写 store
		if (current.toId === targetId && current.props.portId === props.portId) {
			return
		}
		editor.updateBinding({
			...current,
			toId: targetId,
			props,
		})
		// 显示短暂的连接高亮反馈（端口和整个 connector）
		try {
			const flashPortId = resolveConnectorBindingPortId(editor, { ...current, toId: targetId, props })
			setFlashWithConnectorIfChanged(editor, { shapeId: targetId, portId: flashPortId }, connectorId, 350)
		} catch (e) {
			// ignore
		}
	} else {
		editor.createBinding({
			type: 'bezier-connector',
			fromId: connectorId,
			toId: targetId,
			props,
		})
		// 显示短暂的连接高亮反馈（端口和整个 connector）
		try {
			const created = editor
				.getBindingsFromShape<ConnectorBinding>(connectorId, 'bezier-connector')
				.find((b) => b.props.terminal === props.terminal)
			const flashPortId = created ? resolveConnectorBindingPortId(editor, created) : props.portId
			setFlashWithConnectorIfChanged(editor, { shapeId: targetId, portId: flashPortId }, connectorId, 350)
		} catch (e) {
			// ignore
		}
	}
}

/**
 * 移除绑定
 */
export function removeConnectorBinding(
	editor: Editor,
	connector: IBezierConnectorShape | TLShapeId,
	terminal: PortTerminal
) {
	const connectorId = typeof connector === 'string' ? connector : connector.id
	const existing = editor
		.getBindingsFromShape<ConnectorBinding>(connectorId, 'bezier-connector')
		.filter((b) => b.props.terminal === terminal)

	editor.deleteBindings(existing)
}

/**
 * 获取与某个形状关联的所有连接
 * ownPortId 已将 auto 端口解析为当前实际端口
 */
export function getShapeConnections(
	editor: Editor,
	shapeId: TLShapeId
): Array<{
	connectionId: TLShapeId
	ownPortId: string
	terminal: PortTerminal
}> {
	const bindings = editor.getBindingsToShape<ConnectorBinding>(shapeId, 'bezier-connector')
	return bindings.map((binding) => ({
		connectionId: binding.fromId,
		ownPortId: resolveConnectorBindingPortId(editor, binding),
		terminal: binding.props.terminal,
	}))
}
