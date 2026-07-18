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
import { getConnectionTargetAtPoint } from './port-utils'
import { getShapePorts } from './shape-ports'
import { setHintingPortIfChanged, setHighlightConnectorIfChanged } from './port-state'
import { clearConnectorCreationMark, setConnectorCreationMark } from './connector-creation-state'

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

		// 不再设置 eligiblePorts：拖拽时不在其他形状四周显示端口特效，
		// 仅在命中目标时通过 hintingPort 高亮目标端口
	}

	override onExit() {
		// eligiblePorts 已不再使用；清理 hinting / highlight 状态
		setHintingPortIfChanged(this.editor, null)
		setHighlightConnectorIfChanged(this.editor, null)
		this.info = undefined
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onPointerMove(info: TLPointerEventInfo): void {
		if (!this.info) return
		if (!this.editor.inputs.isDragging) return

		const currentPoint = this.editor.inputs.currentPagePoint

		// 查找当前位置的连接目标（精确端口优先，其次形状本体）
		const target = getConnectionTargetAtPoint(this.editor, currentPoint, {
			margin: 28,
			excludeShapeIds: new Set([this.info.shapeId]),
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

		// 获取源端口的页面位置作为连接起点
		const sourceShape = this.editor.getShape(this.info.shapeId)
		if (!sourceShape) return

		// 获取端口在页面坐标中的位置
		const sourceShapeTransform = this.editor.getShapePageTransform(sourceShape)
		const ports = getShapePorts(this.editor, sourceShape)
		const sourcePort = ports?.[this.info.portId]
		if (!sourcePort) return
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
		setConnectorCreationMark(this.editor, connectionShapeId, creatingMarkId)

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
					...info,
					target: 'handle',
					shape: connectionShape,
					handle: handle!,
				})
				return
			}
		}

		// 找不到手柄：回滚已创建的孤儿连接，避免留下一条死线
		console.warn('[PointingPort] handle not found, bailing out of connection creation')
		clearConnectorCreationMark(this.editor, connectionShapeId)
		this.editor.bailToMark(creatingMarkId)
		this.parent.transition('idle')
	}

	override onPointerUp(): void {
		// 点击（非拖拽）处理：返回 idle
		this.parent.transition('idle')
	}

	override onCancel(): void {
		this.parent.transition('idle')
	}
}
