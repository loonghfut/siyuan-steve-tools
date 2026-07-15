import React, { useState, useRef, useCallback, useEffect } from 'react'
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
	DefaultColorStyle,
	TLDefaultColorStyle,
	HTMLContainer,
	stopEventPropagation,
} from '@tldraw/tldraw'
import { moveToSlide } from './useSlides'
import { slideShapeMigrations } from './SlideShapeMigrations'
import { getDefaultColorTheme } from '../utils/color-theme'

export type SlideShape = TLBaseShape<
	'slide',
	{
		w: number
		h: number
		name?: string // 添加 name 属性
		version?: number // 添加 version 属性定义
		color: TLDefaultColorStyle
		screenshot?: string
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

	override getIndicatorPath(shape: SlideShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
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

		// 内联编辑状态
		const [isEditing, setIsEditing] = useState(false)
		const [editValue, setEditValue] = useState(shape.props.name || '')
		const inputRef = useRef<HTMLInputElement>(null)

		// 当shape的name属性变化时，同步到editValue
		useEffect(() => {
			if (!isEditing) {
				setEditValue(shape.props.name || '')
			}
		}, [shape.props.name, isEditing])

		// 进入编辑模式时聚焦输入框
		useEffect(() => {
			if (isEditing && inputRef.current) {
				// 使用setTimeout延迟聚焦，让浏览器先处理完点击事件
				setTimeout(() => {
					inputRef.current?.focus()
					inputRef.current?.select()
				}, 0)
			}
		}, [isEditing])

		// 保存名称
		const saveName = useCallback((newName: string) => {
			const trimmedName = newName.trim()
			if (trimmedName !== shape.props.name) {
				this.editor.updateShape({
					id: shape.id,
					type: 'slide',
					props: { name: trimmedName || 'New Slide' },
				})
			}
			setIsEditing(false)
		}, [shape.id, shape.props.name])

		// 处理键盘事件
		const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault()
				saveName(editValue)
			} else if (e.key === 'Escape') {
				setEditValue(shape.props.name || '')
				setIsEditing(false)
			}
		}, [editValue, saveName, shape.props.name])

		// 处理点击进入编辑模式
		const handleLabelPointerDown = useCallback((e: React.PointerEvent) => {
			stopEventPropagation(e)
			// 不调用preventDefault，让浏览器处理点击事件后再聚焦
			setIsEditing(true)
		}, [])

		// 处理输入变化
		const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
			setEditValue(e.target.value)
		}, [])

		// 处理失去焦点
		const handleBlur = useCallback(() => {
			saveName(editValue)
		}, [editValue, saveName])

		if (!bounds) return null

		const labelFontSize = `calc(12px / ${zoomLevel})`
		const labelPadding = `calc(4px / ${zoomLevel})`

		return (
			<>
				<HTMLContainer style={{ pointerEvents: 'all' }}>
					{isEditing ? (
						<input
							ref={inputRef}
							className="slide-shape-name-input"
							type="text"
							value={editValue}
							onChange={handleInputChange}
							onKeyDown={handleKeyDown}
							onBlur={handleBlur}
							onPointerDown={stopEventPropagation}
							spellCheck={false}
							style={{
								position: 'absolute',
								top: `calc(-25px / ${zoomLevel})`,
								left: 0,
								width: shape.props.w,
								height: `calc(20px / ${zoomLevel})`,
								fontSize: labelFontSize,
								textAlign: 'center',
								border: '1px solid var(--color-primary)',
								borderRadius: `calc(var(--radius-2) / ${zoomLevel})`,
								padding: labelPadding,
								background: 'var(--color-background)',
								color: 'var(--color-text)',
								outline: 'none',
								zIndex: 10,
								cursor: 'text',
							}}
						/>
					) : (
						<div
							className="slide-shape-label"
							onPointerDown={handleLabelPointerDown}
							style={{
								position: 'absolute',
								top: `calc(-25px / ${zoomLevel})`,
								left: 0,
								width: shape.props.w,
								textAlign: 'center',
								cursor: 'text',
								zIndex: 1,
								fontSize: labelFontSize,
								pointerEvents: 'all',
								color: strokeColor,
								userSelect: 'none',
							}}
							title="点击编辑名称"
						>
							{shape.props.name || `Slide`}
						</div>
					)}
				</HTMLContainer>

				<SVGContainer>
					<defs>
						<style>{`
							.slide-border-wavy {
								stroke-dasharray: calc(8px * var(--tl-scale)) calc(4px * var(--tl-scale));
								stroke-dashoffset: 0;
								animation: slideBorderFlow 2s linear infinite;
							}
							@keyframes slideBorderFlow {
								0% { stroke-dashoffset: 0; }
								100% { stroke-dashoffset: calc(-24px * var(--tl-scale)); }
							}
						`}</style>
					</defs>
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
										className="slide-border-wavy"
									/>
								)
							})}
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
