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
import { setEligiblePortsIfChanged, setHintingPortIfChanged, setHighlightConnectorIfChanged } from './port-state'

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

		// 设置可连接的端口状态：将 terminal 设为 undefined，表示任何端口均可连接
		// 标记 eligiblePorts，使得目标形状上的端口可视化（即使没有 hover）
		setEligiblePortsIfChanged(this.editor, {
			terminal: undefined,
			excludeShapeIds: new Set([info.shapeId]),
		})
	}

	override onExit() {
		// 不清除 eligiblePorts：过渡到 dragging_handle 时端口光环应保持可见
		// eligiblePorts 会在 onHandleDragEnd 或 onPointerUp/onCancel 中清除
		setHintingPortIfChanged(this.editor, null)
		setHighlightConnectorIfChanged(this.editor, null)
		this.info = undefined
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onPointerMove(info: TLPointerEventInfo): void {
		if (!this.info) {
			console.debug('[PointingPort] onPointerMove: no info')
			return
		}
		if (!this.editor.inputs.isDragging) {
			console.debug('[PointingPort] onPointerMove: not dragging yet')
			return
		}

		console.debug('[PointingPort] onPointerMove: isDragging=true, creating connection')
		const currentPoint = this.editor.inputs.currentPagePoint

		// 查找当前位置的端口
		// 现在允许连接到任何端口类型（不再限制 start/end），因此不传 terminal
		const target = getPortAtPoint(this.editor, currentPoint, {
			margin: 28,
			excludeShapeId: this.info.shapeId,
		})

		// 更新 hinting 状态
		setHintingPortIfChanged(this.editor, target ? { shapeId: target.shapeId, portId: target.port.id } : null)

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

		console.debug('[PointingPort] Creating bezier-connector shape:', connectionShapeId)

		// 获取源端口的页面位置作为连接起点
		const sourceShape = this.editor.getShape(this.info.shapeId)
		if (!sourceShape) {
			console.debug('[PointingPort] Source shape not found!')
			return
		}

		// 获取端口在页面坐标中的位置
		const sourceShapeTransform = this.editor.getShapePageTransform(sourceShape)
		const ports = getShapePorts(this.editor, sourceShape)
		const sourcePort = ports?.[this.info.portId]
		if (!sourcePort) {
			console.debug('[PointingPort] Source port not found!')
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
				// Set the color to tldraw's official color token instead of a custom hex.
				color: 'black',
				strokeWidth: 3,
				strokeStyle: 'solid',
			},
		})

		console.debug('[PointingPort] Shape created, getting handles')

		// 绑定一端到起始端口
		createOrUpdateConnectorBinding(this.editor, connectionShapeId, this.info.shapeId, {
			portId: this.info.portId,
			terminal: connectingTerminal,
		})

		console.debug('[PointingPort] Binding created')

		// 切换到拖动另一端
		const handles = this.editor.getShapeHandles(connectionShapeId)
		console.debug('[PointingPort] Handles:', handles)
		const handle = handles?.find((h) => h.id === draggingTerminal)
		console.debug('[PointingPort] Target handle:', handle)

		if (handle) {
			const connectionShape = this.editor.getShape(connectionShapeId)
			console.debug('[PointingPort] Connection shape:', connectionShape)
			if (connectionShape) {
				console.debug('[PointingPort] Transitioning to dragging_handle')
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
			console.debug('[PointingPort] No handle found!')
		}
	}

	override onPointerUp(): void {
		// 点击（非拖拽）处理：清除端口状态后返回 idle
		setEligiblePortsIfChanged(this.editor, null)
		this.parent.transition('idle')
	}

	override onCancel(): void {
		setEligiblePortsIfChanged(this.editor, null)
		this.parent.transition('idle')
	}
}
