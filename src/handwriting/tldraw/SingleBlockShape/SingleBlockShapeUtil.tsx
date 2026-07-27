import React, { ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
	HTMLContainer,
	EASINGS,
	Rectangle2d,
	ShapeUtil,
	SvgExportContext,
	TLResizeInfo,
	TLShapeId,
	createShapeId,
	resizeBox,
	AtomMap,
	EditorAtom,
	BindingUtil,
	TLBaseBinding,
	BindingOnShapeChangeOptions,
	Box,
	invLerp,
	lerp,
	VecModel,
	Editor,
	useValue,
} from '@tldraw/tldraw'
import { openAttributePanel, openTab, Protyle, showMessage, TProtyleAction } from 'siyuan'
import * as api from '@/api/api'
import { settingdata } from '@/index'
import { buildTldrawLink } from '../utils/link-builder';
import { DbAttributeBar } from './single-block-db-attributes'
import { singleBlockShapeProps } from './single-block-shape-props'
import { singleBlockShapeMigrations } from './single-block-shape-migrations'
import { ISingleBlockShape } from './single-block-shape-types'
import { enqueueProtyleLoad, ProtyleLoadHandle } from '../protyle-load-queue'
import { shapeLoadManager } from '../shape-load-manager'
import { PortsOverlay } from '../BezierConnectorShape/Port'
import { createArrowBetweenShapes } from '../utils/addConnectedSingleBlock'
import { getShapeHostElement } from '../utils/getShapeHostElement'
import { getCachedHtml, setCachedHtml, cacheFromProtyleHost, invalidateCache, requestBlockDOM, getBlockContent, renderSimpleBlockHtml } from '../block-html-cache'
import { renderAllContentIdle } from '../utils/render/content-renderer'
import { cancelIdleRender } from '../utils/idle-scheduler'
import { getShapeLowDetailFontSize, getShapeLowDetailThreshold } from '../utils/low-detail'
import { getLightweightPreviewTextFromElement, getLightweightPreviewTextFromHtml } from '../utils/lightweight-preview'
import { getDefaultColorTheme } from '../utils/color-theme'
import { getCachedSvgExportSnapshot, getSvgExportGlobalStyles, isSvgExportOutlineOnly, serializeElementForSvgExport } from '../utils/export-dom-snapshot'
import {
	beginBranchAttachmentDrag,
	beginBranchResize,
	clearBranchInteractionHint,
	createSiblingSingleInBranch,
	endBranchResize,
	getSingleBranchParent,
	getBranchInteractionHintForShape,
	setBranchInteractionHint,
	syncBranchMoveForRootContent,
	requestBranchRelayout,
	updateBranchAttachmentAfterDrag,
	useBranchInteractionHint,
} from '../BranchShape'

const draggingBranchSingleBlockIds = new Set<string>()
const pendingCreationPromises = new Map<string, Promise<string>>()

// ===== DOM 尺寸测量（仅影响高度）=====
// 用 EditorAtom 存储每个 shape 的测量尺寸，保证 getGeometry 响应式更新
const SingleBlockSizes = new EditorAtom('single-block sizes', (editor) => {
	const map = new AtomMap<TLShapeId, { width: number; height: number }>('single-block sizes')
	editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
		map.delete(shape.id)
	})
	return map
})
const BORDER_PX = 3 // 与样式、SVG 导出保持一致
const MIN_HEIGHT = 30

function setMeasuredSingleBlockSize(editor: Editor, shapeId: TLShapeId, size: { width: number; height: number }) {
	let changed = false
	SingleBlockSizes.update(editor, (map) => {
		const existing = map.get(shapeId)
		if (existing && existing.width === size.width && existing.height === size.height) return map
		changed = true
		return map.set(shapeId, size)
	})
	if (changed) requestBranchRelayout(editor, shapeId)
}
const SIYUAN_BLOCK_ID_RE = /\b\d{14}-[0-9a-z]{7}\b/i
const STEVE_TOOLS_PLUGIN_URL_RE = /^(?:https:\/\/|siyuan:\/\/)plugins\/siyuan-steve-tools\//i

function decodeLinkTarget(value: string) {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim()
}

function getSiyuanBlockIdFromLink(rawHref: string): string | null {
	const href = decodeLinkTarget(rawHref)
	const directMatch = href.match(/^siyuan:\/\/blocks\/(\d{14}-[0-9a-z]{7})/i)
	if (directMatch) return directMatch[1]
	if (/^\d{14}-[0-9a-z]{7}$/i.test(href)) return href

	try {
		const parsed = new URL(href, window.location.href)
		const idFromQuery = parsed.searchParams.get('id') || parsed.searchParams.get('blockId')
		if (idFromQuery && SIYUAN_BLOCK_ID_RE.test(idFromQuery)) return idFromQuery.match(SIYUAN_BLOCK_ID_RE)![0]
		const idFromHash = parsed.hash.match(SIYUAN_BLOCK_ID_RE)
		if (idFromHash) return idFromHash[0]
	} catch {
		// ignore invalid or relative URLs
	}

	return null
}

function isSteveToolsPluginUrl(rawHref: string) {
	return STEVE_TOOLS_PLUGIN_URL_RE.test(decodeLinkTarget(rawHref))
}

function clearStaticTextSelection() {
	try {
		window.getSelection()?.removeAllRanges()
	} catch {
		// ignore
	}
}

function findStaticLinkTarget(target: EventTarget | null, root: HTMLElement | null) {
	if (!(target instanceof HTMLElement) || !root) return null

	let el: HTMLElement | null = target
	while (el && root.contains(el)) {
		const dataType = el.getAttribute('data-type') || ''
		const dataHref = el.getAttribute('data-href') || ''
		const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') || dataHref : dataHref
		const nodeId =
			el.getAttribute('data-id') ||
			el.getAttribute('data-node-id') ||
			el.getAttribute('data-av-id') ||
			''

		if ((dataType.includes('block-ref') || dataType.includes('file-annotation-ref')) && SIYUAN_BLOCK_ID_RE.test(nodeId)) {
			return { blockId: nodeId.match(SIYUAN_BLOCK_ID_RE)![0], href: '' }
		}

		if (href) {
			return { blockId: getSiyuanBlockIdFromLink(href), href: decodeLinkTarget(href) }
		}

		if (el === root) break
		el = el.parentElement
	}

	return null
}

// ===== 独立的尺寸测量 Hook =====
// 参考 tldraw 官方示例，将尺寸测量逻辑抽取为可复用的 hook
function useSingleBlockSize(
	editor: Editor,
	shape: ISingleBlockShape,
	containerRef: React.RefObject<HTMLDivElement>,
	protyleHostRef: React.RefObject<HTMLDivElement | null>,
	isEditingState: boolean,
	shouldSkipMeasurement: boolean
) {
	// 用于在编辑态切换时临时锁定高度，防止闪烁
	const heightLockRef = useRef(false)
	const prevEditingRef = useRef(isEditingState)
	// 记录上次测量的高度，用于锁定期间保持稳定
	const lastHeightRef = useRef<number | null>(null)

	// 检测编辑态切换，临时锁定高度
	useEffect(() => {
		if (prevEditingRef.current !== isEditingState) {
			prevEditingRef.current = isEditingState
			heightLockRef.current = true
			// 延迟解锁，等待新内容渲染稳定
			const timer = setTimeout(() => {
				heightLockRef.current = false
			}, 150)
			return () => clearTimeout(timer)
		}
	}, [isEditingState])

	const updateShapeSize = useCallback(() => {
		if (shouldSkipMeasurement) return
		if (!editor) return

		// 如果高度被锁定，使用上次测量的高度
		if (heightLockRef.current && lastHeightRef.current !== null) {
			const lockedHeight = lastHeightRef.current
			const lockedWidth = Math.max(shape.props.w, 1)
			setMeasuredSingleBlockSize(editor, shape.id, { width: lockedWidth, height: lockedHeight })
			return
		}

		// 没有 blockId 的新块固定最小高度
		if (!shape.props.blockId) {
			const fallbackHeight = Math.max(shape.props.h, MIN_HEIGHT)
			const fallbackWidth = Math.max(shape.props.w, 1)
			lastHeightRef.current = fallbackHeight
			setMeasuredSingleBlockSize(editor, shape.id, { width: fallbackWidth, height: fallbackHeight })
			return
		}

		// 优先测量 Protyle 的内容区域（编辑态）
		let target: HTMLElement | null = null
		if (isEditingState && protyleHostRef.current) {
			target = (protyleHostRef.current.querySelector('.protyle-wysiwyg') as HTMLElement) || protyleHostRef.current
		}
		// 非编辑态时从容器中测量静态内容
		if (!target && containerRef.current) {
			target = (containerRef.current.querySelector('.protyle-wysiwyg') as HTMLElement) || containerRef.current
		}
		if (!target) return

		// 获取实际 DOM 尺寸
		const contentH = Math.ceil(target.scrollHeight || target.offsetHeight || 0)
		const borderPx = shape.props.transparentBackground ? 0 : BORDER_PX
		const addBorder = settingdata["showCardBorder"] !== false && !shape.props.transparentBackground
		const nextHeight = Math.max(contentH + (addBorder ? borderPx * 2 : 0), MIN_HEIGHT)
		const nextWidth = Math.max(shape.props.w, 1)

		// 保存测量的高度
		lastHeightRef.current = nextHeight

		// 更新全局 atom 中的尺寸
		setMeasuredSingleBlockSize(editor, shape.id, { width: nextWidth, height: nextHeight })
	}, [
		editor,
		shape.id,
		shape.props.blockId,
		shape.props.h,
		shape.props.w,
		shape.props.transparentBackground,
		isEditingState,
		shouldSkipMeasurement,
	])

	// 在每次渲染后立即测量尺寸
	useLayoutEffect(() => {
		if (shouldSkipMeasurement) return
		updateShapeSize()
	})

	// 使用 ResizeObserver 监听 DOM 尺寸变化
	useLayoutEffect(() => {
		if (shouldSkipMeasurement) return
		let target: HTMLElement | null = null
		if (isEditingState && protyleHostRef.current) {
			target = (protyleHostRef.current.querySelector('.protyle-wysiwyg') as HTMLElement) || protyleHostRef.current
		}
		if (!target && containerRef.current) {
			target = (containerRef.current.querySelector('.protyle-wysiwyg') as HTMLElement) || containerRef.current
		}
		if (!target) return

		const observer = new ResizeObserver(() => {
			updateShapeSize()
		})
		observer.observe(target)

		return () => {
			observer.disconnect()
		}
	}, [updateShapeSize, isEditingState, shouldSkipMeasurement])

	// 使用 MutationObserver 监听 DOM 内容变化
	useLayoutEffect(() => {
		if (shouldSkipMeasurement) return
		let target: HTMLElement | null = null
		if (isEditingState && protyleHostRef.current) {
			target = (protyleHostRef.current.querySelector('.protyle-wysiwyg') as HTMLElement) || protyleHostRef.current
		}
		if (!target && containerRef.current) {
			target = (containerRef.current.querySelector('.protyle-wysiwyg') as HTMLElement) || containerRef.current
		}
		if (!target) return

		const observer = new MutationObserver(() => {
			updateShapeSize()
		})
		observer.observe(target, { subtree: true, childList: true, attributes: true, characterData: true })

		return () => {
			observer.disconnect()
		}
	}, [updateShapeSize, isEditingState, shouldSkipMeasurement])

	// 监听图片加载完成后重新测量
	useEffect(() => {
		if (shouldSkipMeasurement) return
		let target: HTMLElement | null = null
		if (isEditingState && protyleHostRef.current) {
			target = protyleHostRef.current
		}
		if (!target && containerRef.current) {
			target = containerRef.current
		}
		if (!target) return

		const handlers: Array<() => void> = []
		target.querySelectorAll('img').forEach((img) => {
			const handler = () => updateShapeSize()
			img.addEventListener('load', handler)
			handlers.push(() => img.removeEventListener('load', handler))
		})

		return () => {
			handlers.forEach((off) => off())
		}
	}, [updateShapeSize, isEditingState, shouldSkipMeasurement])

	return { updateShapeSize }
}

export class SingleBlockShapeUtil extends ShapeUtil<ISingleBlockShape> {
	static override type = 'single-block' as const
	static override props = singleBlockShapeProps
	static override migrations = singleBlockShapeMigrations

	override isAspectRatioLocked(): boolean {
		return false
	}

	override hideRotateHandle(): boolean {
		return false
	}

	override canBind() {
		return true
	}

	override canCull(_shape: ISingleBlockShape): boolean {
		return false
	}

	override canResize(): boolean {
		return true
	}

	override canEdit(): boolean {
		return true
	}

	override canScroll(): boolean {
		return true
	}

	override onBeforeUpdate(prev: ISingleBlockShape, next: ISingleBlockShape) {
		if (prev.props.blockId && !next.props.blockId) {
			next.props.blockId = prev.props.blockId
		}

		if (draggingBranchSingleBlockIds.has(next.id as string) && (prev.x !== next.x || prev.y !== next.y)) {
			syncBranchMoveForRootContent(this.editor, prev, next)
			setBranchInteractionHint(getBranchInteractionHintForShape(this.editor, next))
		}

		// 当从允许绑定切换到不允许绑定时，删除已有的 single-block 类型的绑定
		if ((prev.props.allowBinding ?? true) && (next.props.allowBinding === false)) {
			const bindings = this.editor.getBindingsFromShape(prev, 'single-block')
			if (bindings.length > 0) {
				this.editor.deleteBindings(bindings)
			}
		}
	}

	getDefaultProps(): ISingleBlockShape['props'] {
		return {
			w: 300,
			h: 50,
			color: 'black',
			blockId: '',
			// 初始创建时标记为 true，用于后续在用户进入编辑时再创建实际的思源块
			isNewlyCreated: true,
			fontSize: 22,
			refreshNonce: Date.now(),
			connectOnEnter: false,
			// 默认不透明（带背景和边框）
			transparentBackground: false,
			// 是否允许与其他形状建立绑定（默认允许）
			allowBinding: true,
		}
	}

	getGeometry(shape: ISingleBlockShape) {
		const size = SingleBlockSizes.get(this.editor).get(shape.id)
		return new Rectangle2d({
			width: shape.props.w,
			height: size?.height ?? shape.props.h,
			isFilled: true,
		})
	}

	override getBoundsSnapGeometry(shape: ISingleBlockShape) {
		return { points: this.editor.getShapeGeometry(shape).bounds.cornersAndCenter }
	}

	override getIndicatorPath(shape: ISingleBlockShape) {
		const { width, height } = this.editor.getShapeGeometry(shape).bounds
		const path = new Path2D()
		path.rect(0, 0, width, height)
		return path
	}

	component(shape: ISingleBlockShape) {
		const editor = this.editor
		// 保存 editor 引用供 useSingleBlockSize hook 使用
		const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
		const isEditing = useValue('single-block is editing', () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
		const branchInteractionHint = useBranchInteractionHint()
		const isRootAttachTarget =
			branchInteractionHint?.mode === 'attach' &&
			branchInteractionHint.slot === 'root' &&
			(branchInteractionHint.targetShapeId === shape.id ||
				(!branchInteractionHint.targetShapeId && branchInteractionHint.draggingShapeId === shape.id))
		const isEditingState = isEditing
		// Stay blocked until ShapeLoadManager computes this shape's visibility.
		// Effects in the initial commit still see these values after registration.
		const [isInViewport, setIsInViewport] = useState(false)
		const [canLoad, setCanLoad] = useState(false)
		const [hasAttrIcon, setHasAttrIcon] = useState(false)
		const [hasLoadError, setHasLoadError] = useState(false)
		const isViewportCullingEnabled = settingdata['tldraw-viewport-culling'] !== false
		const efficientZoom = useValue('single-block efficient zoom', () => editor.getEfficientZoomLevel(), [editor])
		const lowDetailThreshold = getShapeLowDetailThreshold()
		const isSmallSingleBlock = !isEditingState && lowDetailThreshold > 0 && Math.min(shape.props.w, shape.props.h) * efficientZoom < lowDetailThreshold
		const lowDetailFontSize = getShapeLowDetailFontSize(Math.min(shape.props.w, shape.props.h), efficientZoom)
		const containerRef = useRef<HTMLDivElement>(null)
		// 保存进入编辑前的相机状态，用于退出编辑后恢复视角
		const prevCameraRef = useRef<any | null>(null)
		const hadFocusedRef = useRef(false)
		const protyleRef = useRef<Protyle | null>(null)
		const protyleHostRef = useRef<HTMLDivElement | null>(null)
		const refreshNonceRef = useRef(shape.props.refreshNonce)
		// 静态 HTML 内容（非编辑态显示）
		const [staticHtml, setStaticHtml] = useState<string>('')
		// 静态内容容器的 ref，用于渲染后执行 renderAllContent
		const staticContentRef = useRef<HTMLDivElement | null>(null)
		// 标记内容是否已渲染（公式、图表等）
		const [, setIsContentRendered] = useState(false)
		const [isLoadingContent, setIsLoadingContent] = useState(false)
		const detachKeyHandler = useRef<() => void>()
		// 全局由 shapeLoadManager 计算可见性，无需本地定时轮询
		const loadHandleRef = useRef<ProtyleLoadHandle | null>(null)
		// 防止重复销毁：为每个 Protyle 实例设置一个已销毁标记
		const DESTROYED_MARK = '__st_destroyed__'
		const safeDestroyProtyle = (pt: Protyle | null | undefined) => {
			if (!pt) return
			const anyPt = pt as any
			if (anyPt[DESTROYED_MARK]) return
			try {
				pt.destroy()
			} catch {
				// ignore
			}
			anyPt[DESTROYED_MARK] = true
		}
		const stopMissingStateEvent = (event: React.PointerEvent | React.MouseEvent) => {
			event.preventDefault()
			event.stopPropagation()
		}
		const previewTextRef = useRef(shape.props.previewText || '')
		previewTextRef.current = shape.props.previewText || ''
		const persistPreviewText = useCallback((previewText: string) => {
			if (!previewText || previewText === previewTextRef.current) return
			previewTextRef.current = previewText
			editor.updateShape({
				id: shape.id,
				type: shape.type,
				props: { previewText },
			})
		}, [editor, shape.id, shape.type])
		const persistLightweightPreviewText = useCallback((html: string) => {
			persistPreviewText(getLightweightPreviewTextFromHtml(html))
		}, [persistPreviewText])


		const destroyRuntimeResources = useCallback(() => {
			detachKeyHandler.current?.()
			detachKeyHandler.current = undefined
			if (loadHandleRef.current) {
				loadHandleRef.current.cancel()
				loadHandleRef.current = null
			}
			if (protyleRef.current) {
				safeDestroyProtyle(protyleRef.current)
				protyleRef.current = null
			}
			if (protyleHostRef.current?.parentElement) {
				try {
					protyleHostRef.current.parentElement.removeChild(protyleHostRef.current)
				} catch {
					// ignore
				}
			}
			protyleHostRef.current = null
		}, [])
		const enterMissingLinkedBlockState = useCallback(() => {
			destroyRuntimeResources()
			setStaticHtml('')
			setIsLoadingContent(false)
			setHasLoadError(true)
			try {
				if (editor.getEditingShapeId() === shape.id) {
					editor.setEditingShape(undefined)
				}
			} catch {
				// ignore
			}
		}, [destroyRuntimeResources, editor, shape.id])
		const handleRefreshMissingLinkedBlock = useCallback((event: React.PointerEvent | React.MouseEvent) => {
			stopMissingStateEvent(event)
			if (shape.props.blockId) {
				invalidateCache(shape.props.blockId)
			}
			destroyRuntimeResources()
			setStaticHtml('')
			setIsLoadingContent(false)
			setHasLoadError(false)
			editor.updateShape({
				id: shape.id,
				type: shape.type,
				props: {
					...shape.props,
					refreshNonce: Date.now(),
				},
			})
		}, [destroyRuntimeResources, editor, shape.id, shape.props, shape.type])
		const handleDeleteMissingLinkedBlock = useCallback((event: React.PointerEvent | React.MouseEvent) => {
			stopMissingStateEvent(event)
			editor.deleteShape(shape.id)
		}, [editor, shape.id])

		// 使用独立的尺寸测量 hook（自动处理尺寸更新）
	// 如果有加载错误，跳过测量以避免异常增长
	useSingleBlockSize(editor, shape, containerRef, protyleHostRef, isEditingState, isSmallSingleBlock || isLoadingContent || hasLoadError)
		// 检测是否包含属性视图图标（数据库图标）
		useEffect(() => {
			if (isSmallSingleBlock) {
				setHasAttrIcon(false)
				return
			}
			let container = containerRef.current
			// 如果没有容器则无需检查
			if (!container) return

			const checkAttrIcon = () => {
				try {
					// 优先检查 protyleHost（编辑态），否则检查容器（非编辑态）
					const target = protyleHostRef.current || container
					if (!target) return
					const exists = !!target.querySelector('.protyle-attr--av')
					setHasAttrIcon((prev) => (prev === exists ? prev : exists))
				} catch {
					// ignore
				}
			}

			// 立即检查一次
			checkAttrIcon()

			// 监听容器及 protyleHost 的 DOM 变化，以便在编辑态/非编辑态都能及时检测到图标变化
			const observer = new MutationObserver(() => {
				checkAttrIcon()
			})
			const obsOptions: MutationObserverInit = { subtree: true, childList: true, attributes: true, characterData: true }

			try {
				observer.observe(container, obsOptions)
				if (protyleHostRef.current && protyleHostRef.current !== container) {
					observer.observe(protyleHostRef.current, obsOptions)
				}
			} catch {
				// ignore
			}

			return () => {
				try {
					observer.disconnect()
				} catch {
					// ignore
				}
			}
		}, [isEditingState, staticHtml, isSmallSingleBlock, containerRef.current, protyleHostRef.current])

		// 编辑模式切换时聚焦到形状，并在退出编辑后恢复之前的视角
		useEffect(() => {
			// 延迟执行，确保编辑状态完全建立
			const timer = setTimeout(() => {
				const enabled = settingdata['restore-camera-on-edit'] === true
				// 如果功能被禁用，则不进行聚焦/恢复，并在退出编辑时清理状态
				if (!enabled) {
					if (!isEditing) {
						hadFocusedRef.current = false
						prevCameraRef.current = null
					}
					return
				}
				if (isEditing) {
					console.debug('聚焦到形状:', shape.id)
					// 进入编辑：仅在第一次进入时保存当前相机
					if (!hadFocusedRef.current) {
						try {
							prevCameraRef.current = editor.getCamera()
						} catch (e) {
							prevCameraRef.current = null
						}
						hadFocusedRef.current = true
					}
					// 刚刚进入编辑模式，选中并聚焦到形状
					editor.select(shape.id)
					editor.zoomToSelection({ animation: { duration: 300 } })
				} else {
					// 退出编辑：如果之前保存过相机，则恢复视角
					if (hadFocusedRef.current && prevCameraRef.current) {
						try {
							editor.setCamera(prevCameraRef.current, { animation: { duration: 300 } })
						} catch (e) {
							// ignore
						}
					}
					// 清理保存的相机状态
					hadFocusedRef.current = false
					prevCameraRef.current = null
				}
			}, 50) // 50ms 延迟确保状态同步完成
			return () => clearTimeout(timer)
		}, [isEditing, shape.id])

		useEffect(() => {
			shapeLoadManager.attachEditor(editor as any)
			const unregister = shapeLoadManager.register(
				shape.id,
				editor as any,
				() => ({ editing: isEditingState }),
				(allowed, meta) => {
					setCanLoad(allowed)
					setIsInViewport(meta.inViewport)
				}
			)
			return unregister
		}, [isEditingState, shape.id])

		// ===== 核心优化：只在编辑态创建 Protyle，非编辑态使用静态 HTML =====
		
		// 加载静态内容（非编辑态）
		useEffect(() => {
			// 编辑态不需要加载静态内容
			if (isEditingState || isSmallSingleBlock) return
			
			const blockId = shape.props.blockId
			if (!blockId) return
			const fontSize = shape.props.fontSize || 16
			
			// 检查视口可见性
			const shouldLoad = !isViewportCullingEnabled || (isInViewport && canLoad)
			if (!shouldLoad) return
			
			// refreshNonce 变化时强制刷新缓存
			const forceRefresh = refreshNonceRef.current !== shape.props.refreshNonce
			refreshNonceRef.current = shape.props.refreshNonce
			
			// 尝试从缓存获取（除非需要强制刷新）
			if (!forceRefresh) {
				const cached = getCachedHtml(blockId, fontSize)
				if (cached) {
					persistLightweightPreviewText(cached)
					setStaticHtml(cached)
					return
				}
			} else {
				// 刷新时使缓存失效
				invalidateCache(blockId)
			}
			
			// 从 API 获取块的 DOM HTML（会自动批量合并请求）
			let cancelled = false
			setIsLoadingContent(true)
			setHasLoadError(false)
			
			// 使用批量请求函数获取 DOM
			requestBlockDOM(blockId, fontSize).then(async (html) => {
				if (cancelled) return
				if (html) {
					persistLightweightPreviewText(html)
					setStaticHtml(html)
					setHasLoadError(false)
					return
				}
				// 备用：使用 getBlockContent + renderSimpleBlockHtml
				const content = await getBlockContent(blockId)
				if (cancelled) return
				if (content) {
					const fallbackHtml = await renderSimpleBlockHtml(content.content || content.markdown, fontSize)
					setCachedHtml(blockId, fallbackHtml, fontSize)
					persistLightweightPreviewText(fallbackHtml)
					setStaticHtml(fallbackHtml)
					setHasLoadError(false)
				} else {
					// 块不存在，设置错误状态
					setStaticHtml('')
					setHasLoadError(true)
				}
			}).catch(() => {
				// API调用失败，设置错误状态
				if (!cancelled) {
					setStaticHtml('')
					setHasLoadError(true)
				}
			}).finally(() => {
				if (!cancelled) setIsLoadingContent(false)
			})
			
			return () => { cancelled = true }
		}, [isEditingState, isSmallSingleBlock, shape.props.blockId, shape.props.fontSize, shape.props.refreshNonce, isInViewport, canLoad, isViewportCullingEnabled, persistLightweightPreviewText])

		// ===== 静态内容渲染：在 staticHtml 挂载后执行 renderAllContentIdle =====
		// 使用空闲调度，避免在拖动画布时阻塞主线程
		useEffect(() => {
			if (!staticHtml || isEditingState || isSmallSingleBlock || !staticContentRef.current) return
			
			// 重置渲染状态
			setIsContentRendered(false)
			
			// 生成唯一的渲染任务 ID
			const renderTaskId = `render-static-${shape.id}`
			let cancelled = false
			
			// 使用 requestAnimationFrame 确保 DOM 已更新
			const rafId = requestAnimationFrame(() => {
				if (staticContentRef.current) {
					// 使用空闲调度渲染，在交互时会暂停
					renderAllContentIdle(staticContentRef.current, 10, renderTaskId).then(() => {
						if (!cancelled) setIsContentRendered(true)
					}).catch(() => {
						// 忽略渲染错误
					})
				}
			})
			
			return () => {
				cancelled = true
				cancelAnimationFrame(rafId)
				cancelIdleRender(renderTaskId)
			}
		}, [staticHtml, isEditingState, isSmallSingleBlock, shape.id])

		// ===== 编辑态专用：创建和管理 Protyle 实例 =====
		useEffect(() => {
			if (!isEditingState) {
				// 退出编辑态时：静态快照的保存与 Protyle 的销毁统一在下方 cleanup 中处理，
				// 因为 React 会先执行上一轮编辑态 effect 的 cleanup（此时 Protyle 仍存在），
				// 再执行这里的 effect body（此时 Protyle 已被销毁），所以必须在那里保存快照。
				destroyRuntimeResources()
				return
			}

			const container = containerRef.current
			if (!container || !window.siyuan?.ws?.app) return

			let disposed = false

			const ensureBlockId = async (): Promise<string | null> => {
				let blockId = shape.props.blockId || container.getAttribute('blockid') || null
				if (blockId) return blockId

				// 如果该形状刚创建（isNewlyCreated === true），在编辑态时创建块
				if (shape.props.isNewlyCreated) {
					try {
						editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, isNewlyCreated: false } })
					} catch (err) {
						// ignore
					}
				}
				
				const editorElement = container.closest('.tldraw__editor')
				const tldrawId = editorElement?.getAttribute('data-tldraw-id')
				const title = editorElement?.getAttribute('data-tldraw-title')
				if (!settingdata['tl-draw-create-note-id'] && !tldrawId) {
					showMessage('配置不完整,请检查设置')
					return null
				}

				const pendingCreationPromise = pendingCreationPromises.get(shape.id as string)
				if (pendingCreationPromise) {
					try {
						blockId = await pendingCreationPromise
					} catch (err) {
						console.error('等待块创建失败', err)
					}
				} else if (!blockId) {
					try {
						const creationPromise = (async () => {
							const idid = (await api.generateSiyuanID()) as string
							const link = buildTldrawLink(tldrawId, idid)
							// 将链接保存到自定义属性中
							const redata = await api.appendBlock(
								'markdown',
								`\n{: id="${idid}" custom-st-tldraw-single="1" custom-tldraw-link="${link}" }\n\n`,
								tldrawId!
							)
							return redata[0].doOperations[0].id as string
						})()
						pendingCreationPromises.set(shape.id as string, creationPromise)
						blockId = await creationPromise
					} catch (err) {
						console.error('创建块失败', err)
					} finally {
						pendingCreationPromises.delete(shape.id as string)
					}
				}

				if (!blockId) {
					showMessage('未找到块')
					return null
				}

				editor.updateShape({
					id: shape.id,
					type: shape.type,
					props: { ...shape.props, blockId },
				})
				container.setAttribute('blockid', blockId)
				// 使旧缓存失效
				invalidateCache(blockId)
				// 重置错误状态
				setHasLoadError(false)
				return blockId
			}

			const mountProtyle = async (blockId: string) => {
				if (disposed) return
				loadHandleRef.current?.cancel()
				// 编辑态始终使用最高优先级
				const handle = enqueueProtyleLoad(shape.id, 0, async (signal) => {
					if (disposed || signal.aborted) return
					const currentContainer = containerRef.current
					if (!currentContainer) return
					if (protyleHostRef.current && protyleHostRef.current.parentElement === currentContainer) {
						try {
							protyleHostRef.current.parentElement.removeChild(protyleHostRef.current)
						} catch {
							// ignore
						}
					}
					if (signal.aborted || disposed) return
					const host = document.createElement('div')
					host.style.width = '100%'
					host.style.height = '100%'
					host.style.overflow = 'hidden'
					protyleHostRef.current = host
					let resolveReady: (() => void) | null = null
					const readyPromise = new Promise<void>((resolve) => (resolveReady = resolve))
					// 防止 Protyle 无法正常触发 `after` 导致永远等待，增加超时与异常保护
					let readyTimeoutId: number | null = null
					const READY_TIMEOUT_MS = 1000
					const timeoutPromise = new Promise<void>((resolve) => {
						readyTimeoutId = window.setTimeout(resolve, READY_TIMEOUT_MS)
					})
					const readyWithTimeout = Promise.race([readyPromise, timeoutPromise])
					let protyleInstance: Protyle | null = null
					try {
						// 编辑态始终获取焦点
						const actions = ['cb-get-all', 'cb-get-focus'] as TProtyleAction[]
						protyleInstance = new Protyle(window.siyuan.ws.app, host, {
							blockId,
							render: {
								breadcrumb: false,
								gutter: true,
								title: false,
								breadcrumbDocName: false,
							},
							action: actions,
							mode: 'wysiwyg',
							after(protyle) {
								protyle.protyle.wysiwyg.preventKeyup = true
								resolveReady && resolveReady()
							},
							click: {
								preventInsetEmptyBlock: true,
							},
							handleEmptyContent() {
								if (!disposed && !signal.aborted) {
									enterMissingLinkedBlockState()
								}
							},
						})
					} catch (err) {
						console.error('Protyle 构造失败', err)
						if (host.parentElement) {
							try { host.parentElement.removeChild(host) } catch { }
						}
						return
					}

					if (signal.aborted || disposed) {
						safeDestroyProtyle(protyleInstance)
						return
					}
					protyleRef.current = protyleInstance
					currentContainer.appendChild(host)
					if (protyleInstance.protyle?.wysiwyg?.element) {
						protyleInstance.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 16}px`
					}
					// 等待 Protyle 就绪
					await readyWithTimeout.catch(() => undefined)
					if (readyTimeoutId) {
						clearTimeout(readyTimeoutId)
						readyTimeoutId = null
					}
					// 尺寸测量由 useSingleBlockSize hook 自动处理
					// 启用编辑
					protyleInstance.enable()
					if (signal.aborted || disposed) {
						safeDestroyProtyle(protyleInstance)
						if (protyleHostRef.current === host && host.parentElement) {
							host.parentElement.removeChild(host)
						}
						if (protyleRef.current === protyleInstance) {
							protyleRef.current = null
						}
					}
				})
				loadHandleRef.current = handle
				try {
					await handle.finished
				} catch (err) {
					console.error('加载 Protyle 失败', err)
				} finally {
					if (loadHandleRef.current === handle) {
						loadHandleRef.current = null
					}
				}
			}

			const ensureShapeVisible = (targetId: TLShapeId, retries = 3) => {
				const attempt = (remaining: number) => {
					const viewportBounds = editor.getViewportPageBounds()
					const shapeBounds = editor.getShapePageBounds(targetId)
					if (!viewportBounds || !shapeBounds) {
						if (remaining > 0) {
							requestAnimationFrame(() => attempt(remaining - 1))
						}
						return
					}

					const padding = 32
					const visibleLeft = viewportBounds.minX + padding
					const visibleRight = viewportBounds.maxX - padding
					const visibleTop = viewportBounds.minY + padding
					const visibleBottom = viewportBounds.maxY - padding

					let deltaX = 0
					let deltaY = 0

					if (shapeBounds.minX < visibleLeft) {
						deltaX = shapeBounds.minX - visibleLeft
					} else if (shapeBounds.maxX > visibleRight) {
						deltaX = shapeBounds.maxX - visibleRight
					}

					if (shapeBounds.minY < visibleTop) {
						deltaY = shapeBounds.minY - visibleTop
					} else if (shapeBounds.maxY > visibleBottom) {
						deltaY = shapeBounds.maxY - visibleBottom
					}

					if (deltaX === 0 && deltaY === 0) return

					const newCenter = {
						x: viewportBounds.midX + deltaX,
						y: viewportBounds.midY + deltaY,
					}

					editor.centerOnPoint(newCenter, {
						animation: { duration: 220, easing: EASINGS.easeInOutCubic },
					})
				}

				attempt(retries)
			}

			const registerKeyHandler = () => {
				detachKeyHandler.current?.()
				const wys = protyleRef.current?.protyle?.wysiwyg?.element
				if (!wys) return

				const handleKeyDown = (event: KeyboardEvent) => {
					if (event.isComposing) return
					// 处理 Escape：退出编辑模式
					if (event.key === 'Escape') {
						try {
							event.preventDefault()
							event.stopImmediatePropagation()
							event.stopPropagation()
						} catch (e) {
							// ignore
						}
						editor.setEditingShape(undefined)
						editor.select(shape.id)
						return
					}

					// 仅对 Enter 做原有处理
					if (event.key !== 'Enter') return
					// 拦截所有 Enter 行为，按修饰键决定新块方向
					try {
						event.preventDefault()
						event.stopImmediatePropagation()
						event.stopPropagation()
						; (event as any).returnValue = false
					} catch (e) {
						// ignore
					}
					const branchParentInfo = !event.ctrlKey && !event.metaKey ? getSingleBranchParent(editor, shape.id) : null
					if (branchParentInfo) {
						const newId = createSiblingSingleInBranch(editor, shape.id)
						if (!newId) return
						editor.select(newId)
						editor.setEditingShape(newId)
						requestAnimationFrame(() => ensureShapeVisible(newId))
						return
					}
					const offset = 40
					const width = shape.props.w
					const height = shape.props.h
					const newId = createShapeId()
					const defaultProps = this.getDefaultProps()
					let nextX = shape.x
					let nextY = shape.y

					if (event.altKey) {
						nextX = shape.x - (width + offset)
					} else if (event.shiftKey) {
						nextY = shape.y - (height + offset)
					} else if (event.ctrlKey || event.metaKey) {
						nextY = shape.y + height + offset
					} else {
						nextX = shape.x + width + offset
					}
					editor.createShapes([
						{
							id: newId,
							type: shape.type,
							x: nextX,
							y: nextY,
							props: {
								...defaultProps,
								blockId: '',
								color: shape.props.color,
								fontSize: shape.props.fontSize,
								connectOnEnter: shape.props.connectOnEnter,
							},
						},
					])
					// 如果开启连接功能，创建一条绑定的箭头或曲线指向新形状
					if (shape.props.connectOnEnter !== false) {
						try {
							const createdShape = editor.getShape(newId)
							if (createdShape && createdShape.type === 'single-block') {
								createArrowBetweenShapes(editor, shape as ISingleBlockShape, createdShape as ISingleBlockShape, shape.props.color ?? 'black')
							}
						} catch (err) {
							console.warn('connectOnEnter connector creation failed', err)
						}
					}
					editor.select(newId)
					editor.setEditingShape(newId)
					requestAnimationFrame(() => ensureShapeVisible(newId))
				}

				const handleKeyUp = (event: KeyboardEvent) => {
					if (event.key !== 'Enter' && event.key !== 'Escape') return
					try {
						event.preventDefault()
						event.stopImmediatePropagation()
						event.stopPropagation()
						; (event as any).returnValue = false
					} catch (e) { }
				}

				wys.addEventListener('keydown', handleKeyDown, { capture: true, passive: false } as AddEventListenerOptions)
				wys.addEventListener('keyup', handleKeyUp, { capture: true, passive: false } as AddEventListenerOptions)

				detachKeyHandler.current = () => {
					try {
						wys.removeEventListener('keydown', handleKeyDown, { capture: true } as EventListenerOptions)
					} catch (e) { }
					try {
						wys.removeEventListener('keyup', handleKeyUp, { capture: true } as EventListenerOptions)
					} catch (e) { }
				}
			}

			const setup = async () => {
				const blockId = await ensureBlockId()
				if (!blockId || disposed) return

				// 挂载 Protyle
				await mountProtyle(blockId)
				
				// 注册键盘处理
				registerKeyHandler()
			}

			setup()

			return () => {
				disposed = true
				// 退出编辑态时，在销毁 Protyle 之前先保存静态快照到缓存与本地状态
				// 必须在此处（cleanup）执行：React 先跑上一轮 effect 的 cleanup（Protyle 仍在），
				// 再跑新一轮非编辑态 effect 的 body（此时若已销毁则取不到内容）
				if (protyleRef.current && protyleHostRef.current && shape.props.blockId) {
					const html = cacheFromProtyleHost(shape.props.blockId, protyleHostRef.current, shape.props.fontSize || 16)
					if (html) {
						persistPreviewText(getLightweightPreviewTextFromElement(protyleHostRef.current))
						setStaticHtml(html)
					}
				}
				destroyRuntimeResources()
			}
		}, [destroyRuntimeResources, isEditingState, shape.id, shape.props.blockId, shape.props.refreshNonce, persistPreviewText])

		useEffect(() => {
			if (protyleRef.current?.protyle?.wysiwyg?.element) {
				protyleRef.current.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 20}px`;
			} else if (containerRef.current) {
				const wys = containerRef.current.querySelector(".protyle-wysiwyg");
				if (wys) (wys as HTMLElement).style.fontSize = `${shape.props.fontSize || 20}px`;
			}
			// 字号变化可能导致高度变化，由 useSingleBlockSize hook 自动处理
		}, [shape.props.fontSize]);


		const handlePointerEvent = (e: React.PointerEvent) => {
			if (isEditingState) {
				e.stopPropagation()
			}
		}

		const handleStaticLinkPointerDown = useCallback(
			(e: React.PointerEvent<HTMLDivElement>) => {
				if (isEditingState) return
				if (findStaticLinkTarget(e.target, staticContentRef.current)) {
					clearStaticTextSelection()
					e.stopPropagation()
				}
			},
			[isEditingState]
		)

		const handleStaticLinkDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault()
			e.stopPropagation()
			clearStaticTextSelection()
		}, [])

		const handleStaticLinkClick = useCallback(
			(e: React.MouseEvent<HTMLDivElement>) => {
				if (isEditingState || e.defaultPrevented) return
				const target = findStaticLinkTarget(e.target, staticContentRef.current)
				if (!target) return

				e.preventDefault()
				e.stopPropagation()
				clearStaticTextSelection()

				if (target.blockId) {
					if (!window.siyuan?.ws?.app) return
					void openTab({
						app: window.siyuan.ws.app,
						doc: {
							id: target.blockId,
							action: ['cb-get-hl', 'cb-get-all'],
							zoomIn: false,
						},
						position: 'right',
						keepCursor: false,
					}).catch((err) => {
						console.error('jump to linked block failed', err)
						try {
							showMessage('跳转到链接块失败', 3000, 'error')
						} catch {
							// ignore
						}
					})
					return
				}

				if (!target.href || target.href === '#') return
				const href = target.href.startsWith('assets/') ? `/${target.href}` : target.href
				if (isSteveToolsPluginUrl(href)) return

				try {
					if (href.startsWith('siyuan://')) {
						window.location.href = href
					} else {
						window.open(href, '_blank', 'noopener')
					}
				} catch (err) {
					console.error('open static link failed', err)
					try {
						showMessage('打开链接失败', 3000, 'error')
					} catch {
						// ignore
					}
				}
			},
			[isEditingState]
		)

		const handleAttrIconClick = useCallback(
			async (e: React.MouseEvent<HTMLDivElement>) => {
				e.preventDefault()
				e.stopPropagation()
				try {
					// console.debug('打开属性面板:', shape.props.blockId)
					const container = containerRef.current
					const blockId = shape.props.blockId || container?.getAttribute('blockid') || ''
					if (!blockId) return
					if (!window.siyuan?.ws?.app) return
					const data = await (api as any).getBlockAttrs(blockId)
					const tempContainer = document.createElement('div')
					const tempProtyle = new Protyle(window.siyuan.ws.app, tempContainer, {
						blockId,
						rootId: blockId,
					})
					const protyle = tempProtyle.protyle
					openAttributePanel({
						data,
						focusName: 'av',
						protyle,
					})
					window.setTimeout(() => {
						safeDestroyProtyle(tempProtyle)
					}, 0)
				} catch (err) {
					console.error('open attribute panel failed', err)
					try {
						showMessage('打开属性面板失败')
					} catch {
						// ignore
					}
				}
			},
			[shape.props.blockId]
		)

		// 计算当前是否需要绘制边框
		const borderPx = shape.props.transparentBackground ? 0 : BORDER_PX

		return (
			<HTMLContainer
				id={shape.id}
				style={{
					display: 'flex',
					flexDirection: 'column',
					backgroundColor: shape.props.transparentBackground ? 'transparent' : theme[shape.props.color].semi,
					// color: theme[shape.props.color].solid,
					position: 'relative',
					isolation: 'isolate',
					// Always allow pointer events at the container level so hover can be detected
					// (used to reveal connector ports even when not editing). The inner content
					// will still prevent interaction when not in edit mode.
					pointerEvents: 'auto',
					width: '100%',
					height: '100%',
					overflow: 'visible', // 改为 visible 以显示端口
					boxShadow: isRootAttachTarget
						? '0 0 0 4px rgba(34, 197, 94, 0.42), 0 0 20px rgba(34, 197, 94, 0.32)'
						: isEditingState ? '0 0 0 2px #3d8aff' : 'none',
					cursor: isEditingState ? 'text' : 'default',
					padding: 0,
					border: settingdata["showCardBorder"] ? (shape.props.transparentBackground ? 'none' : `${borderPx}px solid ${theme[shape.props.color].solid}`) : 'none',
					borderRadius: '10px',
				}}
				onPointerDown={handlePointerEvent}
				onPointerMove={handlePointerEvent}
				onPointerUp={handlePointerEvent}
			>
				{/* 小尺寸时不挂载属性栏及其交互 DOM。 */}
				{!isSmallSingleBlock && <div
					style={{
						position: 'absolute',
						top: '-16px',
						right: '0px',
						display: 'flex',
						alignItems: 'center',
						gap: '4px',
						zIndex: 1000,
						pointerEvents: 'auto',
						minHeight: '20px',
					}}
				>
					{/* 数据库属性内容 - 使用新组件 */}
					<DbAttributeBar
						blockId={shape.props.blockId}
						themeColor={{
							solid: theme[shape.props.color].solid,
							semi: theme[shape.props.color].semi,
						}}
						shapeWidth={shape.props.w}
						refreshNonce={shape.props.refreshNonce}
					/>
					{/* 数据库图标按钮 - 当有属性时显示 */}
					{hasAttrIcon && (
						<div
							onClick={handleAttrIconClick}
							onPointerDown={(e) => {
								e.preventDefault()
								e.stopPropagation()
							}}
							style={{
								width: '20px',
								height: '20px',
								borderRadius: '999px',
								backgroundColor: theme[shape.props.color].solid,
								boxShadow: '0 0 4px rgba(0,0,0,0.3)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								pointerEvents: 'auto',
								cursor: 'pointer',
								flexShrink: 0,
							}}
						>
							<svg
								viewBox="0 0 32 32"
								width={14}
								height={14}
								style={{ fill: theme[shape.props.color].semi }}
							>
								<use xlinkHref="#iconDatabase" />
							</svg>
						</div>
					)}
				</div>}
				<div
					ref={containerRef}
					className="st-single-block-shape__content"
					blockid={shape.props.blockId}
					style={{
						width: '100%',
						height: '100%',
						// 编辑态隐藏滚动条，非编辑态允许滚动
						overflow: isEditingState ? 'hidden' : 'auto',
						// Prevent content interactions when not editing to avoid blocking
						// TL editor pointer handling. The overlay itself can still react
						// to hover because HTMLContainer has pointer-events enabled.
						pointerEvents: isEditingState ? 'all' : 'none',
						touchAction: isEditingState ? 'auto' : 'none',
						contain: 'strict',
						padding: '0px',
					}}
				>
					{/* 非编辑态：显示静态 HTML 内容 */}
					{!isSmallSingleBlock && <style>
						{`
							.st-single-block-shape__content,
							.st-single-block-shape__content * {
								scrollbar-width: none !important;
								-ms-overflow-style: none !important;
							}
							.st-single-block-shape__content::-webkit-scrollbar,
							.st-single-block-shape__content *::-webkit-scrollbar {
								width: 0 !important;
								height: 0 !important;
								display: none !important;
							}
							.single-block-static-content,
							.single-block-static-content .protyle-wysiwyg {
								pointer-events: none !important;
								user-select: none !important;
								-webkit-user-select: none !important;
							}
							.single-block-static-content * {
								pointer-events: none !important;
								user-select: none !important;
								-webkit-user-select: none !important;
								-webkit-user-drag: none !important;
							}
							.single-block-static-content a,
							.single-block-static-content a *,
							.single-block-static-content [data-href],
							.single-block-static-content [data-href] *,
							.single-block-static-content [data-type*="block-ref"],
							.single-block-static-content [data-type*="block-ref"] *,
							.single-block-static-content [data-type*="file-annotation-ref"],
							.single-block-static-content [data-type*="file-annotation-ref"] * {
								pointer-events: auto !important;
								cursor: pointer;
							}
						`}
					</style>}
					{!isEditingState && isSmallSingleBlock && (
						<div
							style={{
								width: '100%',
								height: '100%',
								background: shape.props.transparentBackground ? theme[shape.props.color].semi : 'transparent',
								pointerEvents: 'none',
								padding: '2px 4px',
								boxSizing: 'border-box',
								color: theme[shape.props.color].solid,
								fontSize: `${lowDetailFontSize}px`,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								textAlign: 'center',
							}}
						>
							<span style={{
								display: '-webkit-box',
								WebkitBoxOrient: 'vertical',
								WebkitLineClamp: 2,
								overflow: 'hidden',
								lineHeight: 1.1,
								wordBreak: 'break-word',
							}}>
								{shape.props.previewText || (shape.props.blockId ? '单块' : '双击编辑')}
							</span>
						</div>
					)}
					{!isEditingState && !isSmallSingleBlock && staticHtml && (
						<div
							className="single-block-static-content"
							ref={staticContentRef}
							onPointerDown={handleStaticLinkPointerDown}
							onPointerUp={handleStaticLinkPointerDown}
							onDragStart={handleStaticLinkDragStart}
							onClick={handleStaticLinkClick}
							dangerouslySetInnerHTML={{ __html: staticHtml }}
							style={{
								width: '100%',
								height: '100%',
								pointerEvents: 'none',
								userSelect: 'none',
							}}
						/>
					)}
					{/* 非编辑态：加载中提示 */}
					{!isEditingState && !isSmallSingleBlock && !staticHtml && isLoadingContent && (
						<div style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: `${Math.min(shape.props.fontSize, 16)}px`,
							color: theme[shape.props.color].solid,
							opacity: 0.5,
							textAlign: 'center',
							padding: '4px'
						}}>
							加载中...
						</div>
					)}
					{/* 非编辑态：等待加载提示 */}
					{!isEditingState && !isSmallSingleBlock && !staticHtml && !isLoadingContent && !canLoad && (
						<div style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: `${Math.min(shape.props.fontSize, 18)}px`,
							color: theme[shape.props.color].solid,
							opacity: 0.7,
							textAlign: 'center',
							padding: '4px'
						}}>
							双击加载内容
						</div>
					)}
					{/* 非编辑态：新块占位符 */}
					{!isEditingState && !isSmallSingleBlock && !staticHtml && !isLoadingContent && !hasLoadError && canLoad && shape.props.isNewlyCreated && (
						<div style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: `${Math.min(shape.props.fontSize, 16)}px`,
							color: theme[shape.props.color].solid,
							opacity: 0.5,
							textAlign: 'center',
							padding: '4px'
						}}>
							双击编辑
						</div>
					)}
				</div>
				{!isEditingState && !isSmallSingleBlock && hasLoadError && (
					<div
						onPointerDown={stopMissingStateEvent}
						onClick={stopMissingStateEvent}
						style={{
							position: 'absolute',
							inset: '0',
							zIndex: 20,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							padding: '12px',
							background: shape.props.transparentBackground ? 'rgba(127, 127, 127, 0.08)' : 'rgba(127, 127, 127, 0.14)',
							backdropFilter: 'blur(2px)',
							pointerEvents: 'auto',
						}}
					>
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								gap: '10px',
								maxWidth: '100%',
								padding: '14px 16px',
								borderRadius: '12px',
								background: 'var(--b3-theme-background, #fff)',
								border: '1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12))',
								boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
								color: theme[shape.props.color].solid,
								textAlign: 'center',
							}}
						>
							<div style={{ fontSize: `${Math.min(shape.props.fontSize, 14)}px`, fontWeight: 500 }}>
								找不到绑定块
							</div>
							<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
								<button
									type="button"
									onPointerDown={stopMissingStateEvent}
									onClick={handleRefreshMissingLinkedBlock}
									style={{
										padding: '6px 12px',
										borderRadius: '8px',
										border: '1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12))',
										background: 'transparent',
										color: 'inherit',
										cursor: 'pointer',
									}}
								>
									刷新
								</button>
								<button
									type="button"
									onPointerDown={stopMissingStateEvent}
									onClick={handleDeleteMissingLinkedBlock}
									style={{
										padding: '6px 12px',
										borderRadius: '8px',
										border: '1px solid var(--b3-card-error-color, #d23f31)',
										background: 'var(--b3-card-error-background, rgba(210, 63, 49, 0.12))',
										color: 'var(--b3-card-error-color, #d23f31)',
										cursor: 'pointer',
									}}
								>
									删除
								</button>
							</div>
						</div>
					</div>
				)}
				{/* 端口覆盖层 - 用于贝塞尔连接器 */}
				{/* 在透明模式下不显示端点（PortsOverlay） */}
				{!isSmallSingleBlock && !shape.props.transparentBackground && (
					<PortsOverlay shapeId={shape.id} />
				)}
			</HTMLContainer>
		)
	}

	indicator(shape: ISingleBlockShape) {
		const { width, height } = this.editor.getShapeGeometry(shape).bounds
		return <rect width={width} height={height} rx={10} ry={10} />
	}

	override onResize(shape: ISingleBlockShape, info: TLResizeInfo<ISingleBlockShape>) {
		return resizeBox(shape, info)
	}

	override onResizeStart(shape: ISingleBlockShape) {
		beginBranchResize(this.editor, shape.id)
	}

	override onResizeEnd(_initialShape: ISingleBlockShape, currentShape: ISingleBlockShape) {
		endBranchResize(this.editor, currentShape.id)
	}

	override onResizeCancel(_initialShape: ISingleBlockShape, currentShape: ISingleBlockShape) {
		endBranchResize(this.editor, currentShape.id)
	}

	override onTranslateStart(shape: ISingleBlockShape) {
		draggingBranchSingleBlockIds.add(shape.id as string)
		beginBranchAttachmentDrag(this.editor, shape)
		setBranchInteractionHint(getBranchInteractionHintForShape(this.editor, shape))

		const bindings = this.editor.getBindingsFromShape(shape, 'single-block')
		this.editor.deleteBindings(bindings)
	}

	override onTranslateEnd(_initial: ISingleBlockShape, currentShape: ISingleBlockShape) {
		draggingBranchSingleBlockIds.delete(currentShape.id as string)
		clearBranchInteractionHint(currentShape.id as string)
		if (updateBranchAttachmentAfterDrag(this.editor, currentShape)) return

        // 如果当前 shape 标记为不允许绑定，则跳过创建绑定
        if (currentShape.props.allowBinding === false) return
		const pageAnchor = this.editor
			.getShapePageTransform(currentShape)
			.applyToPoint(this.editor.getShapeGeometry(currentShape).bounds.center)
		const target = this.editor.getShapeAtPoint(pageAnchor, {
			hitInside: true,
			filter: (shape) =>
				shape.id !== currentShape.id &&
				this.editor.canBindShapes({ fromShape: currentShape, toShape: shape, binding: 'single-block' }),
		})

		if (!target) return

		const targetBounds = Box.ZeroFix(this.editor.getShapeGeometry(target)!.bounds)
		const pointInTargetSpace = this.editor.getPointInShapeSpace(target, pageAnchor)

		const anchor = {
			x: invLerp(targetBounds.minX, targetBounds.maxX, pointInTargetSpace.x),
			y: invLerp(targetBounds.minY, targetBounds.maxY, pointInTargetSpace.y),
		}

		this.editor.createBinding({
			type: 'single-block',
			fromId: currentShape.id,
			toId: target.id,
			props: {
				anchor,
			},
		})
	}

	override toSvg(shape: ISingleBlockShape, ctx: SvgExportContext): ReactElement | null {
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		const { w, h: hProp, color, fontSize = 16, blockId, transparentBackground } = shape.props
		const showBorder = settingdata["showCardBorder"] !== false && !transparentBackground
		// 背景是否透明与是否显示边框是两个独立的选项。画布上的
		// singleblock 在关闭边框时仍然保留颜色背景，导出也应保持一致。
		const hasBackground = !transparentBackground
		const border = showBorder ? BORDER_PX : 0
		const radius = 10
		const strokeColor = showBorder ? theme[color].solid : 'none'
		const fillColor = hasBackground ? theme[color].semi : 'none'
		const textColor = theme[color].solid
		const size = SingleBlockSizes.get(this.editor).get(shape.id)
		// 使用实际渲染高度，如果没有则使用属性高度，确保导出与实际一致
		const h = size?.height ?? Math.max(hProp, MIN_HEIGHT)
		if (isSvgExportOutlineOnly()) {
			return <rect width={w} height={h} fill="none" stroke={theme[color].solid} strokeWidth={border || 1} rx={radius} ry={radius} />
		}

		// Clamp inner dimensions to avoid negative <foreignObject> size during export
		const innerW = Math.max(w - border * 2, 1)
		const innerH = Math.max(h - border * 2, 1)
		const cachedSnapshot = getCachedSvgExportSnapshot(shape.id)
		let serialized = cachedSnapshot ?? ''
		if (cachedSnapshot === null && typeof document !== 'undefined') {
			const host = getShapeHostElement(shape.id, this.editor.getContainer())
			const content = host?.querySelector('[blockid]') as HTMLElement | null
			if (content) {
				serialized = serializeElementForSvgExport(content, {
					viewportWidth: innerW,
					viewportHeight: innerH,
					fontSize,
				})
			}
		}
		const scopeId = `st-single-block-export-${shape.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

		return (
			<g>
				{hasBackground || border > 0 ? (
					<rect width={w} height={h} fill={fillColor} stroke={strokeColor} strokeWidth={border} rx={radius} ry={radius} />
				) : (
					// 保持形状几何但不绘制填充与边框
					<rect width={w} height={h} fill="none" stroke="none" strokeWidth={0} rx={radius} ry={radius} />
				)}
				{serialized ? (
					<foreignObject x={border} y={border} width={Math.max(innerW, 1)} height={Math.max(innerH, 1)}>
						<div
							xmlns="http://www.w3.org/1999/xhtml"
							id={scopeId}
							style={{ width: '100%', height: '100%', overflow: 'hidden', fontSize: `${fontSize}px` }}
							dangerouslySetInnerHTML={{ __html: `${getSvgExportGlobalStyles(`#${scopeId}`)}${serialized}` }}
						/>
					</foreignObject>
				) : (
					<text x={w / 2} y={h / 2} fill={textColor} fontSize={fontSize * 0.9} dominantBaseline="middle" textAnchor="middle">
						{blockId ? `Block ${blockId.slice(-6)}` : 'Single Block'}
					</text>
				)}
			</g>
		)
	}
}

// ===== Single Block Binding =====
export type SingleBlockBinding = TLBaseBinding<
	'single-block',
	{
		anchor: VecModel
	}
>

export class SingleBlockBindingUtil extends BindingUtil<SingleBlockBinding> {
	static override type = 'single-block' as const

	override getDefaultProps() {
		return {
			anchor: { x: 0.5, y: 0.5 },
		}
	}

	// 当绑定的目标形状发生变化时，更新 single-block 的位置
	override onAfterChangeToShape({
		binding,
		shapeAfter,
	}: BindingOnShapeChangeOptions<SingleBlockBinding>): void {
		const singleBlock = this.editor.getShape<ISingleBlockShape>(binding.fromId)
		if (!singleBlock) return

		// 如果 single-block 被设置为不允许绑定，则移除此 binding 并返回
		if (singleBlock.props.allowBinding === false) {
			try {
				this.editor.deleteBindings([binding])
			} catch (err) {
				// ignore
			}
			return
		}

		const shapeBounds = this.editor.getShapeGeometry(shapeAfter)!.bounds
		const shapeAnchor = {
			x: lerp(shapeBounds.minX, shapeBounds.maxX, binding.props.anchor.x),
			y: lerp(shapeBounds.minY, shapeBounds.maxY, binding.props.anchor.y),
		}
		const pageAnchor = this.editor.getShapePageTransform(shapeAfter).applyToPoint(shapeAnchor)

		const singleBlockParentAnchor = this.editor
			.getShapeParentTransform(singleBlock)
			.invert()
			.applyToPoint(pageAnchor)

		this.editor.updateShape({
			id: singleBlock.id,
			type: 'single-block',
			x: singleBlockParentAnchor.x,
			y: singleBlockParentAnchor.y,
		})
	}

	// 当绑定的目标形状被删除时，删除 single-block
	// override onBeforeDeleteToShape({ binding }: BindingOnShapeDeleteOptions<SingleBlockBinding>): void {
	// 	this.editor.deleteShape(binding.fromId)
	// }
}
