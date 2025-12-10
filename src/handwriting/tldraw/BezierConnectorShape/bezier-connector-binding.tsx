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
import { updatePortState } from './port-state'

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
 * 获取绑定位置（页面坐标）
 */
export function getConnectorBindingPositionInPageSpace(
	editor: Editor,
	binding: ConnectorBinding
): { x: number; y: number } | null {
	const targetShape = editor.getShape(binding.toId)
	if (!targetShape) return null

	// 获取目标形状上的端口位置
	const ports = getShapePorts(editor, targetShape)
	const port = ports?.[binding.props.portId]
	if (!port) return null

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
			updatePortState(editor, { flashPort: { shapeId: targetId, portId: props.portId }, flashConnectorId: connectorId })
			setTimeout(() => updatePortState(editor, { flashPort: null, flashConnectorId: null }), 350)
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
			updatePortState(editor, { flashPort: { shapeId: targetId, portId: props.portId }, flashConnectorId: connectorId })
			setTimeout(() => updatePortState(editor, { flashPort: null, flashConnectorId: null }), 350)
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
		ownPortId: binding.props.portId,
		terminal: binding.props.terminal,
	}))
}
