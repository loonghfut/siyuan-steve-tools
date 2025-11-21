import { Editor, TLShapeId, Vec, createShapeId } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import { ICardShape } from '../CardShape/card-shape-types'
import { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'

type ConnectableShape = ICardShape | ISingleBlockShape

// 检查形状是否是可连接的类型
const isConnectableShape = (shape: any): shape is ConnectableShape => {
    return shape?.type === 'card' || shape?.type === 'single-block'
}

// 检查两个形状之间是否已经存在连接
const hasExistingConnection = (editor: Editor, sourceId: TLShapeId, targetId: TLShapeId): boolean => {
    const arrows = editor.getCurrentPageShapes().filter(shape => shape.type === 'arrow')

    for (const arrow of arrows) {
        const bindings = editor.getBindingsFromShape(arrow, 'arrow')
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

    constructor(onStateChange?: (isActive: boolean) => void) {
        this.onStateChange = onStateChange
    }

    // 启用连接模式
    enableConnectionMode(editor: Editor): boolean {
        const shapes = editor.getSelectedShapes().filter(isConnectableShape)

        if (shapes.length < 1) {
            showMessage('请先选择至少一个卡片或块', 3000, 'info')
            return false
        }

        this.pendingShapeIds = shapes.map(s => s.id)
        this.isActive = true
        this.editor = editor

        showMessage(`已记录 ${shapes.length} 个形状，请点击目标形状建立连接`, 4000, 'info')

        // 取消选择，方便用户点击其他形状
        editor.setSelectedShapes([])

        // 开始监听选择变化
        this.startListening()

        // 通知状态变化
        this.onStateChange?.(true)

        return true
    }

    // 禁用连接模式
    disableConnectionMode() {
        this.isActive = false
        this.pendingShapeIds = []
        this.editor = null
        this.stopListening()
        this.onStateChange?.(false)
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

                // 创建箭头连接
                const arrowId = this.createArrowBinding(sourceShape, targetShape, colorToUse)
                if (arrowId) {
                    createdCount++
                    createdArrowIds.push(arrowId)
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
                    arrowheadStart: 'arrow',
                    arrowheadEnd: 'none',
                },
            })

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

            return arrowId
        } catch (error) {
            console.error('创建箭头连接失败', error)
            return null
        }
    }

    // 清理资源
    cleanup() {
        this.disableConnectionMode()
    }
}
