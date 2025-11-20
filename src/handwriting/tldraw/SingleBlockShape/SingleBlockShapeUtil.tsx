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
	getDefaultColorTheme,
	resizeBox,
    AtomMap,
    EditorAtom,
} from '@tldraw/tldraw'
import { Protyle, showMessage } from 'siyuan'
import * as api from '@/api/api'
import { settingdata } from '@/index'
import { singleBlockShapeProps } from './single-block-shape-props'
import { singleBlockShapeMigrations } from './single-block-shape-migrations'
import { ISingleBlockShape } from './single-block-shape-types'
import { enqueueProtyleLoad, ProtyleLoadHandle } from '../protyle-load-queue'

let isCreatingBlock = false
let pendingCreationPromise: Promise<string> | null = null

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
const MIN_HEIGHT = 50

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
	}

	getDefaultProps(): ISingleBlockShape['props'] {
		return {
			w: 300,
			h: 50,
			color: 'black',
			blockId: '',
			fontSize: 22,
			refreshNonce: Date.now(),
			connectOnEnter: true,
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

	component(shape: ISingleBlockShape) {
		const editor = this.editor
		const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
		const isEditing = editor.getEditingShapeId() === shape.id
		const [isEditingState, setIsEditingState] = useState(isEditing)
		const [isInViewport, setIsInViewport] = useState(true)
		const isViewportCullingEnabled = settingdata['tldraw-viewport-culling'] !== false
		const containerRef = useRef<HTMLDivElement>(null)
		const protyleRef = useRef<Protyle | null>(null)
		const protyleHostRef = useRef<HTMLDivElement | null>(null)
		const detachKeyHandler = useRef<() => void>()
		const visibilityTimerRef = useRef<number | null>(null)
		const loadHandleRef = useRef<ProtyleLoadHandle | null>(null)
		const resizeObsRef = useRef<ResizeObserver | null>(null)
		const mutationObsRef = useRef<MutationObserver | null>(null)
		const imgListenersRef = useRef<Array<() => void>>([])
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

		// 以世界坐标的“预加载边距”来判断是否接近视口，避免 DOM 观察在复杂变换下不可靠
		const PRELOAD_MARGIN_WORLD = 1600

		const disconnectObservers = () => {
			try { resizeObsRef.current?.disconnect() } catch { }
			resizeObsRef.current = null
			try { mutationObsRef.current?.disconnect() } catch { }
			mutationObsRef.current = null
			for (const off of imgListenersRef.current) {
				try { off() } catch { }
			}
			imgListenersRef.current = []
		}

		const destroyRuntimeResources = useCallback(() => {
			detachKeyHandler.current?.()
			detachKeyHandler.current = undefined
			disconnectObservers()
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

		useEffect(() => {
			setIsEditingState(isEditing)
		}, [isEditing])

		// 计算并写入 DOM 尺寸（以内容高度为准，宽度沿用 props.w）
		const updateDomSize = useCallback(() => {
			// 优先测量 Protyle 的内容区域
			let target: HTMLElement | null = null
			if (protyleHostRef.current) {
				target = (protyleHostRef.current.querySelector('.protyle-wysiwyg') as HTMLElement) || protyleHostRef.current
			}
			if (!target && containerRef.current) target = containerRef.current
			if (!target) return

			const contentH = Math.ceil((target as HTMLElement).scrollHeight || (target as HTMLElement).offsetHeight || 0)
			const nextHeight = Math.max(contentH + BORDER_PX * 2, MIN_HEIGHT)
			const nextWidth = Math.max(shape.props.w, 1)
			SingleBlockSizes.update(editor, (map) => {
				const existing = map.get(shape.id)
				if (existing && existing.height === nextHeight && existing.width === nextWidth) return map
				return map.set(shape.id, { width: nextWidth, height: nextHeight })
			})
		}, [editor, shape.id, shape.props.w])

		// 在渲染和字体变化后尽快测量一次
		useLayoutEffect(() => {
			updateDomSize()
		})

		// 基于 tldraw 的世界坐标计算是否进入“预加载区”（视口外但在边距内）
		const updateVisibilityManual = useCallback(() => {
			if (!isViewportCullingEnabled) {
				setIsInViewport(true)
				return
			}
			const viewport = editor.getViewportPageBounds()
			const shapeBounds = editor.getShapePageBounds(shape.id)
			if (!viewport || !shapeBounds) return
			const expanded = {
				minX: viewport.minX - PRELOAD_MARGIN_WORLD,
				minY: viewport.minY - PRELOAD_MARGIN_WORLD,
				maxX: viewport.maxX + PRELOAD_MARGIN_WORLD,
				maxY: viewport.maxY + PRELOAD_MARGIN_WORLD,
			}
			const intersects =
				expanded.minX < shapeBounds.maxX &&
				expanded.maxX > shapeBounds.minX &&
				expanded.minY < shapeBounds.maxY &&
				expanded.maxY > shapeBounds.minY
			if (visibilityTimerRef.current !== null) {
				clearTimeout(visibilityTimerRef.current)
			}
			visibilityTimerRef.current = window.setTimeout(() => {
				visibilityTimerRef.current = null
				setIsInViewport((prev) => (prev === intersects ? prev : intersects))
			}, 100)
		}, [editor, isViewportCullingEnabled, shape.id])

		useEffect(() => {
			updateVisibilityManual()
			const id = window.setInterval(updateVisibilityManual, 200)
			return () => window.clearInterval(id)
		}, [updateVisibilityManual])

		useEffect(() => {
			const shouldRender = !isViewportCullingEnabled || isEditingState || isInViewport
			if (!shouldRender) {
				destroyRuntimeResources()
				return
			}

			const container = containerRef.current
			if (!container || !window.siyuan?.ws?.app) return

			let disposed = false

			const ensureBlockId = async (): Promise<string | null> => {
				let blockId = shape.props.blockId || container.getAttribute('blockid') || null
				if (blockId) return blockId

				const editorElement = container.closest('.tldraw__editor')
				const tldrawId = editorElement?.getAttribute('data-tldraw-id')
				const title = editorElement?.getAttribute('data-tldraw-title')
				if (!settingdata['tl-draw-create-note-id'] && !tldrawId) {
					showMessage('配置不完整,请检查设置')
					return null
				}

				if (isCreatingBlock && pendingCreationPromise) {
					try {
						blockId = await pendingCreationPromise
					} catch (err) {
						console.error('等待块创建失败', err)
					}
				} else if (!blockId) {
					isCreatingBlock = true
					try {
						pendingCreationPromise = (async () => {
							const idid = (await api.generateSiyuanID()) as string
							const link = `https://plugins/siyuan-steve-tools/?rootid=${tldrawId}&blockid=${idid}&title=${title}`
							const redata = await api.appendBlock(
								'markdown',
								`[*](${link})\n{: id="${idid}" custom-st-tldraw-single="1" }\n\n`,
								tldrawId!
							)
							return redata[0].doOperations[0].id as string
						})()
						blockId = await pendingCreationPromise
					} catch (err) {
						console.error('创建块失败', err)
					} finally {
						isCreatingBlock = false
						setTimeout(() => (pendingCreationPromise = null), 5000)
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
				return blockId
			}

			const setupObservers = () => {
				disconnectObservers()
				let target: HTMLElement | null = null
				if (protyleHostRef.current) {
					target = (protyleHostRef.current.querySelector('.protyle-wysiwyg') as HTMLElement) || protyleHostRef.current
				}
				if (!target) return
				try {
					resizeObsRef.current = new ResizeObserver(() => updateDomSize())
					resizeObsRef.current.observe(target)
				} catch { }
				try {
					mutationObsRef.current = new MutationObserver(() => updateDomSize())
					mutationObsRef.current.observe(target, { subtree: true, childList: true, attributes: true, characterData: true })
				} catch { }
				// 图片等资源加载后尺寸变化
				imgListenersRef.current = []
				target.querySelectorAll('img').forEach((img) => {
					const handler = () => updateDomSize()
					img.addEventListener('load', handler)
					imgListenersRef.current.push(() => img.removeEventListener('load', handler))
				})
				// 初始测量
				updateDomSize()
			}

			const mountProtyle = async (blockId: string, priority: number) => {
				if (disposed) return
				loadHandleRef.current?.cancel()
				const handle = enqueueProtyleLoad(shape.id, priority, async (signal) => {
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
					const protyleInstance = new Protyle(window.siyuan.ws.app, host, {
						blockId,
						render: {
							breadcrumb: false,
							gutter: true,
							title: false,
							breadcrumbDocName: false,
						},
						action: ['cb-get-all', 'cb-get-focus'],
						mode: 'wysiwyg',
						after(protyle) {
							protyle.protyle.wysiwyg.preventKeyup = true
							resolveReady && resolveReady()
						},
						click: {
							preventInsetEmptyBlock: true,
						},
						handleEmptyContent() {
							showMessage('块已被删除')
							if (!disposed && !signal.aborted) {
								editor.deleteShape(shape.id)
							}
						},
					})
					if (signal.aborted || disposed) {
						safeDestroyProtyle(protyleInstance)
						return
					}
					protyleRef.current = protyleInstance
					currentContainer.appendChild(host)
					if (protyleInstance.protyle?.wysiwyg?.element) {
						protyleInstance.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 16}px`
					}
					await readyPromise.catch(() => undefined)
					// 初始化观察与尺寸写入
					setupObservers()
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
				if (!isEditingState || !wys) return

				const handleKeyDown = (event: KeyboardEvent) => {
					if (event.isComposing) return
					// 处理 Escape：退出编辑模式
					if (event.key === 'Escape') {
						try {
							event.preventDefault()
							event.stopImmediatePropagation()
							event.stopPropagation()
							// ; (event as any).returnValue = false
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
							// IE fallback
							; (event as any).returnValue = false
					} catch (e) {
						// ignore
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
							},
						},
					])
					// 如果开启连接功能，尝试创建一条箭头指向新形状
					if (shape.props.connectOnEnter !== false) {
						try {
							const fromBounds = editor.getShapePageBounds(shape.id)
							const toBounds = editor.getShapePageBounds(newId)
							if (fromBounds && toBounds) {
								// 计算矩形边界上的附着点（从中心指向对方中心）
								const centerA = { x: fromBounds.midX, y: fromBounds.midY }
								const centerB = { x: toBounds.midX, y: toBounds.midY }
								const computeAttachPoint = (bounds: { minX: number; minY: number; maxX: number; maxY: number; midX: number; midY: number }, from: { x: number; y: number }, to: { x: number; y: number }) => {
									const dx = to.x - from.x
									const dy = to.y - from.y
									const candidates: Array<{ t: number; x: number; y: number }> = []
									if (dx !== 0) {
										const tLeft = (bounds.minX - from.x) / dx
										const yLeft = from.y + tLeft * dy
										if (tLeft > 0 && tLeft <= 1 && yLeft >= bounds.minY - 0.1 && yLeft <= bounds.maxY + 0.1) candidates.push({ t: tLeft, x: bounds.minX, y: yLeft })
										const tRight = (bounds.maxX - from.x) / dx
										const yRight = from.y + tRight * dy
										if (tRight > 0 && tRight <= 1 && yRight >= bounds.minY - 0.1 && yRight <= bounds.maxY + 0.1) candidates.push({ t: tRight, x: bounds.maxX, y: yRight })
									}
									if (dy !== 0) {
										const tTop = (bounds.minY - from.y) / dy
										const xTop = from.x + tTop * dx
										if (tTop > 0 && tTop <= 1 && xTop >= bounds.minX - 0.1 && xTop <= bounds.maxX + 0.1) candidates.push({ t: tTop, x: xTop, y: bounds.minY })
										const tBottom = (bounds.maxY - from.y) / dy
										const xBottom = from.x + tBottom * dx
										if (tBottom > 0 && tBottom <= 1 && xBottom >= bounds.minX - 0.1 && xBottom <= bounds.maxX + 0.1) candidates.push({ t: tBottom, x: xBottom, y: bounds.maxY })
									}
									if (!candidates.length) return from // fallback to center
									candidates.sort((a, b) => a.t - b.t)
									return { x: candidates[0].x, y: candidates[0].y }
								}
								const startAbs = computeAttachPoint(fromBounds, centerA, centerB)
								const endAbs = computeAttachPoint(toBounds, centerB, centerA)
								const minX = Math.min(startAbs.x, endAbs.x)
								const minY = Math.min(startAbs.y, endAbs.y)
								const arrowId = createShapeId()
								editor.createShapes([
									{
										id: arrowId,
										type: 'arrow',
										x: minX,
										y: minY,
										props: {
											color: shape.props.color,
											start: { x: startAbs.x - minX, y: startAbs.y - minY },
											end: { x: endAbs.x - minX, y: endAbs.y - minY },
											arrowheadStart: 'none',
											arrowheadEnd: 'arrow',
											bend: 0,
											dash: 'draw',
											size: 'm',
										},
									} as any,
								])
							}
						} catch (err) {
							console.warn('connectOnEnter arrow creation failed', err)
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

				// Use non-passive capture listeners so we can reliably prevent default actions
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

			const applyFontSize = () => {
				const fontSize = `${shape.props.fontSize || 16}px`
				if (protyleRef.current?.protyle?.wysiwyg?.element) {
					protyleRef.current.protyle.wysiwyg.element.style.fontSize = fontSize
				}
			}

			const setup = async () => {
				const blockId = await ensureBlockId()
				if (!blockId || disposed) return
				const loadPriority = isEditingState ? 0 : 1

				if (!protyleRef.current) {
					await mountProtyle(blockId, loadPriority)
				} else if (protyleRef.current?.protyle?.block?.parent?.id !== blockId) {
					try {
						protyleRef.current?.destroy()
					} catch (err) {
						console.error(err)
					}
					protyleRef.current = null
					protyleHostRef.current?.remove()
					await mountProtyle(blockId, loadPriority)
				}

				if (isEditingState) {
					protyleRef.current?.enable()
				} else {
					// When leaving edit mode, destroy the Protyle instance but keep a static DOM copy
					if (protyleRef.current) {
						try {
							const host = protyleHostRef.current
							if (host && host.parentElement) {
								const staticHost = document.createElement('div')
								staticHost.style.width = host.style.width || '100%'
								staticHost.style.height = host.style.height || '100%'
								staticHost.style.overflow = host.style.overflow || 'hidden'
								// copy innerHTML so the visual content remains
								staticHost.innerHTML = host.innerHTML
								host.parentElement.replaceChild(staticHost, host)
								protyleHostRef.current = staticHost
							}
							try { protyleRef.current.destroy() } catch (e) { }
						} catch (err) {
							console.error('销毁 Protyle 时出错', err)
						}
						protyleRef.current = null
						// 静态 DOM 也需要尺寸监听
						setupObservers()
					} else {
						// no protyle instance, nothing to do
					}
				}

				applyFontSize()
				registerKeyHandler()
			}

			setup()

			return () => {
				disposed = true
				destroyRuntimeResources()
			}
		}, [destroyRuntimeResources, isEditingState, isInViewport, isViewportCullingEnabled, shape.id, shape.props.blockId, shape.props.refreshNonce])

		useEffect(() => {
			if (protyleRef.current?.protyle?.wysiwyg?.element) {
				protyleRef.current.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 20}px`;
			} else if (containerRef.current) {
				const wys = containerRef.current.querySelector(".protyle-wysiwyg");
				if (wys) (wys as HTMLElement).style.fontSize = `${shape.props.fontSize || 20}px`;
			}
			// 字号变化可能导致高度变化
			updateDomSize()
		}, [shape.props.fontSize]);

		const handleDoubleClick = (e: React.MouseEvent) => {
			if (!isEditingState) {
				e.stopPropagation()
				editor.setEditingShape(shape.id)
				setIsEditingState(true)
			}
		}

		const handlePointerEvent = (e: React.PointerEvent) => {
			if (isEditingState) {
				e.stopPropagation()
			}
		}

		return (
			<HTMLContainer
				id={shape.id}
				style={{
					display: 'flex',
					flexDirection: 'column',
					backgroundColor: theme[shape.props.color].semi,
					color: theme[shape.props.color].solid,
					position: 'relative',
					isolation: 'isolate',
					pointerEvents: isEditingState ? 'auto' : 'none',
					width: '100%',
					height: '100%',
					overflow: 'auto',
					boxShadow: isEditingState ? '0 0 0 2px #3d8aff' : 'none',
					cursor: isEditingState ? 'text' : 'default',
					padding: 0,
					border: `${BORDER_PX}px solid ${theme[shape.props.color].solid}`,
					borderRadius: '10px',
				}}
				onDoubleClick={handleDoubleClick}
				onPointerDown={handlePointerEvent}
				onPointerMove={handlePointerEvent}
				onPointerUp={handlePointerEvent}
			>
				<div
					ref={containerRef}
					blockid={shape.props.blockId}
					style={{
						width: '100%',
						height: '100%',
						overflow: 'hidden',
						pointerEvents: isEditingState ? 'all' : 'none',
						touchAction: isEditingState ? 'auto' : 'none',
						contain: 'strict',
						padding: '0px',
					}}
				/>
			</HTMLContainer>
		)
	}

	indicator(shape: ISingleBlockShape) {
		const { width, height } = this.editor.getShapeGeometry(shape).bounds
		return <rect width={width} height={height} />
	}

	override onResize(shape: ISingleBlockShape, info: TLResizeInfo<ISingleBlockShape>) {
		return resizeBox(shape, info)
	}

	override toSvg(shape: ISingleBlockShape, ctx: SvgExportContext): ReactElement | null {
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		const { w, h: hProp, color, fontSize = 16, blockId } = shape.props
		const border = BORDER_PX
		const radius = 10
		const strokeColor = theme[color].solid
		const fillColor = theme[color].semi
		let serialized = ''

		const size = SingleBlockSizes.get(this.editor).get(shape.id)
		const h = size?.height ?? hProp

		// Clamp inner dimensions to avoid negative <foreignObject> size during export
		const innerW = Math.max(w - border * 2, 1)
		const innerH = Math.max(h - border * 2, 1)

		const binaryToBase64 = (binary: string) => {
			let base64 = ''
			const chunkSize = 0x6000
			for (let i = 0; i < binary.length; i += chunkSize) {
				const slice = binary.slice(i, i + chunkSize)
				let normalized = ''
				for (let j = 0; j < slice.length; j++) {
					normalized += String.fromCharCode(slice.charCodeAt(j) & 0xff)
				}
				base64 += btoa(normalized)
			}
			return base64
		}

		const assetToDataUrl = (rawSrc: string | null) => {
			if (!rawSrc) return ''
			const trimmed = rawSrc.trim()
			if (!trimmed || /^data:/i.test(trimmed) || /^https?:/i.test(trimmed) || trimmed.startsWith('//')) return trimmed
			let logicalPath = trimmed.replace(/^\.\//, '')
			if (logicalPath.startsWith('/')) logicalPath = logicalPath.slice(1)
			let kernelPath = ''
			if (logicalPath.startsWith('assets/')) kernelPath = `/data/${logicalPath}`
			else if (logicalPath.startsWith('data/')) kernelPath = `/${logicalPath}`
			else if (logicalPath.startsWith('/data/')) kernelPath = logicalPath
			else return trimmed
			try {
				const xhr = new XMLHttpRequest()
				xhr.open('POST', '/api/file/getFile', false)
				xhr.overrideMimeType('text/plain; charset=x-user-defined')
				xhr.setRequestHeader('Content-Type', 'application/json')
				xhr.send(JSON.stringify({ path: kernelPath }))
				if (xhr.status >= 200 && xhr.status < 300 && typeof xhr.responseText === 'string') {
					const base64 = binaryToBase64(xhr.responseText)
					const ext = (logicalPath.split('.').pop() || 'png').toLowerCase()
					const mimeMap: Record<string, string> = {
						png: 'image/png',
						jpg: 'image/jpeg',
						jpeg: 'image/jpeg',
						gif: 'image/gif',
						webp: 'image/webp',
						svg: 'image/svg+xml',
						bmp: 'image/bmp',
						ico: 'image/x-icon',
						avif: 'image/avif',
					}
					const mime = mimeMap[ext] || 'image/png'
					return `data:${mime};base64,${base64}`
				}
			} catch (err) {
				console.warn('Embedding asset failed', err)
			}
			return trimmed
		}

		const serializeContent = () => {
			if (typeof document === 'undefined') return ''
			const host = document.getElementById(shape.id)
			if (!host) return ''
			const content = host.querySelector('[blockid]') as HTMLElement | null
			if (!content) return ''
			const clone = content.cloneNode(true) as HTMLElement

			const inlineComputedStyles = (source: Element, target: Element) => {
				const computed = window.getComputedStyle(source)
				const styleText = Array.from(computed)
					.map((prop) => `${prop}:${computed.getPropertyValue(prop)};`)
					.join('')
				const existing = target.getAttribute('style') || ''
				target.setAttribute('style', `${styleText}${existing}`)
				const sourceChildren = Array.from(source.children)
				const targetChildren = Array.from(target.children)
				for (let i = 0; i < sourceChildren.length; i++) {
					const srcChild = sourceChildren[i]
					const tgtChild = targetChildren[i]
					if (srcChild && tgtChild) {
						inlineComputedStyles(srcChild, tgtChild)
					}
				}
			}

			inlineComputedStyles(content, clone)
			clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))
			clone.querySelectorAll('[data-node-id]').forEach((el) => el.removeAttribute('data-node-id'))
			clone.querySelectorAll('[data-node-index]').forEach((el) => el.removeAttribute('data-node-index'))
			clone.querySelectorAll('[updated]').forEach((el) => el.removeAttribute('updated'))
			clone.querySelectorAll('[data-realwidth]').forEach((el) => el.removeAttribute('data-realwidth'))
			clone.querySelectorAll('[data-readonly]').forEach((el) => el.removeAttribute('data-readonly'))
			clone.querySelectorAll('*').forEach((node) => {
				if (node instanceof HTMLElement) {
					node.style.setProperty('scrollbar-width', 'none', 'important')
					node.style.setProperty('ms-overflow-style', 'none', 'important')
					node.style.setProperty('overscroll-behavior', 'contain')
				}
			})
			clone.querySelectorAll('img').forEach((img) => {
				const embedded = assetToDataUrl(img.getAttribute('src'))
				if (embedded) {
					img.setAttribute('src', embedded)
					img.removeAttribute('crossorigin')
				}
				const srcset = img.getAttribute('srcset')
				if (srcset) {
					const resolvedSet = srcset
						.split(',')
						.map((entry) => {
							const [url, descriptor] = entry.trim().split(/\s+/, 2)
							const resolved = assetToDataUrl(url)
							return resolved ? (descriptor ? `${resolved} ${descriptor}` : resolved) : ''
						})
						.filter(Boolean)
						.join(', ')
					if (resolvedSet) img.setAttribute('srcset', resolvedSet)
					else img.removeAttribute('srcset')
				}
			})
			clone.querySelectorAll('source').forEach((sourceEl) => {
				const src = sourceEl.getAttribute('src')
				const resolved = assetToDataUrl(src)
				if (resolved) {
					sourceEl.setAttribute('src', resolved)
					sourceEl.removeAttribute('crossorigin')
				}
				const srcset = sourceEl.getAttribute('srcset')
				if (srcset) {
					const resolvedSet = srcset
						.split(',')
						.map((entry) => {
							const [url, descriptor] = entry.trim().split(/\s+/, 2)
							const result = assetToDataUrl(url)
							return result ? (descriptor ? `${result} ${descriptor}` : result) : ''
						})
						.filter(Boolean)
						.join(', ')
					if (resolvedSet) sourceEl.setAttribute('srcset', resolvedSet)
					else sourceEl.removeAttribute('srcset')
				}
			})
			clone.style.width = `${Math.max(innerW, 1)}px`
			clone.style.height = `${Math.max(innerH, 1)}px`
			clone.style.pointerEvents = 'none'
			clone.style.overflow = 'hidden'
			clone.style.fontSize = `${fontSize}px`
			clone.style.boxSizing = 'border-box'
			return clone.outerHTML
		}

		serialized = serializeContent()
		const containerAttrSelector = `[data-sb-id="${shape.id}"]`
		const hideScrollbarStyle = serialized
			? `<style xmlns="http://www.w3.org/1999/xhtml">${containerAttrSelector} *::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}${containerAttrSelector} *::-webkit-scrollbar-thumb{display:none!important;}${containerAttrSelector} *{scrollbar-width:none!important;}${containerAttrSelector} .protyle-wysiwyg{position:relative;padding:0 0 0 8px!important;}</style>`
			: ''

		return (
			<g>
				<rect width={w} height={h} fill={fillColor} stroke={strokeColor} strokeWidth={border} rx={radius} ry={radius} />
				{serialized ? (
					<foreignObject x={border} y={border} width={Math.max(innerW, 1)} height={Math.max(innerH, 1)}>
						<div
							xmlns="http://www.w3.org/1999/xhtml"
							data-sb-id={shape.id}
							style={{ width: '100%', height: '100%', overflow: 'hidden', fontSize: `${fontSize}px` }}
							dangerouslySetInnerHTML={{ __html: `${hideScrollbarStyle}${serialized}` }}
						/>
					</foreignObject>
				) : (
					<text x={w / 2} y={h / 2} fill={strokeColor} fontSize={fontSize * 0.9} dominantBaseline="middle" textAnchor="middle">
						{blockId ? `Block ${blockId.slice(-6)}` : 'Single Block'}
					</text>
				)}
			</g>
		)
	}
}
