import React from 'react'
import { TLShapeId, useEditor, useValue } from '@tldraw/tldraw'
import { getPortState } from './port-state'
import { getShapePorts } from './shape-ports'
import { getShapeConnections } from './bezier-connector-binding'

interface PortProps {
	shapeId: TLShapeId
	portId: string
	key?: string
	parentHovered?: boolean
}

/**
 * 端口组件 - 用于在形状上显示可连接的端口
 */
export function Port({ shapeId, portId, parentHovered = false }: PortProps) {
	const editor = useEditor()

	const port = useValue(
		'port',
		() => {
			const shape = editor.getShape(shapeId)
			if (!shape) return null
			const ports = getShapePorts(editor, shape)
			return ports?.[portId] ?? null
		},
		[shapeId, portId, editor]
	)

	// 判断是否正在被拖拽连接指向
	const isHinting = useValue(
		'isHinting',
		() => {
			const { hintingPort } = getPortState(editor)
			return hintingPort?.portId === portId && hintingPort?.shapeId === shapeId
		},
		[editor, shapeId, portId]
	)

	// 判断是否为可连接的目标
	const isEligible = useValue(
		'isEligible',
		() => {
			const { eligiblePorts } = getPortState(editor)
			if (!eligiblePorts || !port) return false
			if (eligiblePorts.terminal !== port.terminal) return false
			if (eligiblePorts.excludeShapeIds?.has(shapeId)) return false
			return true
		},
		[editor, shapeId, port]
	)

	if (!port) return null

	const isInput = port.terminal === 'end'

	// 使用端口返回的本地坐标进行定位（overlay 覆盖层已相对于形状定位）
	const left = typeof port.x === 'number' ? `${port.x}px` : undefined
	const top = typeof port.y === 'number' ? `${port.y}px` : undefined

	const scale = isHinting ? 1.4 : 1
	// 所有端口统一向左偏移 3px，并向上偏移 3px
	const extraOffsetX = -3
	const extraOffsetY = -3

	// 判断该端口是否已有连接（若有连接则一直显示）
	const isConnected = useValue(
		'isConnected',
		() => {
			const conns = getShapeConnections(editor, shapeId)
			return conns.some((c) => c.ownPortId === portId)
		},
		[editor, shapeId, portId]
	)
	return (
		<div
			className={`bezier-connector-port bezier-connector-port--${isInput ? 'input' : 'output'}${
				isHinting ? ' bezier-connector-port--hinting' : ''
			}${isEligible ? ' bezier-connector-port--eligible' : ''}`}
			style={{
				position: 'absolute',
				left,
				top,
				transform: `translate(-50%, -50%) translateX(${extraOffsetX}px) translateY(${extraOffsetY}px) scale(${scale})`,
				pointerEvents: isConnected || parentHovered ? 'all' : 'none',
				opacity: isConnected || parentHovered ? 1 : 0,
				transition: 'opacity 0.12s ease, transform 0.08s ease-in-out',
			}}
			onPointerDown={() => {
				// 不要阻止事件传播，让 TLDraw 的 input 系统能够追踪拖拽状态
				// 直接使用 setCurrentTool 切换到 pointing_port 状态，并传递端口信息
				// 参考: https://github.com/tldraw/tldraw/tree/main/templates/workflow/src/ports/Port.tsx
				editor.setCurrentTool('select.pointing_port', {
					shapeId,
					portId,
					terminal: port.terminal,
				})
			}}
		/>
	)
}

/**
 * 端口容器组件 - 在形状上显示输入和输出端口
 */
export function PortsOverlay({ shapeId, parentHovered = false }: { shapeId: TLShapeId; parentHovered?: boolean }) {
	const editor = useEditor()

	const ports = useValue(
		'ports',
		() => {
			const shape = editor.getShape(shapeId)
			if (!shape) return null
			return getShapePorts(editor, shape)
		},
		[editor, shapeId]
	)

	if (!ports) return null

	return (
		<div className="bezier-connector-ports-overlay">
			{Object.keys(ports).map((portId) => (
				<Port key={portId} shapeId={shapeId} portId={portId} parentHovered={parentHovered} />
			))}
		</div>
	)
}
