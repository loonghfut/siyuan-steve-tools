import { Editor, TLShapeId } from '@tldraw/tldraw'
import { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'

// 获取所有与给定 single-block 相连的 single-block（通过 arrow 或 bezier-connector 绑定）
type ArrowBindingLike = {
    toId: TLShapeId
    props?: {
        terminal?: 'start' | 'end'
    }
}

type ArrowShapeLike = {
    props?: {
        arrowheadStart?: string
        arrowheadEnd?: string
    }
}

const getConnectedSingleBlocks = (editor: Editor, centerId: TLShapeId): ISingleBlockShape[] => {
    const shapes = editor.getCurrentPageShapes()
    const arrows = shapes.filter(s => s.type === 'arrow')
    const beziers = shapes.filter(s => s.type === 'bezier-connector')
    const result: ISingleBlockShape[] = []
    const visited = new Set<TLShapeId>()

    const isSingleBlock = (shape: any): shape is ISingleBlockShape => shape?.type === 'single-block'

    const addIfSingleBlock = (id: TLShapeId) => {
        if (visited.has(id)) return
        const shape = editor.getShape(id)
        if (isSingleBlock(shape) && shape.id !== centerId) {
            visited.add(id)
            result.push(shape)
        }
    }

    arrows.forEach(arrow => {
        const bindings = editor.getBindingsFromShape(arrow, 'arrow') as ArrowBindingLike[]
        if (!bindings || bindings.length < 2) return

        const arrowShape = arrow as ArrowShapeLike
        const arrowheadTarget: 'start' | 'end' = arrowShape.props?.arrowheadStart === 'arrow' ? 'start' : 'end'
        const arrowheadSource: 'start' | 'end' = arrowheadTarget === 'start' ? 'end' : 'start'

        const sourceBinding = bindings.find(b => b.props?.terminal === arrowheadSource)
        if (!sourceBinding || sourceBinding.toId !== centerId) return

        const targetBinding = bindings.find(b => b.props?.terminal === arrowheadTarget)
        if (!targetBinding || targetBinding.toId === centerId) return

        addIfSingleBlock(targetBinding.toId)
    })

    // 处理贝塞尔连接器：若 connector 对 centerId 有 binding，则把另一个绑定端的 single-block 加入
    beziers.forEach(connector => {
        const bindings = editor.getBindingsFromShape(connector, 'bezier-connector') as ArrowBindingLike[]
        if (!bindings || bindings.length === 0) return

        // Find if one end is centerId, and the other end points to a single-block.
        const startBinding = bindings.find(b => b.props?.terminal === 'start')
        const endBinding = bindings.find(b => b.props?.terminal === 'end')
        if (!startBinding || !endBinding) return

        // If start or end equals center, add the other
        if (startBinding.toId === centerId && endBinding.toId && endBinding.toId !== centerId) {
            addIfSingleBlock(endBinding.toId)
        }
        if (endBinding.toId === centerId && startBinding.toId && startBinding.toId !== centerId) {
            addIfSingleBlock(startBinding.toId)
        }
    })

    return result
}

export type ArrangeDirection = 'up' | 'down' | 'left' | 'right'

// 将与选中 single-block 相连的 single-block 按指定方向整齐排列
export const arrangeConnectedSingleBlocks = (
    editor: Editor,
    direction: ArrangeDirection,
    gap: number = 100,
) => {
    const selected = editor.getSelectedShapes()
    if (selected.length !== 1 || selected[0].type !== 'single-block') return

    const center = selected[0] as ISingleBlockShape
    const centerBounds = editor.getShapePageBounds(center)
    if (!centerBounds) return

    const neighbors = getConnectedSingleBlocks(editor, center.id)
    if (neighbors.length === 0) return

    // 统一用中心的宽高进行对齐
    const centerWidth = centerBounds.width
    const centerHeight = centerBounds.height

    // 根据方向决定主轴与排序依据
    let sorted = neighbors.slice()

    if (direction === 'left' || direction === 'right') {
        // 水平方向排列，根据当前 y 排序
        sorted.sort((a, b) => {
            const ba = editor.getShapePageBounds(a)
            const bb = editor.getShapePageBounds(b)
            if (!ba || !bb) return 0
            return ba.y - bb.y
        })
    } else {
        // 垂直方向排列，根据当前 x 排序
        sorted.sort((a, b) => {
            const ba = editor.getShapePageBounds(a)
            const bb = editor.getShapePageBounds(b)
            if (!ba || !bb) return 0
            return ba.x - bb.x
        })
    }

    const shapeBounds = sorted.map(shape => editor.getShapePageBounds(shape))
    const heights = shapeBounds.map(b => b?.height ?? centerHeight)
    const widths = shapeBounds.map(b => b?.width ?? centerWidth)
    const totalHeight = heights.reduce((sum, h) => sum + h, 0) + gap * (heights.length - 1)
    const totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1)
    const heightOffsets: number[] = []
    const widthOffsets: number[] = []
    {
        let cursor = -(totalHeight / 2)
        heights.forEach(height => {
            heightOffsets.push(cursor + height / 2)
            cursor += height + gap
        })
    }
    {
        let cursor = -(totalWidth / 2)
        widths.forEach(width => {
            widthOffsets.push(cursor + width / 2)
            cursor += width + gap
        })
    }

    editor.run(() => {
        sorted.forEach((shape, index) => {
            const bounds = shapeBounds[index]
            if (!bounds) return

            let x = bounds.x
            let y = bounds.y

            if (direction === 'right') {
                x = centerBounds.x + centerWidth + gap
                const centerY = centerBounds.y + centerHeight / 2 + heightOffsets[index]
                y = centerY - bounds.height / 2
            } else if (direction === 'left') {
                x = centerBounds.x - bounds.width - gap
                const centerY = centerBounds.y + centerHeight / 2 + heightOffsets[index]
                y = centerY - bounds.height / 2
            } else if (direction === 'down') {
                y = centerBounds.y + centerHeight + gap
                const centerX = centerBounds.x + centerWidth / 2 + widthOffsets[index]
                x = centerX - bounds.width / 2
            } else if (direction === 'up') {
                y = centerBounds.y - bounds.height - gap
                const centerX = centerBounds.x + centerWidth / 2 + widthOffsets[index]
                x = centerX - bounds.width / 2
            }

            editor.updateShape({
                id: shape.id,
                type: 'single-block',
                x,
                y,
            } as any)
        })
    })
}
