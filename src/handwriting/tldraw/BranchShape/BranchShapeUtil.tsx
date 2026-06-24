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
import { IBranchShape } from './branch-shape-types'
import { beginBranchAttachmentDrag, getAllBranchChildIds, getBranchInteractionHintForShape, getBranchRenderInfo, isShapeInBranch, layoutBranchChildren, updateBranchAttachmentAfterDrag } from './branch-layout'
import { clearBranchInteractionHint, setBranchInteractionHint, useBranchInteractionHint } from './branch-interaction-state'

const translatingBranchIds = new Set<string>()
const syncingBranchMoveIds = new Set<string>()

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
			snapDistance: 160,
			showOuterFrame: false,
			version: 2,
		}
	}

	getGeometry(shape: IBranchShape) {
		const info = getBranchRenderInfo(this.editor, shape)
		const children = []

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
			const stemDx = child.side === 'left' ? -24 : 24
			children.push(
				new CubicBezier2d({
					start: new Vec(info.rootX, info.rootY),
					cp1: new Vec(info.rootX + stemDx, info.rootY),
					cp2: new Vec(child.midX, child.targetY),
					end: new Vec(child.targetX, child.targetY),
				})
			)
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
		const interactionHint = useBranchInteractionHint()
		const isAttachTarget = interactionHint?.mode === 'attach' && interactionHint.branchId === shape.id
		const isDetachTarget = interactionHint?.mode === 'detach' && interactionHint.branchId === shape.id
		const isMovingBranch = interactionHint?.mode === 'move-branch' && interactionHint.branchId === shape.id
		const isConnectedBranch = useValue(
			`branch-connected-${shape.id}`,
			() => isShapeInBranch(editor, shape.id),
			[editor, shape.id]
		)
		const activeSide = isAttachTarget ? interactionHint.side : null
		const accentColor = isDetachTarget ? '#ef4444' : isAttachTarget ? '#22c55e' : '#3b82f6'
		const rootHaloRadius = info.rootRadius + (isAttachTarget ? 10 : isMovingBranch ? 7 : isDetachTarget ? 8 : 0)
		const showHint = isAttachTarget || isDetachTarget || isMovingBranch
		const showOuterFrame = shape.props.showOuterFrame === true

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
				{isConnectedBranch && showOuterFrame && !isMovingBranch && (
					<rect
						x={1}
						y={1}
						width={Math.max(shape.props.w - 2, 1)}
						height={Math.max(shape.props.h - 2, 1)}
						rx={8}
						ry={8}
						fill="none"
						stroke={color}
						strokeWidth={1.2}
						strokeDasharray="4 8"
						opacity={0.8}
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
				<circle
					cx={info.rootX}
					cy={info.rootY}
					r={info.rootRadius}
					fill={color}
					opacity={hasChildren || showHint ? 1 : 0.9}
				/>
				{hasChildren && (
					<g fill="none" stroke={color} strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round">
						{info.children.map((child) => {
							const stemDx = child.side === 'left' ? -24 : 24
							const stemX = info.rootX + stemDx
							const path = [
								`M ${info.rootX} ${info.rootY}`,
								`C ${stemX} ${info.rootY}, ${child.midX} ${child.targetY}, ${child.targetX} ${child.targetY}`,
							].join(' ')
							const isActiveSide = isAttachTarget && activeSide === child.side
							return (
								<path
									key={child.id}
									d={path}
									stroke={isDetachTarget || isActiveSide || isMovingBranch ? accentColor : color}
									strokeWidth={isDetachTarget || isActiveSide || isMovingBranch ? lineWidth + 1.5 : lineWidth}
									strokeDasharray={isDetachTarget ? '6 5' : undefined}
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

		return (
			<g>
				<rect width={Math.max(shape.props.w, 1)} height={Math.max(shape.props.h, 1)} fill="none" />
				<circle cx={info.rootX} cy={info.rootY} r={info.rootRadius} />
				{info.children.map((child) => {
					const stemDx = child.side === 'left' ? -24 : 24
					const stemX = info.rootX + stemDx
					const path = [
						`M ${info.rootX} ${info.rootY}`,
						`C ${stemX} ${info.rootY}, ${child.midX} ${child.targetY}, ${child.targetX} ${child.targetY}`,
					].join(' ')
					return (
						<path
							key={child.id}
							d={path}
							strokeWidth={Math.max(1, (shape.props.lineWidth || 3) - 1)}
							strokeLinecap="round"
							fill="none"
						/>
					)
				})}
			</g>
		)
	}
}
