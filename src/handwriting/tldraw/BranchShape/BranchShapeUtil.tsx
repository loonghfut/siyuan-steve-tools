import React from 'react'
import {
	Box,
	CubicBezier2d,
	Geometry2d,
	Geometry2dFilters,
	Rectangle2d,
	ShapeUtil,
	SVGContainer,
	TLResizeInfo,
	TLShapeId,
	Vec,
	VecLike,
	resizeBox,
	getDefaultColorTheme,
	useValue,
} from '@tldraw/tldraw'
import { branchShapeMigrations } from './branch-shape-migrations'
import { branchShapeProps } from './branch-shape-props'
import { IBranchShape } from './branch-shape-types'
import { getAllBranchChildIds, getBranchRenderInfo, layoutBranchChildren } from './branch-layout'

const translateStartState = new Map<
	string,
	{
		branchX: number
		branchY: number
		children: Array<{ id: string; type: string; x: number; y: number }>
	}
>()

class BranchGeometry2d extends Geometry2d {
	constructor(private readonly children: Geometry2d[]) {
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
		return this.children.flatMap((child) => child.getBoundsVertices())
	}

	override getBounds() {
		return Box.FromPoints(this.getBoundsVertices())
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
			version: 1,
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

		return new BranchGeometry2d(children)
	}

	override onResize(shape: IBranchShape, info: TLResizeInfo<IBranchShape>) {
		return resizeBox(shape, info)
	}

	override onTranslateStart(shape: IBranchShape) {
		const children = getAllBranchChildIds(shape)
			.map((id) => this.editor.getShape(id as TLShapeId))
			.filter(Boolean)
			.map((child: any) => ({
				id: child.id,
				type: child.type,
				x: child.x,
				y: child.y,
			}))

		translateStartState.set(shape.id, {
			branchX: shape.x,
			branchY: shape.y,
			children,
		})
	}

	override onTranslateEnd(initial: IBranchShape, current: IBranchShape) {
		const start = translateStartState.get(current.id)
		translateStartState.delete(current.id)

		if (start && start.children.length > 0) {
			const dx = current.x - start.branchX
			const dy = current.y - start.branchY
			if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
				this.editor.updateShapes(
					start.children.map((child) => ({
						id: child.id as any,
						type: child.type as any,
						x: child.x + dx,
						y: child.y + dy,
					}))
				)
			}
		}

		const branch = this.editor.getShape<IBranchShape>(current.id) || current || initial
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

		return (
			<SVGContainer className="BranchShape">
				<circle
					cx={info.rootX}
					cy={info.rootY}
					r={info.rootRadius}
					fill={color}
					opacity={hasChildren ? 1 : 0.9}
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
							return <path key={child.id} d={path} />
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
