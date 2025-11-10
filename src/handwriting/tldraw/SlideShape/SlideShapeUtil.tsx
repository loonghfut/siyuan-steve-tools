import React, { useCallback, useState, useRef, useEffect } from 'react' // 导入 React hooks
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
	useEditor,
	TLDefaultColorStyle,
	getDefaultColorTheme, // 导入 useEditor
} from '@tldraw/tldraw'
import { moveToSlide, useSlides } from './useSlides'
import { slideShapeMigrations } from './SlideShapeMigrations'

export type SlideShape = TLBaseShape<
	'slide',
	{
		w: number
		h: number
		name?: string // 添加 name 属性
		version?: number // 添加 version 属性定义
		color: TLDefaultColorStyle
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
		const editor = useEditor() // 获取 editor 实例
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const zoomLevel = useValue('zoom level', () => this.editor.getZoomLevel(), [this.editor])
		const [isEditing, setIsEditing] = useState(false)
		const [editText, setEditText] = useState(shape.props.name)
		const inputRef = useRef<HTMLInputElement>(null)

		useEffect(() => {
			// Update local text state if the shape's name prop changes externally
			if (!isEditing) {
				setEditText(shape.props.name)
			}
		}, [shape.props.name, isEditing])

		// eslint-disable-next-line react-hooks/rules-of-hooks
		useEffect(() => {
			// Focus input when editing starts
			if (isEditing && inputRef.current) {
				inputRef.current.focus()
				inputRef.current.select()
			}
		}, [isEditing])

		// eslint-disable-next-line react-hooks/rules-of-hooks
		// const handleLabelPointerDown = useCallback(
		// 	(e: React.PointerEvent) => {
		// 		// Prevent selecting the shape when clicking the label if already editing
		// 		if (isEditing) {
		// 			stopEventPropagation(e)
		// 			return
		// 		}
		// 		// Allow selecting the shape otherwise
		// 		editor.select(shape.id)
		// 	},
		// 	[editor, shape.id, isEditing]
		// )

		// eslint-disable-next-line react-hooks/rules-of-hooks
		// const handleDoubleClick = useCallback((e: React.MouseEvent) => {
		// 	console.log('Double click on label')
		// 	stopEventPropagation(e) // Prevent canvas double click actions
		// 	// Select the shape if not already selected when starting to edit
		// 	if (!editor.getSelectedShapeIds().includes(shape.id)) {
		// 		editor.select(shape.id)
		// 	}
		// 	setIsEditing(true)
		// }, [editor, shape.id])

		// eslint-disable-next-line react-hooks/rules-of-hooks
		const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
			setEditText(e.target.value)
		}, [])

		// eslint-disable-next-line react-hooks/rules-of-hooks
		const handleBlur = useCallback(() => {
			if (editText.trim() === '') {
				// Revert if empty
				setEditText(shape.props.name)
			} else if (editText !== shape.props.name) {
				// Save changes
				editor.updateShape({
					id: shape.id,
					type: 'slide',
					props: { name: editText.trim() },
				})
			}
			setIsEditing(false)
		}, [editor, shape.id, shape.props.name, editText])

		// eslint-disable-next-line react-hooks/rules-of-hooks
		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent<HTMLInputElement>) => {
				if (e.key === 'Enter') {
					e.currentTarget.blur() // Trigger blur to save
				} else if (e.key === 'Escape') {
					setEditText(shape.props.name) // Revert
					setIsEditing(false)
					e.currentTarget.blur()
				}
			},
			[shape.props.name]
		)




		if (!bounds) return null

		return (
			<>
				<div
					className="slide-shape-label"
					style={{
						position: 'absolute',
						top: `calc(-25px / ${zoomLevel})`, // Adjust position based on zoom
						left: 0,
						width: shape.props.w,
						textAlign: 'center',
						cursor: 'default', // Change cursor as it's not directly editable here
						zIndex: 1,
						fontSize: `calc(12px / ${zoomLevel})`, // Adjust font size based on zoom
						pointerEvents: 'none', // Prevent label from interfering with selection
						color: theme[shape.props.color].solid, // Ensure visibility
					}}
				>
					{shape.props.name || `Slide`}
				</div>

				<SVGContainer>
                    {/* Background Rectangle */}
                    <rect
                        width={shape.props.w}
                        height={shape.props.h}
                        fill={theme[shape.props.color].solid}
                        fillOpacity={0.08} // Add a subtle background fill
                    />
                    {/* Dashed Border Outline */}
                    <g
                        style={{
                            stroke: theme[shape.props.color].solid, // Use shape's color for border
                            strokeWidth: 'calc(1px * var(--tl-scale))',
                            opacity: 0.5, // Adjust opacity for better visibility
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