import React from 'react'
import {
	Geometry2d,
	RecordProps,
	Rectangle2d,
	SVGContainer,
	ShapeUtil,
	T,
	TLBaseShape,
	TLResizeInfo,
	getPerfectDashProps,
	resizeBox,
	useValue,
	DefaultColorStyle, // 导入 stopEventPropagation
	TLDefaultColorStyle,
	getDefaultColorTheme, // 导入 useEditor
} from '@tldraw/tldraw'
import { moveToSlide } from './useSlides'
import { slideShapeMigrations } from './SlideShapeMigrations'

export type SlideShape = TLBaseShape<
	'slide',
	{
		w: number
		h: number
		name?: string // 添加 name 属性
		version?: number // 添加 version 属性定义
		color: TLDefaultColorStyle
		screenshot?: string
		blockId?: string
	}
>

export class SlideShapeUtil extends ShapeUtil<SlideShape> {
	static override type = 'slide' as const
	static override props: RecordProps<SlideShape> = {
		w: T.number,
		h: T.number,
		name: T.optional(T.string), // 添加 name 属性
		version: T.optional(T.number), // 添加 version 属性定义
		color: DefaultColorStyle, // 添加 color 属性定义
		screenshot: T.optional(T.string),
		blockId: T.optional(T.string),
	}
	static override migrations = slideShapeMigrations

	override canBind() {
		return false
	}
	override hideRotateHandle() {
		return true
	}

	getDefaultProps(): SlideShape['props'] {
		return {
			w: 720,
			h: 480,
			name: 'New Slide', // 设置默认名称
			color: 'black', 
			// version: 1, // 设置默认版本
		}
	}

	getGeometry(shape: SlideShape): Geometry2d {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,
		})
	}

	override onRotate(initial: SlideShape) {
		return initial
	}
	// override canEdit() {
	// 	return true
	// }
	override onResize(shape: SlideShape, info: TLResizeInfo<SlideShape>) {
		return resizeBox(shape, info)
	}

	// override onDoubleClick(shape: SlideShape) {
	// 	moveToSlide(this.editor, shape)
	// 	this.editor.selectNone()
	// }

	override onDoubleClickEdge(shape: SlideShape) {
		moveToSlide(this.editor, shape)
		this.editor.selectNone()
	}

	component(shape: SlideShape) {
		const theme = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
		const bounds = this.editor.getShapeGeometry(shape).bounds
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const zoomLevel = useValue('zoom level', () => this.editor.getZoomLevel(), [this.editor])

		if (!bounds) return null

		return (
			<>
				<div
					className="slide-shape-label"
					style={{
						position: 'absolute',
						top: `calc(-25px / ${zoomLevel})`,
						left: 0,
						width: shape.props.w,
						textAlign: 'center',
						cursor: 'default',
						zIndex: 1,
						fontSize: `calc(12px / ${zoomLevel})`,
						pointerEvents: 'none',
						color: theme[shape.props.color].solid,
					}}
				>
					{shape.props.name || `Slide`}
				</div>

				<SVGContainer>
					<rect
						width={shape.props.w}
						height={shape.props.h}
						fill={theme[shape.props.color].solid}
						fillOpacity={0.06}
					/>
					<g
						style={{
							stroke: theme[shape.props.color].solid,
							strokeWidth: 'calc(1px * var(--tl-scale))',
							opacity: 0.5,
						}}
						pointerEvents="none"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						{bounds.sides.map((side, i) => {
							const { strokeDasharray, strokeDashoffset } = getPerfectDashProps(
								side[0].dist(side[1]),
								1 / zoomLevel,
								{
									style: 'dashed',
									lengthRatio: 6,
									forceSolid: zoomLevel < 0.2,
								}
							)

							return (
								<line
									key={i}
									x1={side[0].x}
									y1={side[0].y}
									x2={side[1].x}
									y2={side[1].y}
									strokeDasharray={strokeDasharray}
									strokeDashoffset={strokeDashoffset}
								/>
							)
						})}
					</g>
				</SVGContainer>
			</>
		)
	}

	indicator(shape: SlideShape) {
		return <rect width={shape.props.w} height={shape.props.h} />
	}
}