import { Editor, TLShapeId, Vec, createShapeId } from '@tldraw/tldraw'
import { createOrUpdateConnectorBinding } from '../BezierConnectorShape'
import { setFlashWithConnectorIfChanged, setHintingPortIfChanged } from '../BezierConnectorShape/port-state'
import { getPortPagePosition, getBestPortPair, getShapePorts } from '../BezierConnectorShape/port-utils'
import { showMessage } from 'siyuan'
import { ICardShape } from '../CardShape/card-shape-types'
import { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'
import { IBranchShape } from '../BranchShape/branch-shape-types'

type ConnectableShape = ICardShape | ISingleBlockShape | IBranchShape

// 检查形状是否是可连接的类型
const isConnectableShape = (shape: any): shape is ConnectableShape => {
    return shape?.type === 'card' || shape?.type === 'single-block' || shape?.type === 'branch'
}

// 检查两个形状之间是否已经存在连接
const hasExistingConnection = (editor: Editor, sourceId: TLShapeId, targetId: TLShapeId): boolean => {
    // 检查 arrow 或 bezier-connector 类型的连接是否已经存在
    const connectors = editor.getCurrentPageShapes().filter(shape => shape.type === 'arrow' || shape.type === 'bezier-connector')

    for (const conn of connectors) {
        const type = conn.type === 'arrow' ? 'arrow' : 'bezier-connector'
        const bindings = editor.getBindingsFromShape(conn, type)
        const boundShapeIds = bindings.map(b => b.toId)

        // 检查是否存在从 sourceId 到 targetId 的连接(任意方向)
        if (
            (boundShapeIds.includes(sourceId) && boundShapeIds.includes(targetId)) ||
            (boundShapeIds.includes(targetId) && boundShapeIds.includes(sourceId))
        ) {
            return true
        }
    }

    return false
}

// 连接模式管理类
export class ConnectionModeManager {
    private pendingShapeIds: TLShapeId[] = []
    private isActive: boolean = false
    private editor: Editor | null = null
    private checkInterval: number | null = null
    private lastSelectionIds: string = ''
    private onStateChange?: (isActive: boolean) => void
    private connectorKind: 'arrow' | 'bezier' = 'bezier'

    constructor(onStateChange?: (isActive: boolean) => void) {
        this.onStateChange = onStateChange
    }

    // 启用连接模式
    enableConnectionMode(editor: Editor, kind: 'arrow' | 'bezier' = 'bezier'): boolean {
        const shapes = editor.getSelectedShapes().filter(isConnectableShape)

        if (shapes.length < 1) {
            showMessage('请先选择至少一个卡片或块', 3000, 'info')
            return false
        }

        this.pendingShapeIds = shapes.map(s => s.id)
        this.isActive = true
        this.editor = editor
        this.connectorKind = kind

        showMessage(`已记录 ${shapes.length} 个形状，请点击目标形状建立连接`, 4000, 'info')

        // 取消选择，方便用户点击其他形状
        editor.setSelectedShapes([])

        // 开始监听选择变化
        this.startListening()

        // 通知状态变化（确保 onStateChange 是函数，避免在传入非函数（如布尔值）时出错）
        if (typeof this.onStateChange === 'function') {
            this.onStateChange(true)
        }

        return true
    }

    // 禁用连接模式
    disableConnectionMode() {
        this.isActive = false
        this.pendingShapeIds = []
        this.editor = null
        this.stopListening()
        if (typeof this.onStateChange === 'function') {
            this.onStateChange(false)
        }
    }

    // 检查是否处于连接模式
    isInConnectionMode(): boolean {
        return this.isActive
    }

    // 开始监听选择变化
    private startListening() {
        if (!this.editor) return

        this.lastSelectionIds = ''
        this.checkInterval = window.setInterval(() => {
            this.checkSelection()
        }, 100)
    }

    // 停止监听
    private stopListening() {
        if (this.checkInterval !== null) {
            window.clearInterval(this.checkInterval)
            this.checkInterval = null
        }
    }

    // 检查选择变化
    private checkSelection() {
        if (!this.editor || !this.isActive) return

        const currentIds = this.editor.getSelectedShapeIds().join(',')
        if (currentIds !== this.lastSelectionIds) {
            this.lastSelectionIds = currentIds
            this.handleShapeSelection();
            this.disableConnectionMode();
        }
    }

    // 处理形状选择
    private handleShapeSelection() {
        if (!this.editor) return

        const currentSelected = this.editor.getSelectedShapes()
        if (currentSelected.length !== 1) return

        const targetShape = currentSelected[0]

        // 只处理可连接的形状类型
        if (!isConnectableShape(targetShape)) {
            showMessage('只能连接到卡片或块', 2000, 'info')
            return
        }

        const targetId = targetShape.id

        // 检查目标形状是否在待连接列表中
        if (this.pendingShapeIds.includes(targetId)) {
            showMessage('不能连接到自身', 2000, 'info')
            return
        }

        // 创建连接
        this.createConnections(targetShape)
    }

    // 创建所有连接
    private createConnections(targetShape: ConnectableShape) {
        if (!this.editor) return

        const targetId = targetShape.id
        const colorToUse = targetShape.props?.color || 'black'
        let createdCount = 0
        let skippedCount = 0
        const createdArrowIds: TLShapeId[] = []

        this.editor.run(() => {
            this.pendingShapeIds.forEach(sourceId => {
                const sourceShape = this.editor!.getShape(sourceId as any)
                if (!sourceShape) return

                // 检查是否已存在连接
                if (hasExistingConnection(this.editor!, sourceId, targetId)) {
                    skippedCount++
                    return
                }

                // 创建连接（支持 line 或 bezier）
                const connId = this.connectorKind === 'bezier'
                    ? this.createBezierBinding(sourceShape, targetShape, colorToUse)
                    : this.createArrowBinding(sourceShape, targetShape, colorToUse)
                if (connId) {
                    createdCount++
                    createdArrowIds.push(connId)
                }
            })
        })

        // 完成连接后退出连接模式
        // this.disableConnectionMode()

        // 选中刚刚创建的所有箭头
        if (createdArrowIds.length > 0) {
            this.editor.setSelectedShapes(createdArrowIds)
            this.editor.sendToBack(createdArrowIds)
        }

        // 显示结果信息
        if (createdCount > 0 && skippedCount > 0) {
            showMessage(`已创建 ${createdCount} 个连接，跳过 ${skippedCount} 个已存在的连接`, 3000, 'info')
        } else if (createdCount > 0) {
            showMessage(`已创建 ${createdCount} 个连接`, 2000, 'info')
        } else if (skippedCount > 0) {
            showMessage(`所有连接已存在，已跳过`, 2000, 'info')
        } else {
            showMessage('未创建任何连接', 2000, 'info')
        }
    }

    // 创建单个箭头绑定，返回创建的箭头ID，失败返回 null
    private createArrowBinding(sourceShape: any, targetShape: ConnectableShape, color: string): TLShapeId | null {
        if (!this.editor) return null

        try {
            const sourceBounds = this.editor.getShapePageBounds(sourceShape)
            const targetBounds = this.editor.getShapePageBounds(targetShape)
            if (!sourceBounds || !targetBounds) return null

            const sourceRotation = this.editor.getShapePageTransform(sourceShape).rotation()
            const targetRotation = this.editor.getShapePageTransform(targetShape).rotation()

            const startNormalizedAnchor = { x: 0.5, y: 0.5 }
            const endNormalizedAnchor = { x: 0.5, y: 0.5 }

            const startTerminalNormalizedPosition = Vec.From(startNormalizedAnchor)
            const endTerminalNormalizedPosition = Vec.From(endNormalizedAnchor)

            const startTerminalPagePosition = Vec.Add(
                sourceBounds.point,
                Vec.MulV(
                    sourceBounds.size,
                    Vec.Rot(startTerminalNormalizedPosition, sourceRotation)
                )
            )
            const endTerminalPagePosition = Vec.Add(
                targetBounds.point,
                Vec.MulV(
                    targetBounds.size,
                    Vec.Rot(endTerminalNormalizedPosition, targetRotation)
                )
            )

            const arrowPointInParentSpace = Vec.Min(startTerminalPagePosition, endTerminalPagePosition)
            const arrowId = createShapeId()

            this.editor.createShape({
                id: arrowId,
                type: 'arrow',
                x: arrowPointInParentSpace.x,
                y: arrowPointInParentSpace.y,
                props: {
                    color: color,
                    start: {
                        x: startTerminalPagePosition.x - arrowPointInParentSpace.x,
                        y: startTerminalPagePosition.y - arrowPointInParentSpace.y,
                    },
                    end: {
                        x: endTerminalPagePosition.x - arrowPointInParentSpace.x,
                        y: endTerminalPagePosition.y - arrowPointInParentSpace.y,
                    },
                    arrowheadStart: 'none',
                    arrowheadEnd: 'arrow',
                },
            })

            // 尝试确定靠近的最佳端口（便于做闪烁反馈）
            const { sourcePortId: flashSourcePort, targetPortId: flashTargetPort } = getBestPortPair(this.editor, sourceShape.id as any, targetShape.id as any)

            this.editor.createBindings([
                {
                    fromId: arrowId,
                    toId: sourceShape.id as any,
                    type: 'arrow',
                    props: {
                        terminal: 'start',
                        normalizedAnchor: startNormalizedAnchor,
                        isExact: false,
                        isPrecise: false,
                    },
                },
                {
                    fromId: arrowId,
                    toId: targetShape.id,
                    type: 'arrow',
                    props: {
                        terminal: 'end',
                        normalizedAnchor: endNormalizedAnchor,
                        isExact: false,
                        isPrecise: false,
                    },
                },
            ])

            // 端口闪烁反馈：短暂高亮 source/target 端口
            try {
                setFlashWithConnectorIfChanged(this.editor, { shapeId: sourceShape.id as any, portId: flashSourcePort }, arrowId, 350)
                setFlashWithConnectorIfChanged(this.editor, { shapeId: targetShape.id as any, portId: flashTargetPort }, arrowId, 350)
            } catch (e) {
                // ignore
            }
            // 清除 hinting（若有）
            try { setHintingPortIfChanged(this.editor, null) } catch (e) {}

            return arrowId
        } catch (error) {
            console.error('创建箭头连接失败', error)
            return null
        }
    }

    // 创建贝塞尔连接器，返回 connector id
    private createBezierBinding(sourceShape: any, targetShape: ConnectableShape, color: string): TLShapeId | null {
        if (!this.editor) return null
        try {
            const sourceBounds = this.editor.getShapePageBounds(sourceShape)
            const targetBounds = this.editor.getShapePageBounds(targetShape)
            if (!sourceBounds || !targetBounds) return null

            const connectorId = createShapeId()

            // 选定默认端口 output -> input
            // Choose best ports based on relative position
            const { sourcePortId: sourcePort, targetPortId: targetPort } = getBestPortPair(this.editor, sourceShape.id as any, targetShape.id as any)

            // 获取端口在页面上的坐标，如果失败则使用 shape 的中心点。
            let sourcePagePos = getPortPagePosition(this.editor, sourceShape.id, sourcePort) || this.editor.getShapePageTransform(sourceShape).applyToPoint({ x: sourceBounds.size.x / 2, y: sourceBounds.size.y / 2 })
            let targetPagePos = getPortPagePosition(this.editor, targetShape.id, targetPort) || this.editor.getShapePageTransform(targetShape).applyToPoint({ x: targetBounds.size.x / 2, y: targetBounds.size.y / 2 })

            // 获取 binding terminal 定义
            const sourcePorts = getShapePorts(this.editor, sourceShape)
            const targetPorts = getShapePorts(this.editor, targetShape)
            const sourceTerminal = (sourcePorts && sourcePorts[sourcePort] && sourcePorts[sourcePort].terminal) || 'start'
            const targetTerminal = (targetPorts && targetPorts[targetPort] && targetPorts[targetPort].terminal) || 'end'

            // 若 terminal 方向与 start/end 约定相反（例如 sourcePort terminal 是 'end'），则 swap start/end
            if (sourceTerminal === 'end' && targetTerminal === 'start') {
                // swap
                const tmp = sourcePagePos
                sourcePagePos = targetPagePos
                targetPagePos = tmp
            }

            // 使用 page coords 储存在 connector 的 props 中，shape origin 设为 0,0（PointingPort 也是这样）
            this.editor.createShape({
                id: connectorId,
                type: 'bezier-connector',
                x: 0,
                y: 0,
                props: {
                    start: { x: sourcePagePos.x, y: sourcePagePos.y },
                    end: { x: targetPagePos.x, y: targetPagePos.y },
                    color: color,
                    strokeWidth: 3,
                    strokeStyle: 'solid',
                },
            })

            // 创建 binding，优先使用默认端口 id

            createOrUpdateConnectorBinding(this.editor, connectorId, sourceShape.id, {
                portId: sourcePort,
                terminal: sourceTerminal as any,
            })
            createOrUpdateConnectorBinding(this.editor, connectorId, targetShape.id, {
                portId: targetPort,
                terminal: targetTerminal as any,
            })

            // 连接成功闪烁反馈
            try {
                setFlashWithConnectorIfChanged(this.editor, { shapeId: sourceShape.id as any, portId: sourcePort }, connectorId as any, 350)
                setFlashWithConnectorIfChanged(this.editor, { shapeId: targetShape.id as any, portId: targetPort }, connectorId as any, 350)
            } catch (e) {
                // ignore
            }
            try { setHintingPortIfChanged(this.editor, null) } catch (e) {}

            return connectorId
        } catch (err) {
            console.error('创建 bezier 连接失败', err)
            return null
        }
    }

    // 清理资源
    cleanup() {
        this.disableConnectionMode()
    }
}
