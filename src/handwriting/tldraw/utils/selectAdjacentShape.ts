import type { Editor, TLShape } from '@tldraw/tldraw'

type Direction = 'left' | 'right' | 'up' | 'down'

type ShapeInfo = {
    shape: TLShape
    center: { x: number; y: number }
}

type CandidateInfo = {
    info: ShapeInfo
    dx: number
    dy: number
    distance: number
    direction: Direction | null  // 候选相对当前形状的主方向
}

/**
 * 根据相对位置判断候选形状的主方向
 * 策略：|dx| vs |dy| 决定水平/垂直，符号决定具体方向
 */
const classifyDirection = (dx: number, dy: number): Direction | null => {
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    
    // 距离太小，认为重合
    if (absDx < 1 && absDy < 1) {
        return null
    }
    
    // 水平方向占优
    if (absDx > absDy) {
        return dx > 0 ? 'right' : 'left'
    }
    // 垂直方向占优
    else {
        return dy > 0 ? 'down' : 'up'
    }
}

/**
 * 获取所有未锁定的形状信息
 */
const getShapeInfos = (editor: Editor): ShapeInfo[] => {
    return editor.getCurrentPageShapes().reduce<ShapeInfo[]>((acc, shape) => {
        if (shape.isLocked) {
            return acc
        }
        const bounds = editor.getShapePageBounds(shape.id)
        if (!bounds) {
            return acc
        }
        acc.push({
            shape,
            center: {
                x: bounds.x + bounds.width / 2,
                y: bounds.y + bounds.height / 2,
            },
        })
        return acc
    }, [])
}

/**
 * 构建候选列表并分类方向
 */
const buildCandidates = (infos: ShapeInfo[], current: ShapeInfo): CandidateInfo[] => {
    const currentCenter = current.center

    return infos
        .filter((info) => info.shape.id !== current.shape.id)
        .map((info) => {
            const dx = info.center.x - currentCenter.x
            const dy = info.center.y - currentCenter.y
            return {
                info,
                dx,
                dy,
                distance: Math.hypot(dx, dy),
                direction: classifyDirection(dx, dy),
            }
        })
}

/**
 * 选择目标方向上最近的候选
 * 策略：
 * 1. 优先选择完全匹配目标方向的候选中最近的
 * 2. 如果没有匹配，fallback 到相邻方向（例如 right 时考虑 右上/右下象限）
 */
const selectBestCandidate = (
    candidates: CandidateInfo[],
    targetDirection: Direction
): ShapeInfo | null => {
    // 完全匹配目标方向的候选
    const exactMatches = candidates
        .filter(c => c.direction === targetDirection)
        .sort((a, b) => a.distance - b.distance)
    
    if (exactMatches.length > 0) {
        return exactMatches[0].info
    }
    
    // Fallback：选择相邻象限的最近候选
    // 例如按 right 时，如果没有纯右方向，考虑右上/右下（dx > 0）
    const fallbackCandidates = candidates.filter(c => {
        switch (targetDirection) {
            case 'right':
                return c.dx > 1
            case 'left':
                return c.dx < -1
            case 'down':
                return c.dy > 1
            case 'up':
                return c.dy < -1
        }
    }).sort((a, b) => a.distance - b.distance)
    
    return fallbackCandidates.length > 0 ? fallbackCandidates[0].info : null
}

/**
 * 获取当前选中形状的信息
 */
const getCurrentShapeInfo = (infos: ShapeInfo[], editor: Editor): ShapeInfo | null => {
    const selectedShapes = editor.getSelectedShapes()
    return selectedShapes.length > 0
        ? infos.find((info) => info.shape.id === selectedShapes[0].id) ?? null
        : null
}

/**
 * 按指定方向选择相邻形状
 */
export const selectAdjacentShape = (editor: Editor, direction: Direction) => {
    if (editor.getEditingShapeId()) {
        return
    }

    // 只考虑 'single-block' 类型的形状
    const shapeInfos = getShapeInfos(editor).filter(
        si => (si.shape as any).type === 'single-block'
    )
    
    if (shapeInfos.length === 0) {
        return
    }

    const currentInfo = getCurrentShapeInfo(shapeInfos, editor)
    
    // 如果当前没有选中，选择第一个
    if (!currentInfo) {
        editor.select(shapeInfos[0].shape.id)
        return
    }

    // 构建候选并分类方向
    const candidates = buildCandidates(shapeInfos, currentInfo)
    
    // 选择最佳候选
    const targetInfo = selectBestCandidate(candidates, direction)

    if (targetInfo) {
        editor.select(targetInfo.shape.id)
    }
    // 如果完全没有候选，保持当前选择不变
}
