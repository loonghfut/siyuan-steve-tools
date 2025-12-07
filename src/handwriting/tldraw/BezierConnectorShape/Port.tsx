import React from 'react'
import { TLShapeId, useEditor, useValue } from '@tldraw/tldraw'
import { getPortState } from './port-state'
import { getShapePorts } from './port-utils'

interface PortProps {
	shapeId: TLShapeId
	portId: string
	key?: string
}

/**
 * 端口组件 - 用于在形状上显示可连接的端口
 */
export function Port({ shapeId, portId }: PortProps) {
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

	return (
		<div
			className={`bezier-connector-port bezier-connector-port--${isInput ? 'input' : 'output'}${
				isHinting ? ' bezier-connector-port--hinting' : ''
			}${isEligible ? ' bezier-connector-port--eligible' : ''}`}
			style={{
				position: 'absolute',
				left: isInput ? -7 : undefined,
				right: isInput ? undefined : -7,
				top: '50%',
				transform: 'translateY(-50%)',
				pointerEvents: 'all',
			}}
			onPointerDown={(e) => {
				e.preventDefault()
				e.stopPropagation()
				
				// 设置状态以便 PointingPort 状态机可以识别
				;(editor as any).__pointingPortInfo = {
					shapeId,
					portId,
					terminal: port.terminal,
				}
				
				// 确保使用选择工具，然后切换到 pointing_port 状态
				editor.setCurrentTool('select')
				// 使用 requestAnimationFrame 确保工具已切换
				requestAnimationFrame(() => {
					try {
						const selectTool = editor.getStateDescendant('select')
						if (selectTool) {
							selectTool.transition('pointing_port')
						}
					} catch (err) {
						console.warn('切换到 pointing_port 状态失败', err)
					}
				})
			}}
		/>
	)
}

/**
 * 端口容器组件 - 在形状上显示输入和输出端口
 */
export function PortsOverlay({ shapeId }: { shapeId: TLShapeId }) {
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
				<Port key={portId} shapeId={shapeId} portId={portId} />
			))}
		</div>
	)
}
