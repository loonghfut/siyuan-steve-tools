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
		borderStyle?: 'solid' | 'dashed' | 'wavy' // 边框样式：实线、虚线、流动效果
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
		borderStyle: T.optional(T.string) as any, // 边框样式: solid, dashed, wavy
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
			borderStyle: 'dashed', // 默认虚线边框
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
		const borderStyle = shape.props.borderStyle || 'dashed'
		const strokeColor = theme[shape.props.color].solid

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
						color: strokeColor,
					}}
				>
					{shape.props.name || `Slide`}
				</div>

				<SVGContainer>
					<rect
						width={shape.props.w}
						height={shape.props.h}
						fill={strokeColor}
						fillOpacity={0.06}
					/>
					{borderStyle === 'wavy' ? (
						/* 流动效果 - 使用动画虚线 */
						<g
							style={{
								stroke: strokeColor,
								strokeWidth: 'calc(1.5px * var(--tl-scale))',
								opacity: 0.8,
							}}
							pointerEvents="none"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							{bounds.sides.map((side, i) => {
								return (
									<line
										key={i}
										x1={side[0].x}
										y1={side[0].y}
										x2={side[1].x}
										y2={side[1].y}
										strokeDasharray="8 4"
										className="slide-border-wavy"
									/>
								)
							})}
							<style>{`
								.slide-border-wavy {
									animation: slideBorderFlow 2s linear infinite;
								}
								@keyframes slideBorderFlow {
									0% { stroke-dashoffset: 0; }
									100% { stroke-dashoffset: -24; }
								}
							`}</style>
						</g>
					) : (
						/* 普通边框 - 实线或虚线 */
						<g
							style={{
								stroke: strokeColor,
								strokeWidth: 'calc(1px * var(--tl-scale))',
								opacity: borderStyle === 'dashed' ? 0.5 : 0.8,
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
										style: borderStyle === 'dashed' ? 'dashed' : 'solid',
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
					)}
				</SVGContainer>
			</>
		)
	}

	indicator(shape: SlideShape) {
		return <rect width={shape.props.w} height={shape.props.h} />
	}
}
