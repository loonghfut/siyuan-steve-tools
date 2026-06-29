import React from 'react'
import {
	Box,
	CubicBezier2d,
	Geometry2d,
	Geometry2dFilters,
	Rectangle2d,
	ShapeUtil,
	SVGContainer,
	TLShapeId,
	Vec,
	VecLike,
	getDefaultColorTheme,
	useValue,
} from '@tldraw/tldraw'
import { branchShapeMigrations } from './branch-shape-migrations'
import { branchShapeProps } from './branch-shape-props'
import { BranchLineStyle, IBranchShape } from './branch-shape-types'
import { beginBranchAttachmentDrag, getAllBranchAttachedShapeIds, getBranchInteractionHintForShape, getBranchRenderInfo, layoutBranchChildren, runWithSuppressedRootContentMoveIds, updateBranchAttachmentAfterDrag } from './branch-layout'
import { clearBranchInteractionHint, setBranchInteractionHint, useBranchInteractionHintForBranch } from './branch-interaction-state'

const translatingBranchIds = new Set<string>()
const syncingBranchMoveIds = new Set<string>()
const CURVE_DASHARRAY = '6 5'
const DETACH_DASHARRAY = '6 5'
const OUTER_FRAME_INSET = 2
const OUTER_FRAME_STROKE_WIDTH = 2.2
const OUTER_FRAME_OPACITY = 0.96
const OUTER_FRAME_DASHARRAY = '8 4'
const OUTER_FRAME_RX = 12
const BRANCH_HIT_SLOP = 4

type BranchChildRenderInfo = ReturnType<typeof getBranchRenderInfo>['children'][number]

type BranchPathInfo = {
	path: string
	strokeDasharray?: string
	geometry: CubicBezier2d[]
}

type BranchHitTarget =
	| { type: 'geometry'; geometry: Geometry2d; hitWidth: number }
	| { type: 'rect'; x: number; y: number; w: number; h: number; hitWidth: number; filled?: boolean }
	| { type: 'circle'; x: number; y: number; r: number; filled?: boolean }

function getBranchLineStyle(shape: IBranchShape): BranchLineStyle {
	return shape.props.lineStyle ?? 'curve-solid'
}

function isFloatingFrameStyle(lineStyle: BranchLineStyle) {
	return lineStyle === 'frame-floating'
}

function createLinearBezier(start: VecLike, end: VecLike) {
	return new CubicBezier2d({
		start: new Vec(start.x, start.y),
		cp1: new Vec(start.x, start.y),
		cp2: new Vec(end.x, end.y),
		end: new Vec(end.x, end.y),
	})
}

function getBranchPathInfo(
	rootX: number,
	rootY: number,
	child: BranchChildRenderInfo,
	lineStyle: BranchLineStyle
): BranchPathInfo {
	const sourceX = child.sourceX ?? rootX
	const sourceY = child.sourceY ?? rootY
	const elbowX = sourceX + (child.side === 'left' ? -24 : 24)

	switch (lineStyle) {
		case 'frame-floating':
			return {
				path: '',
				geometry: [],
			}
		case 'straight-solid':
			return {
				path: `M ${sourceX} ${sourceY} L ${child.targetX} ${child.targetY}`,
				geometry: [
					createLinearBezier({ x: sourceX, y: sourceY }, { x: child.targetX, y: child.targetY }),
				],
			}
		case 'elbow-solid':
			return {
				path: `M ${sourceX} ${sourceY} L ${elbowX} ${sourceY} L ${elbowX} ${child.targetY} L ${child.targetX} ${child.targetY}`,
				geometry: [
					createLinearBezier({ x: sourceX, y: sourceY }, { x: elbowX, y: sourceY }),
					createLinearBezier({ x: elbowX, y: sourceY }, { x: elbowX, y: child.targetY }),
					createLinearBezier({ x: elbowX, y: child.targetY }, { x: child.targetX, y: child.targetY }),
				],
			}
		case 'curve-dashed':
		case 'curve-solid': {
			const stemX = sourceX + (child.side === 'left' ? -24 : 24)
			return {
				path: `M ${sourceX} ${sourceY} C ${stemX} ${sourceY}, ${child.midX} ${child.targetY}, ${child.targetX} ${child.targetY}`,
				strokeDasharray: lineStyle === 'curve-dashed' ? CURVE_DASHARRAY : undefined,
				geometry: [
					new CubicBezier2d({
						start: new Vec(sourceX, sourceY),
						cp1: new Vec(stemX, sourceY),
						cp2: new Vec(child.midX, child.targetY),
						end: new Vec(child.targetX, child.targetY),
					}),
				],
			}
		}
	}
}

function collectBranchMoveUpdates(
	editor: any,
	branch: IBranchShape,
	dx: number,
	dy: number,
	updates: Array<{ id: any; type: any; x: number; y: number }>,
	suppressedBranchIds: Set<string>,
	selectedIds: Set<string>,
	visited = new Set<string>()
) {
	for (const childId of getAllBranchAttachedShapeIds(branch)) {
		if (visited.has(childId)) continue
		visited.add(childId)

		const child = editor.getShape(childId as TLShapeId)
		if (!child) continue

		const isSelected = selectedIds.has(child.id as string)
		if (!isSelected) {
			updates.push({
				id: child.id,
				type: child.type,
				x: child.x + dx,
				y: child.y + dy,
			})

			if (child.type === 'branch') {
				suppressedBranchIds.add(child.id as string)
			}
		}

		if (child.type === 'branch' && !isSelected) {
			collectBranchMoveUpdates(editor, child as IBranchShape, dx, dy, updates, suppressedBranchIds, selectedIds, visited)
		}
	}
}

class BranchGeometry2d extends Geometry2d {
	constructor(
		private readonly children: Geometry2d[],
		private readonly hitTargets: BranchHitTarget[],
		private readonly branchBounds: Box
	) {
		super({ isClosed: false, isFilled: false })
	}

	getVertices(filters: Geometry2dFilters) {
		return this.children.flatMap((child) => child.getVertices(filters))
	}

	nearestPoint(point: VecLike, filters?: Geometry2dFilters) {
		let nearest: Vec | undefined
		let distance = Number.POSITIVE_INFINITY
		for (const child of this.children) {
			const candidate = child.nearestPoint(point, filters)
			const nextDistance = Vec.Dist2(candidate, point)
			if (nextDistance < distance) {
				nearest = candidate
				distance = nextDistance
			}
		}
		return nearest ?? new Vec(0, 0)
	}

	override hitTestPoint(point: VecLike, margin = 0, _hitInside = false, filters?: Geometry2dFilters) {
		return this.hitTargets.some((target) => hitTestBranchTarget(target, point, margin, filters))
	}

	override distanceToPoint(point: VecLike, _hitInside = false, filters?: Geometry2dFilters) {
		let distance = Number.POSITIVE_INFINITY
		for (const target of this.hitTargets) {
			distance = Math.min(distance, distanceToBranchTarget(target, point, filters))
		}
		return distance
	}

	override hitTestLineSegment(A: VecLike, B: VecLike, distance = 0, filters?: Geometry2dFilters) {
		return this.hitTargets.some((target) => hitTestBranchTargetLineSegment(target, A, B, distance, filters))
	}

	override intersectLineSegment(A: VecLike, B: VecLike, filters?: Geometry2dFilters) {
		return this.children.flatMap((child) => child.intersectLineSegment(A, B, filters))
	}

	override intersectCircle(center: VecLike, radius: number, filters?: Geometry2dFilters) {
		return this.children.flatMap((child) => child.intersectCircle(center, radius, filters))
	}

	override getBoundsVertices() {
		return [
			new Vec(this.branchBounds.x, this.branchBounds.y),
			new Vec(this.branchBounds.x + this.branchBounds.width, this.branchBounds.y),
			new Vec(this.branchBounds.x + this.branchBounds.width, this.branchBounds.y + this.branchBounds.height),
			new Vec(this.branchBounds.x, this.branchBounds.y + this.branchBounds.height),
		]
	}

	override getBounds() {
		return this.branchBounds
	}

	getSvgPathData() {
		return this.children.map((child, index) => child.getSvgPathData(index === 0)).join(' ')
	}
}

function getVisibleStrokeHitWidth(strokeWidth: number) {
	return Math.max(strokeWidth / 2 + BRANCH_HIT_SLOP, 8)
}

function distanceToRect(point: VecLike, x: number, y: number, w: number, h: number) {
	const dx = Math.max(x - point.x, 0, point.x - (x + w))
	const dy = Math.max(y - point.y, 0, point.y - (y + h))
	return Math.hypot(dx, dy)
}

function distanceToRectStroke(point: VecLike, x: number, y: number, w: number, h: number) {
	const insideX = point.x >= x && point.x <= x + w
	const insideY = point.y >= y && point.y <= y + h
	if (insideX && insideY) {
		return Math.min(point.x - x, x + w - point.x, point.y - y, y + h - point.y)
	}
	return distanceToRect(point, x, y, w, h)
}

function hitTestBranchTarget(
	target: BranchHitTarget,
	point: VecLike,
	margin: number,
	filters?: Geometry2dFilters
) {
	return distanceToBranchTarget(target, point, filters) <= margin
}

function hitTestBranchTargetLineSegment(
	target: BranchHitTarget,
	A: VecLike,
	B: VecLike,
	distance: number,
	filters?: Geometry2dFilters
) {
	switch (target.type) {
		case 'geometry':
			return target.geometry.hitTestLineSegment(A, B, distance + target.hitWidth, filters)
		case 'rect':
			return (
				lineSegmentIntersectsRect(A, B, target.x, target.y, target.w, target.h) ||
				distanceToBranchTarget(target, A, filters) <= distance ||
				distanceToBranchTarget(target, B, filters) <= distance
			)
		case 'circle':
			return distanceToLineSegment(target, A, B) <= target.r + BRANCH_HIT_SLOP + distance
	}
}

function distanceToBranchTarget(target: BranchHitTarget, point: VecLike, filters?: Geometry2dFilters) {
	switch (target.type) {
		case 'geometry':
			return Math.max(0, target.geometry.distanceToPoint(point, false, filters) - target.hitWidth)
		case 'rect': {
			if (target.filled && distanceToRect(point, target.x, target.y, target.w, target.h) === 0) return 0
			return Math.max(0, distanceToRectStroke(point, target.x, target.y, target.w, target.h) - target.hitWidth)
		}
		case 'circle': {
			const distanceFromCenter = Math.hypot(point.x - target.x, point.y - target.y)
			if (target.filled && distanceFromCenter <= target.r) return 0
			return Math.max(0, Math.abs(distanceFromCenter - target.r) - BRANCH_HIT_SLOP)
		}
	}
}

function lineSegmentIntersectsRect(A: VecLike, B: VecLike, x: number, y: number, w: number, h: number) {
	if (distanceToRect(A, x, y, w, h) === 0 || distanceToRect(B, x, y, w, h) === 0) return true
	const corners = [
		{ x, y },
		{ x: x + w, y },
		{ x: x + w, y: y + h },
		{ x, y: y + h },
	]
	return corners.some((corner, index) => {
		const next = corners[(index + 1) % corners.length]
		return lineSegmentsIntersect(A, B, corner, next)
	})
}

function lineSegmentsIntersect(a1: VecLike, a2: VecLike, b1: VecLike, b2: VecLike) {
	const d1 = cross(a1, a2, b1)
	const d2 = cross(a1, a2, b2)
	const d3 = cross(b1, b2, a1)
	const d4 = cross(b1, b2, a2)
	return (
		((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
		((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
	)
}

function cross(a: VecLike, b: VecLike, c: VecLike) {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function distanceToLineSegment(point: VecLike, A: VecLike, B: VecLike) {
	const lengthSquared = Vec.Dist2(A, B)
	if (lengthSquared <= 0) return Math.hypot(point.x - A.x, point.y - A.y)
	const t = Math.max(0, Math.min(1, ((point.x - A.x) * (B.x - A.x) + (point.y - A.y) * (B.y - A.y)) / lengthSquared))
	return Math.hypot(point.x - (A.x + t * (B.x - A.x)), point.y - (A.y + t * (B.y - A.y)))
}

export class BranchShapeUtil extends ShapeUtil<IBranchShape> {
	static override type = 'branch' as const
	static override props = branchShapeProps
	static override migrations = branchShapeMigrations

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	override hideRotateHandle() {
		return true
	}

	override hideSelectionBoundsBg() {
		return true
	}

	override hideSelectionBoundsFg() {
		return true
	}

	override canSnap() {
		return false
	}

	override getBoundsSnapGeometry() {
		return { points: [] }
	}

	override canBind() {
		return true
	}

	override canEdit() {
		return false
	}

	override isAspectRatioLocked() {
		return false
	}

	getDefaultProps(): IBranchShape['props'] {
		return {
			w: 80,
			h: 40,
			color: 'black',
			childIds: [],
			leftChildIds: [],
			rightChildIds: [],
			rootX: 40,
			direction: 'right',
			horizontalGap: 96,
			verticalGap: 28,
			lineWidth: 3,
			lineStyle: 'curve-solid',
			snapDistance: 160,
			showBackground: false,
			version: 5,
		}
	}

	getGeometry(shape: IBranchShape) {
		const info = getBranchRenderInfo(this.editor, shape)
		const lineStyle = getBranchLineStyle(shape)
		const children = []
		const hitTargets: BranchHitTarget[] = []
		const lineWidth = Math.max(shape.props.lineWidth || 3, 1)
		const isFloatingStyle = isFloatingFrameStyle(lineStyle)
		const isAutoFrameEnhanced = info.autoFrame.enabled
		const showBackground = shape.props.showBackground === true

		if (isAutoFrameEnhanced && !isFloatingStyle) {
			hitTargets.push({
				type: 'rect',
				x: OUTER_FRAME_INSET,
				y: OUTER_FRAME_INSET,
				w: Math.max(shape.props.w - OUTER_FRAME_INSET * 2, 1),
				h: Math.max(shape.props.h - OUTER_FRAME_INSET * 2, 1),
				hitWidth: getVisibleStrokeHitWidth(OUTER_FRAME_STROKE_WIDTH),
			})
		}

		if (showBackground) {
			hitTargets.push({
				type: 'rect',
				x: isAutoFrameEnhanced ? 2 : 1,
				y: isAutoFrameEnhanced ? 2 : 1,
				w: Math.max(shape.props.w - (isAutoFrameEnhanced ? 4 : 2), 1),
				h: Math.max(shape.props.h - (isAutoFrameEnhanced ? 4 : 2), 1),
				hitWidth: 0,
				filled: true,
			})
		}

		if (isFloatingStyle) {
			const frame = new Rectangle2d({
				x: OUTER_FRAME_INSET,
				y: OUTER_FRAME_INSET,
				width: Math.max(shape.props.w - OUTER_FRAME_INSET * 2, 1),
				height: Math.max(shape.props.h - OUTER_FRAME_INSET * 2, 1),
				isFilled: false,
			})
			children.push(frame)
			hitTargets.push({
				type: 'rect',
				x: OUTER_FRAME_INSET,
				y: OUTER_FRAME_INSET,
				w: Math.max(shape.props.w - OUTER_FRAME_INSET * 2, 1),
				h: Math.max(shape.props.h - OUTER_FRAME_INSET * 2, 1),
				hitWidth: getVisibleStrokeHitWidth(OUTER_FRAME_STROKE_WIDTH),
			})
		}

		if (info.rootBounds) {
			hitTargets.push({
				type: 'rect',
				x: info.rootBounds.x - 3,
				y: info.rootBounds.y - 3,
				w: info.rootBounds.w + 6,
				h: info.rootBounds.h + 6,
				hitWidth: getVisibleStrokeHitWidth(1.2),
			})
		} else {
			const root = new Rectangle2d({
				x: info.rootX - info.rootRadius,
				y: info.rootY - info.rootRadius,
				width: info.rootRadius * 2,
				height: info.rootRadius * 2,
				isFilled: true,
			})
			children.push(root)
			hitTargets.push({
				type: 'circle',
				x: info.rootX,
				y: info.rootY,
				r: isFloatingStyle ? info.rootRadius + 5 : info.rootRadius,
				filled: true,
			})
		}

		for (const child of info.children) {
			const pathGeometry = getBranchPathInfo(info.rootX, info.rootY, child, lineStyle).geometry
			children.push(...pathGeometry)
			for (const geometry of pathGeometry) {
				hitTargets.push({
					type: 'geometry',
					geometry,
					hitWidth: getVisibleStrokeHitWidth(lineWidth),
				})
			}
		}

		return new BranchGeometry2d(
			children,
			hitTargets,
			new Box(0, 0, Math.max(shape.props.w, 1), Math.max(shape.props.h, 1))
		)
	}

	override onBeforeUpdate(prev: IBranchShape, next: IBranchShape) {
		if (!translatingBranchIds.has(next.id) || (prev.x === next.x && prev.y === next.y)) return

		setBranchInteractionHint(
			getBranchInteractionHintForShape(this.editor, next) || {
				mode: 'move-branch',
				branchId: next.id as string,
			}
		)

		if (syncingBranchMoveIds.has(next.id as string)) return

		const dx = next.x - prev.x
		const dy = next.y - prev.y
		if (Math.abs(dx) <= 0.001 && Math.abs(dy) <= 0.001) return

		const updates: Array<{ id: any; type: any; x: number; y: number }> = []
		const suppressedBranchIds = new Set<string>()
		const selectedIds = new Set(this.editor.getSelectedShapeIds().map((id) => id as string))
		collectBranchMoveUpdates(this.editor, prev, dx, dy, updates, suppressedBranchIds, selectedIds)

		if (updates.length === 0) return

		for (const branchId of suppressedBranchIds) syncingBranchMoveIds.add(branchId)
		try {
			runWithSuppressedRootContentMoveIds(
				updates.map((update) => update.id as string),
				() => this.editor.updateShapes(updates)
			)
		} finally {
			for (const branchId of suppressedBranchIds) syncingBranchMoveIds.delete(branchId)
		}
	}

	override onTranslateStart(shape: IBranchShape) {
		beginBranchAttachmentDrag(this.editor, shape)
		setBranchInteractionHint({
			mode: 'move-branch',
			branchId: shape.id,
		})

		translatingBranchIds.add(shape.id)
	}

	override onTranslateEnd(initial: IBranchShape, current: IBranchShape) {
		clearBranchInteractionHint(current.id)

		translatingBranchIds.delete(current.id)

		const branch = this.editor.getShape<IBranchShape>(current.id) || current || initial
		if (updateBranchAttachmentAfterDrag(this.editor, branch)) return

		layoutBranchChildren(this.editor, branch)
	}

	component(shape: IBranchShape) {
		const editor = this.editor
		const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
		const color = theme[shape.props.color]?.solid || '#1d4ed8'
		const info = useValue(
			`branch-render-${shape.id}`,
			() => getBranchRenderInfo(editor, shape),
			[editor, shape]
		)
		const hasChildren = info.children.length > 0
		const lineWidth = Math.max(shape.props.lineWidth || 3, 1)
		const lineStyle = getBranchLineStyle(shape)
		const isFloatingStyle = isFloatingFrameStyle(lineStyle)
		const hasRootContent = !!info.rootShapeId && !!info.rootBounds
		const interactionHint = useBranchInteractionHintForBranch(shape.id as string)
		const isAttachTarget = interactionHint?.mode === 'attach' && interactionHint.branchId === shape.id
		const isAbsorbingShape = isAttachTarget && !!interactionHint?.targetShapeId
		const isRootAttachTarget = isAttachTarget && interactionHint.slot === 'root'
		const isDetachTarget = interactionHint?.mode === 'detach' && interactionHint.branchId === shape.id
		const isMovingBranch = interactionHint?.mode === 'move-branch' && interactionHint.branchId === shape.id
		const activeSide = isAttachTarget ? interactionHint.side : null
		const accentColor = isDetachTarget ? '#ef4444' : isAttachTarget ? '#22c55e' : '#3b82f6'
		const rootHaloRadius = info.rootRadius + (isAttachTarget ? (isAbsorbingShape ? 11 : 10) : isMovingBranch ? 7 : isDetachTarget ? 8 : 0)
		const showHint = isAttachTarget || isDetachTarget || isMovingBranch
		const isAutoFrameEnhanced = info.autoFrame.enabled
		const showBackground = shape.props.showBackground === true
		const backgroundInset = isAutoFrameEnhanced ? 2 : 1
		const backgroundOpacity = isAutoFrameEnhanced ? 0.12 : 0.08
		const backgroundRx = isAutoFrameEnhanced ? 12 : 8
		const showAutoOuterFrame = isAutoFrameEnhanced && !isFloatingStyle
		const floatingFrameInset = OUTER_FRAME_INSET
		const floatingFrameStrokeWidth = OUTER_FRAME_STROKE_WIDTH
		const floatingFrameOpacity = OUTER_FRAME_OPACITY
		const floatingFrameDasharray = OUTER_FRAME_DASHARRAY
		const floatingFrameRx = OUTER_FRAME_RX
		const floatingRootOuterRadius = info.rootRadius + 5
		const floatingRootInnerRadius = Math.max(info.rootRadius - 1, 4)

		return (
			<SVGContainer className="BranchShape">
				<rect
					x={0}
					y={0}
					width={Math.max(shape.props.w, 1)}
					height={Math.max(shape.props.h, 1)}
					fill="transparent"
					pointerEvents="none"
				/>
				{showAutoOuterFrame && !isMovingBranch && (
					<rect
						x={OUTER_FRAME_INSET}
						y={OUTER_FRAME_INSET}
						width={Math.max(shape.props.w - OUTER_FRAME_INSET * 2, 1)}
						height={Math.max(shape.props.h - OUTER_FRAME_INSET * 2, 1)}
						rx={OUTER_FRAME_RX}
						ry={OUTER_FRAME_RX}
						fill="none"
						stroke={color}
						strokeWidth={OUTER_FRAME_STROKE_WIDTH}
						strokeDasharray={OUTER_FRAME_DASHARRAY}
						opacity={OUTER_FRAME_OPACITY}
						pointerEvents="none"
					/>
				)}
				{showBackground && !isMovingBranch && (
					<rect
						x={backgroundInset}
						y={backgroundInset}
						width={Math.max(shape.props.w - backgroundInset * 2, 1)}
						height={Math.max(shape.props.h - backgroundInset * 2, 1)}
						rx={backgroundRx}
						ry={backgroundRx}
						fill={color}
						opacity={backgroundOpacity}
						pointerEvents="none"
					/>
				)}
				{isFloatingStyle && (
					<rect
						x={floatingFrameInset}
						y={floatingFrameInset}
						width={Math.max(shape.props.w - floatingFrameInset * 2, 1)}
						height={Math.max(shape.props.h - floatingFrameInset * 2, 1)}
						rx={floatingFrameRx}
						ry={floatingFrameRx}
						fill="none"
						stroke={showHint && !isMovingBranch ? accentColor : color}
						strokeWidth={showHint && !isMovingBranch ? floatingFrameStrokeWidth + 0.8 : floatingFrameStrokeWidth}
						strokeDasharray={isDetachTarget ? DETACH_DASHARRAY : floatingFrameDasharray}
						opacity={floatingFrameOpacity}
						pointerEvents="none"
					/>
				)}
				{showHint && (
					<g pointerEvents="none">
						{isMovingBranch && (
							<rect
								x={1}
								y={1}
								width={Math.max(shape.props.w - 2, 1)}
								height={Math.max(shape.props.h - 2, 1)}
								rx={10}
								ry={10}
								fill="none"
								stroke={accentColor}
								strokeWidth={1.25}
								strokeDasharray="3 7"
								opacity={0.22}
							/>
						)}
						<circle
							cx={info.rootX}
							cy={info.rootY}
							r={rootHaloRadius}
							fill={accentColor}
							opacity={isDetachTarget ? 0.12 : 0.16}
						/>
						<circle
							cx={info.rootX}
							cy={info.rootY}
							r={rootHaloRadius}
							fill="none"
							stroke={accentColor}
							strokeWidth={2}
							strokeDasharray={isDetachTarget ? '4 4' : undefined}
							opacity={0.85}
						/>
						{isAttachTarget && activeSide && (
							<path
								d={[
									`M ${info.rootX + (activeSide === 'left' ? -14 : 14)} ${info.rootY}`,
									`L ${info.rootX + (activeSide === 'left' ? -36 : 36)} ${info.rootY}`,
									`M ${info.rootX + (activeSide === 'left' ? -27 : 27)} ${info.rootY - 8}`,
									`L ${info.rootX + (activeSide === 'left' ? -36 : 36)} ${info.rootY}`,
									`L ${info.rootX + (activeSide === 'left' ? -27 : 27)} ${info.rootY + 8}`,
								].join(' ')}
								fill="none"
								stroke={accentColor}
								strokeWidth={2.5}
								strokeLinecap="round"
								strokeLinejoin="round"
								opacity={0.95}
							/>
						)}
						{(isRootAttachTarget || (hasRootContent && isMovingBranch)) && info.rootBounds && (
							<rect
								x={info.rootBounds.x - 5}
								y={info.rootBounds.y - 5}
								width={info.rootBounds.w + 10}
								height={info.rootBounds.h + 10}
								rx={8}
								ry={8}
								fill="none"
								stroke={accentColor}
								strokeWidth={2}
								strokeDasharray="5 4"
								opacity={0.85}
							/>
						)}
						{isDetachTarget && (
							<g stroke={accentColor} strokeWidth={2.5} strokeLinecap="round" opacity={0.95}>
								<line x1={info.rootX - 6} y1={info.rootY - 6} x2={info.rootX + 6} y2={info.rootY + 6} />
								<line x1={info.rootX + 6} y1={info.rootY - 6} x2={info.rootX - 6} y2={info.rootY + 6} />
							</g>
						)}
					</g>
				)}
				{hasRootContent ? (
					info.rootBounds ? (
						<rect
							x={info.rootBounds.x - 3}
							y={info.rootBounds.y - 3}
							width={info.rootBounds.w + 6}
							height={info.rootBounds.h + 6}
							rx={8}
							ry={8}
							fill="none"
							stroke={showHint ? accentColor : color}
							strokeWidth={showHint ? 1.8 : 1.2}
							strokeDasharray="4 4"
							opacity={showHint ? 0.65 : 0.22}
							pointerEvents="none"
						/>
					) : null
				) : isFloatingStyle ? (
					<g pointerEvents="none">
						<circle
							cx={info.rootX}
							cy={info.rootY}
							r={floatingRootOuterRadius}
							fill={showHint ? accentColor : color}
							opacity={showHint ? 0.18 : 0.14}
						/>
						<circle
							cx={info.rootX}
							cy={info.rootY}
							r={floatingRootOuterRadius}
							fill="none"
							stroke={showHint ? accentColor : color}
							strokeWidth={1.5}
							opacity={0.55}
						/>
						<circle
							cx={info.rootX}
							cy={info.rootY}
							r={floatingRootInnerRadius}
							fill={showHint ? accentColor : color}
							opacity={1}
						/>
					</g>
				) : (
					<circle
						cx={info.rootX}
						cy={info.rootY}
						r={info.rootRadius}
						fill={color}
						opacity={hasChildren || showHint ? 1 : 0.9}
					/>
				)}
				{hasChildren && !isFloatingStyle && (
					<g fill="none" stroke={color} strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round">
						{info.children.map((child) => {
							const pathInfo = getBranchPathInfo(info.rootX, info.rootY, child, lineStyle)
							const isActiveSide = isAttachTarget && activeSide === child.side
							return (
								<path
									key={child.id}
									d={pathInfo.path}
									stroke={isDetachTarget || isActiveSide || isMovingBranch ? accentColor : color}
									strokeWidth={isDetachTarget || isActiveSide || isMovingBranch ? lineWidth + 1.5 : lineWidth}
									strokeDasharray={isDetachTarget ? DETACH_DASHARRAY : pathInfo.strokeDasharray}
									opacity={showHint && !isMovingBranch && !isActiveSide ? 0.45 : 1}
								/>
							)
						})}
					</g>
				)}
			</SVGContainer>
		)
	}

	indicator(shape: IBranchShape) {
		const info = getBranchRenderInfo(this.editor, shape)
		const lineStyle = getBranchLineStyle(shape)

		return (
			<g>
				<rect width={Math.max(shape.props.w, 1)} height={Math.max(shape.props.h, 1)} fill="none" />
				{lineStyle === 'frame-floating' ? (
					<>
						<rect
							x={2}
							y={2}
							width={Math.max(shape.props.w - 4, 1)}
							height={Math.max(shape.props.h - 4, 1)}
							rx={OUTER_FRAME_RX}
							ry={OUTER_FRAME_RX}
							fill="none"
						/>
						<circle cx={info.rootX} cy={info.rootY} r={info.rootRadius + 5} fill="none" />
						<circle cx={info.rootX} cy={info.rootY} r={Math.max(info.rootRadius - 1, 4)} />
					</>
				) : (
					<circle cx={info.rootX} cy={info.rootY} r={info.rootRadius} />
				)}
				{lineStyle !== 'frame-floating' && info.children.map((child) => {
					const pathInfo = getBranchPathInfo(info.rootX, info.rootY, child, lineStyle)
					return (
						<path
							key={child.id}
							d={pathInfo.path}
							strokeWidth={Math.max(1, (shape.props.lineWidth || 3) - 1)}
							strokeLinecap="round"
							strokeDasharray={pathInfo.strokeDasharray}
							fill="none"
						/>
					)
				})}
			</g>
		)
	}
}
