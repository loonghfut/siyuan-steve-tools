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
import { beginBranchAttachmentDrag, getAllBranchChildIds, getBranchInteractionHintForShape, getBranchRenderInfo, layoutBranchChildren, updateBranchAttachmentAfterDrag } from './branch-layout'
import { clearBranchInteractionHint, setBranchInteractionHint, useBranchInteractionHint } from './branch-interaction-state'

const translatingBranchIds = new Set<string>()
const syncingBranchMoveIds = new Set<string>()
const CURVE_DASHARRAY = '6 5'
const DETACH_DASHARRAY = '6 5'
const OUTER_FRAME_INSET = 2
const OUTER_FRAME_STROKE_WIDTH = 2.2
const OUTER_FRAME_OPACITY = 0.96
const OUTER_FRAME_DASHARRAY = '8 4'
const OUTER_FRAME_RX = 12

type BranchChildRenderInfo = ReturnType<typeof getBranchRenderInfo>['children'][number]

type BranchPathInfo = {
	path: string
	strokeDasharray?: string
	geometry: CubicBezier2d[]
}

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
	const elbowX = rootX + (child.side === 'left' ? -24 : 24)

	switch (lineStyle) {
		case 'frame-floating':
			return {
				path: '',
				geometry: [],
			}
		case 'straight-solid':
			return {
				path: `M ${rootX} ${rootY} L ${child.targetX} ${child.targetY}`,
				geometry: [
					createLinearBezier({ x: rootX, y: rootY }, { x: child.targetX, y: child.targetY }),
				],
			}
		case 'elbow-solid':
			return {
				path: `M ${rootX} ${rootY} L ${elbowX} ${rootY} L ${elbowX} ${child.targetY} L ${child.targetX} ${child.targetY}`,
				geometry: [
					createLinearBezier({ x: rootX, y: rootY }, { x: elbowX, y: rootY }),
					createLinearBezier({ x: elbowX, y: rootY }, { x: elbowX, y: child.targetY }),
					createLinearBezier({ x: elbowX, y: child.targetY }, { x: child.targetX, y: child.targetY }),
				],
			}
		case 'curve-dashed':
		case 'curve-solid': {
			const stemX = rootX + (child.side === 'left' ? -24 : 24)
			return {
				path: `M ${rootX} ${rootY} C ${stemX} ${rootY}, ${child.midX} ${child.targetY}, ${child.targetX} ${child.targetY}`,
				strokeDasharray: lineStyle === 'curve-dashed' ? CURVE_DASHARRAY : undefined,
				geometry: [
					new CubicBezier2d({
						start: new Vec(rootX, rootY),
						cp1: new Vec(stemX, rootY),
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
	for (const childId of getAllBranchChildIds(branch)) {
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
		return this.children.some((child) => child.hitTestPoint(point, margin, false, filters))
	}

	override distanceToPoint(point: VecLike, _hitInside = false, filters?: Geometry2dFilters) {
		let distance = Number.POSITIVE_INFINITY
		for (const child of this.children) {
			distance = Math.min(distance, child.distanceToPoint(point, false, filters))
		}
		return distance
	}

	override hitTestLineSegment(A: VecLike, B: VecLike, distance = 0, filters?: Geometry2dFilters) {
		return this.children.some((child) => child.hitTestLineSegment(A, B, distance, filters))
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
			version: 4,
		}
	}

	getGeometry(shape: IBranchShape) {
		const info = getBranchRenderInfo(this.editor, shape)
		const lineStyle = getBranchLineStyle(shape)
		const children = []

		if (isFloatingFrameStyle(lineStyle)) {
			children.push(
				new Rectangle2d({
					x: 2,
					y: 2,
					width: Math.max(shape.props.w - 4, 1),
					height: Math.max(shape.props.h - 4, 1),
					isFilled: false,
				})
			)
		}

		children.push(
			new Rectangle2d({
				x: info.rootX - info.rootRadius,
				y: info.rootY - info.rootRadius,
				width: info.rootRadius * 2,
				height: info.rootRadius * 2,
				isFilled: true,
			})
		)

		for (const child of info.children) {
			children.push(...getBranchPathInfo(info.rootX, info.rootY, child, lineStyle).geometry)
		}

		return new BranchGeometry2d(
			children,
			new Box(0, 0, Math.max(shape.props.w, 1), Math.max(shape.props.h, 1))
		)
	}

	override onBeforeUpdate(prev: IBranchShape, next: IBranchShape) {
		if (!translatingBranchIds.has(next.id) || (prev.x === next.x && prev.y === next.y)) return

		setBranchInteractionHint(getBranchInteractionHintForShape(this.editor, next))

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
			this.editor.updateShapes(updates)
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
		const interactionHint = useBranchInteractionHint()
		const isAttachTarget = interactionHint?.mode === 'attach' && interactionHint.branchId === shape.id
		const isAbsorbingShape = isAttachTarget && !!interactionHint?.targetShapeId
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
		const showAutoOuterFrame = isAutoFrameEnhanced
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
						{isDetachTarget && (
							<g stroke={accentColor} strokeWidth={2.5} strokeLinecap="round" opacity={0.95}>
								<line x1={info.rootX - 6} y1={info.rootY - 6} x2={info.rootX + 6} y2={info.rootY + 6} />
								<line x1={info.rootX + 6} y1={info.rootY - 6} x2={info.rootX - 6} y2={info.rootY + 6} />
							</g>
						)}
					</g>
				)}
				{isFloatingStyle ? (
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
