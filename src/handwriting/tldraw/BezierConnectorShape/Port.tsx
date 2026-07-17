import React, { useEffect, useState, useRef, memo } from 'react'
import { TLShapeId, useEditor, useValue } from '@tldraw/tldraw'
import { getPortState } from './port-state'
import { getShapePorts } from './shape-ports'
import { getShapeConnections } from './bezier-connector-binding'
import { settingdata } from '@/index'
import { getDefaultColorTheme } from '../utils/color-theme'

const DEFAULT_PORT_HOVER_DELAY_MS = 300

function getPortHoverDelayMs(): number {
	const raw = Number(settingdata['tldraw-port-hover-delay'])
	if (!Number.isFinite(raw)) return DEFAULT_PORT_HOVER_DELAY_MS
	return Math.max(0, raw)
}

interface PortProps {
	shapeId: TLShapeId
	portId: string
	key?: string
	parentHovered?: boolean
}

/**
 * 端口组件 - 用于在形状上显示可连接的端口
 * React.memo 避免父组件重渲染时不必要的子组件更新（内部通过 useValue 自行订阅状态）
 */
export const Port = memo(function Port({ shapeId, portId, parentHovered = false }: PortProps) {
	const editor = useEditor()

	// 一次性读取端口定义与形状几何信息，减少 useValue 订阅数量
	const portData = useValue(
		'portData',
		() => {
			const shape = editor.getShape(shapeId)
			if (!shape) return null
			const ports = getShapePorts(editor, shape)
			const port = ports?.[portId] ?? null
			if (!port) return null
			const bounds = editor.getShapeGeometry(shape).bounds
			const zoom = editor.getZoomLevel()
			// 基础 hitSize（页面坐标），根据形状大小动态计算
			const baseHitSize = Math.max(16, Math.min(Math.sqrt(bounds.width ** 2 + bounds.height ** 2) * 0.13, 38))
			// 基于缩放动态调整 hitSize：缩小画布时自动放大，放大画布时自动缩小
			const hitSize = Math.max(8, Math.min(baseHitSize / zoom, 200))
			// 端口圆点大小：基础 8px，跟随缩放保持屏幕视觉一致（clamp 3~48px 页面坐标）
			const dotSize = Math.max(3, Math.min(8 / zoom, 48))
			const colorKey = (shape as any)?.props?.color ?? 'black'
			const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
			const defaultDotColor = (theme[colorKey] && theme[colorKey].solid) || theme.black.solid
			return { port, hitSize, dotSize, defaultDotColor }
		},
		[editor, shapeId, portId]
	)

	// 合并端口状态查询：一次 useValue 读取 hinting/eligible/flash/isConnected
	const portState = useValue(
		'portState',
		() => {
			const state = getPortState(editor)
			const conns = getShapeConnections(editor, shapeId)
			return {
				isHinting: state.hintingPort?.portId === portId && state.hintingPort?.shapeId === shapeId,
				isEligible: (() => {
					const ep = state.eligiblePorts
					if (!ep || !portData?.port) return false
					if (ep.terminal && ep.terminal !== portData.port.terminal) return false
					if (ep.excludeShapeIds?.has(shapeId)) return false
					return true
				})(),
				isFlashing: state.flashPort?.shapeId === shapeId && state.flashPort?.portId === portId,
				isConnected: conns.some((c) => c.ownPortId === portId),
			}
		},
		[editor, shapeId, portId, portData?.port]
	)

	// 注意：所有 hooks 必须在任何提前 return 之前调用（React Hooks 规则），
	// 否则形状被删除导致 portData 变 null 的那一帧会因 hooks 数量变化而崩溃
	const { isHinting, isEligible, isFlashing, isConnected } = portState
	const isInteractive = isConnected || parentHovered || isEligible || isHinting || isFlashing

	// 入场动画：parentHovered 触发端口首次可见时短暂缩放，配合 CSS transition 实现弹性入场
	const isFirstInteractive = useRef(false)
	const [entering, setEntering] = useState(false)
	useEffect(() => {
		if (isInteractive && !isConnected && !isHinting && !isEligible && !isFlashing) {
			if (!isFirstInteractive.current) {
				isFirstInteractive.current = true
				setEntering(true)
				const raf = requestAnimationFrame(() => setEntering(false))
				return () => cancelAnimationFrame(raf)
			}
		} else if (!isInteractive) {
			isFirstInteractive.current = false
			setEntering(false)
		}
	}, [isInteractive, isConnected, isHinting, isEligible, isFlashing])

	if (!portData) return null

	const { port, hitSize, dotSize, defaultDotColor } = portData
	const isInput = port.terminal === 'end'

	const left = typeof port.x === 'number' ? `${port.x}px` : undefined
	const top = typeof port.y === 'number' ? `${port.y}px` : undefined

	const scale = isHinting ? 1.4 : 1
	let extraOffsetX = 0
	let extraOffsetY = 0
	if (settingdata["showCardBorder"]) {
		extraOffsetX = -3
		extraOffsetY = -3
	}

	const displayScale = entering ? 0.3 : scale

	return (
		<div
			className={`bezier-connector-port bezier-connector-port--${isInput ? 'input' : 'output'}${isHinting ? ' bezier-connector-port--hinting' : ''
				}${isEligible ? ' bezier-connector-port--eligible' : ''}${isFlashing ? ' bezier-connector-port--flash' : ''}`}
			style={{
				position: 'absolute',
				left,
				top,
				transform: `translate(-50%, -50%) translateX(${extraOffsetX}px) translateY(${extraOffsetY}px) scale(${displayScale})`,
				pointerEvents: isInteractive ? 'all' : 'none',
				opacity: isInteractive ? 1 : 0,
				transition: 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
				backgroundColor: isHinting || isEligible ? undefined : defaultDotColor,
				'--port-hit-size': `${hitSize}px`,
				'--port-dot-size': `${dotSize}px`,
			} as React.CSSProperties}
			onPointerDown={() => {
				// 注意：不要 stopPropagation / markEventAsHandled——
				// tldraw 需要收到这次 pointerdown 才会更新 inputs.isDragging，
				// 否则 PointingPort.onPointerMove 永远不会进入拖拽创建连接的分支
				editor.setCurrentTool('select.pointing_port', {
					shapeId,
					portId,
					terminal: port.terminal,
				})
			}}
		/>
	)
})

/**
 * 端口容器组件 - 在形状上显示输入和输出端口
 */
export function PortsOverlay({ shapeId, parentHovered = false }: { shapeId: TLShapeId; parentHovered?: boolean }) {
	const editor = useEditor()

	// 当形状已被选中时，不再因悬停触发端口显示（此时浮动操作按钮栏已展示）
	const isSelected = useValue(
		'is-shape-selected',
		() => editor.getSelectedShapeIds().includes(shapeId),
		[editor, shapeId]
	)
	const effectiveParentHovered = parentHovered && !isSelected

	const ports = useValue(
		'ports',
		() => {
			const shape = editor.getShape(shapeId)
			if (!shape) return null
			return getShapePorts(editor, shape)
		},
		[editor, shapeId]
	)

	// 延时显示：当 parentHovered 为 true 时，短暂延迟后显示端口（防止快速划过时闪烁）
	const [hoveredVisible, setHoveredVisible] = useState(false)
	const hoverTimerRef = useRef<number | null>(null)

	useEffect(() => {
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

		if (effectiveParentHovered) {
			if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
			const hoverDelayMs = getPortHoverDelayMs()
			hoverTimerRef.current = window.setTimeout(() => {
				hoverTimerRef.current = null
				setHoveredVisible(true)
			}, hoverDelayMs)
		} else {
			if (hoverTimerRef.current) {
				clearTimeout(hoverTimerRef.current)
				hoverTimerRef.current = null
			}
			setHoveredVisible(false)
		}
	}, [effectiveParentHovered, editor])

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
	}, [editor, shapeId, effectiveParentHovered, ports, hoveredVisible])

	if (!ports || !visible) return null

	return (
		<div className="bezier-connector-ports-overlay">
			{Object.keys(ports).map((portId) => (
				<Port key={portId} shapeId={shapeId} portId={portId} parentHovered={effectiveParentHovered} />
			))}
		</div>
	)
}
