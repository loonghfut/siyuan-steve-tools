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
	BindingUtil,
	TLBaseBinding,
	BindingOnShapeChangeOptions,
	Box,
	invLerp,
	lerp,
	VecModel,
} from '@tldraw/tldraw'
import { Protyle, showMessage, TProtyleAction } from 'siyuan'
import * as api from '@/api/api'
import { settingdata } from '@/index'
import { singleBlockShapeProps } from './single-block-shape-props'
import { singleBlockShapeMigrations } from './single-block-shape-migrations'
import { ISingleBlockShape } from './single-block-shape-types'
import { enqueueProtyleLoad, ProtyleLoadHandle } from '../protyle-load-queue'
import { shapeLoadManager } from '../shape-load-manager'
import { PortsOverlay } from '../BezierConnectorShape/Port'
import { createArrowBetweenShapes } from '../utils/addConnectedSingleBlock'

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

	override canBind() {
		return true
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

	component(shape: ISingleBlockShape) {
		const editor = this.editor
		const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
		const isEditing = editor.getEditingShapeId() === shape.id
		const [isEditingState, setIsEditingState] = useState(isEditing)
		const [isInViewport, setIsInViewport] = useState(true)
		const [canLoad, setCanLoad] = useState(true)
 		const [isHovered, setIsHovered] = useState(false)
		const isViewportCullingEnabled = settingdata['tldraw-viewport-culling'] !== false
		const containerRef = useRef<HTMLDivElement>(null)
		// 保存进入编辑前的相机状态，用于退出编辑后恢复视角
		const prevCameraRef = useRef<any | null>(null)
		const hadFocusedRef = useRef(false)
		const protyleRef = useRef<Protyle | null>(null)
		const protyleHostRef = useRef<HTMLDivElement | null>(null)
		const detachKeyHandler = useRef<() => void>()
		// 全局由 shapeLoadManager 计算可见性，无需本地定时轮询
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
					console.log('聚焦到形状:', shape.id)
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
			const borderPx = shape.props.transparentBackground ? 0 : BORDER_PX
			const nextHeight = Math.max(contentH + borderPx * 2, MIN_HEIGHT)
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

		useEffect(() => {
			const shouldRender = !isViewportCullingEnabled || isEditingState || (isInViewport && canLoad)
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

				// 如果该形状刚创建（isNewlyCreated === true），且当前并非处于编辑态，则不在此时创建块。
				// 我们将把 isNewlyCreated 置为 false，等待用户进入编辑态时再触发创建（保持与 card 行为一致）。
				// 如果是新创建的 shape，则只有在进入编辑态时才把 isNewlyCreated 置为 false 并继续执行
				if (shape.props.isNewlyCreated) {
					// 未进入编辑态则直接跳过创建流程
					if (!isEditingState) {
						return null
					}
					// 在编辑态时标记为已处理（isNewlyCreated = false），之后才继续创建块
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
					// 防止 Protyle 无法正常触发 `after` 导致永远等待，增加超时与异常保护
					let readyTimeoutId: number | null = null
					const READY_TIMEOUT_MS = 1000
					const timeoutPromise = new Promise<void>((resolve) => {
						readyTimeoutId = window.setTimeout(resolve, READY_TIMEOUT_MS)
					})
					const readyWithTimeout = Promise.race([readyPromise, timeoutPromise])
					let protyleInstance: Protyle | null = null
					try {
						const actions = ['cb-get-all', ...(isEditingState ? ['cb-get-focus'] : [])] as TProtyleAction[]
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
								showMessage('块已被删除')
								if (!disposed && !signal.aborted) {
									editor.deleteShape(shape.id)
								}
							},
						})
					} catch (err) {
						console.error('Protyle 构造失败', err)
						// 若构造失败，确保不会阻塞队列并清理宿主
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
					// 等待 Protyle 就绪，但有超时保护，避免死等导致加载队列阻塞
					await readyWithTimeout.catch(() => undefined)
					if (readyTimeoutId) {
						clearTimeout(readyTimeoutId)
						readyTimeoutId = null
					}
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
								connectOnEnter: shape.props.connectOnEnter,
							},
						},
					])
					// 如果开启连接功能，创建一条绑定的箭头或曲线指向新形状
					if (shape.props.connectOnEnter !== false) {
						try {
							const createdShape = editor.getShape(newId)
							if (createdShape && createdShape.type === 'single-block') {
								// 延迟到刚刚创建的 shape 可用后，再创建连接
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
		}, [destroyRuntimeResources, isEditingState, isInViewport, isViewportCullingEnabled, shape.id, shape.props.blockId, shape.props.refreshNonce, canLoad])

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


		const handlePointerEvent = (e: React.PointerEvent) => {
			if (isEditingState) {
				e.stopPropagation()
			}
		}

		// 计算当前是否需要绘制边框
		const borderPx = shape.props.transparentBackground ? 0 : BORDER_PX

		return (
			<HTMLContainer
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				id={shape.id}
				style={{
					display: 'flex',
					flexDirection: 'column',
					backgroundColor: shape.props.transparentBackground ? 'transparent' : theme[shape.props.color].semi,
					color: theme[shape.props.color].solid,
					position: 'relative',
					isolation: 'isolate',
					// Always allow pointer events at the container level so hover can be detected
					// (used to reveal connector ports even when not editing). The inner content
					// will still prevent interaction when not in edit mode.
					pointerEvents: 'auto',
					width: '100%',
					height: '100%',
					overflow: 'visible', // 改为 visible 以显示端口
					boxShadow: isEditingState ? '0 0 0 2px #3d8aff' : 'none',
					cursor: isEditingState ? 'text' : 'default',
					padding: 0,
					border: shape.props.transparentBackground ? 'none' : `${borderPx}px solid ${theme[shape.props.color].solid}`,
					borderRadius: '10px',
				}}
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
						overflow: 'auto', // 内容区域可滚动
						// Prevent content interactions when not editing to avoid blocking
						// TL editor pointer handling. The overlay itself can still react
						// to hover because HTMLContainer has pointer-events enabled.
						pointerEvents: isEditingState ? 'all' : 'none',
						touchAction: isEditingState ? 'auto' : 'none',
						contain: 'strict',
						padding: '0px',
					}}
				>
					{!isEditingState && !canLoad && (
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
				</div>
				{/* 端口覆盖层 - 用于贝塞尔连接器 */}
				{/* 在透明模式下不显示端点（PortsOverlay） */}
				{!shape.props.transparentBackground && (
					<PortsOverlay shapeId={shape.id} parentHovered={isHovered} />
				)}
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

	override onTranslateStart(shape: ISingleBlockShape) {
		const bindings = this.editor.getBindingsFromShape(shape, 'single-block')
		this.editor.deleteBindings(bindings)
	}

	override onTranslateEnd(_initial: ISingleBlockShape, currentShape: ISingleBlockShape) {
        // 如果当前 shape 标记为不允许绑定，则跳过创建绑定
        if (currentShape.props.allowBinding === false) return
		const pageAnchor = this.editor.getShapePageTransform(currentShape).applyToPoint({ x: 0, y: 0 })
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
		const { w, h: hProp, color, fontSize = 16, blockId } = shape.props
		const border = shape.props.transparentBackground ? 0 : BORDER_PX
		const radius = 10
		const strokeColor = shape.props.transparentBackground ? 'none' : theme[color].solid
		const fillColor = shape.props.transparentBackground ? 'none' : theme[color].semi
		const textColor = theme[color].solid
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
				{border > 0 ? (
					<rect width={w} height={h} fill={fillColor} stroke={strokeColor} strokeWidth={border} rx={radius} ry={radius} />
				) : (
					// 保持形状几何但不绘制填充与边框
					<rect width={w} height={h} fill="none" stroke="none" strokeWidth={0} rx={radius} ry={radius} />
				)}
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
					<text x={w / 2} y={h / 2} fill={textColor} fontSize={fontSize * 0.9} dominantBaseline="middle" textAnchor="middle">
						{blockId ? `Block ${blockId.slice(-6)}` : 'Single Block'}
					</text>
				)}
			</g>
		)
	}
}

// ===== Single Block Binding =====
type SingleBlockBinding = TLBaseBinding<
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
