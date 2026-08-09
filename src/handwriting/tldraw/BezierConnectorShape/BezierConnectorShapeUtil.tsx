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
	toRichText,
	createComputedCache,
	renderHtmlFromRichTextForMeasurement,
	renderPlaintextFromRichText,
	TLRichText,
} from '@tldraw/tldraw'
import { RichTextLabel, RichTextSVG } from '@tldraw/tldraw'
import { showMessage } from 'siyuan'
import { bezierConnectorShapeProps } from './bezier-connector-props'
import { bezierConnectorShapeMigrations } from './bezier-connector-migrations'
import { IBezierConnectorShape, PortTerminal } from './bezier-connector-types'
import {
	getConnectorBindings,
	getConnectorBindingPositionInPageSpace,
	createOrUpdateConnectorBinding,
	removeConnectorBinding,
	resolveConnectorBindingPortIdWithOppositePoint,
	AUTO_PORT_ID,
	resolveAutoPortId,
} from './bezier-connector-binding'
import { getConnectionTargetAtPoint } from './port-utils'
import { getPortState, setEligiblePortsIfChanged, setHintingPortIfChanged, setHighlightConnectorIfChanged } from './port-state'
import { getShapePorts } from './shape-ports'
import { getDefaultColorTheme } from '../utils/color-theme'
import { openConnectorExtensionMenu } from './connector-extension-menu-state'
import { clearConnectorCreationMark, takeConnectorCreationMark } from './connector-creation-state'

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
	connector: IBezierConnectorShape,
	providedBezier?: CubicBezier2d
): { box: Box } {
	const bezier = providedBezier ?? (() => {
		const { start, end, startPortId, endPortId } = getConnectorTerminals(editor, connector)
		return getBezierLayout(start, end, startPortId, endPortId).bezier
	})()

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
	| { kind: 'set'; targetId: TLShapeId; portId: string; previewPortId: string; terminal: PortTerminal }
	| { kind: 'remove'; terminal: PortTerminal }

const pendingBindingTargets = new Map<TLShapeId, PendingBindingTarget>()
// 缓存上一次 handlePagePosition 字符化值，避免大量重复计算
const handleLastDragKey = new Map<TLShapeId, string>()

/**
 * 检查除 selfConnectorId 之外，shapeA 与 shapeB 之间是否已存在其他 bezier 连接
 * （用于拖拽落点时防止重复连线）
 */
function hasOtherConnectionBetween(
	editor: Editor,
	selfConnectorId: TLShapeId,
	shapeA: TLShapeId,
	shapeB: TLShapeId
): boolean {
	const bindingsToA = editor.getBindingsToShape(shapeA, 'bezier-connector')
	for (const binding of bindingsToA) {
		if (binding.fromId === selfConnectorId) continue
		const siblings = editor.getBindingsFromShape(binding.fromId, 'bezier-connector')
		if (siblings.some((b) => b.toId === shapeB)) return true
	}
	return false
}

/**
 * 计算贝塞尔曲线的控制点
 * 每个端点按自身端口朝向独立计算偏移量：
 * - 偏移大小主要取决于该端出线轴上的距离，clamp 到 [40, 250]
 * - 反向连接（目标在出线方向的背面）时用固定的较大偏移，让曲线自然绕出
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

	const startIsVertical = startDir === 'top' || startDir === 'bottom'
	const startIsHorizontal = startDir === 'input' || startDir === 'output' || startDir === 'left' || startDir === 'right'
	const endIsVertical = endDir === 'top' || endDir === 'bottom'
	const endIsHorizontal = endDir === 'input' || endDir === 'output' || endDir === 'left' || endDir === 'right'

	// 某端沿指定单位方向 (ux, uy) 出线时的控制点偏移量
	// forwardDist: 目标相对该端点在出线方向上的投影距离（正=前方，负=背面）
	const offsetAlong = (forwardDist: number, crossDist: number) => {
		if (forwardDist >= 0) {
			// 正向：距离越远曲线越舒展；横向偏移较大时加一点余量避免过平
			return clamp(forwardDist * 0.5 + Math.abs(crossDist) * 0.1, 40, 250)
		}
		// 反向：需要绕出，固定较大偏移（随背离程度略增）
		return clamp(Math.abs(forwardDist) * 0.25 + 60, 60, 180)
	}

	const computeCp = (
		point: VecLike,
		isHorizontal: boolean,
		isVertical: boolean,
		dir: string | null,
		/** 该端指向对端的向量 */
		towardX: number,
		towardY: number
	): Vec => {
		if (isHorizontal) {
			const sign = dir === 'input' || dir === 'left' ? -1 : 1
			const dist = offsetAlong(towardX * sign, towardY)
			return new Vec(point.x + sign * dist, point.y)
		}
		if (isVertical) {
			const sign = dir === 'top' ? -1 : 1
			const dist = offsetAlong(towardY * sign, towardX)
			return new Vec(point.x, point.y + sign * dist)
		}
		// 未绑定端口：沿主轴指向对端
		if (Math.abs(towardX) >= Math.abs(towardY)) {
			const sign = towardX >= 0 ? 1 : -1
			return new Vec(point.x + sign * clamp(Math.abs(towardX) * 0.5, 40, 250), point.y)
		}
		const sign = towardY >= 0 ? 1 : -1
		return new Vec(point.x, point.y + sign * clamp(Math.abs(towardY) * 0.5, 40, 250))
	}

	const cp1 = computeCp(start, startIsHorizontal, startIsVertical, startDir, dx, dy)
	const cp2 = computeCp(end, endIsHorizontal, endIsVertical, endDir, -dx, -dy)

	return [cp1, cp2]
}

interface BezierLayout {
	bezier: CubicBezier2d
	path: string
}

function getBezierLayout(start: VecLike, end: VecLike, startPortId?: string, endPortId?: string): BezierLayout {
	const [cp1, cp2] = getConnectionControlPoints(start, end, startPortId, endPortId)
	return {
		bezier: new CubicBezier2d({
			start: Vec.From(start),
			cp1: Vec.From(cp1),
			cp2: Vec.From(cp2),
			end: Vec.From(end),
		}),
		path: `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`,
	}
}

/**
 * Build the even-odd clipping path used everywhere a label covers a connector.
 * Keeping this in one place prevents the rendered connector, selection indicator,
 * and SVG export from drifting apart.
 */
function getLabelClipPath(bezier: CubicBezier2d, labelBounds: Box): string {
	const bounds = bezier.bounds
	const padding = 100
	const hole = labelBounds.clone()
	return [
		`M ${bounds.minX - padding} ${bounds.minY - padding}`,
		`L ${bounds.maxX + padding} ${bounds.minY - padding}`,
		`L ${bounds.maxX + padding} ${bounds.maxY + padding}`,
		`L ${bounds.minX - padding} ${bounds.maxY + padding}`,
		'Z',
		`M ${hole.minX} ${hole.minY}`,
		`L ${hole.maxX} ${hole.minY}`,
		`L ${hole.maxX} ${hole.maxY}`,
		`L ${hole.minX} ${hole.maxY}`,
		'Z',
	].join(' ')
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

	// 拖拽中的临时目标：拖拽端的位置以 props 为准（onHandleDrag 每帧更新），
	// 必须忽略旧 binding 的位置，否则曲线端点会被旧绑定"钉"在端口上不跟手，
	// 直到松手 onHandleDragEnd 提交 binding 变更后才跳到新位置
	const pending = pendingBindingTargets.get(connector.id)
	const pendingTerminal = pending?.terminal
	const pendingTargetCenter = pending?.kind === 'set'
		? (() => {
			const bounds = editor.getShapePageBounds(pending.targetId)
			return bounds ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 } : undefined
		})()
		: undefined
	const getBoundPortId = (binding: NonNullable<typeof bindings.start>) =>
		resolveConnectorBindingPortIdWithOppositePoint(
			editor,
			binding,
			binding.props.terminal === pendingTerminal ? undefined : pendingTargetCenter
		)
	const getBoundPosition = (binding: NonNullable<typeof bindings.start>) =>
		getConnectorBindingPositionInPageSpace(
			editor,
			binding,
			binding.props.terminal === pendingTerminal ? undefined : pendingTargetCenter
		)

	// 从绑定获取位置（拖拽中的一端跳过，走 props 回退）
	if (bindings.start && pendingTerminal !== 'start') {
		const inPageSpace = getBoundPosition(bindings.start)
		if (inPageSpace) {
			start = Mat.applyToPoint(shapeTransform, inPageSpace)
		}
	}
	if (bindings.end && pendingTerminal !== 'end') {
		const inPageSpace = getBoundPosition(bindings.end)
		if (inPageSpace) {
			end = Mat.applyToPoint(shapeTransform, inPageSpace)
		}
	}

	// 回退到形状属性
	if (!start) start = connector.props.start
	if (!end) end = connector.props.end

	// 从绑定中提取形状/端口信息（可用于决定控制点方向）
	// auto 端口解析为当前相对位置下的实际端口，保证控制点方向与实际出线边一致
	let startShapeId: TLShapeId | undefined
	let endShapeId: TLShapeId | undefined
	let startPortId: string | undefined
	let endPortId: string | undefined
	if (bindings.start) {
		startShapeId = bindings.start.toId
		startPortId = getBoundPortId(bindings.start)
	}
	if (bindings.end) {
		endShapeId = bindings.end.toId
		endPortId = getBoundPortId(bindings.end)
	}

	// 拖拽过程中，优先使用未提交的 pendingBindingTargets 提供的端口信息以便实时显示
	if (pending) {
		if (pending.kind === 'set') {
			if (pending.terminal === 'start') {
				startShapeId = pending.targetId
				startPortId = pending.previewPortId
			} else {
				endShapeId = pending.targetId
				endPortId = pending.previewPortId
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
	// Subscribe to per-connector booleans rather than a freshly allocated global
	// state object. A hint change should only re-render the old/new connector.
	const isHighlighted = useValue(
		'connector-highlighted',
		() => getPortState(editor).highlightConnectorId === connector.id,
		[editor, connector.id]
	)
	const isFlashing = useValue(
		'connector-flashing',
		() => getPortState(editor).flashConnectorId === connector.id,
		[editor, connector.id]
	)

	// 标签相关
	const isEditing = useValue('isEditing', () => editor.getEditingShapeId() === connector.id, [editor, connector.id])
	const isSelected = useValue(
		'isSelected',
		() => editor.getSelectedShapeIds().includes(connector.id),
		[editor, connector.id]
	)
	const showLabel = isEditing || !isEmptyRichText(connector.props.richText)
	const fontSize = getBezierLabelFontSize(connector)
	const labelColor = theme[connector.props.color].solid

	const clipPathId = React.useMemo(
		() => `bezier-connector-clip-${connector.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
		[connector.id]
	)

	const layout = React.useMemo(() => {
		return getBezierLayout(start, end, startPortId, endPortId)
	}, [start, end, startPortId, endPortId])
	const bezier = layout.bezier
	const labelPosition = React.useMemo(
		() => getBezierLabelPosition(editor, connector, bezier),
		[editor, connector, bezier]
	)

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
								d={getLabelClipPath(bezier, labelPosition.box)}
							/>
						</clipPath>
					</defs>
				)}
				{renderConnectorPath(
					layout.path,
					connector.props,
					theme,
					isHighlighted,
					isFlashing,
					isSelected,
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
						fontFamily={FONT_FAMILIES[connector.props.font]}
						fontSize={fontSize}
						lineHeight={TEXT_PROPS.lineHeight}
						textAlign="center"
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
function renderConnectorPath(
	path: string,
	props: IBezierConnectorShape['props'],
	theme: ReturnType<typeof getDefaultColorTheme>,
	isHighlighted: boolean = false,
	isFlashing: boolean = false,
	isSelected: boolean = false,
	clipPathId?: string
) {
	const color = (theme && theme[props.color] && theme[props.color].solid) || props.color || theme.black.solid
	const strokeStyle = props.strokeStyle ?? 'solid'
	const strokeDasharray = getStrokeDasharray(strokeStyle)
	const isFlowing = strokeStyle === 'flowing' && (isSelected || isHighlighted || isFlashing)
	// Keep drag feedback on the same path. A small width change is easier to
	// read than a second translucent glow path and avoids doubling SVG paint.
	const isFeedback = isHighlighted || isFlashing
	const strokeWidth = Math.max(0.5, (props.strokeWidth || 2) + (isFlashing ? 1 : isHighlighted ? 0.5 : 0))

	return (
		<>
			<path
				d={path}
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				fill="none"
				strokeOpacity={isFeedback && isFlashing ? 0.9 : 1}
				strokeDasharray={strokeDasharray}
				className={isFlowing ? 'bezier-connector-path bezier-connector-path--flowing' : 'bezier-connector-path'}
				clipPath={clipPathId ? `url(#${clipPathId})` : undefined}
			/>
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
		const layout = getBezierLayout(start, end, startPortId, endPortId)
		const bodyGeom = layout.bezier

		// 如果正在编辑或有文本，添加标签几何体
		let labelGeom: Rectangle2d | undefined
		if (isEditing || !isEmptyRichText(connector.props.richText)) {
			const labelPosition = getBezierLabelPosition(this.editor, connector, layout.bezier)
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

	override getIndicatorPath(connector: IBezierConnectorShape) {
		const { start, end, startPortId, endPortId } = getConnectorTerminals(this.editor, connector)
		return new Path2D(getBezierLayout(start, end, startPortId, endPortId).path)
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

		// 排除连接器自身；同时排除对侧已绑定的形状，防止拖回同一形状产生自环
		const excludeShapeIds = new Set<TLShapeId>([connectorId])
		const bindings = getConnectorBindings(this.editor, connector)
		const oppositeBinding = draggingTerminal === 'start' ? bindings.end : bindings.start
		if (oppositeBinding) excludeShapeIds.add(oppositeBinding.toId)

		// 注意：拖拽中不设置 eligiblePorts（不在其他形状四周显示端口特效），
		// 仅在命中目标时通过 hintingPort 高亮目标端口

		// 查找该位置的连接目标：优先精确端口，其次形状本体（自动选边）
		const target = getConnectionTargetAtPoint(this.editor, handlePagePosition, {
			margin: 28,
			excludeShapeIds,
		})

		// 如果找到可用目标，记录待绑定目标，并设置高亮当前 connector
		if (target) {
			const targetShape = this.editor.getShape(target.shapeId)
			if (targetShape) {
				const oppositeTerminal: PortTerminal = draggingTerminal === 'start' ? 'end' : 'start'
				const oppositePoint = oppositeBinding
					? (() => {
						const bounds = this.editor.getShapePageBounds(oppositeBinding.toId)
						return bounds ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 } : undefined
					})()
					: shapeTransform.applyToPoint(connector.props[oppositeTerminal])
				// createOrUpdateConnectorBinding normalizes ordinary shapes to auto.
				// Resolve that future port now so the hint and preview cannot jump on drop.
				const usesAutoPort = targetShape.type !== 'mind-map'
				const previewPortId = usesAutoPort && oppositePoint
					? resolveAutoPortId(this.editor, target.shapeId, oppositePoint)
					: target.port.id
				const previewPort = getShapePorts(this.editor, targetShape)?.[previewPortId] ?? target.port
				const targetPortInPage = this.editor
					.getShapePageTransform(targetShape)
					.applyToPoint(previewPort)
				const targetPortOnConnector = Mat.applyToPoint(inverseShapeTransform, targetPortInPage)

				// 更新 hinting 状态以便端口可视化高亮
				setHintingPortIfChanged(this.editor, { shapeId: target.shapeId, portId: previewPort.id })
				// 高亮当前连接器用于视觉引导
				setHighlightConnectorIfChanged(this.editor, connectorId)
				// 只存储目标信息，不写 store
				// 普通形状的绑定都会在提交时归一化为 auto；思维导图保留具体节点端口。
				pendingBindingTargets.set(connectorId, {
					kind: 'set',
					targetId: target.shapeId,
					portId: usesAutoPort ? AUTO_PORT_ID : previewPort.id,
					previewPortId: previewPort.id,
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
		const creatingMarkId = takeConnectorCreationMark(this.editor, connector.id)
		const releasedPoint = pending?.kind === 'remove'
			? this.editor.getShapePageTransform(connector).applyToPoint(connector.props[pending.terminal])
			: null
		this.cleanupHandleDragState(connector.id)
		if (!pending) return

		if (pending.kind === 'remove') {
			removeConnectorBinding(this.editor, connector.id, pending.terminal)
			if (creatingMarkId && releasedPoint) {
				openConnectorExtensionMenu(this.editor, {
					connectorId: connector.id,
					terminal: pending.terminal,
					pagePoint: releasedPoint,
					creatingMarkId,
				})
			}
		} else {
			// 查重：同一对形状之间若已有其他连接线，则不重复创建绑定
			const oppositeTerminal: PortTerminal = pending.terminal === 'start' ? 'end' : 'start'
			const bindings = getConnectorBindings(this.editor, connector)
			const opposite = bindings[oppositeTerminal]
			if (opposite && hasOtherConnectionBetween(this.editor, connector.id, opposite.toId, pending.targetId)) {
				// 已存在等价连接：放弃这一端的绑定（保持自由端点），并给出提示反馈
				removeConnectorBinding(this.editor, connector.id, pending.terminal)
				try {
					showMessage('两个形状之间已存在连接', 2000, 'info')
				} catch {
					// ignore（非思源环境下静默）
				}
				return
			}
			createOrUpdateConnectorBinding(this.editor, connector.id, pending.targetId, {
				portId: pending.portId,
				terminal: pending.terminal,
			})
		}
	}

	/**
	 * 拖拽被取消（Escape / 中断）时清理临时状态
	 * 不做任何 binding 提交——tldraw 会通过 bailToMark 回滚形状变更
	 */
	override onHandleDragCancel(
		connector: IBezierConnectorShape,
		_info: TLHandleDragInfo<IBezierConnectorShape>
	): void {
		this.cleanupHandleDragState(connector.id)
	}

	/**
	 * 统一清理拖拽过程中的临时状态（pending 目标、端口高亮、节流缓存）
	 */
	private cleanupHandleDragState(connectorId: TLShapeId): void {
		pendingBindingTargets.delete(connectorId)
		handleLastDragKey.delete(connectorId)
		clearConnectorCreationMark(this.editor, connectorId)
		// 清理 hinting，并清除 connector highlight
		setHintingPortIfChanged(this.editor, null)
		setHighlightConnectorIfChanged(this.editor, null)
		// 清理 eligiblePorts 以隐藏端口 overlay
		setEligiblePortsIfChanged(this.editor, null)
	}

	// 渲染连接组件
	component(connector: IBezierConnectorShape) {
		return <BezierConnectorComponent connector={connector} />
	}

	// 导出为 SVG（用于导出/序列化）
	override toSvg(connector: IBezierConnectorShape, ctx: SvgExportContext) {
		const { start, end, startPortId, endPortId } = getConnectorTerminals(this.editor, connector)
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		const layout = getBezierLayout(start, end, startPortId, endPortId)
		const labelPosition = getBezierLabelPosition(this.editor, connector, layout.bezier)
		const isEmpty = isEmptyRichText(connector.props.richText)
		const fontSize = getBezierLabelFontSize(connector)
		const labelColor = theme[connector.props.color].solid
		const clipPathId = `bezier-connector-export-clip-${connector.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
		return (
			<g>
				{!isEmpty && (
					<defs>
						<clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
							<path
								clipRule="evenodd"
								d={getLabelClipPath(layout.bezier, labelPosition.box)}
							/>
						</clipPath>
					</defs>
				)}
				{renderConnectorPath(
					layout.path,
					connector.props,
					theme,
					false,
					false,
					false,
					!isEmpty ? clipPathId : undefined
				)}
				{!isEmpty && (
					<RichTextSVG
						fontSize={fontSize}
						fontFamily={FONT_FAMILIES[connector.props.font]}
						lineHeight={TEXT_PROPS.lineHeight}
						textAlign="center"
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
		const isEmpty = isEmptyRichText(connector.props.richText)
		const isEditing = this.editor.getEditingShapeId() === connector.id
		const clipPathId = `bezier-connector-indicator-clip-${connector.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
		const layout = getBezierLayout(start, end, startPortId, endPortId)
		const labelPosition = getBezierLabelPosition(this.editor, connector, layout.bezier)
		const labelBounds = labelPosition.box

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
								d={getLabelClipPath(layout.bezier, labelBounds)}
							/>
						</clipPath>
					</defs>
				)}
				<path
					d={layout.path}
					strokeWidth={Math.max(0.5, connector.props.strokeWidth || 1)}
					strokeLinecap="round"
					strokeDasharray={getStrokeDasharray(connector.props.strokeStyle)}
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
