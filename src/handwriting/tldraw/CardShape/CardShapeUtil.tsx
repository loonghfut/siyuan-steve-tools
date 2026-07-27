import React, { ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	SvgExportContext,
	TLResizeInfo,
	useValue,
	resizeBox,
} from '@tldraw/tldraw'
import { cardShapeMigrations } from './card-shape-migrations'
import { cardShapeProps, getCardShapeDefaultProps } from './card-shape-props'
import { CardRenderMode, ICardShape } from './card-shape-types'
import { openTab, Protyle, showMessage, TProtyleAction } from 'siyuan';
import * as api from '@/api/api';
import { settingdata } from '@/index';
import { buildTldrawLink } from '../utils/link-builder';
import { enqueueProtyleLoad, ProtyleLoadHandle } from '../protyle-load-queue'
import { shapeLoadManager } from '../shape-load-manager'
import { PortsOverlay } from '../BezierConnectorShape/Port'
import { renderAllContentIdle } from '../utils/render/content-renderer'
import { cancelIdleRender } from '../utils/idle-scheduler'
import { getShapeLowDetailThreshold } from '../utils/low-detail'
import { convertProtyleHtmlToDom } from '../utils/render/content-html-converter'
import { exportCardShapeToSvg } from './CardShapeExport'
import { getCardCollapsedHeight } from './card-collapse'
import { getDefaultColorTheme } from '../utils/color-theme'
import { inputDialogSync } from '@/libs/dialog'
import {
	beginBranchAttachmentDrag,
	beginBranchResize,
	clearBranchInteractionHint,
	endBranchResize,
	getBranchInteractionHintForShape,
	setBranchInteractionHint,
	syncBranchMoveForRootContent,
	updateBranchAttachmentAfterDrag,
	useBranchInteractionHint,
} from '../BranchShape'

// 按卡片隔离创建流程，避免多个新卡片互相复用创建结果
const pendingCreationPromises = new Map<string, Promise<string>>();
const draggingBranchCardIds = new Set<string>()

// 静态预览 DOM 缓存：避免重复请求
const staticPreviewCache = new Map<string, { html: string; fontSize: number }>();
const MAX_CACHE_SIZE = 50;

// 限制首屏渲染规模，避免一次性插入过多 DOM
const INITIAL_NODE_LIMIT = 80;
const INITIAL_TEXT_LIMIT = 8000;
const SIYUAN_BLOCK_ID_RE = /\b\d{14}-[0-9a-z]{7}\b/i
const STEVE_TOOLS_PLUGIN_URL_RE = /^(?:https:\/\/|siyuan:\/\/)plugins\/siyuan-steve-tools\//i
type DefaultCardBlockType = 'heading' | 'blockquote'

function getDefaultCardBlockType(): DefaultCardBlockType {
	return settingdata['tldraw-card-default-block-type'] === 'blockquote' ? 'blockquote' : 'heading'
}

function buildDefaultCardBlockMarkdown(
	blockType: DefaultCardBlockType,
	title: string,
	blockId: string,
	link: string,
) {
	const firstLine = blockType === 'blockquote' ? `> ` : `###### ${title}`
	return (
		firstLine +
		'\n' +
		'{: id="' + blockId + '" custom-st-tldraw="1" custom-tldraw-link="' + link + '" }' +
		'\n\n' +
		'{: custom-st-tldraw-none="1" }' +
		'\n'
	)
}

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

function clearStaticTextSelectionSoon() {
	clearStaticTextSelection()
	if (typeof requestAnimationFrame === 'function') {
		requestAnimationFrame(clearStaticTextSelection)
	} else {
		window.setTimeout(clearStaticTextSelection, 0)
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

function cacheStaticPreview(blockId: string, html: string, fontSize: number) {
	if (staticPreviewCache.size >= MAX_CACHE_SIZE) {
		const firstKey = staticPreviewCache.keys().next().value;
		if (firstKey) staticPreviewCache.delete(firstKey);
	}
	staticPreviewCache.set(blockId, { html, fontSize });
}

function getCachedPreview(blockId: string, fontSize: number): string | null {
	const cached = staticPreviewCache.get(blockId);
	if (cached && cached.fontSize === fontSize) return cached.html;
	return null;
}

// 使缓存失效
function invalidatePreviewCache(blockId: string) {
	staticPreviewCache.delete(blockId);
}

// 批量块存在性检查：收集多个卡片的检查请求，合并处理
const blockCheckQueue = new Map<string, { shapeId: string; resolve: (exists: boolean) => void }[]>();
let blockCheckTimer: number | null = null;

function scheduleBlockCheck(blockId: string, shapeId: string): Promise<boolean> {
	return new Promise((resolve) => {
		const list = blockCheckQueue.get(blockId) || [];
		list.push({ shapeId, resolve });
		blockCheckQueue.set(blockId, list);

		if (blockCheckTimer === null) {
			blockCheckTimer = window.setTimeout(async () => {
				blockCheckTimer = null;
				const entries = [...blockCheckQueue.entries()];
				blockCheckQueue.clear();

				// 并行检查所有块
				await Promise.allSettled(
					entries.map(async ([bid, callbacks]) => {
						try {
							const res = await api.getBlockByID(bid);
							const exists = !!res;
							callbacks.forEach(cb => cb.resolve(exists));
						} catch {
							callbacks.forEach(cb => cb.resolve(false));
						}
					})
				);
			}, 2000);
		}
	});
}


export class CardShapeUtil extends ShapeUtil<ICardShape> {
	static override type = 'card' as const
	// [1]
	static override props = cardShapeProps
	// [2]
	static override migrations = cardShapeMigrations

	// [3]
	override canCull(shape: ICardShape) {
		// Keep the active editor mounted; all other cards can use tldraw's native culling.
		return this.editor.getEditingShapeId() !== shape.id
	}
	override isAspectRatioLocked(_shape: ICardShape) {
		return false
	}
	override hideRotateHandle(_shape: ICardShape) {
		return false
	}
	override canResize(_shape: ICardShape) {
		return true
	}
	override canEdit() {
		return true
	}
	override canScroll(_shape: ICardShape) {
		return true
	}
	// [4]
	override onBeforeUpdate(prev: ICardShape, next: ICardShape) {
		if (prev.props.blockId && next.props.blockId === '') {
			next.props.blockId = prev.props.blockId;
		}

		if (draggingBranchCardIds.has(next.id as string) && (prev.x !== next.x || prev.y !== next.y)) {
			syncBranchMoveForRootContent(this.editor, prev, next)
			setBranchInteractionHint(getBranchInteractionHintForShape(this.editor, next))
		}
	}

	getDefaultProps(): ICardShape['props'] {
		return getCardShapeDefaultProps()
		/*
		return {
			w: 300,
			h: 300,
			color: 'black',
			showMask: true,
			blockId: '',
			isNewlyCreated: true,
			fontSize: 16, // 默认字体大小
			isMain: false, // 是否为主卡片
			refreshNonce: Date.now(), // 用于之后强制刷新
			isCollapsed: false, // 默认不折叠
			renderMode: 'inherit' as CardRenderMode, // 卡片单独渲染模式: inherit | static-dom | live-protyle
			// version: 1, // 版本号
			collapsedTextSize: 21, // 折叠后的文字大小
			collapsedTextAlign: 'center', // 折叠后的文字对齐方式
		}
		*/
	}

	// [5]
	getGeometry(shape: ICardShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override getIndicatorPath(shape: ICardShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
	// [6]
	component(shape: ICardShape) {
		// const bounds = this.editor.getShapeGeometry(shape).bounds
		const editor = this.editor
		const theme = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
		const isEditing = useValue('card is editing', () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
		const branchInteractionHint = useBranchInteractionHint()
		const isRootAttachTarget =
			branchInteractionHint?.mode === 'attach' &&
			branchInteractionHint.slot === 'root' &&
			(branchInteractionHint.targetShapeId === shape.id ||
				(!branchInteractionHint.targetShapeId && branchInteractionHint.draggingShapeId === shape.id))
		const isEditingState = isEditing
		const [isInViewport, setIsInViewport] = useState(false);
		const [canLoad, setCanLoad] = useState(false); // gating heavy render by global manager
		const [hasMissingLinkedBlock, setHasMissingLinkedBlock] = useState(false);
		const isViewportCullingEnabled = settingdata['tldraw-viewport-culling'] !== false;
		const tldrawHeaderImage = settingdata['tldraw-header-image'] !== false;
		const [collapsedText, setCollapsedText] = useState<string>('加载中...');
		const [collapsedDocInfo, setCollapsedDocInfo] = useState<{
			title: string;
			titleImg?: string;
			titleImgSrc?: string;
			titleImgBackground?: string;
			titleImgColor?: string;
			titleImgHasUrl?: boolean;
		} | null>(null);
		const isCollapsed = shape.props.isCollapsed || false;
		const efficientZoom = useValue('card efficient zoom', () => editor.getEfficientZoomLevel(), [editor])
		const lowDetailThreshold = getShapeLowDetailThreshold()
		const isSmallCard = !isEditingState && lowDetailThreshold > 0 && Math.min(shape.props.w, shape.props.h) * efficientZoom < lowDetailThreshold
		const isMainCard = Boolean(shape.props.isMain);
		const collapsedTextSize = shape.props.collapsedTextSize || 21; // 折叠文字大小，默认21px
		const collapsedTextAlign = shape.props.collapsedTextAlign || 'center'; // 折叠文字对齐，默认居中
		const collapsedTextLineHeight = 1.4;
		const collapsedTextAvailableHeight = Math.max(
			shape.props.h - 20,
			collapsedTextSize * collapsedTextLineHeight
		);
		const collapsedTextLineClamp = Math.max(
			1,
			Math.floor(collapsedTextAvailableHeight / (collapsedTextSize * collapsedTextLineHeight))
		);
		const headerGradientFallback = `linear-gradient(135deg, ${theme[shape.props.color].solid} 0%, ${theme[shape.props.color].semi} 100%)`;
		const cardInnerGap = 4

		// 计算有效渲染模式（不使用 useMemo，确保每次渲染都读取最新的全局设置）
		const globalRenderMode: Exclude<CardRenderMode, 'inherit'> =
			settingdata["card-render-mode"] === 'live-protyle' ? 'live-protyle' : 'static-dom';
		const effectiveRenderMode: Exclude<CardRenderMode, 'inherit'> =
			shape.props.renderMode === 'inherit' || !shape.props.renderMode
				? globalRenderMode
				: (shape.props.renderMode as Exclude<CardRenderMode, 'inherit'>);
		// While editing, viewport admission must not cancel the queued Protyle mount.
		const renderAdmission = isEditingState || !isViewportCullingEnabled || (isInViewport && canLoad)
			? 'allowed'
			: 'blocked'
		const cardInnerEdgeShadow = 'inset 0 0 0 5px var(--b3-body-background, var(--b3-theme-background, #fff))'
		const cardOuterShadow = isRootAttachTarget
			? '0 0 0 4px rgba(34, 197, 94, 0.42), 0 0 20px rgba(34, 197, 94, 0.32)'
			: isEditingState
				? '0 0 0 2px #3d8aff'
				: ''

		// 缓存 blockId 以减少属性访问
		const blockId = shape.props.blockId;
		const fontSize = shape.props.fontSize || 16;

		// 追踪上一次的编辑状态，用于检测编辑->非编辑的切换
		const prevIsEditingRef = useRef(isEditingState);
		const refreshNonceRef = useRef(shape.props.refreshNonce);
		// 每个新卡片只询问一次用户标题，避免编辑态重渲染时重复弹窗
		const userTitlePromptedRef = useRef(false)
		const prevCollapsedRef = useRef(isCollapsed);

		// 稳定引用当前 shape props，供折叠图标点击回调使用，避免 useCallback 依赖 shape.props 导致频繁重建
		const shapePropsRef = useRef(shape.props);
		shapePropsRef.current = shape.props;

		const handleUncollapse = useCallback((e: React.PointerEvent | React.MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			const props = shapePropsRef.current;
			const storedHeight = props.preCollapseHeight;
			this.editor.updateShape({
				id: shape.id,
				type: shape.type,
				props: {
					...props,
					isCollapsed: false,
					h: storedHeight && storedHeight > 0 ? storedHeight : props.h,
					preCollapseHeight: undefined,
				},
			});
		}, [shape.id, shape.type]);


		// 仅在编辑时创建 Protyle 实例
		const protyleRef = useRef<Protyle | null>(null)
		// Protyle 的承载元素（脱离 containerRef 创建，再 append 进去）
		const protyleHostRef = useRef<HTMLDivElement | null>(null)
		// 非编辑态下的静态预览节点（由 Protyle contentElement 克隆而来）
		const staticPreviewRef = useRef<HTMLElement | null>(null)
		const staticPreviewHandlersRef = useRef<{
			target: HTMLElement
			pointerDown: (event: PointerEvent) => void
			pointerUp: (event: PointerEvent) => void
			click: (event: MouseEvent) => void
			dragStart: (event: DragEvent) => void
		} | null>(null)
		// 防止重复销毁：为每个 Protyle 实例设置一个已销毁标记
		const DESTROYED_MARK = '__st_destroyed__'
		const safeDestroyProtyle = (pt: Protyle | null | undefined) => {
			if (!pt) return
			const anyPt = pt as any
			if (anyPt[DESTROYED_MARK]) return
			try { pt.destroy() } catch { }
			anyPt[DESTROYED_MARK] = true
		}
		const removeStaticPreviewLinkHandlers = useCallback((preview?: HTMLElement | null) => {
			const handlers = staticPreviewHandlersRef.current
			const target = handlers?.target || preview || staticPreviewRef.current
			if (!target || !handlers) return
			target.removeEventListener('pointerdown', handlers.pointerDown, true)
			target.removeEventListener('pointerup', handlers.pointerUp, true)
			target.removeEventListener('click', handlers.click, true)
			target.removeEventListener('dragstart', handlers.dragStart, true)
			target.classList.remove('card-static-content')
			staticPreviewHandlersRef.current = null
		}, [])
		const openStaticLinkTarget = useCallback((target: { blockId: string | null; href: string }) => {
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
					console.error('jump to card linked block failed', err)
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
				console.error('open card static link failed', err)
				try {
					showMessage('打开链接失败', 3000, 'error')
				} catch {
					// ignore
				}
			}
		}, [])
		const installStaticPreviewLinkHandlers = useCallback((preview: HTMLElement) => {
			removeStaticPreviewLinkHandlers()
			preview.classList.add('card-static-content')
			const pointerHandler = (event: PointerEvent) => {
				if (findStaticLinkTarget(event.target, preview)) {
					event.preventDefault()
					clearStaticTextSelectionSoon()
					event.stopPropagation()
				}
			}
			const clickHandler = (event: MouseEvent) => {
				if (event.defaultPrevented) return
				const target = findStaticLinkTarget(event.target, preview)
				if (!target) return
				if (!target.blockId && target.href && isSteveToolsPluginUrl(target.href)) return
				event.preventDefault()
				event.stopPropagation()
				clearStaticTextSelectionSoon()
				openStaticLinkTarget(target)
			}
			const dragStartHandler = (event: DragEvent) => {
				event.preventDefault()
				event.stopPropagation()
				clearStaticTextSelectionSoon()
			}
			staticPreviewHandlersRef.current = {
				target: preview,
				pointerDown: pointerHandler,
				pointerUp: pointerHandler,
				click: clickHandler,
				dragStart: dragStartHandler,
			}
			preview.addEventListener('pointerdown', pointerHandler, true)
			preview.addEventListener('pointerup', pointerHandler, true)
			preview.addEventListener('click', clickHandler, true)
			preview.addEventListener('dragstart', dragStartHandler, true)
		}, [openStaticLinkTarget, removeStaticPreviewLinkHandlers])
		// 全局由 shapeLoadManager 计算可见性，无需本地定时轮询
		const loadHandleRef = useRef<ProtyleLoadHandle | null>(null)

		const destroyRuntimeResources = useCallback(() => {
			if (loadHandleRef.current) {
				loadHandleRef.current.cancel()
				loadHandleRef.current = null
			}
			removeStaticPreviewLinkHandlers()
			if (staticPreviewRef.current?.parentElement) {
				try {
					staticPreviewRef.current.parentElement.removeChild(staticPreviewRef.current)
				} catch {
					// ignore
				}
			}
			staticPreviewRef.current = null
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
		}, [removeStaticPreviewLinkHandlers])


		const containerRef = useRef<HTMLDivElement>(null)
		const lastSizeRef = useRef({ h: shape.props.h })
		// 保存进入编辑前的相机状态，用于退出编辑后恢复视角
		const prevCameraRef = useRef<any | null>(null)
		const hadFocusedRef = useRef(false)
		// 保存编辑前的形状层级索引，用于退出编辑后恢复原层次
		const originalIndexRef = useRef<string | null>(null)
		const stopMissingStateEvent = (event: React.PointerEvent | React.MouseEvent) => {
			event.preventDefault()
			event.stopPropagation()
		}
		const enterMissingLinkedBlockState = useCallback(() => {
			destroyRuntimeResources()
			setHasMissingLinkedBlock(true)
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
			if (blockId) {
				invalidatePreviewCache(blockId)
			}
			destroyRuntimeResources()
			setHasMissingLinkedBlock(false)
			editor.updateShape({
				id: shape.id,
				type: shape.type,
				props: {
					...shape.props,
					refreshNonce: Date.now(),
				},
			})
		}, [blockId, destroyRuntimeResources, editor, shape.id, shape.props, shape.type])
		const handleDeleteMissingLinkedBlock = useCallback((event: React.PointerEvent | React.MouseEvent) => {
			stopMissingStateEvent(event)
			editor.deleteShape(shape.id)
		}, [editor, shape.id])


		// 编辑时临时置顶，退出编辑后恢复原层次
		useEffect(() => {
			if (isEditing) {
				// 进入编辑：保存原始 index 并用原生方法置顶
				if (originalIndexRef.current === null) {
					originalIndexRef.current = shape.index;
				}
				try {
					this.editor.bringToFront([shape.id]);
				} catch (e) {
					// ignore
				}
			} else {
				// 退出编辑：恢复原始层次
				if (originalIndexRef.current !== null) {
					try {
						this.editor.updateShapes([{
							id: shape.id,
							type: shape.type,
							index: originalIndexRef.current,
						}]);
					} catch (e) {
						// ignore
					}
					originalIndexRef.current = null;
				}
			}
		}, [isEditing, shape.id]);

		useLayoutEffect(() => {
			const prevH = lastSizeRef.current.h
			const nextH = shape.props.h
			if (prevH !== nextH) {
				lastSizeRef.current = { h: nextH }
			}
		}, [shape.props.h])

		// 检测编辑状态变化：从编辑 -> 非编辑时，使静态预览缓存失效
		useEffect(() => {
			const wasEditing = prevIsEditingRef.current;
			prevIsEditingRef.current = isEditingState;

			// 从编辑状态退出时，使该 blockId 的缓存失效，确保下次使用最新内容
			if (wasEditing && !isEditingState && blockId) {
				invalidatePreviewCache(blockId);
			}
		}, [isEditingState, blockId]);

		// 折叠/展开时记录高度并在展开时恢复
		useEffect(() => {
			const prev = prevCollapsedRef.current;
			const collapsedHeight = getCardCollapsedHeight(shape);
			const storedHeight = shape.props.preCollapseHeight;

			// 折叠状态下进入编辑：临时恢复到折叠前高度，便于编辑
			if (isCollapsed && isEditingState) {
				const restoreHeight = (storedHeight && storedHeight > 0) ? storedHeight : shape.props.h || collapsedHeight;
				const ensuredStoredHeight = storedHeight || shape.props.h || collapsedHeight;
				if (shape.props.h !== restoreHeight) {
					this.editor.updateShape({
						id: shape.id,
						type: shape.type,
						props: {
							...shape.props,
							isCollapsed: true,
							preCollapseHeight: ensuredStoredHeight,
							h: restoreHeight,
						},
					});
				}
				prevCollapsedRef.current = isCollapsed;
				return;
			}

			// 折叠且非编辑：如果未记录高度则记录并收缩；若已记录则确保收缩到折叠高度
			if (isCollapsed) {
				if (!storedHeight) {
					this.editor.updateShape({
						id: shape.id,
						type: shape.type,
						props: {
							...shape.props,
							isCollapsed: true,
							preCollapseHeight: shape.props.h,
							h: collapsedHeight,
						},
					});
				} else if (shape.props.h !== collapsedHeight) {
					this.editor.updateShape({
						id: shape.id,
						type: shape.type,
						props: {
							...shape.props,
							isCollapsed: true,
							preCollapseHeight: storedHeight,
							h: collapsedHeight,
						},
					});
				}
				prevCollapsedRef.current = isCollapsed;
				return;
			}

			// 从折叠 -> 展开时恢复高度
			if (prev && !isCollapsed && storedHeight && storedHeight > 0) {
				this.editor.updateShape({
					id: shape.id,
					type: shape.type,
					props: {
						...shape.props,
						h: storedHeight,
						isCollapsed: false,
						preCollapseHeight: undefined,
					},
				});
				prevCollapsedRef.current = isCollapsed;
				return;
			}

			// 同步记录当前折叠状态
			prevCollapsedRef.current = isCollapsed;
		}, [isCollapsed, isEditingState, shape.props.h, shape.props.preCollapseHeight, shape.id, shape.props.fontSize, shape.type, isMainCard]);

		// 编辑模式切换时聚焦到形状，并在退出编辑后恢复之前的视角
		useEffect(() => {
			// 延迟执行，确保编辑状态完全建立
			const timer = setTimeout(() => {
				const enabled = settingdata['restore-camera-on-edit'] === true
				// 如果该功能被禁用，则不进行任何聚焦/恢复动作；并清理可能残留的状态
				if (!enabled) {
					if (!isEditing) {
						hadFocusedRef.current = false
						prevCameraRef.current = null
					}
					return
				}
				if (isEditing) {
					console.debug('聚焦到Card形状:', shape.id);
					// 进入编辑：仅在第一次进入时保存当前相机
					if (!hadFocusedRef.current) {
						try {
							prevCameraRef.current = this.editor.getCamera()
						} catch (e) {
							prevCameraRef.current = null
						}
						hadFocusedRef.current = true
					}
					// 刚刚进入编辑模式，选中并聚焦到形状
					this.editor.select(shape.id)
					this.editor.zoomToSelection({ animation: { duration: 300 } })
				} else {
					// 退出编辑：如果之前保存过相机，则恢复视角
					if (hadFocusedRef.current && prevCameraRef.current) {
						try {
							this.editor.setCamera(prevCameraRef.current, { animation: { duration: 300 } })
						} catch (e) {
							// ignore
						}
					}
					// 清理保存的相机状态
					hadFocusedRef.current = false
					prevCameraRef.current = null
				}
			}, 50) // 50ms 延迟确保状态同步完成
			// console.debug('大苏打发')
			return () => clearTimeout(timer)
		}, [isEditing, shape.id])

		// 解析题头图：提取背景图 URL/渐变，并返回 img src 以及背景信息
		const parseTitleImg = (titleImg?: string): {
			src: string;
			backgroundImage?: string;
			backgroundColor?: string;
			hasUrl?: boolean;
		} => {
			const fallback = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
			if (!titleImg) return { src: fallback };
			let imgSrc = fallback;
			let hasUrl = false;
			let backgroundImage: string | undefined;
			let backgroundColor: string | undefined;

			// 先检查是否包含 url()（可能是 background 属性中的 url）
			const urlMatch = titleImg.match(/url\(["']?([^"')]+)["']?\)/i);
			if (urlMatch) {
				hasUrl = true;
				const imgPath = urlMatch[1];
				imgSrc = `${imgPath}`;
				backgroundImage = `url(${imgSrc})`;
			} else {
				// 尝试从 background-image 属性提取
				const bgImageMatch = titleImg.match(/background-image\s*:\s*([^;]+);?/i);
				if (bgImageMatch) {
					backgroundImage = bgImageMatch[1].trim(); // 支持线性渐变等
				} else {
					// 尝试从 background 属性中提取（包含渐变的完整背景定义）
					// 如: "background: linear-gradient(...)" 或复合 background 定义
					const bgMatch = titleImg.match(/background\s*:\s*([^;]+)/i);
					if (bgMatch) {
						const bgValue = bgMatch[1].trim();
						// 检查是否包含渐变或图片
						if (bgValue.includes('gradient') || bgValue.includes('url(')) {
							backgroundImage = bgValue;
						}
					}
				}
			}

			const bgColorMatch = titleImg.match(/background-color\s*:\s*([^;]+);?/i);
			if (bgColorMatch) {
				backgroundColor = bgColorMatch[1].trim();
			}

			return { src: imgSrc, backgroundImage, backgroundColor, hasUrl };
		};

		// 折叠状态下的展示内容：
		// - isMain: 显示题头图和标题
		// - 其他: 显示块内容摘要
		useEffect(() => {
			if (!isCollapsed || !shape.props.blockId) return;

			let cancelled = false;

			const loadForMain = async () => {
				try {
					const info = await api.getDocInfo(shape.props.blockId);
					if (cancelled) return;
					const ial = info?.ial || {};
					const titleImg = ial['title-img'];
					const title = ial.title || info?.name || '未命名文档';
					const parsed = parseTitleImg(titleImg);
					setCollapsedDocInfo({
						title,
						titleImg,
						titleImgSrc: parsed.src,
						titleImgBackground: parsed.backgroundImage,
						titleImgColor: parsed.backgroundColor,
						titleImgHasUrl: parsed.hasUrl,
					});
				} catch (e) {
					if (cancelled) return;
					setCollapsedDocInfo({ title: '未命名文档' });
				}
			};

			const loadForNormal = async () => {
				try {
					const res = await api.getBlockByID(shape.props.blockId);
					if (cancelled) return;
					if (res && res.content) {
						const plainText = res.content
							.replace(/\[🔗\]\([^)]+\)/g, '')
							.replace(/^#+\s+/gm, '')
							.replace(/\{:[^}]+\}/g, '')
							.trim();
						const preview = plainText
						setCollapsedText(preview || '空块');
					} else {
						setCollapsedText('空块');
					}
				} catch {
					if (cancelled) return;
					setCollapsedText('加载失败');
				}
			};

			if (isMainCard) {
				loadForMain();
			} else {
				loadForNormal();
			}

			return () => { cancelled = true; };
		}, [isCollapsed, shape.props.blockId, isMainCard]);



		// register with global shape load manager (drives visibility + load admission)
		useEffect(() => {
			shapeLoadManager.attachEditor(this.editor as any)
			const unregister = shapeLoadManager.register(
				shape.id,
				this.editor as any,
				() => ({ editing: isEditingState }),
				(allowed, meta) => {
					setCanLoad(allowed)
					setIsInViewport(meta.inViewport)
				}
			)
			return unregister
		}, [isEditingState, shape.id])

		// 移除轻量预览逻辑，统一使用 Protyle 渲染

		// 字体大小变更时，如果处于编辑且存在 Protyle，则更新其样式
		useEffect(() => {
			if (protyleRef.current?.protyle?.wysiwyg?.element) {
				protyleRef.current.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 16}px`;
			} else if (containerRef.current) {
				const wys = containerRef.current.querySelector(".protyle-wysiwyg");
				if (wys) (wys as HTMLElement).style.fontSize = `${shape.props.fontSize || 16}px`;
			}
		}, [shape.props.fontSize]);
		// NOTE: previously we experimented with creating a Siyuan block immediately on shape creation
		// (isNewlyCreated === true). That led to behavior where a block would be created before the
		// user actually edited the shape. To maintain the original UX and keep parity with
		// `single-block` shapes, we intentionally do NOT create blocks at shape creation time.
		// Block creation continues to occur during mount/edit workflows (e.g. mountProtyle) as before.
		// 非编辑态下做一次存在性检查，使用批量检查机制
		useEffect(() => {
			const container = containerRef.current;
			const currentBlockId = container?.getAttribute('blockid') || blockId;
			if (!blockId && currentBlockId) {
				this.editor.updateShape({
					id: shape.id,
					type: shape.type,
					props: { ...shape.props, blockId: currentBlockId }
				});
			}
			if (currentBlockId && !isEditingState) {
				if (shape.props.isNewlyCreated) {
					this.editor.updateShape({
						id: shape.id,
						type: shape.type,
						props: { ...shape.props, isNewlyCreated: false }
					});
				} else {
					// 使用批量检查机制
					let cancelled = false;
					scheduleBlockCheck(currentBlockId, shape.id).then((exists) => {
						if (cancelled) return;
						if (exists) {
							setHasMissingLinkedBlock(false);
							return;
						}
						enterMissingLinkedBlockState();
					});
					return () => { cancelled = true; };
				}
			}
		}, [blockId, editor, enterMissingLinkedBlockState, isEditingState, shape.id, shape.props, shape.type, shape.props.refreshNonce]);
		// Protyle 生命周期管理主 Effect
		// 注意：对于 live-protyle 模式，编辑状态切换不应触发重建
		useEffect(() => {
			const renderTaskId = `render-card-content-${shape.id}`
			// 检测是否为手动刷新（通过 refreshNonce 变更触发）
			const manualRefreshTriggered = refreshNonceRef.current !== shape.props.refreshNonce;
			const shouldForceReloadLiveProtyle =
				effectiveRenderMode === 'live-protyle' &&
				manualRefreshTriggered;
			// 更新引用以记录最新的 nonce
			refreshNonceRef.current = shape.props.refreshNonce;
			// 折叠状态下不渲染 Protyle
			if (isCollapsed && !isEditingState) {
				destroyRuntimeResources();
				return;
			}
			if (isSmallCard) {
				destroyRuntimeResources();
				return;
			}

			const shouldRender = renderAdmission === 'allowed';
			if (!shouldRender) {
				destroyRuntimeResources();
				return;
			}

			if (shouldForceReloadLiveProtyle) {
				destroyRuntimeResources();
			}

			if (!containerRef.current || !window.siyuan?.ws?.app) return;
			// effectiveRenderMode 已通过 useMemo 计算

			// 等待 Protyle 完成首次内容渲染（尽量接近编辑态样式）
			// const waitForProtyleRendered = async (pt: Protyle, timeout = 800) => {
			// 	const ce = pt.protyle?.contentElement as HTMLElement | undefined;
			// 	if (!ce) return;
			// 	if (ce.childElementCount > 0) {
			// 		await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
			// 		return;
			// 	}
			// 	await new Promise<void>((resolve) => {
			// 		let done = false;
			// 		const finish = () => {
			// 			if (done) return; done = true; resolve();
			// 		};
			// 		const obs = new MutationObserver(() => {
			// 			if (ce.childElementCount > 0) {
			// 				obs.disconnect();
			// 				requestAnimationFrame(() => requestAnimationFrame(finish));
			// 			}
			// 		});
			// 		obs.observe(ce, { childList: true, subtree: true });
			// 		setTimeout(() => { try { obs.disconnect(); } catch { } finish(); }, timeout);
			// 	});
			// };

			const mountProtyle = async (priority: number): Promise<string | null> => {
				if (cancelled) return null;
				let currentBlockId: string | null = containerRef.current?.getAttribute('blockid') || shape.props.blockId || null;
				if (!currentBlockId) {
					const editorElement = containerRef.current?.closest('.tldraw__editor');
					const tldrawId = editorElement?.getAttribute('data-tldraw-id');
					const title = editorElement?.getAttribute('data-tldraw-title');
					if (!settingdata["tl-draw-create-note-id"] && !tldrawId) {
						showMessage('配置不完整,请检查设置');
						return null;
					}
					const pendingCreationPromise = pendingCreationPromises.get(shape.id as string);
					if (pendingCreationPromise) {
						try {
							currentBlockId = await pendingCreationPromise;
						} catch (e) {
							console.error('等待块创建失败', e);
						}
						if (cancelled) return null;
					} else if (!currentBlockId) {
						const creationPromise = (async () => {
							const idid = await api.generateSiyuanID() as string;
							const link = buildTldrawLink(tldrawId, idid);
							const defaultBlockType = getDefaultCardBlockType();
							const initialTitle = defaultBlockType === 'heading'
								? String(settingdata["tldraw-custom-card-title"] || "${timestamp}")
									.replace(/\$\{timestamp\}/g, () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))
								: '';
							const content = buildDefaultCardBlockMarkdown(defaultBlockType, initialTitle, idid, link)
							const redata = await api.appendBlock("markdown", content, tldrawId!);
							const newBlockId = redata[0].doOperations[0].id as string;

							if (defaultBlockType === 'heading' && isEditingState && !shape.props.blockId && !containerRef.current?.getAttribute('blockid') && settingdata["tldraw-prompt-card-title"] && !userTitlePromptedRef.current) {
								userTitlePromptedRef.current = true;
								try {
									const input = await inputDialogSync({
										title: '输入卡片标题',
										placeholder: '请输入标题',
										width: '520px',
										confirmOnEnter: true,
									});
									const userTitle = input?.replace(/[\r\n]+/g, ' ').trim() || '';
									if (userTitle) {
										// updateBlock 会整体替换块内容，因此必须重新附带 Card 的 IAL。
										await api.updateBlock('markdown', buildDefaultCardBlockMarkdown(defaultBlockType, userTitle, idid, link), newBlockId);
									}
								} catch (err) {
									// 标题更新失败不应影响已创建块与 Card 的绑定。
									console.log('更新卡片标题失败，继续使用默认标题', err);
								}
							}
							return newBlockId;
						})();
						pendingCreationPromises.set(shape.id as string, creationPromise);
						try {
							currentBlockId = await creationPromise;
							if (cancelled) return null;
						} catch (err) {
							console.error('创建块失败', err);
						} finally {
							if (pendingCreationPromises.get(shape.id as string) === creationPromise) {
								pendingCreationPromises.delete(shape.id as string);
							}
						}
					}
				}

				if (!currentBlockId) {
					showMessage('未找到块');
					return null;
				}

				if (cancelled) return null;
				containerRef.current?.setAttribute('blockid', currentBlockId);
				if (cancelled) return null;

				loadHandleRef.current?.cancel();
				const handle = enqueueProtyleLoad(shape.id, priority, async (signal) => {
					if (cancelled || signal.aborted) return;
					const currentContainer = containerRef.current;
					if (!currentContainer) return;
					if (staticPreviewRef.current?.parentElement === currentContainer) {
						removeStaticPreviewLinkHandlers()
						try {
							currentContainer.removeChild(staticPreviewRef.current);
						} catch {
							// ignore
						}
						staticPreviewRef.current = null;
					}
					if (protyleHostRef.current && protyleHostRef.current.parentElement === currentContainer) {
						try {
							protyleHostRef.current.parentElement.removeChild(protyleHostRef.current);
						} catch {
							// ignore
						}
					}
					if (signal.aborted || cancelled) return;
					const host = document.createElement('div');
					host.style.width = '100%';
					host.style.height = '100%';
					host.style.overflow = 'hidden';
					protyleHostRef.current = host;
					let resolveReady: (() => void) | null = null;
					const readyPromise = new Promise<void>((resolve) => (resolveReady = resolve));
					// 防止 Protyle 无法正常触发 `after` 导致永远等待，增加超时与异常保护
					let readyTimeoutId: number | null = null;
					const READY_TIMEOUT_MS = 1000;
					const timeoutPromise = new Promise<void>((resolve) => {
						readyTimeoutId = window.setTimeout(resolve, READY_TIMEOUT_MS);
					});
					const readyWithTimeout = Promise.race([readyPromise, timeoutPromise]);
					let protyleInstance: Protyle | null = null;
					try {
						// 对于 live-protyle 模式，始终创建可编辑的 Protyle（后续通过 enable/disable 控制）
						const shouldFocus = isEditingState && effectiveRenderMode === 'live-protyle';
						const actions = ['cb-get-all', ...(shouldFocus ? ['cb-get-focus'] : [])] as TProtyleAction[]
						protyleInstance = new Protyle(window.siyuan.ws.app, host, {
							blockId: currentBlockId,
							rootId: currentBlockId,
							render: {
								background: (shape.props.isMain && tldrawHeaderImage),
								breadcrumb: false,
								gutter: true,
								title: shape.props.isMain,
								breadcrumbDocName: shape.props.isMain,
							},
							action: actions,
							mode: "wysiwyg",
							after: (protyle: Protyle) => {
								protyle.protyle.wysiwyg.preventKeyup = true;
								resolveReady && resolveReady();
							},
							handleEmptyContent: () => {
								enterMissingLinkedBlockState();
							},
							click: {
								/** 点击末尾是否阻止插入新块 */
								preventInsetEmptyBlock: true,
							}
						});
					} catch (err) {
						console.error('Protyle 构造失败', err);
						if (host.parentElement) {
							try { host.parentElement.removeChild(host); } catch { }
						}
						return;
					}
					if (signal.aborted || cancelled) {
						safeDestroyProtyle(protyleInstance)
						return;
					}
					protyleRef.current = protyleInstance;
					currentContainer.appendChild(host);
					if (protyleInstance.protyle?.wysiwyg?.element) {
						protyleInstance.protyle.wysiwyg.element.style.fontSize = `${fontSize}px`;
					}
					// 等待 Protyle 就绪，但带超时保护，避免长时间阻塞加载队列
					await readyWithTimeout.catch(() => { });
					if (readyTimeoutId) {
						clearTimeout(readyTimeoutId);
						readyTimeoutId = null;
					}
					if (signal.aborted || cancelled) {
						safeDestroyProtyle(protyleInstance)
						if (protyleHostRef.current === host && host.parentElement) {
							host.parentElement.removeChild(host);
						}
						if (protyleRef.current === protyleInstance) {
							protyleRef.current = null;
						}
					}
				});
				loadHandleRef.current = handle;
				try {
					await handle.finished;
				} catch (err) {
					console.error('加载 Protyle 失败', err);
				} finally {
					if (loadHandleRef.current === handle) {
						loadHandleRef.current = null;
					}
				}
				return currentBlockId;
			};

			// 从 API 获取静态预览 - 用于文档块(isMain)的静态渲染
			const useStaticPreviewFromGetDoc = async (targetBlockId: string, forceRefresh = false) => {
				if (cancelled || !containerRef.current) return;

				// 检查缓存（如果非强制刷新）
				if (!forceRefresh) {
					const cachedHtml = getCachedPreview(targetBlockId, fontSize);
					if (cachedHtml) {
						// 使用缓存的预览
						if (staticPreviewRef.current?.parentElement === containerRef.current) {
							removeStaticPreviewLinkHandlers()
							containerRef.current.removeChild(staticPreviewRef.current);
						}
						const wrapper = document.createElement('div');
						wrapper.innerHTML = cachedHtml;
						const clone = wrapper.firstElementChild as HTMLElement;
						if (clone && containerRef.current) {
							// 清理 Protyle host
							if (protyleHostRef.current?.parentElement === containerRef.current) {
								try { containerRef.current.removeChild(protyleHostRef.current); } catch { }
							}
							// 销毁 Protyle 实例
							try { safeDestroyProtyle(protyleRef.current); } catch { }
							protyleRef.current = null;
							protyleHostRef.current = null;

							staticPreviewRef.current = clone;
							installStaticPreviewLinkHandlers(clone);
							containerRef.current.appendChild(clone);
							try { convertProtyleHtmlToDom(clone); } catch (e) { console.warn('convertProtyleHtmlToDom failed', e); }
							await renderAllContentIdle(clone, 10, renderTaskId, true);
							if (cancelled) return;
							return;
						}
					}
				}

				// 使用 getDoc API 获取 DOM 内容
				let domContent: string | null = null;
				try {
					const res = await api.getDoc(targetBlockId);
					if (res && res.content) {
						domContent = res.content;
					}
				} catch (err) {
					console.error('获取文档 DOM 内容失败:', err);
				}

				if (cancelled || !domContent) return;

				// 对于 isMain 形状，获取文档信息（标题和题头图）
				let docInfo: api.IResGetDocInfo | null = null;
				if (isMainCard) {
					try {
						docInfo = await api.getDocInfo(targetBlockId);
					} catch (err) {
						console.error('获取文档信息失败:', err);
					}
				}

				// 移除旧的静态预览
				if (staticPreviewRef.current?.parentElement === containerRef.current) {
					removeStaticPreviewLinkHandlers()
					containerRef.current.removeChild(staticPreviewRef.current);
				}
				// 清理 Protyle host
				if (protyleHostRef.current?.parentElement === containerRef.current) {
					try { containerRef.current.removeChild(protyleHostRef.current); } catch { }
				}
				// 销毁 Protyle 实例
				try { safeDestroyProtyle(protyleRef.current); } catch { }
				protyleRef.current = null;
				protyleHostRef.current = null;

				// 创建预览容器
				const previewWrapper = document.createElement('div');
				previewWrapper.className = 'protyle-wysiwyg protyle-wysiwyg--attr';
				previewWrapper.style.width = '100%';
				previewWrapper.style.height = '100%';
				previewWrapper.style.overflow = 'auto';
				previewWrapper.style.fontSize = `${fontSize}px`;
				previewWrapper.innerHTML = domContent;

				// 如果是 isMain 形状，添加题头图和标题
				if (isMainCard && docInfo) {
					const ial = docInfo.ial || {};
					const titleImg = ial['title-img'];
					const title = ial.title || docInfo.name || '未命名文档';

					// 创建顶部区域容器
					const topContainer = document.createElement('div');
					topContainer.className = 'protyle-top';

					// 添加题头图
					if (titleImg && tldrawHeaderImage) {
						const bgContainer = document.createElement('div');
						bgContainer.className = 'protyle-background protyle-background--enable';
						bgContainer.setAttribute('data-node-id', targetBlockId);

						const bgImg = document.createElement('div');
						bgImg.className = 'protyle-background__img';

						// 处理 title-img 的背景图片兼容
						let bgStyle = titleImg;
						let imgSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
						const urlMatch = titleImg.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
						if (urlMatch) {
							const imgPath = urlMatch[1];
							// 构建静态资源 URL
							const assetUrl = `${imgPath}`;
							imgSrc = assetUrl;
							// 移除 background-image 部分，只保留其他样式（如 background-color）
							bgStyle = titleImg.replace(/background-image:\s*url\(["']?[^"')]+["']?\);?/g, '').trim();
							// 移除末尾分号
							if (bgStyle.endsWith(';')) bgStyle = bgStyle.slice(0, -1);
						}

						bgImg.innerHTML = `<img src="${imgSrc}" style="${bgStyle}">`;

						const bgIa = document.createElement('div');
						bgIa.className = 'protyle-background__ia';
						bgIa.style.marginLeft = '24px';
						bgIa.style.marginRight = '16px';

						bgContainer.appendChild(bgImg);
						bgContainer.appendChild(bgIa);
						topContainer.appendChild(bgContainer);
					}

					// 添加标题
					const titleContainer = document.createElement('div');
					titleContainer.className = 'protyle-title protyle-wysiwyg--attr';
					titleContainer.setAttribute('data-node-id', targetBlockId);
					titleContainer.setAttribute('data-render', 'true');
					titleContainer.style.margin = '16px 16px 0px 24px';

					const iconSpan = document.createElement('span');
					iconSpan.className = 'protyle-title__icon';
					iconSpan.innerHTML = '<svg><use xlink:href="#iconFile"></use></svg>';

					const titleInput = document.createElement('div');
					titleInput.contentEditable = 'false';
					titleInput.spellcheck = false;
					titleInput.className = 'protyle-title__input';
					titleInput.style.outline = 'none';
					titleInput.textContent = title;

					const attrDiv = document.createElement('div');
					attrDiv.className = 'protyle-attr';

					// 添加书签（如果有）
					const bookmark = ial.bookmark;
					if (bookmark) {
						const bookmarkDiv = document.createElement('div');
						bookmarkDiv.className = 'protyle-attr--bookmark';
						bookmarkDiv.textContent = bookmark;
						attrDiv.appendChild(bookmarkDiv);
					}

					titleContainer.appendChild(iconSpan);
					titleContainer.appendChild(titleInput);
					titleContainer.appendChild(attrDiv);
					topContainer.appendChild(titleContainer);

					// 将 topContainer 插入到内容最前面
					if (previewWrapper.firstChild) {
						previewWrapper.insertBefore(topContainer, previewWrapper.firstChild);
					} else {
						previewWrapper.appendChild(topContainer);
					}
				}

				// 图片懒加载，避免首屏同步解码
				previewWrapper.querySelectorAll('img').forEach((img) => {
					if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
				});

				// 对超大文档做首屏截断，并提供懒加载剩余内容
				const installIncrementalRender = () => {
					const children = Array.from(previewWrapper.children);
					const remainder: Element[] = [];
					let keptNodes = 0;
					let keptText = 0;

					for (const node of children) {
						// 题头与标题区域直接保留
						if (node.classList.contains('protyle-top') || node.classList.contains('protyle-title')) {
							continue;
						}
						const textLen = (node.textContent || '').length;
						const hitLimit = keptNodes >= INITIAL_NODE_LIMIT || keptText >= INITIAL_TEXT_LIMIT;
						if (hitLimit) {
							remainder.push(node);
							continue;
						}
						keptNodes += 1;
						keptText += textLen;
					}

					if (!remainder.length) return true;

					remainder.forEach((n) => previewWrapper.removeChild(n));

					const placeholder = document.createElement('div');
					placeholder.style.padding = '16px';
					placeholder.style.textAlign = 'center';
					placeholder.style.color = 'var(--b3-theme-on-surface, #666)';
					placeholder.style.opacity = '0.8';
					placeholder.style.cursor = 'pointer';
					placeholder.style.userSelect = 'none';
					placeholder.textContent = '文档较大，点击或滚动以加载剩余内容';

					let loaded = false;
					const loadRest = async () => {
						if (loaded || cancelled) return;
						loaded = true;
						placeholder.textContent = '正在加载剩余内容...';
						const frag = document.createDocumentFragment();
						remainder.forEach((n) => frag.appendChild(n));
						previewWrapper.insertBefore(frag, placeholder);
						try { convertProtyleHtmlToDom(previewWrapper); } catch (e) { console.warn('convertProtyleHtmlToDom failed', e); }
						await renderAllContentIdle(previewWrapper, 10, renderTaskId, true);
						if (placeholder.parentElement === previewWrapper) {
							previewWrapper.removeChild(placeholder);
						}
					};

					placeholder.addEventListener('click', loadRest, { once: true });

					// 当滚动接近占位符时自动加载
					if ('IntersectionObserver' in window) {
						const obs = new IntersectionObserver((entries) => {
							if (entries.some((e) => e.isIntersecting)) {
								obs.disconnect();
								loadRest();
							}
						}, { root: previewWrapper, rootMargin: '200px' });
						obs.observe(placeholder);
					}

					previewWrapper.appendChild(placeholder);
					return false;
				};

				const allowCache = installIncrementalRender();

				// 渲染所有内容类型（公式、图表等）需要依赖已挂载的 DOM，先挂载再渲染
				staticPreviewRef.current = previewWrapper;
				installStaticPreviewLinkHandlers(previewWrapper);
				containerRef.current.appendChild(previewWrapper);
				// 先把 protyle-html 转为普通 DOM，再运行后续渲染
				try { convertProtyleHtmlToDom(previewWrapper); } catch (e) { console.warn('convertProtyleHtmlToDom failed', e); }
				await renderAllContentIdle(previewWrapper, 10, renderTaskId, true);

				if (cancelled) return;

				// 仅在未截断时缓存，避免缓存巨大 DOM
				if (allowCache) {
					cacheStaticPreview(targetBlockId, previewWrapper.outerHTML, fontSize);
				}
			};

			let cancelled = false;

			// 检测是否刚从编辑状态退出（用于强制刷新缓存）
			const wasEditing = prevIsEditingRef.current && !isEditingState;

			(async () => {
				if (isEditingState) {
					// 进入编辑：移除静态预览，创建或复用 Protyle
					if (staticPreviewRef.current?.parentElement === containerRef.current) {
						removeStaticPreviewLinkHandlers()
						containerRef.current.removeChild(staticPreviewRef.current);
					}
					staticPreviewRef.current = null;
					if (!protyleRef.current) {
						const createdBlockId = await mountProtyle(0);
						if (cancelled) return;
						if (createdBlockId && shape.props.blockId !== createdBlockId) {
							this.editor.updateShape({
								id: shape.id,
								type: shape.type,
								props: { ...shape.props, blockId: createdBlockId }
							});
						}
					}
					if (protyleHostRef.current && containerRef.current && protyleHostRef.current.parentElement !== containerRef.current) {
						containerRef.current.appendChild(protyleHostRef.current);
					}
					removeStaticPreviewLinkHandlers()
					try { protyleRef.current?.enable(); } catch { }
				} else {
					// 非编辑
					if (effectiveRenderMode === 'static-dom') {
						const id = containerRef.current?.getAttribute('blockid') || blockId;
						if (!id) return;
						if (isMainCard) {
							await useStaticPreviewFromGetDoc(id, wasEditing || manualRefreshTriggered);
							if (cancelled) return;
						} else {
							// 普通块：使用 getDoc API 直接获取静态 DOM
							if (protyleRef.current) {
								if (protyleHostRef.current?.parentElement) {
									removeStaticPreviewLinkHandlers()
									protyleHostRef.current.parentElement.removeChild(protyleHostRef.current);
								}
								try { safeDestroyProtyle(protyleRef.current); } catch { }
								protyleRef.current = null;
								protyleHostRef.current = null;
							}
							// 如果是手动刷新，则强制 bypass 缓存并通过 API 重新获取 DOM
							await useStaticPreviewFromGetDoc(id, manualRefreshTriggered || wasEditing);
							if (cancelled) return;
						}
					} else {
						// live-protyle 模式：保留 Protyle 实例，仅切换 enable/disable 状态
						if (!protyleRef.current) {
							// 首次加载或实例不存在时创建
							await mountProtyle(1);
							if (cancelled) return;
						}
						// 移除可能存在的静态预览
						if (staticPreviewRef.current?.parentElement === containerRef.current) {
							removeStaticPreviewLinkHandlers()
							containerRef.current.removeChild(staticPreviewRef.current);
						}
						staticPreviewRef.current = null;
						// 确保 Protyle host 已挂载
						if (protyleHostRef.current && containerRef.current && protyleHostRef.current.parentElement !== containerRef.current) {
							containerRef.current.appendChild(protyleHostRef.current);
						}
						// 禁用交互但保留实例
						if (protyleHostRef.current) {
							removeStaticPreviewLinkHandlers()
							installStaticPreviewLinkHandlers(protyleHostRef.current)
						}
						try { protyleRef.current?.disable(); } catch { }
						// 如果刚从编辑状态退出，刷新内容以反映最新编辑
						if (wasEditing) {
							try { protyleRef.current?.reload(false); } catch { }
						}
					}
				}
			})()

			// 组件卸载清理（仅在真正卸载时销毁，编辑状态切换不触发）
			return () => {
				cancelled = true;
				cancelIdleRender(renderTaskId);
				// 对于 live-protyle 模式，不在编辑切换时销毁资源
				// 仅当组件真正卸载或渲染条件不满足时才销毁
				if (isCollapsed || !shouldRender) {
					destroyRuntimeResources();
				}
			};
		}, [destroyRuntimeResources, isEditingState, renderAdmission, shape.id, blockId, shape.props.refreshNonce, isCollapsed, effectiveRenderMode, fontSize, isSmallCard]);

		const handlePointerEvent = (e: React.PointerEvent) => {
			if (isEditingState) {
				e.stopPropagation(); // 在编辑模式下阻止事件冒泡
			}
		};

		return (
			<HTMLContainer
				style={{
					display: 'flex',
					flexDirection: 'column',
					backgroundColor: theme[shape.props.color].semi,
					// color: theme[shape.props.color].solid,
					// 只有在非编辑状态时才禁用指针事件
					position: 'relative',
					isolation: 'isolate',
					// Enable pointer events at the outer container so hover works and
					// ports can be revealed even when not editing. The inner content
					// will still block interactions unless in edit mode.
					pointerEvents: 'auto',
					width: '100%',
					height: '100%',
					overflow: 'visible', // 改为 visible 以显示端口
					boxShadow: cardOuterShadow
						? `${cardOuterShadow}, ${cardInnerEdgeShadow}`
						: cardInnerEdgeShadow,
					cursor: isEditingState ? 'text' : 'default',
					padding: 0,
					border: settingdata["showCardBorder"] ? `3px solid ${theme[shape.props.color].solid}` : 'none', // 添加颜色边框
					borderRadius: '10px', // 增加圆角
				}}
				// onDoubleClick={handleDoubleClick}
				onPointerDown={handlePointerEvent}
				onPointerMove={handlePointerEvent}
				onPointerUp={handlePointerEvent}
			>
				<style>
					{`
						.card-static-content,
						.card-static-content .protyle-wysiwyg {
							pointer-events: none !important;
							user-select: none !important;
							-webkit-user-select: none !important;
							-webkit-touch-callout: none !important;
						}
						.card-static-content * {
							pointer-events: none !important;
							user-select: none !important;
							-webkit-user-select: none !important;
							-webkit-user-drag: none !important;
							-webkit-touch-callout: none !important;
						}
						.card-static-content a,
						.card-static-content a *,
						.card-static-content [data-href],
						.card-static-content [data-href] *,
						.card-static-content [data-type*="block-ref"],
						.card-static-content [data-type*="block-ref"] *,
						.card-static-content [data-type*="file-annotation-ref"],
						.card-static-content [data-type*="file-annotation-ref"] * {
							pointer-events: auto !important;
							cursor: pointer;
						}
					`}
				</style>
				<div
					ref={containerRef}
					blockid={shape.props.blockId}
					style={{
						width: '100%',
						height: '100%',
						overflow: 'auto', // 内容区域可滚动
						pointerEvents: isEditingState || (!isMainCard && isCollapsed) ? 'all' : 'none',
						touchAction: isEditingState || (!isMainCard && isCollapsed) ? 'auto' : 'none',
						contain: 'strict',
						padding: `${cardInnerGap}px`,
						boxSizing: 'border-box',
					}}
				>
					{/* 折叠状态 */}
					{isCollapsed && !isEditingState && (
						isMainCard ? (
							<div
								className="card-shape-collapsed-content"
								style={{
									width: '100%',
									height: '100%',
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'flex-start',
									justifyContent: 'flex-start',
									gap: '12px',
									padding: '12px',
									boxSizing: 'border-box',
									color: theme[shape.props.color].solid,
									overflow: 'hidden',
									opacity: 1,
									transform: 'translateY(0)'
								}}
							>
								{tldrawHeaderImage && (
									<div
										style={{
											width: '100%',
											height: '80%',
											minHeight: '120px',
											borderRadius: '12px',
											overflow: 'hidden',
											background: collapsedDocInfo?.titleImgBackground || collapsedDocInfo?.titleImgColor || headerGradientFallback,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										{collapsedDocInfo?.titleImgHasUrl ? (
											<img
												src={collapsedDocInfo.titleImgSrc}
												style={{ width: '100%', height: '100%', objectFit: 'cover' }}
												alt={collapsedDocInfo.title || '文档'}
											/>
										) : null}
									</div>
								)}
								<div style={{
									width: '100%',
									display: 'flex',
									alignItems: 'center',
									gap: '8px',
									fontSize: `${Math.min(shape.props.w / 8, 28)}px`,
									fontWeight: 600,
									wordBreak: 'break-all',
								}}>
									<span style={{ display: 'flex', alignItems: 'center' }}>
										<svg width="20" height="20" style={{ marginRight: '6px' }}>
											<use xlinkHref="#iconFile"></use>
										</svg>
										{collapsedDocInfo?.title || '加载中...'}
									</span>
								</div>
							</div>
						) : (
							<div
								className="card-shape-collapsed-content"
								style={{
									width: '100%',
									height: '100%',
									display: 'flex',
									alignItems: 'center',
									justifyContent: collapsedTextAlign === 'right' ? 'flex-end' : collapsedTextAlign === 'center' ? 'center' : 'flex-start',
									padding: '10px 14px',
									boxSizing: 'border-box',
									gap: collapsedTextAlign === 'center' ? '0px' : '10px',
									position: 'relative',
									opacity: 1,
									transform: 'translateY(0)'
								}}>
								{/* 折叠图标 — 点击展开 */}
								<svg
									className="card-shape-collapsed-toggle-icon"
									width={Math.round(collapsedTextSize * 0.85)}
									height={Math.round(collapsedTextSize * 0.85)}
									viewBox="0 0 24 24"
									fill="none"
									stroke={theme[shape.props.color].solid}
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									style={{
										flexShrink: 0,
										cursor: 'pointer',
										...(collapsedTextAlign === 'center'
											? { position: 'absolute', left: '14px', zIndex: 1 }
											: {}),
									}}
									onClick={handleUncollapse}
									onPointerDown={(e) => e.stopPropagation()}
								>
									<title>点击展开</title>
									<polyline points="4 14 10 14 10 20"></polyline>
									<polyline points="20 10 14 10 14 4"></polyline>
									<line x1="14" y1="10" x2="21" y2="3"></line>
									<line x1="3" y1="21" x2="10" y2="14"></line>
								</svg>
								{/* 内容摘要文字 */}
								<span data-card-collapsed-text style={{
									flex: 1,
									minWidth: 0,
									fontSize: `${collapsedTextSize}px`,
									fontWeight: 500,
									color: theme[shape.props.color].solid,
									wordBreak: 'break-word',
									overflowWrap: 'anywhere',
									lineHeight: collapsedTextLineHeight,
									opacity: 0.85,
									textAlign: collapsedTextAlign as any,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									display: '-webkit-box',
									WebkitBoxOrient: 'vertical',
									WebkitLineClamp: collapsedTextLineClamp,
									maxHeight: `${collapsedTextLineClamp * collapsedTextSize * collapsedTextLineHeight}px`,
								}}>
									{collapsedText}
								</span>
							</div>
						)
					)}
					{shape.props.isNewlyCreated && !shape.props.blockId && !isEditingState && (
						<div style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: `${Math.min(shape.props.fontSize || 16, 20)}px`,
							padding: '16px',
							color: theme[shape.props.color].solid,
							opacity: 0.6,
							textAlign: 'center',
							userSelect: 'none',
						}}>
							双击编辑以创建笔记块
						</div>
					)}
					{/* 预览被限制（canLoad=false 且非编辑 && 未折叠）显示占位 */}
					{isSmallCard && !isCollapsed && (
						<div style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							padding: '6px',
							boxSizing: 'border-box',
							fontSize: '12px',
							fontWeight: 500,
							color: theme[shape.props.color].solid,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}>
							{shape.props.blockId ? '卡片' : '双击编辑'}
						</div>
					)}
					{!isEditingState && !isCollapsed && !canLoad && (
						<div style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: `${Math.min(shape.props.w / 6, shape.props.h / 2)}px`,
							padding: '8px',
							wordBreak: 'break-all',
							color: theme[shape.props.color].solid,
							textAlign: 'center',
							opacity: 0.4,
						}}>
							双击加载内容
						</div>
					)}
				</div>
				{!isEditingState && hasMissingLinkedBlock && (
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
							padding: '16px',
							background: 'rgba(127, 127, 127, 0.14)',
							backdropFilter: 'blur(2px)',
							pointerEvents: 'auto',
						}}
					>
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								gap: '12px',
								maxWidth: '100%',
								padding: '16px 18px',
								borderRadius: '12px',
								background: 'var(--b3-theme-background, #fff)',
								border: '1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12))',
								boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
								color: theme[shape.props.color].solid,
								textAlign: 'center',
							}}
						>
							<div style={{ fontSize: `${Math.min(fontSize, 16)}px`, fontWeight: 500 }}>
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
				<PortsOverlay shapeId={shape.id} />
			</HTMLContainer >
		)
	}

	// [7]
	indicator(shape: ICardShape) {
		return <rect width={shape.props.w} height={shape.props.h} />
	}

	// [8]
	override onResize(shape: ICardShape, info: TLResizeInfo<ICardShape>) {
		return resizeBox(shape, info)
	}

	override onResizeStart(shape: ICardShape) {
		beginBranchResize(this.editor, shape.id)
	}

	override onResizeEnd(_initialShape: ICardShape, currentShape: ICardShape) {
		endBranchResize(this.editor, currentShape.id)
	}

	override onResizeCancel(_initialShape: ICardShape, currentShape: ICardShape) {
		endBranchResize(this.editor, currentShape.id)
	}

	override onTranslateStart(shape: ICardShape) {
		draggingBranchCardIds.add(shape.id as string)
		beginBranchAttachmentDrag(this.editor, shape)
		setBranchInteractionHint(getBranchInteractionHintForShape(this.editor, shape))
	}

	override onTranslateEnd(_initial: ICardShape, currentShape: ICardShape) {
		draggingBranchCardIds.delete(currentShape.id as string)
		clearBranchInteractionHint(currentShape.id as string)
		updateBranchAttachmentAfterDrag(this.editor, currentShape)
	}

	override toSvg(shape: ICardShape, ctx: SvgExportContext): ReactElement | null {
		return exportCardShapeToSvg(shape, ctx, this.editor.getContainer())
	}

}
/* 
A utility class for the card shape. This is where you define the shape's behavior, 
how it renders (its component and indicator), and how it handles different events.

[1]
A validation schema for the shape's props (optional)
Check out card-shape-props.ts for more info.

[2]
Migrations for upgrading shapes (optional)
Check out card-shape-migrations.ts for more info.

[3]
Letting the editor know if the shape's aspect ratio is locked, and whether it 
can be resized or bound to other shapes. 

[4]
The default props the shape will be rendered with when click-creating one.

[5]
We use this to calculate the shape's geometry for hit-testing, bindings and
doing other geometric calculations. 

[6]
Render method — the React component that will be rendered for the shape. It takes the 
shape as an argument. HTMLContainer is just a div that's being used to wrap our text 
and button. We can get the shape's bounds using our own getGeometry method.
	
- [a] Check it out! We can do normal React stuff here like using setState.
   Annoying: eslint sometimes thinks this is a class component, but it's not.

- [b] You need to stop the pointer down event on buttons, otherwise the editor will
	   think you're trying to select drag the shape.

[7]
Indicator — used when hovering over a shape or when it's selected; must return only SVG elements here

[8]
Resize handler — called when the shape is resized. Sometimes you'll want to do some 
custom logic here, but for our purposes, this is fine.
*/
