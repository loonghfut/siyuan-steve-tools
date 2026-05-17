import React from 'react'
import {
	Box,
	CubicBezier2d,
	Editor,
	Group2d,
	IndexKey,
	Mat,
	Rectangle2d,
	SvgExportContext,
	ShapeUtil,
	SVGContainer,
	TLHandle,
	TLHandleDragInfo,
	TLShapeId,
	Vec,
	VecLike,
	clamp,
	useEditor,
	useValue,
	getDefaultColorTheme,
	getColorValue,
	toRichText,
	createComputedCache,
	renderHtmlFromRichTextForMeasurement,
	renderPlaintextFromRichText,
	TLRichText,
} from '@tldraw/tldraw'
import { RichTextLabel, RichTextSVG } from '@tldraw/tldraw'
import { bezierConnectorShapeProps } from './bezier-connector-props'
import { bezierConnectorShapeMigrations } from './bezier-connector-migrations'
import { IBezierConnectorShape, PortTerminal } from './bezier-connector-types'
import {
	getConnectorBindings,
	getConnectorBindingPositionInPageSpace,
	createOrUpdateConnectorBinding,
	removeConnectorBinding,
} from './bezier-connector-binding'
import { getPortAtPoint } from './port-utils'
import { getPortState, setEligiblePortsIfChanged, setHintingPortIfChanged, setHighlightConnectorIfChanged } from './port-state'

// 常量定义（参考 tldraw 的 default-shape-constants）
const ARROW_LABEL_FONT_SIZES: Record<string, number> = {
	s: 18,
	m: 20,
	l: 24,
	xl: 28,
}

const ARROW_LABEL_PADDING = 4.25

const TEXT_PROPS = {
	lineHeight: 1.35,
	fontWeight: 'normal',
	fontVariant: 'normal',
	fontStyle: 'normal',
	padding: '0px',
}

const FONT_FAMILIES: Record<string, string> = {
	draw: 'var(--tl-font-draw)',
	sans: 'var(--tl-font-sans)',
	serif: 'var(--tl-font-serif)',
	mono: 'var(--tl-font-mono)',
}

/**
 * 判断富文本是否为空
 */
function isEmptyRichText(richText: TLRichText | undefined): boolean {
	if (!richText) return true
	if (typeof richText === 'object' && richText.content) {
		return richText.content.every((node: any) => {
			if (node.type === 'paragraph') {
				if (!node.content || node.content.length === 0) return true
				return node.content.every((child: any) => {
					if (child.type === 'text') {
						return !child.text || child.text.trim() === ''
					}
					return false
				})
			}
			return false
		})
	}
	return true
}

// tldraw 箭头/默认标签使用的 padding（用于几何与裁剪）
// 这里保持与 ARROW_LABEL_PADDING 一致，确保：
// - 几何命中区域与实际渲染一致
// - 曲线裁剪缺口与文字框一致
const LABEL_PADDING = ARROW_LABEL_PADDING

function isRichTextEmpty(editor: Editor, richText: any) {
	return renderPlaintextFromRichText(editor, richText).trim().length === 0
}

const bezierLabelSizeCache = createComputedCache(
	'bezier-connector-label-size',
	(editor: Editor, shape: IBezierConnectorShape) => {
		editor.fonts.trackFontsForShape(shape)
		const isEmpty = isRichTextEmpty(editor, shape.props.richText)
		const html = renderHtmlFromRichTextForMeasurement(
			editor,
			isEmpty ? toRichText('i') : shape.props.richText
		)
		const fontSize = getBezierLabelFontSize(shape)
		const { w, h } = editor.textMeasure.measureHtml(html, {
			...TEXT_PROPS,
			fontFamily: FONT_FAMILIES[shape.props.font],
			fontSize,
			maxWidth: null,
		})
		return new Vec(w, h).addScalar(LABEL_PADDING * 2 * shape.props.scale)
	},
	{ areRecordsEqual: (a, b) => a.props === b.props }
)

function getBezierLabelFontSize(shape: IBezierConnectorShape) {
	return ARROW_LABEL_FONT_SIZES[shape.props.size] * (shape.props.scale ?? 1)
}

function getBezierLabelSize(editor: Editor, shape: IBezierConnectorShape) {
	return bezierLabelSizeCache.get(editor, shape.id) ?? new Vec(0, 0)
}

/**
 * 获取贝塞尔连接器标签位置
 */
function getBezierLabelPosition(
	editor: Editor,
	connector: IBezierConnectorShape
): { box: Box } {
	const { start, end, startPortId, endPortId } = getConnectorTerminals(editor, connector)
	const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)

	// 创建贝塞尔曲线几何体
	const bezier = new CubicBezier2d({
		start: Vec.From(start),
		cp1: Vec.From(cp1),
		cp2: Vec.From(cp2),
		end: Vec.From(end),
	})

	// 在标签位置插值获取中心点
	const labelPosition = clamp(connector.props.labelPosition, 0, 1)
	const labelCenter = bezier.interpolateAlongEdge(labelPosition)

	// 获取标签大小
	const labelSize = getBezierLabelSize(editor, connector)

	return { box: Box.FromCenter(labelCenter, labelSize) }
}

/**
 * 存储拖拽过程中最新检测到的目标端口信息
 * 只在松手时（onHandleDragEnd）真正写入 binding，避免在 drag 回调中嵌套更新 store
 */
export type PendingBindingTarget =
	| { kind: 'set'; targetId: TLShapeId; portId: string; terminal: PortTerminal }
	| { kind: 'remove'; terminal: PortTerminal }

const pendingBindingTargets = new Map<TLShapeId, PendingBindingTarget>()
// 缓存上一次 handlePagePosition 字符化值，避免大量重复计算
const handleLastDragKey = new Map<TLShapeId, string>()

/**
 * 计算贝塞尔曲线的控制点
 */
function getConnectionControlPoints(
	start: VecLike,
	end: VecLike,
	startPortId?: string,
	endPortId?: string
): [Vec, Vec] {
	const dx = end.x - start.x
	const dy = end.y - start.y

	// 提取端口方向（支持两种格式：直接方向如 'input'/'output'/'top'/'bottom'，或思维导图格式 'nodeId:direction'）
	const extractPortDirection = (portId?: string): string | null => {
		if (!portId) return null
		// 如果是思维导图格式，提取最后的方向部分
		if (portId.includes(':')) {
			return portId.split(':').pop() || null
		}
		return portId
	}

	const startDir = extractPortDirection(startPortId)
	const endDir = extractPortDirection(endPortId)

	// 先识别端口方向（若已绑定端口，则优先使用端口方向）
	const startIsVertical = startDir === 'top' || startDir === 'bottom'
	const startIsHorizontal = startDir === 'input' || startDir === 'output' || startDir === 'left' || startDir === 'right'
	const endIsVertical = endDir === 'top' || endDir === 'bottom'
	const endIsHorizontal = endDir === 'input' || endDir === 'output' || endDir === 'left' || endDir === 'right'

	// 计算水平/垂直偏移大小
	const distanceX = dx
	const absX = Math.abs(distanceX)
	const adjustedDistanceX = Math.max(30, distanceX > 0 ? distanceX / 3 : clamp(absX + 30, 0, 100))

	const distanceY = dy
	const absY = Math.abs(distanceY)
	const adjustedDistanceY = Math.max(30, Math.min(absY / 3, 100))
	const signY = distanceY >= 0 ? 1 : -1

	// 计算控制点：分别独立处理每个端点，优先使用端口方向
	let cp1: Vec
	let cp2: Vec

	// 起点控制点
	if (startIsHorizontal) {
		const isLeftOrInput = startDir === 'input' || startDir === 'left'
		cp1 = new Vec(start.x + (isLeftOrInput ? -adjustedDistanceX : adjustedDistanceX), start.y)
	} else if (startIsVertical) {
		cp1 = new Vec(start.x, start.y + (startDir === 'bottom' ? adjustedDistanceY : -adjustedDistanceY))
	} else {
		// 根据主轴选择偏移方向
		if (Math.abs(dx) >= Math.abs(dy)) {
			cp1 = new Vec(start.x + (distanceX > 0 ? adjustedDistanceX : -adjustedDistanceX), start.y)
		} else {
			cp1 = new Vec(start.x, start.y + signY * adjustedDistanceY)
		}
	}

	// 终点控制点
	if (endIsHorizontal) {
		// 默认让控制点在端口外侧。
		const isLeftOrInput = endDir === 'input' || endDir === 'left'
		cp2 = new Vec(end.x + (isLeftOrInput ? -adjustedDistanceX : adjustedDistanceX), end.y)
	} else if (endIsVertical) {
		cp2 = new Vec(end.x, end.y + (endDir === 'bottom' ? adjustedDistanceY : -adjustedDistanceY))
	} else {
		if (Math.abs(dx) >= Math.abs(dy)) {
			cp2 = new Vec(end.x + (distanceX > 0 ? -adjustedDistanceX : adjustedDistanceX), end.y)
		} else {
			cp2 = new Vec(end.x, end.y + (signY < 0 ? adjustedDistanceY : -adjustedDistanceY))
		}
	}

	return [cp1, cp2]
}

/**
 * 生成 SVG 路径
 */
function getConnectionPath(start: VecLike, end: VecLike, startPortId?: string, endPortId?: string): string {
	const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)
	return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`
}

function getStrokeDasharray(strokeStyle?: IBezierConnectorShape['props']['strokeStyle']) {
	if (strokeStyle === 'dashed') return '12 8'
	if (strokeStyle === 'flowing') return '10 8'
	return undefined
}

/**
 * 获取连接的实际端点（考虑绑定关系）
 */
export function getConnectorTerminals(
	editor: Editor,
	connector: IBezierConnectorShape
): {
	start: VecLike
	end: VecLike
	startShapeId?: TLShapeId
	endShapeId?: TLShapeId
	startPortId?: string
	endPortId?: string
	/** 是否两端都有绑定 */
	hasBothBindings: boolean
} {
	let start: VecLike | undefined
	let end: VecLike | undefined

	const bindings = getConnectorBindings(editor, connector)
	const shapeTransform = Mat.Inverse(editor.getShapePageTransform(connector))

	// 从绑定获取位置
	if (bindings.start) {
		const inPageSpace = getConnectorBindingPositionInPageSpace(editor, bindings.start)
		if (inPageSpace) {
			start = Mat.applyToPoint(shapeTransform, inPageSpace)
		}
	}
	if (bindings.end) {
		const inPageSpace = getConnectorBindingPositionInPageSpace(editor, bindings.end)
		if (inPageSpace) {
			end = Mat.applyToPoint(shapeTransform, inPageSpace)
		}
	}

	// 回退到形状属性
	if (!start) start = connector.props.start
	if (!end) end = connector.props.end

	// 从绑定中提取形状/端口信息（可用于决定控制点方向）
	let startShapeId: TLShapeId | undefined
	let endShapeId: TLShapeId | undefined
	let startPortId: string | undefined
	let endPortId: string | undefined
	if (bindings.start) {
		startShapeId = bindings.start.toId
		startPortId = bindings.start.props.portId
	}
	if (bindings.end) {
		endShapeId = bindings.end.toId
		endPortId = bindings.end.props.portId
	}

	// 在拖拽过程中，优先使用未提交的 pendingBindingTargets 提供的端口信息以便实时显示
	const pending = pendingBindingTargets.get(connector.id)
	if (pending) {
		if (pending.kind === 'set') {
			if (pending.terminal === 'start') {
				startShapeId = pending.targetId
				startPortId = pending.portId
			} else {
				endShapeId = pending.targetId
				endPortId = pending.portId
			}
		} else if (pending.kind === 'remove') {
			if (pending.terminal === 'start') {
				startShapeId = undefined
				startPortId = undefined
			} else {
				endShapeId = undefined
				endPortId = undefined
			}
		}
	}

	const hasBothBindings = Boolean(startShapeId && endShapeId)
	return { start, end, startShapeId, endShapeId, startPortId, endPortId, hasBothBindings }
}

// Navigation buttons are handled in the style panel now; keep component minimal.

/**
 * 贝塞尔连接器组件
 */
function BezierConnectorComponent({ connector }: { connector: IBezierConnectorShape }) {
	const editor = useEditor()
	// 订阅 editor.user 的 isDarkMode，以便在主题切换时触发组件重渲染
	const isDarkMode = useValue('isDarkMode', () => editor.user.getIsDarkMode(), [editor])
	const theme = getDefaultColorTheme({ isDarkMode })
	const { start, end, startPortId, endPortId } = useValue(
		'terminals',
		() => getConnectorTerminals(editor, connector),
		[editor, connector]
	)
	const { highlightConnectorId, flashConnectorId } = useValue('connector-highlights', () => {
		const s = getPortState(editor)
		return { highlightConnectorId: s.highlightConnectorId, flashConnectorId: s.flashConnectorId }
	}, [editor])
	const isHighlighted = highlightConnectorId === connector.id
	const isFlashing = flashConnectorId === connector.id

	// 标签相关
	const isEditing = useValue('isEditing', () => editor.getEditingShapeId() === connector.id, [editor, connector.id])
	const isSelected = useValue('isSelected', () => editor.getOnlySelectedShapeId() === connector.id, [editor, connector.id])
	const showLabel = isEditing || !isEmptyRichText(connector.props.richText)
	const labelPosition = getBezierLabelPosition(editor, connector)
	const fontSize = getBezierLabelFontSize(connector)
	const labelColor = getColorValue(theme, connector.props.color, 'solid')

	const clipPathId = React.useMemo(
		() => `bezier-connector-clip-${connector.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
		[connector.id]
	)

	const bezier = React.useMemo(() => {
		const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)
		return new CubicBezier2d({
			start: Vec.From(start),
			cp1: Vec.From(cp1),
			cp2: Vec.From(cp2),
			end: Vec.From(end),
		})
	}, [start, end, startPortId, endPortId])

	// 直接拖拽文字框：仿照 tldraw 的 PointingArrowLabel
	const dragState = React.useRef<{
		isDragging: boolean
		didDrag: boolean
		offset: Vec
	}>(
		{ isDragging: false, didDrag: false, offset: new Vec(0, 0) }
	)

	const updateLabelPositionFromClientPoint = React.useCallback(
		(clientX: number, clientY: number) => {
			const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
			const pointInShapeSpace = editor
				.getPointInShapeSpace(connector, pagePoint)
				.add(dragState.current.offset)

			let next = bezier.uninterpolateAlongEdge(pointInShapeSpace)
			if (isNaN(next)) return

			// 避免贴近端点
			next = clamp(next, 0.05, 0.95)

			// 贴近默认位置时吸附到中间
			const defaultPos = 0.5
			const nextPoint = bezier.interpolateAlongEdge(next)
			const defaultPoint = bezier.interpolateAlongEdge(defaultPos)
			const snapDist = 16 / editor.getZoomLevel()
			if (Vec.Dist(nextPoint, defaultPoint) < snapDist) {
				next = defaultPos
			}

			editor.updateShape({
				id: connector.id,
				type: connector.type,
				props: { labelPosition: next },
			})
		},
		[editor, connector, bezier]
	)

	const handleLabelPointerDown = React.useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (isEditing) return
			// 让 tldraw 不把这次 pointer down 当作画布交互
			editor.markEventAsHandled(e)
			;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)

			dragState.current.isDragging = true
			dragState.current.didDrag = false

			const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY })
			const pointInShapeSpace = editor.getPointInShapeSpace(connector, pagePoint)
			const labelCenter = labelPosition.box.center
			dragState.current.offset = Vec.Sub(labelCenter, pointInShapeSpace)

			// 同时选中该连接器，提升交互一致性
			editor.select(connector.id)
		},
		[editor, connector, isEditing, labelPosition.box.center]
	)

	const handleLabelPointerMove = React.useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!dragState.current.isDragging) return
			if (isEditing) return
			// 只有按下并移动时才算拖拽
			if (e.buttons !== 1) return
			dragState.current.didDrag = true
			updateLabelPositionFromClientPoint(e.clientX, e.clientY)
		},
		[isEditing, updateLabelPositionFromClientPoint]
	)

	const endLabelDrag = React.useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!dragState.current.isDragging) return
			dragState.current.isDragging = false
			try {
				;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
			} catch {
				// ignore
			}
		},
		[]
	)

	const handleLabelDoubleClick = React.useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (isEditing) return
			editor.markEventAsHandled(e)
			editor.select(connector.id)
			// 进入编辑态（RichTextLabel 内部会根据 editingShapeId 切换为可编辑）
			editor.setEditingShape(connector.id)
			editor.setCurrentTool('select.editing_shape', {})
			// 体验：双击进入后全选
			editor.emit('select-all-text', { shapeId: connector.id })
		},
		[editor, connector.id, isEditing]
	)

	return (
		<>
			<SVGContainer className="BezierConnectorShape">
				{showLabel && (
					<defs>
						<clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
							<path
								clipRule="evenodd"
								d={(() => {
									const b = bezier.bounds
									const pad = 100
									const outerLeft = b.minX - pad
									const outerTop = b.minY - pad
									const outerRight = b.maxX + pad
									const outerBottom = b.maxY + pad

									// 缺口按整个 label box 裁掉（与 tldraw arrow 一致），确保曲线不穿过文字框
									const hole = labelPosition.box.clone().expandBy(0)
									return [
										`M ${outerLeft} ${outerTop}`,
										`L ${outerRight} ${outerTop}`,
										`L ${outerRight} ${outerBottom}`,
										`L ${outerLeft} ${outerBottom}`,
										`Z`,
										`M ${hole.minX} ${hole.minY}`,
										`L ${hole.maxX} ${hole.minY}`,
										`L ${hole.maxX} ${hole.maxY}`,
										`L ${hole.minX} ${hole.maxY}`,
										`Z`,
									].join(' ')
								})()}
							/>
						</clipPath>
					</defs>
				)}
				{renderConnectorPathAndEndpoints(
					start,
					end,
					connector.props,
					theme,
					startPortId,
					endPortId,
					isHighlighted,
					isFlashing,
					showLabel ? clipPathId : undefined
				)}
			</SVGContainer>
			{showLabel && (
				<>
					{/* 交互层：用于拖拽标签位置与双击进入编辑（非编辑态时生效） */}
					<div
						className="bezier-connector-label-overlay"
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							width: labelPosition.box.w,
							height: labelPosition.box.h,
							transform: `translate(${labelPosition.box.x}px, ${labelPosition.box.y}px)`,
							pointerEvents: isEditing ? 'none' : 'all',
							cursor: isEditing ? 'text' : 'grab',
							background: 'transparent',
							borderRadius: 4 * connector.props.scale,
						}}
						onPointerDown={handleLabelPointerDown}
						onPointerMove={handleLabelPointerMove}
						onPointerUp={endLabelDrag}
						onPointerCancel={endLabelDrag}
						onDoubleClick={handleLabelDoubleClick}
					/>
					<RichTextLabel
						shapeId={connector.id}
						type="bezier-connector"
						font={connector.props.font}
						fontSize={fontSize}
						lineHeight={TEXT_PROPS.lineHeight}
						align="middle"
						verticalAlign="middle"
						labelColor={labelColor}
						richText={connector.props.richText}
						isSelected={isSelected}
						textWidth={labelPosition.box.w - ARROW_LABEL_PADDING * 2 * connector.props.scale}
						padding={0}
						style={{
							transform: `translate(${labelPosition.box.center.x}px, ${labelPosition.box.center.y}px)`,
						}}
					/>
				</>
			)}
		</>
	)
}

/**
 * 抽取出的渲染函数：在 component 和 toSvg 中复用，避免样式/行为不同步
 */
function renderConnectorPathAndEndpoints(
	start: VecLike,
	end: VecLike,
	props: IBezierConnectorShape['props'],
	theme: ReturnType<typeof getDefaultColorTheme>,
	startPortId?: string,
	endPortId?: string
	, isHighlighted: boolean = false, isFlashing: boolean = false,
	clipPathId?: string
) {
	const d = getConnectionPath(start, end, startPortId, endPortId)
	const r = Math.max(3, (props.strokeWidth || 2) + 1)
	const color = (theme && theme[props.color] && theme[props.color].solid) || props.color || theme.black.solid
	const strokeStyle = props.strokeStyle ?? 'solid'
	const strokeDasharray = getStrokeDasharray(strokeStyle)
	const isFlowing = strokeStyle === 'flowing'
	// 如果需要高亮或闪烁，先画一条宽的半透明路径作为 glow/halo
	const highlight = isHighlighted || isFlashing
	const highlightWidth = Math.max(0, (props.strokeWidth || 2) + (isHighlighted ? 3 : 0) + (isFlashing ? 2 : 0))
	const highlightOpacity = isFlashing ? 0.6 : 0.28

	return (
		<>
			{highlight && (
				<path
					d={d}
					stroke={color}
					strokeWidth={highlightWidth}
					strokeLinecap="round"
					fill="none"
					strokeOpacity={highlightOpacity}
					strokeDasharray={strokeDasharray}
					clipPath={clipPathId ? `url(#${clipPathId})` : undefined}
				/>
			)}
			<path
				d={d}
				stroke={color}
				strokeWidth={props.strokeWidth}
				strokeLinecap="round"
				fill="none"
				strokeDasharray={strokeDasharray}
				className={isFlowing ? 'bezier-connector-path bezier-connector-path--flowing' : 'bezier-connector-path'}
				clipPath={clipPathId ? `url(#${clipPathId})` : undefined}
			/>
			{start && (
				<circle cx={start.x} cy={start.y} r={r} fill={color} stroke="none" />
			)}
			{end && (
				<circle cx={end.x} cy={end.y} r={r} fill={color} stroke="none" />
			)}
		</>
	)
}

/**
 * 贝塞尔连接器形状工具类
 */
export class BezierConnectorShapeUtil extends ShapeUtil<IBezierConnectorShape> {
	static override type = 'bezier-connector' as const
	static override props = bezierConnectorShapeProps
	static override migrations = bezierConnectorShapeMigrations

	getDefaultProps(): IBezierConnectorShape['props'] {
		return {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 100 },
			color: 'grey',
			strokeWidth: 3,
			strokeStyle: 'solid',
			richText: toRichText(''),
			labelPosition: 0.5,
			font: 'draw',
			size: 'm',
			scale: 1,
		}
	}

	// 启用编辑功能以支持双击编辑文字
	override canEdit() {
		return true
	}
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

	// 定义连接形状的几何形状为三次贝塞尔曲线
	getGeometry(connector: IBezierConnectorShape) {
		const isEditing = this.editor.getEditingShapeId() === connector.id
		const { start, end, startPortId, endPortId } = getConnectorTerminals(this.editor, connector)
		const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)

		const bodyGeom = new CubicBezier2d({
			start: Vec.From(start),
			cp1: Vec.From(cp1),
			cp2: Vec.From(cp2),
			end: Vec.From(end),
		})

		// 如果正在编辑或有文本，添加标签几何体
		let labelGeom: Rectangle2d | undefined
		if (isEditing || !isEmptyRichText(connector.props.richText)) {
			const labelPosition = getBezierLabelPosition(this.editor, connector)
			labelGeom = new Rectangle2d({
				x: labelPosition.box.x,
				y: labelPosition.box.y,
				width: labelPosition.box.w,
				height: labelPosition.box.h,
				isFilled: true,
				isLabel: true,
			})
		}

		return new Group2d({
			children: labelGeom ? [bodyGeom, labelGeom] : [bodyGeom],
		})
	}

	override getText(shape: IBezierConnectorShape) {
		return renderPlaintextFromRichText(this.editor, shape.props.richText)
	}

	// 定义可拖拽的手柄（起点、中点标签、终点）
	getHandles(connector: IBezierConnectorShape): TLHandle[] {
		const { start, end } = getConnectorTerminals(this.editor, connector)

		return [
			{
				id: 'start',
				type: 'vertex',
				index: 'a0' as IndexKey,
				x: start.x,
				y: start.y,
			},
			{
				id: 'end',
				type: 'vertex',
				index: 'a2' as IndexKey,
				x: end.x,
				y: end.y,
			},
		]
	}

	/**
	 * 处理手柄拖拽（纯函数，不写 store）
	 * 只计算坐标并记录待绑定的目标，真正的 binding 在 onHandleDragEnd 落盘
	 */
	onHandleDrag(
		connector: IBezierConnectorShape,
		{ handle }: TLHandleDragInfo<IBezierConnectorShape>
	): IBezierConnectorShape {
		const handleId = handle.id
		const connectorId = connector.id

		const draggingTerminal = handleId as PortTerminal

		// 计算手柄在页面空间中的位置
		const shapeTransform = this.editor.getShapePageTransform(connector)
		const inverseShapeTransform = Mat.Inverse(shapeTransform)
		const handlePagePosition = shapeTransform.applyToPoint(handle)

			// 简单节流：若位置未发生实际变化，则跳过后续的计算与状态写入
			const key = `${Math.round(handlePagePosition.x)}:${Math.round(handlePagePosition.y)}:${draggingTerminal}`
			const lastKey = handleLastDragKey.get(connectorId)
			if (lastKey === key) {
				return connector
			}
			handleLastDragKey.set(connectorId, key)

		// 查找该位置的端口
		// 不再按 terminal (start/end) 过滤目标端口，允许任意端口互连
		// 将 handle 拖动视为连接模式的一部分：显示 eligible ports
		setEligiblePortsIfChanged(this.editor, {
			terminal: undefined,
			excludeShapeIds: new Set([connector.id]),
		})

		const target = getPortAtPoint(this.editor, handlePagePosition, {
			margin: 28,
		})

		// 如果找到可用端口，记录待绑定目标，并设置高亮当前 connector
		if (target) {
			const targetShape = this.editor.getShape(target.shapeId)
			if (targetShape) {
				const targetPortInPage = this.editor
					.getShapePageTransform(targetShape)
					.applyToPoint(target.port)
				const targetPortOnConnector = Mat.applyToPoint(inverseShapeTransform, targetPortInPage)

				// 更新 hinting 状态以便端口可视化高亮
				setHintingPortIfChanged(this.editor, { shapeId: target.shapeId, portId: target.port.id })
				// 高亮当前连接器用于视觉引导
				setHighlightConnectorIfChanged(this.editor, connectorId)
				// 只存储目标信息，不写 store
				pendingBindingTargets.set(connectorId, {
					kind: 'set',
					targetId: target.shapeId,
					portId: target.port.id,
					terminal: draggingTerminal,
				})

				return {
					...connector,
					props: {
						...connector.props,
						[handle.id]: { x: targetPortOnConnector.x, y: targetPortOnConnector.y },
					},
				}
			}
		}

		// 没有找到端口，记录待移除
		// 清除 hinting 状态
		setHintingPortIfChanged(this.editor, null)
		setHighlightConnectorIfChanged(this.editor, null)
		// clear eligible ports when not matching
		// eligiblePorts stay during drag, cleared in onHandleDragEnd
		pendingBindingTargets.set(connectorId, {
			kind: 'remove',
			terminal: draggingTerminal,
		})
		return {
			...connector,
			props: {
				...connector.props,
				[handle.id]: { x: handle.x, y: handle.y },
			},
		}
	}

	/**
	 * 拖拽结束时真正提交 binding 变更
	 */
	onHandleDragEnd(
		connector: IBezierConnectorShape,
		_info: TLHandleDragInfo<IBezierConnectorShape>
	): void {
		const pending = pendingBindingTargets.get(connector.id)
		pendingBindingTargets.delete(connector.id)
		if (!pending) return

		if (pending.kind === 'remove') {
			removeConnectorBinding(this.editor, connector.id, pending.terminal)
		} else {
			createOrUpdateConnectorBinding(this.editor, connector.id, pending.targetId, {
				portId: pending.portId,
				terminal: pending.terminal,
			})
		}

		// 清理 hinting，并清除 connector highlight
		setHintingPortIfChanged(this.editor, null)
		setHighlightConnectorIfChanged(this.editor, null)
		// 清理 eligiblePorts 以隐藏端口 overlay
		setEligiblePortsIfChanged(this.editor, null)

	// 清理位置节流缓存
	handleLastDragKey.delete(connector.id)
	}

	// 渲染连接组件
	component(connector: IBezierConnectorShape) {
		return <BezierConnectorComponent connector={connector} />
	}

	// 导出为 SVG（用于导出/序列化）
	override toSvg(connector: IBezierConnectorShape, ctx: SvgExportContext) {
		const { start, end, startPortId, endPortId } = getConnectorTerminals(this.editor, connector)
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		const labelPosition = getBezierLabelPosition(this.editor, connector)
		const isEmpty = isEmptyRichText(connector.props.richText)
		const fontSize = getBezierLabelFontSize(connector)
		const labelColor = getColorValue(theme, connector.props.color, 'solid')
		const clipPathId = `bezier-connector-export-clip-${connector.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
		const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)
		const bezier = new CubicBezier2d({
			start: Vec.From(start),
			cp1: Vec.From(cp1),
			cp2: Vec.From(cp2),
			end: Vec.From(end),
		})

		return (
			<g>
				{!isEmpty && (
					<defs>
						<clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
							<path
								clipRule="evenodd"
								d={(() => {
									const b = bezier.bounds
									const pad = 100
									const outerLeft = b.minX - pad
									const outerTop = b.minY - pad
									const outerRight = b.maxX + pad
									const outerBottom = b.maxY + pad
									const hole = labelPosition.box.clone().expandBy(0)
									return [
										`M ${outerLeft} ${outerTop}`,
										`L ${outerRight} ${outerTop}`,
										`L ${outerRight} ${outerBottom}`,
										`L ${outerLeft} ${outerBottom}`,
										`Z`,
										`M ${hole.minX} ${hole.minY}`,
										`L ${hole.maxX} ${hole.minY}`,
										`L ${hole.maxX} ${hole.maxY}`,
										`L ${hole.minX} ${hole.maxY}`,
										`Z`,
									].join(' ')
								})()}
							/>
						</clipPath>
					</defs>
				)}
				{renderConnectorPathAndEndpoints(
					start,
					end,
					connector.props,
					theme,
					startPortId,
					endPortId,
					false,
					false,
					!isEmpty ? clipPathId : undefined
				)}
				{!isEmpty && (
					<RichTextSVG
						fontSize={fontSize}
						font={connector.props.font}
						align="middle"
						verticalAlign="middle"
						labelColor={labelColor}
						richText={connector.props.richText}
						bounds={labelPosition.box.clone().expandBy(-ARROW_LABEL_PADDING * connector.props.scale)}
						padding={0}
					/>
				)}
			</g>
		)
	}

	// 渲染选中指示器
	indicator(connector: IBezierConnectorShape) {
		const { start, end, startPortId, endPortId } = getConnectorTerminals(this.editor, connector)
		const strokeStyle = connector.props.strokeStyle ?? 'solid'
		const isEmpty = isEmptyRichText(connector.props.richText)
		const isEditing = this.editor.getEditingShapeId() === connector.id
		const clipPathId = `bezier-connector-indicator-clip-${connector.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

		const labelPosition = getBezierLabelPosition(this.editor, connector)
		const labelBounds = labelPosition.box
		const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)
		const bezier = new CubicBezier2d({
			start: Vec.From(start),
			cp1: Vec.From(cp1),
			cp2: Vec.From(cp2),
			end: Vec.From(end),
		})

		// 如果正在编辑，只显示标签框的指示器
		if (isEditing && !isEmpty) {
			return (
				<rect
					x={labelBounds.x}
					y={labelBounds.y}
					width={labelBounds.w}
					height={labelBounds.h}
					rx={3.5 * connector.props.scale}
					ry={3.5 * connector.props.scale}
				/>
			)
		}

		return (
			<g>
				{!isEmpty && (
					<defs>
						<clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
							<path
								clipRule="evenodd"
								d={(() => {
									const b = bezier.bounds
									const pad = 100
									const outerLeft = b.minX - pad
									const outerTop = b.minY - pad
									const outerRight = b.maxX + pad
									const outerBottom = b.maxY + pad
									const hole = labelBounds.clone().expandBy(0)
									return [
										`M ${outerLeft} ${outerTop}`,
										`L ${outerRight} ${outerTop}`,
										`L ${outerRight} ${outerBottom}`,
										`L ${outerLeft} ${outerBottom}`,
										`Z`,
										`M ${hole.minX} ${hole.minY}`,
										`L ${hole.maxX} ${hole.minY}`,
										`L ${hole.maxX} ${hole.maxY}`,
										`L ${hole.minX} ${hole.maxY}`,
										`Z`,
									].join(' ')
								})()}
							/>
						</clipPath>
					</defs>
				)}
				<path
					d={getConnectionPath(start, end, startPortId, endPortId)}
					strokeWidth={Math.max(0.5, (connector.props.strokeWidth || 0) - 1.5)}
					strokeLinecap="round"
					strokeDasharray={getStrokeDasharray(strokeStyle)}
					fill="none"
					clipPath={!isEmpty ? `url(#${clipPathId})` : undefined}
				/>
				{!isEmpty && (
					<rect
						x={labelBounds.x}
						y={labelBounds.y}
						width={labelBounds.w}
						height={labelBounds.h}
						rx={3.5 * connector.props.scale}
						ry={3.5 * connector.props.scale}
					/>
				)}
			</g>
		)
	}

	// 开始编辑时，如果是首次编辑空文本，设置默认标签位置
	override onEditStart(connector: IBezierConnectorShape) {
		if (isEmptyRichText(connector.props.richText)) {
			this.editor.updateShape({
				id: connector.id,
				type: connector.type,
				props: { labelPosition: 0.5 },
			})
		}
	}
}
