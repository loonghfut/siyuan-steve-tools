import type { Editor, TLShape } from '@tldraw/tldraw'

type Direction = 'left' | 'right' | 'up' | 'down'

type Axis = 'x' | 'y'

type DirectionMeta = {
    axis: Axis
    positive: boolean
}

type ShapeInfo = {
    shape: TLShape
    center: { x: number; y: number }
}

type CandidateInfo = {
    info: ShapeInfo
    axisDelta: number
    crossDelta: number
    distance: number
}

type WeightedCandidate = CandidateInfo & {
    axisAdvance: number
    crossOffset: number
    weightedScore: number
}

const DIRECTION_META: Record<Direction, DirectionMeta> = {
    left: { axis: 'x', positive: false },
    right: { axis: 'x', positive: true },
    up: { axis: 'y', positive: false },
    down: { axis: 'y', positive: true },
}

const AXIS_EPSILON = 1e-3
const CROSS_DISTANCE_WEIGHT = 0.35
const EUCLIDEAN_DISTANCE_WEIGHT = 0.15
const APPROX_TOLERANCE = 1e-6

const approxEqual = (a: number, b: number, tolerance = APPROX_TOLERANCE) => Math.abs(a - b) <= tolerance

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

const sortShapeInfosByDirection = (infos: ShapeInfo[], axis: Axis, positive: boolean): ShapeInfo[] => {
    const otherAxis: Axis = axis === 'x' ? 'y' : 'x'

    return [...infos].sort((a, b) => {
        if (!approxEqual(a.center[axis], b.center[axis])) {
            return positive ? a.center[axis] - b.center[axis] : b.center[axis] - a.center[axis]
        }
        return positive
            ? a.center[otherAxis] - b.center[otherAxis]
            : b.center[otherAxis] - a.center[otherAxis]
    })
}

const buildCandidates = (infos: ShapeInfo[], current: ShapeInfo, axis: Axis): CandidateInfo[] => {
    const currentCenter = current.center

    return infos
        .filter((info) => info.shape.id !== current.shape.id)
        .map((info) => {
            const dx = info.center.x - currentCenter.x
            const dy = info.center.y - currentCenter.y
            const axisDelta = axis === 'x' ? dx : dy
            const crossDelta = axis === 'x' ? dy : dx
            return {
                info,
                axisDelta,
                crossDelta,
                distance: Math.hypot(dx, dy),
            }
        })
}

const filterCandidatesByDirection = (
    candidates: CandidateInfo[],
    positive: boolean
): CandidateInfo[] => {
    return candidates.filter((candidate) =>
        positive ? candidate.axisDelta > AXIS_EPSILON : candidate.axisDelta < -AXIS_EPSILON
    )
}

const weightCandidates = (
    candidates: CandidateInfo[],
    positive: boolean
): WeightedCandidate[] => {
    return candidates
        .map((candidate) => {
            const axisAdvance = positive ? candidate.axisDelta : -candidate.axisDelta
            const crossOffset = Math.abs(candidate.crossDelta)
            const weightedScore =
                axisAdvance +
                crossOffset * CROSS_DISTANCE_WEIGHT +
                candidate.distance * EUCLIDEAN_DISTANCE_WEIGHT
            return {
                ...candidate,
                axisAdvance,
                crossOffset,
                weightedScore,
            }
        })
        .sort((a, b) => {
            if (!approxEqual(a.weightedScore, b.weightedScore)) {
                return a.weightedScore - b.weightedScore
            }
            if (!approxEqual(a.axisAdvance, b.axisAdvance)) {
                return a.axisAdvance - b.axisAdvance
            }
            if (!approxEqual(a.crossOffset, b.crossOffset)) {
                return a.crossOffset - b.crossOffset
            }
            return a.distance - b.distance
        })
}

const getCurrentShapeInfo = (infos: ShapeInfo[], editor: Editor): ShapeInfo | null => {
    const selectedShapes = editor.getSelectedShapes()
    return selectedShapes.length
        ? infos.find((info) => info.shape.id === selectedShapes[0].id) ?? null
        : null
}

export const selectAdjacentShape = (editor: Editor, direction: Direction) => {
    if (editor.getEditingShapeId()) {
        return
    }

    const shapeInfos = getShapeInfos(editor)
    if (shapeInfos.length === 0) {
        return
    }

    const { axis, positive } = DIRECTION_META[direction]
    const sortedByAxis = sortShapeInfosByDirection(shapeInfos, axis, positive)

    const currentInfo = getCurrentShapeInfo(shapeInfos, editor)
    if (!currentInfo) {
        const fallback = sortedByAxis[0]
        if (fallback) {
            editor.select(fallback.shape.id)
        }
        return
    }

    const candidates = buildCandidates(shapeInfos, currentInfo, axis)
    const directionalCandidates = filterCandidatesByDirection(candidates, positive)
    const weightedCandidates = weightCandidates(directionalCandidates, positive)

    const targetInfo = weightedCandidates[0]?.info

    if (targetInfo) {
        editor.select(targetInfo.shape.id)
        return
    }

    const fallback = positive ? sortedByAxis[0] : sortedByAxis[sortedByAxis.length - 1]
    if (fallback && fallback.shape.id !== currentInfo.shape.id) {
        editor.select(fallback.shape.id)
    }
}
