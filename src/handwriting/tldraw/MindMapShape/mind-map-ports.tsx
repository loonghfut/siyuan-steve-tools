// ===== 思维导图端口支持 =====
// 为思维导图的每个节点添加曲线连接器端口

import React from 'react'
import {
    Editor,
    TLShapeId,
    VecLike,
    useEditor,
    useValue,
    getDefaultColorTheme,
} from '@tldraw/tldraw'
import { IMindMapShape } from './mind-map-shape-types'
import { NodeLayout, calculateFullLayout, LayoutDirection } from './mind-map-layout'
import { ShapePort } from '../BezierConnectorShape/bezier-connector-types'
import { getPortState } from '../BezierConnectorShape/port-state'
import { getShapeConnections } from '../BezierConnectorShape/bezier-connector-binding'

/**
 * 思维导图节点端口信息
 * 每个节点有上下左右四个端口
 */
export interface MindMapNodePort extends ShapePort {
    /** 所属节点 ID */
    nodeId: string
}

/**
 * 获取单个节点的四个端口位置（相对于节点中心）
 */
export function getNodePortsLocal(
    layout: NodeLayout
): Record<string, MindMapNodePort> {
    const { node, width, height } = layout
    const halfW = width / 2
    const halfH = height / 2
    
    return {
        [`${node.id}:left`]: {
            id: `${node.id}:left`,
            nodeId: node.id,
            x: -halfW,
            y: 0,
            terminal: 'end',
        },
        [`${node.id}:right`]: {
            id: `${node.id}:right`,
            nodeId: node.id,
            x: halfW,
            y: 0,
            terminal: 'start',
        },
        [`${node.id}:top`]: {
            id: `${node.id}:top`,
            nodeId: node.id,
            x: 0,
            y: -halfH,
            terminal: 'end',
        },
        [`${node.id}:bottom`]: {
            id: `${node.id}:bottom`,
            nodeId: node.id,
            x: 0,
            y: halfH,
            terminal: 'start',
        },
    }
}

/**
 * 收集整个布局树中所有节点的端口（相对于 shape 的本地坐标）
 */
export function collectAllNodePorts(
    layoutTree: NodeLayout,
    offsetX: number,
    offsetY: number
): Record<string, MindMapNodePort> {
    const ports: Record<string, MindMapNodePort> = {}
    
    const traverse = (layout: NodeLayout) => {
        const nodePorts = getNodePortsLocal(layout)
        // 将端口坐标从节点中心转换为 shape 本地坐标
        for (const [portId, port] of Object.entries(nodePorts)) {
            ports[portId] = {
                ...port,
                x: layout.x + port.x + offsetX,
                y: layout.y + port.y + offsetY,
            }
        }
        // 如果节点未折叠，则递归处理子节点
        if (!layout.node.collapsed) {
            for (const child of layout.children) {
                traverse(child)
            }
        }
    }
    
    traverse(layoutTree)
    return ports
}

/**
 * 获取思维导图形状的所有端口（用于 BezierConnector 绑定）
 * 返回的端口坐标是相对于 shape 的本地坐标系
 */
export function getMindMapShapePorts(
    _editor: Editor,
    shape: IMindMapShape
): Record<string, ShapePort> | null {
    const {
        rootNode,
        nodeHeight,
        fontSize,
        horizontalGap,
        verticalGap,
        direction,
    } = shape.props
    
    const layoutDirection = (direction || 'right') as LayoutDirection
    const { layoutTree, offsetX, offsetY } = calculateFullLayout(
        rootNode,
        nodeHeight,
        fontSize,
        horizontalGap,
        verticalGap,
        layoutDirection
    )
    
    return collectAllNodePorts(layoutTree, offsetX, offsetY)
}

/**
 * 获取端口的页面坐标
 */
export function getMindMapPortPagePosition(
    editor: Editor,
    shapeId: TLShapeId,
    portId: string
): VecLike | null {
    const shape = editor.getShape<IMindMapShape>(shapeId)
    if (!shape || shape.type !== 'mind-map') return null
    
    const ports = getMindMapShapePorts(editor, shape)
    if (!ports || !ports[portId]) return null
    
    const port = ports[portId]
    return editor.getShapePageTransform(shape).applyToPoint(port)
}

// ===== 端口组件 =====

interface MindMapPortProps {
    shapeId: TLShapeId
    portId: string
    port: MindMapNodePort
    key?: string
}

/**
 * 单个端口组件
 */
export function MindMapPort({ shapeId, portId, port }: MindMapPortProps) {
    const editor = useEditor()
    
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
            if (!eligiblePorts) return false
            // 如果 eligiblePorts.terminal 未设置，则允许任何端口类型
            if (eligiblePorts.terminal && eligiblePorts.terminal !== port.terminal) return false
            if (eligiblePorts.excludeShapeIds?.has(shapeId)) return false
            return true
        },
        [editor, shapeId, port.terminal]
    )
    
    // 判断该端口是否已有连接
    const isConnected = useValue(
        'isConnected',
        () => {
            const conns = getShapeConnections(editor, shapeId)
            return conns.some((c) => c.ownPortId === portId)
        },
        [editor, shapeId, portId]
    )
    
    // 判断该端口是否最近被连接（用于短暂高亮反馈）
    const isFlashing = useValue(
        'isFlashing',
        () => {
            const s = getPortState(editor)
            return s.flashPort?.shapeId === shapeId && s.flashPort?.portId === portId
        },
        [editor, shapeId, portId]
    )
    
    const isInput = port.terminal === 'end'
    const scale = isHinting ? 1.4 : 1
    
    // 根据端口位置确定显示的颜色
    const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
    const defaultDotColor = theme.black.solid
    
    // 只在需要时显示端口（不包括父悬浮状态）
    const shouldShow = isConnected || isEligible || isHinting || isFlashing
    
    return (
        <div
            className={`bezier-connector-port bezier-connector-port--${isInput ? 'input' : 'output'}${
                isHinting ? ' bezier-connector-port--hinting' : ''
            }${isEligible ? ' bezier-connector-port--eligible' : ''}${isFlashing ? ' bezier-connector-port--flash' : ''}`}
            style={{
                position: 'absolute',
                left: `${port.x}px`,
                top: `${port.y}px`,
                transform: `translate(-50%, -50%) scale(${scale})`,
                pointerEvents: shouldShow ? 'all' : 'none',
                opacity: shouldShow ? 1 : 0,
                transition: 'opacity 0.12s ease, transform 0.08s ease-in-out',
                backgroundColor: isHinting || isEligible ? undefined : defaultDotColor,
            }}
            onPointerDown={(e) => {
                e.stopPropagation()
                // 切换到端口拖拽状态
                editor.setCurrentTool('select.pointing_port', {
                    shapeId,
                    portId,
                    terminal: port.terminal,
                })
            }}
        />
    )
}

interface MindMapPortsOverlayProps {
    shapeId: TLShapeId
    ports: Record<string, MindMapNodePort>
}

/**
 * 思维导图端口覆盖层组件
 */
export function MindMapPortsOverlay({ shapeId, ports }: MindMapPortsOverlayProps) {
    const editor = useEditor()
    
    const visible = useValue('overlay-visible', () => {
        const state = getPortState(editor)
        if (!ports || Object.keys(ports).length === 0) return false
        // 如果形状已有连接也显示
        const conns = getShapeConnections(editor, shapeId)
        if (conns.length > 0) return true
        if (state.hintingPort?.shapeId === shapeId) return true
        if (state.flashPort?.shapeId === shapeId) return true
        const eligible = state.eligiblePorts
        if (eligible) {
            // 若不被排除，则显示
            if (!eligible.excludeShapeIds?.has(shapeId)) return true
        }
        return false
    }, [editor, shapeId, ports])
    
    if (!visible) return null
    
    return (
        <div 
            className="mind-map-ports-overlay"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        >
            {Object.entries(ports).map(([portId, port]) => (
                <MindMapPort
                    key={portId}
                    shapeId={shapeId}
                    portId={portId}
                    port={port}
                />
            ))}
        </div>
    )
}

/**
 * 从端口 ID 中解析节点 ID
 */
export function parseNodeIdFromPortId(portId: string): string | null {
    const parts = portId.split(':')
    if (parts.length >= 2) {
        // 去掉最后一部分（端口方向），剩下的是节点 ID
        return parts.slice(0, -1).join(':')
    }
    return null
}

/**
 * 从端口 ID 中解析端口方向
 */
export function parsePortDirectionFromPortId(portId: string): string | null {
    const parts = portId.split(':')
    if (parts.length >= 2) {
        return parts[parts.length - 1]
    }
    return null
}
