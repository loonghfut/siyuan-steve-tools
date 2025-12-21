import React, { useEffect, useState, useRef } from 'react'
import { TLShapeId, useEditor, useValue, getDefaultColorTheme } from '@tldraw/tldraw'
import { getPortState } from './port-state'
import { getShapePorts } from './shape-ports'
import { getShapeConnections } from './bezier-connector-binding'
import { settingdata } from '@/index'

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
			// 如果 eligiblePorts.terminal 未设置，则允许任何端口类型
			if (eligiblePorts.terminal && eligiblePorts.terminal !== port.terminal) return false
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
	let extraOffsetX = 0
	let extraOffsetY = 0
	// 如果设置了显示 Card 边框，则额外偏移 3px 以避免遮挡
	if (settingdata["showCardBorder"]) {
		extraOffsetX = -3
		extraOffsetY = -3
	}


	// 根据所属形状的配色决定点的默认颜色（当未处于 hint/eligible 时使用）
	const shape = editor.getShape(shapeId) as any
	const colorKey = shape?.props?.color ?? 'black'
	const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
	const defaultDotColor = (theme[colorKey] && theme[colorKey].solid) || theme.black.solid

	// 判断该端口是否已有连接（若有连接则一直显示）
	const isConnected = useValue(
		'isConnected',
		() => {
			const conns = getShapeConnections(editor, shapeId)
			return conns.some((c) => c.ownPortId === portId)
		},
		[editor, shapeId, portId]
	)
	// 判断该端口是否最近被连接，用于短暂高亮反馈
	const isFlashing = useValue(
		'isFlashing',
		() => {
			const s = getPortState(editor)
			return s.flashPort?.shapeId === shapeId && s.flashPort?.portId === portId
		},
		[editor, shapeId, portId]
	)
	return (
		<div
			className={`bezier-connector-port bezier-connector-port--${isInput ? 'input' : 'output'}${isHinting ? ' bezier-connector-port--hinting' : ''
				}${isEligible ? ' bezier-connector-port--eligible' : ''}${isFlashing ? ' bezier-connector-port--flash' : ''}`}
			style={{
				position: 'absolute',
				left,
				top,
				transform: `translate(-50%, -50%) translateX(${extraOffsetX}px) translateY(${extraOffsetY}px) scale(${scale})`,
				pointerEvents: isConnected || parentHovered || isEligible || isHinting || isFlashing ? 'all' : 'none',
				opacity: isConnected || parentHovered || isEligible || isHinting || isFlashing ? 1 : 0,
				transition: 'opacity 0.12s ease, transform 0.08s ease-in-out',
				backgroundColor: isHinting || isEligible ? undefined : defaultDotColor,
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

	// 延时显示：当 parentHovered 为 true 时，延迟一段时间再显示端口
	const [hoveredVisible, setHoveredVisible] = useState(false)
	const hoverTimerRef = useRef<number | null>(null)

	useEffect(() => {
		// 清理定时器
		return () => {
			if (hoverTimerRef.current) {
				clearTimeout(hoverTimerRef.current)
				hoverTimerRef.current = null
			}
		}
	}, [])

	useEffect(() => {
		// 如果工具为 hand，确保不显示
		if (editor.getCurrentToolId() === 'hand') {
			setHoveredVisible(false)
			if (hoverTimerRef.current) {
				clearTimeout(hoverTimerRef.current)
				hoverTimerRef.current = null
			}
			return
		}

		if (parentHovered) {
			// start timer to show after 300ms
			if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
			hoverTimerRef.current = window.setTimeout(() => {
				hoverTimerRef.current = null
				setHoveredVisible(true)
			}, 700)
		} else {
			// hide immediately
			if (hoverTimerRef.current) {
				clearTimeout(hoverTimerRef.current)
				hoverTimerRef.current = null
			}
			setHoveredVisible(false)
		}
	}, [parentHovered, editor])

	const visible = useValue('overlay-visible', () => {
		// 当工具为 hand 时，隐藏端口
		const currentToolId = editor.getCurrentToolId()
		if (currentToolId === 'hand') return false

		const state = getPortState(editor)
		if (!ports) return false
		// 只有在 hoveredVisible 为 true 或满足其他即时条件时才显示
		if (hoveredVisible) return true
		if (state.hintingPort?.shapeId === shapeId) return true
		if (state.flashPort?.shapeId === shapeId) return true
		const eligible = state.eligiblePorts
		if (eligible) {
			// 若不被排除，则显示
			if (!eligible.excludeShapeIds?.has(shapeId)) return true
		}
		return false
	}, [editor, shapeId, parentHovered, ports, hoveredVisible])

	if (!ports || !visible) return null

	return (
		<div className="bezier-connector-ports-overlay">
			{Object.keys(ports).map((portId) => (
				<Port key={portId} shapeId={shapeId} portId={portId} parentHovered={parentHovered} />
			))}
		</div>
	)
}
