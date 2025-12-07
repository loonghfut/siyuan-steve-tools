import {
	createShapeId,
	StateNode,
	TLEventHandlers,
	TLShapeId,
} from '@tldraw/tldraw'
import { PortTerminal } from './bezier-connector-types'
import {
	createOrUpdateConnectorBinding,
	getShapeConnections,
} from './bezier-connector-binding'
import { getPortAtPoint } from './port-utils'
import { updatePortState, resetPortState } from './port-state'

/**
 * 端口拖拽信息
 */
interface PointingPortInfo {
	shapeId: TLShapeId
	portId: string
	terminal: PortTerminal
}

/**
 * PointingPort 状态机
 * 处理用户从端口拖拽创建连接的交互
 */
export class PointingPort extends StateNode {
	static override id = 'pointing_port'
	info?: PointingPortInfo

	override onEnter() {
		// 从编辑器实例中获取端口信息
		const portInfo = (this.editor as any).__pointingPortInfo as PointingPortInfo | undefined
		if (portInfo) {
			this.info = portInfo
			delete (this.editor as any).__pointingPortInfo
			
			// 设置可连接的端口状态
			updatePortState(this.editor, {
				eligiblePorts: {
					// 如果拖拽的是输出端口 (start)，需要连接到输入端口 (end)
					// 如果拖拽的是输入端口 (end)，需要连接到输出端口 (start)
					terminal: portInfo.terminal === 'start' ? 'end' : 'start',
					excludeShapeIds: new Set([portInfo.shapeId]),
				},
			})
		}
	}

	override onExit() {
		resetPortState(this.editor)
		this.info = undefined
	}

	override onPointerMove: TLEventHandlers['onPointerMove'] = () => {
		if (!this.info) return
		if (!this.editor.inputs.isDragging) return

		const currentPoint = this.editor.inputs.currentPagePoint

		// 查找当前位置的端口
		const targetTerminal = this.info.terminal === 'start' ? 'end' : 'start'
		const target = getPortAtPoint(this.editor, currentPoint, {
			terminal: targetTerminal,
			margin: 20,
			excludeShapeId: this.info.shapeId,
		})

		// 更新 hinting 状态
		updatePortState(this.editor, {
			hintingPort: target
				? { shapeId: target.shapeId, portId: target.port.id }
				: null,
		})

		// 检查输出端口是否允许多连接
		const allowsMultipleConnections = this.info.terminal === 'start'
		const existingConnections = getShapeConnections(this.editor, this.info.shapeId).filter(
			(c) => c.ownPortId === this.info!.portId
		)

		// 如果不允许多连接且已有连接，拖动现有连接
		if (!allowsMultipleConnections && existingConnections.length > 0) {
			const existingConnection = existingConnections[0]
			const connectionShape = this.editor.getShape(existingConnection.connectionId)
			if (connectionShape) {
				const handles = this.editor.getShapeHandles(existingConnection.connectionId)
				const handle = handles?.find((h) => h.id === this.info!.terminal)
				if (handle) {
					this.parent.transition('dragging_handle', {
						target: 'handle',
						shape: connectionShape,
						handle,
					})
					return
				}
			}
		}

		// 创建新连接
		const creatingMarkId = this.editor.markHistoryStoppingPoint('creating_connection')
		const connectionShapeId = createShapeId()
		const connectingTerminal = this.info.terminal
		const draggingTerminal = connectingTerminal === 'start' ? 'end' : 'start'

		this.editor.createShape({
			type: 'bezier-connector',
			id: connectionShapeId,
			x: currentPoint.x,
			y: currentPoint.y,
			props: {
				start: { x: 0, y: 0 },
				end: { x: 0, y: 0 },
				color: '#666666',
				strokeWidth: 2,
			},
		})

		// 绑定一端到起始端口
		createOrUpdateConnectorBinding(this.editor, connectionShapeId, this.info.shapeId, {
			portId: this.info.portId,
			terminal: connectingTerminal,
		})

		// 切换到拖动另一端
		const handles = this.editor.getShapeHandles(connectionShapeId)
		const handle = handles?.find((h) => h.id === draggingTerminal)

		if (handle) {
			const connectionShape = this.editor.getShape(connectionShapeId)
			if (connectionShape) {
				this.parent.transition('dragging_handle', {
					target: 'handle',
					shape: connectionShape,
					handle,
					creatingMarkId,
					isCreating: true,
				})
			}
		}
	}

	override onPointerUp: TLEventHandlers['onPointerUp'] = () => {
		// 点击（非拖拽）处理
		this.parent.transition('idle')
	}

	override onCancel: TLEventHandlers['onCancel'] = () => {
		this.parent.transition('idle')
	}
}
