import {
	createShapeId,
	StateNode,
	TLPointerEventInfo,
	TLShapeId,
} from '@tldraw/tldraw'
import { PortTerminal } from './bezier-connector-types'
import {
	createOrUpdateConnectorBinding,
	getShapeConnections,
} from './bezier-connector-binding'
import { getPortAtPoint } from './port-utils'
import { getShapePorts } from './shape-ports'
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
 * 参考: https://github.com/tldraw/tldraw/tree/main/templates/workflow/src/ports/PointingPort.tsx
 */
export class PointingPort extends StateNode {
	static override id = 'pointing_port'
	info?: PointingPortInfo

	override onEnter(info: PointingPortInfo): void {
		// 直接从 onEnter 参数中获取端口信息
		this.info = info
		
		// 设置光标
		this.editor.setCursor({ type: 'cross', rotation: 0 })
		
		// 设置可连接的端口状态
		updatePortState(this.editor, {
			eligiblePorts: {
				// 如果拖拽的是输出端口 (start)，需要连接到输入端口 (end)
				// 如果拖拽的是输入端口 (end)，需要连接到输出端口 (start)
				terminal: info.terminal === 'start' ? 'end' : 'start',
				excludeShapeIds: new Set([info.shapeId]),
			},
		})
	}

	override onExit() {
		resetPortState(this.editor)
		this.info = undefined
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onPointerMove(info: TLPointerEventInfo): void {
		if (!this.info) {
			console.log('[PointingPort] onPointerMove: no info')
			return
		}
		if (!this.editor.inputs.isDragging) {
			console.log('[PointingPort] onPointerMove: not dragging yet')
			return
		}

		console.log('[PointingPort] onPointerMove: isDragging=true, creating connection')
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
						...info,
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

		console.log('[PointingPort] Creating bezier-connector shape:', connectionShapeId)

		// 获取源端口的页面位置作为连接起点
		const sourceShape = this.editor.getShape(this.info.shapeId)
		if (!sourceShape) {
			console.log('[PointingPort] Source shape not found!')
			return
		}

		// 获取端口在页面坐标中的位置
		const sourceShapeTransform = this.editor.getShapePageTransform(sourceShape)
		const ports = getShapePorts(this.editor, sourceShape)
		const sourcePort = ports?.[this.info.portId]
		if (!sourcePort) {
			console.log('[PointingPort] Source port not found!')
			return
		}
		const sourcePortPagePos = sourceShapeTransform.applyToPoint(sourcePort)

		// 连接器形状的原点在 (0,0)，start/end 使用页面坐标
		// connectingTerminal 是固定端（连接到端口的一端）
		// draggingTerminal 是正在拖拽的一端（跟随鼠标）
		const startPos = connectingTerminal === 'start' ? sourcePortPagePos : currentPoint
		const endPos = connectingTerminal === 'start' ? currentPoint : sourcePortPagePos

		this.editor.createShape({
			type: 'bezier-connector',
			id: connectionShapeId,
			x: 0,
			y: 0,
			props: {
				start: { x: startPos.x, y: startPos.y },
				end: { x: endPos.x, y: endPos.y },
				color: '#666666',
				strokeWidth: 2,
			},
		})

		console.log('[PointingPort] Shape created, getting handles')

		// 绑定一端到起始端口
		createOrUpdateConnectorBinding(this.editor, connectionShapeId, this.info.shapeId, {
			portId: this.info.portId,
			terminal: connectingTerminal,
		})

		console.log('[PointingPort] Binding created')

		// 切换到拖动另一端
		const handles = this.editor.getShapeHandles(connectionShapeId)
		console.log('[PointingPort] Handles:', handles)
		const handle = handles?.find((h) => h.id === draggingTerminal)
		console.log('[PointingPort] Target handle:', handle)

		if (handle) {
			const connectionShape = this.editor.getShape(connectionShapeId)
			console.log('[PointingPort] Connection shape:', connectionShape)
			if (connectionShape) {
				console.log('[PointingPort] Transitioning to dragging_handle')
				this.parent.transition('dragging_handle', {
					...info,
					target: 'handle',
					shape: connectionShape,
					handle: handle!,
					creatingMarkId,
					isCreating: true,
				})
			}
		} else {
			console.log('[PointingPort] No handle found!')
		}
	}

	override onPointerUp(): void {
		// 点击（非拖拽）处理
		this.parent.transition('idle')
	}

	override onCancel(): void {
		this.parent.transition('idle')
	}
}
