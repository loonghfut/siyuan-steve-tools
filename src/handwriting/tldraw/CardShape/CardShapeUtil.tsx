import React, { ReactElement, useCallback, useEffect, useRef, useState } from 'react'
import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	SvgExportContext,
	TLResizeInfo,
	getDefaultColorTheme,
	resizeBox,
} from '@tldraw/tldraw'
import { cardShapeMigrations } from './card-shape-migrations'
import { cardShapeProps } from './card-shape-props'
import { CardRenderMode, ICardShape } from './card-shape-types'
import { Protyle, showMessage, TProtyleAction } from 'siyuan';
import * as api from '@/api/api';
import { settingdata } from '@/index';
import { buildTldrawLink } from '../utils/link-builder';
import { enqueueProtyleLoad, ProtyleLoadHandle } from '../protyle-load-queue'
import { shapeLoadManager } from '../shape-load-manager'
import { PortsOverlay } from '../BezierConnectorShape/Port'
import { renderAllContent } from '../utils/render/content-renderer'

let isCreatingBlock = false;
// 仅用于并发创建控制，不再缓存最近创建的块ID
let pendingCreationPromise: Promise<string> | null = null;

// 静态预览 DOM 缓存：避免重复请求
const staticPreviewCache = new Map<string, { html: string; fontSize: number }>();
const MAX_CACHE_SIZE = 50;

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

// 使用 getHeadingChildrenDOM API 获取静态 DOM 内容
async function fetchStaticDomContent(blockId: string): Promise<string | null> {
	try {
		const res = await api.getHeadingChildrenDOM(blockId);
		// getHeadingChildrenDOM 直接返回 DOM 字符串
		if (res) {
			return res;
		}
		return null;
	} catch (err) {
		console.error('获取静态 DOM 内容失败:', err);
		return null;
	}
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

// 关键样式属性列表（优化样式内联性能）
const CRITICAL_STYLE_PROPS = [
	'color', 'background-color', 'background', 'font-size', 'font-family', 'font-weight',
	'line-height', 'text-align', 'padding', 'margin', 'border', 'display', 'flex-direction',
	'align-items', 'justify-content', 'width', 'height', 'max-width', 'max-height',
	'overflow', 'white-space', 'word-break', 'opacity', 'visibility'
];


export class CardShapeUtil extends ShapeUtil<ICardShape> {
	static override type = 'card' as const
	// [1]
	static override props = cardShapeProps
	// [2]
	static override migrations = cardShapeMigrations

	// [3]
	override canCull(_shape: ICardShape) {
		return false
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
	}

	getDefaultProps(): ICardShape['props'] {
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
		}
	}

	// [5]
	getGeometry(shape: ICardShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}
	// [6]
	component(shape: ICardShape) {
		// const bounds = this.editor.getShapeGeometry(shape).bounds
		const theme = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
		const isEditing = this.editor.getEditingShapeId() === shape.id;
		const [isEditingState, setIsEditingState] = useState(isEditing);
		const [isInViewport, setIsInViewport] = useState(true);
		const [canLoad, setCanLoad] = useState(true); // gating heavy render by global manager
		const [isHovered, setIsHovered] = useState(false);
		const isViewportCullingEnabled = settingdata['tldraw-viewport-culling'] !== false;
		const tldrawHeaderImage = settingdata['tldraw-header-image'] !== false;
		const [collapsedText, setCollapsedText] = useState<string>('加载中...');
		const isCollapsed = shape.props.isCollapsed || false;
		const isMainCard = Boolean(shape.props.isMain);

		// 计算有效渲染模式（不使用 useMemo，确保每次渲染都读取最新的全局设置）
		const globalRenderMode: Exclude<CardRenderMode, 'inherit'> =
			settingdata["card-render-mode"] === 'live-protyle' ? 'live-protyle' : 'static-dom';
		const effectiveRenderMode: Exclude<CardRenderMode, 'inherit'> =
			shape.props.renderMode === 'inherit' || !shape.props.renderMode
				? globalRenderMode
				: (shape.props.renderMode as Exclude<CardRenderMode, 'inherit'>);

		// 缓存 blockId 以减少属性访问
		const blockId = shape.props.blockId;
		const fontSize = shape.props.fontSize || 16;

		// 追踪上一次的编辑状态，用于检测编辑->非编辑的切换
		const prevIsEditingRef = useRef(isEditingState);
		const refreshNonceRef = useRef(shape.props.refreshNonce);


		// 仅在编辑时创建 Protyle 实例
		const protyleRef = useRef<Protyle | null>(null)
		// Protyle 的承载元素（脱离 containerRef 创建，再 append 进去）
		const protyleHostRef = useRef<HTMLDivElement | null>(null)
		// 非编辑态下的静态预览节点（由 Protyle contentElement 克隆而来）
		const staticPreviewRef = useRef<HTMLElement | null>(null)
		// 防止重复销毁：为每个 Protyle 实例设置一个已销毁标记
		const DESTROYED_MARK = '__st_destroyed__'
		const safeDestroyProtyle = (pt: Protyle | null | undefined) => {
			if (!pt) return
			const anyPt = pt as any
			if (anyPt[DESTROYED_MARK]) return
			try { pt.destroy() } catch { }
			anyPt[DESTROYED_MARK] = true
		}
		// 全局由 shapeLoadManager 计算可见性，无需本地定时轮询
		const loadHandleRef = useRef<ProtyleLoadHandle | null>(null)

		const destroyRuntimeResources = useCallback(() => {
			if (loadHandleRef.current) {
				loadHandleRef.current.cancel()
				loadHandleRef.current = null
			}
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
		}, [])


		const containerRef = useRef<HTMLDivElement>(null)
		// 保存进入编辑前的相机状态，用于退出编辑后恢复视角
		const prevCameraRef = useRef<any | null>(null)
		const hadFocusedRef = useRef(false)


		useEffect(() => {
			setIsEditingState(isEditing);
		}, [isEditing]);

		// 检测编辑状态变化：从编辑 -> 非编辑时，使静态预览缓存失效
		useEffect(() => {
			const wasEditing = prevIsEditingRef.current;
			prevIsEditingRef.current = isEditingState;

			// 从编辑状态退出时，使该 blockId 的缓存失效，确保下次使用最新内容
			if (wasEditing && !isEditingState && blockId) {
				invalidatePreviewCache(blockId);
			}
		}, [isEditingState, blockId]);

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
					console.log('聚焦到Card形状:', shape.id);
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
			// console.log('大苏打发')
			return () => clearTimeout(timer)
		}, [isEditing, shape.id])

		// 折叠状态下获取块的 markdown 内容并截取前10个字
		useEffect(() => {
			if (isCollapsed && shape.props.blockId) {
				api.getBlockByID(shape.props.blockId).then((res) => {
					if (res && res.content) {
						// 移除 markdown 标记和链接，只保留纯文本
						const plainText = res.content
							.replace(/\[🔗\]\([^)]+\)/g, '') // 移除链接
							.replace(/^#+\s+/gm, '') // 移除标题标记
							.replace(/\{:[^}]+\}/g, '') // 移除属性
							.trim();
						const preview = plainText.slice(0, 10) + (plainText.length > 10 ? '...' : '');
						setCollapsedText(preview || '空块');
					} else {
						setCollapsedText('空块');
					}
				}).catch(() => {
					setCollapsedText('加载失败');
				});
			}
		}, [isCollapsed, shape.props.blockId]);



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
						if (!cancelled && !exists) {
							showMessage('块不存在,已被删除');
							this.editor.deleteShape(shape.id);
						}
					});
					return () => { cancelled = true; };
				}
			}
		}, [isEditingState, blockId]);
		// Protyle 生命周期管理主 Effect
		// 注意：对于 live-protyle 模式，编辑状态切换不应触发重建
		useEffect(() => {
			const shouldForceReloadLiveProtyle =
				effectiveRenderMode === 'live-protyle' &&
				refreshNonceRef.current !== shape.props.refreshNonce;
			refreshNonceRef.current = shape.props.refreshNonce;
			// 折叠状态下不渲染 Protyle
			if (isCollapsed && !isEditingState) {
				destroyRuntimeResources();
				return;
			}

			const shouldRender = !isViewportCullingEnabled || isEditingState || (isInViewport && canLoad);
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
			const waitForProtyleRendered = async (pt: Protyle, timeout = 800) => {
				const ce = pt.protyle?.contentElement as HTMLElement | undefined;
				if (!ce) return;
				if (ce.childElementCount > 0) {
					await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
					return;
				}
				await new Promise<void>((resolve) => {
					let done = false;
					const finish = () => {
						if (done) return; done = true; resolve();
					};
					const obs = new MutationObserver(() => {
						if (ce.childElementCount > 0) {
							obs.disconnect();
							requestAnimationFrame(() => requestAnimationFrame(finish));
						}
					});
					obs.observe(ce, { childList: true, subtree: true });
					setTimeout(() => { try { obs.disconnect(); } catch { } finish(); }, timeout);
				});
			};

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
					if (isCreatingBlock && pendingCreationPromise) {
						try {
							currentBlockId = await pendingCreationPromise;
						} catch (e) {
							console.error('等待块创建失败', e);
						}
						if (cancelled) return null;
					} else if (!currentBlockId) {
						isCreatingBlock = true;
						try {
							pendingCreationPromise = (async () => {
								const idid = await api.generateSiyuanID() as string;
								const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
								const link = buildTldrawLink(tldrawId, idid, title);
								// 将链接保存到自定义属性中
								const content =
									'###### ' + timestamp +
									'\n' +
									'{: id="' + idid + '" custom-st-tldraw="1" custom-tldraw-link="' + link + '" }' +
									'\n\n' +
									'{: custom-st-tldraw-none="1" }' +
									'\n';
								const redata = await api.appendBlock("markdown", content, tldrawId!);
								const newBlockId = redata[0].doOperations[0].id;
								return newBlockId;
							})();
							currentBlockId = await pendingCreationPromise;
							if (cancelled) return null;
						} catch (err) {
							console.error('创建块失败', err);
						} finally {
							isCreatingBlock = false;
							setTimeout(() => (pendingCreationPromise = null), 5000);
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
								breadcrumb: shape.props.isMain,
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
								showMessage('块已被删除');
							},
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

			// 从 Protyle 实例克隆静态预览 - 用于文档块(isMain)的静态渲染
			const useStaticPreviewFromProtyle = async (forceRefresh = false) => {
				if (!isMainCard) return;
				if (!protyleRef.current || cancelled) return;
				const ce = protyleRef.current.protyle?.contentElement as HTMLElement | undefined;
				if (!ce) return;

				// 检查缓存（如果非强制刷新）
				const currentBlockId = containerRef.current?.getAttribute('blockid') || blockId;
				if (!forceRefresh && currentBlockId) {
					const cachedHtml = getCachedPreview(currentBlockId, fontSize);
					if (cachedHtml) {
						// 使用缓存的预览
						if (staticPreviewRef.current?.parentElement === containerRef.current) {
							containerRef.current.removeChild(staticPreviewRef.current);
						}
						const wrapper = document.createElement('div');
						wrapper.innerHTML = cachedHtml;
						const clone = wrapper.firstElementChild as HTMLElement;
						if (clone && containerRef.current) {
							if (protyleHostRef.current?.parentElement === containerRef.current) {
								try { containerRef.current.removeChild(protyleHostRef.current); } catch { }
							}
							staticPreviewRef.current = clone;
							containerRef.current.appendChild(clone);
							await renderAllContent(clone);
							// 清理 Protyle
							if (protyleHostRef.current?.parentElement) {
								protyleHostRef.current.parentElement.removeChild(protyleHostRef.current);
							}
							try { safeDestroyProtyle(protyleRef.current); } catch { }
							protyleRef.current = null;
							protyleHostRef.current = null;
							if (cancelled) return;
							return;
						}
					}
				}

				// 保险起见，再等待一次渲染完成
				await waitForProtyleRendered(protyleRef.current);
				if (cancelled) return;
				// 克隆只读 DOM
				if (staticPreviewRef.current?.parentElement === containerRef.current) {
					containerRef.current.removeChild(staticPreviewRef.current);
				}
				const clone = ce.cloneNode(true) as HTMLElement;
				clone.style.width = '100%';
				clone.style.height = '100%';
				clone.style.overflow = 'auto';
				clone.style.fontSize = `${fontSize}px`;

				// 缓存原始 DOM HTML（渲染前）
				if (currentBlockId) {
					cacheStaticPreview(currentBlockId, clone.outerHTML, fontSize);
				}

				// 渲染所有内容类型（公式、图表等）需要依赖已挂载的 DOM，先挂载再渲染
				if (containerRef.current) {
					if (protyleHostRef.current?.parentElement === containerRef.current) {
						try { containerRef.current.removeChild(protyleHostRef.current); } catch { }
					}
					staticPreviewRef.current = clone;
					containerRef.current.appendChild(clone);
					await renderAllContent(clone);
				}

				// 清理 Protyle host
				if (protyleHostRef.current?.parentElement) {
					protyleHostRef.current.parentElement.removeChild(protyleHostRef.current);
				}
				// 销毁 Protyle 实例
				try { safeDestroyProtyle(protyleRef.current); } catch { }
				protyleRef.current = null;
				protyleHostRef.current = null;
				if (cancelled) return;
			};

			// 使用 getDoc API 直接获取静态 DOM 内容（无需创建 Protyle）
			const useStaticPreviewFromGetDoc = async (targetBlockId: string, forceRefresh = false) => {
				if (cancelled || !containerRef.current) return;

				// 检查缓存（如果非强制刷新）
				if (!forceRefresh) {
					const cachedHtml = getCachedPreview(targetBlockId, fontSize);
					if (cachedHtml) {
						// 使用缓存的预览
						if (staticPreviewRef.current?.parentElement === containerRef.current) {
							containerRef.current.removeChild(staticPreviewRef.current);
						}
						const wrapper = document.createElement('div');
						wrapper.innerHTML = cachedHtml;
						const clone = wrapper.firstElementChild as HTMLElement;
						if (clone && containerRef.current) {
							staticPreviewRef.current = clone;
							containerRef.current.appendChild(clone);
							await renderAllContent(clone);
							if (cancelled) return;
							return;
						}
					}
				}

				// 使用 getDoc API 获取 DOM 内容
				const domContent = await fetchStaticDomContent(targetBlockId);
				if (cancelled || !domContent) return;

				// 移除旧的静态预览
				if (staticPreviewRef.current?.parentElement === containerRef.current) {
					containerRef.current.removeChild(staticPreviewRef.current);
				}

				// 创建预览容器
				const previewWrapper = document.createElement('div');
				previewWrapper.className = 'protyle-wysiwyg protyle-wysiwyg--attr';
				previewWrapper.style.width = '100%';
				previewWrapper.style.height = '100%';
				previewWrapper.style.overflow = 'auto';
				previewWrapper.style.fontSize = `${fontSize}px`;
				previewWrapper.innerHTML = domContent;

				// 缓存原始 DOM HTML（渲染前）
				cacheStaticPreview(targetBlockId, previewWrapper.outerHTML, fontSize);

				// 渲染所有内容类型（公式、图表等）需要依赖已挂载的 DOM，先挂载再渲染
				staticPreviewRef.current = previewWrapper;
				containerRef.current.appendChild(previewWrapper);
				await renderAllContent(previewWrapper);

				if (cancelled) return;
			};

			let cancelled = false;

			// 检测是否刚从编辑状态退出（用于强制刷新缓存）
			const wasEditing = prevIsEditingRef.current && !isEditingState;

			(async () => {
				if (isEditingState) {
					// 进入编辑：移除静态预览，创建或复用 Protyle
					if (staticPreviewRef.current?.parentElement === containerRef.current) {
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
					try { protyleRef.current?.enable(); } catch { }
				} else {
					// 非编辑
					if (effectiveRenderMode === 'static-dom') {
						const id = containerRef.current?.getAttribute('blockid') || blockId;
						if (!id) return;
						if (isMainCard) {
							// 文档块：创建 Protyle 实例并克隆 DOM
							if (!protyleRef.current) {
								await mountProtyle(2);
								if (cancelled) return;
								if (protyleRef.current) await waitForProtyleRendered(protyleRef.current);
							}
							await useStaticPreviewFromProtyle(wasEditing);
							if (cancelled) return;
						} else {
							// 普通块：使用 fetchStaticDomContent API 直接获取静态 DOM
							if (protyleRef.current) {
								if (protyleHostRef.current?.parentElement) {
									protyleHostRef.current.parentElement.removeChild(protyleHostRef.current);
								}
								try { safeDestroyProtyle(protyleRef.current); } catch { }
								protyleRef.current = null;
								protyleHostRef.current = null;
							}
							await useStaticPreviewFromGetDoc(id, wasEditing);
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
							containerRef.current.removeChild(staticPreviewRef.current);
						}
						staticPreviewRef.current = null;
						// 确保 Protyle host 已挂载
						if (protyleHostRef.current && containerRef.current && protyleHostRef.current.parentElement !== containerRef.current) {
							containerRef.current.appendChild(protyleHostRef.current);
						}
						// 禁用交互但保留实例
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
				// 对于 live-protyle 模式，不在编辑切换时销毁资源
				// 仅当组件真正卸载或渲染条件不满足时才销毁
				if (isCollapsed || !shouldRender) {
					destroyRuntimeResources();
				}
			};
		}, [destroyRuntimeResources, isEditingState, isInViewport, isViewportCullingEnabled, shape.id, blockId, shape.props.refreshNonce, isCollapsed, effectiveRenderMode, canLoad, fontSize]);

		const handlePointerEvent = (e: React.PointerEvent) => {
			if (isEditingState) {
				e.stopPropagation(); // 在编辑模式下阻止事件冒泡
			}
		};

		return (
			<HTMLContainer
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				id={shape.id}
				style={{
					display: 'flex',
					flexDirection: 'column',
					backgroundColor: theme[shape.props.color].semi,
					color: theme[shape.props.color].solid,
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
					boxShadow: isEditingState ? '0 0 0 2px #3d8aff' : 'none',
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
				<div
					ref={containerRef}
					blockid={shape.props.blockId}
					style={{
						width: '100%',
						height: '100%',
						overflow: 'auto', // 内容区域可滚动
						pointerEvents: isEditingState ? 'all' : 'none',
						touchAction: isEditingState ? 'auto' : 'none',
						contain: 'strict',
						padding: '0px',
					}}
				>
					{/* 折叠状态 */}
					{isCollapsed && !isEditingState && (
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
						}}>
							{collapsedText}
						</div>
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
				{/* 端口覆盖层 - 用于贝塞尔连接器 */}
				<PortsOverlay shapeId={shape.id} parentHovered={isHovered} />
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

	override toSvg(shape: ICardShape, ctx: SvgExportContext): ReactElement | null {
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode })
		const { w, h, color, fontSize = 16, blockId, isCollapsed } = shape.props
		const borderWidth = 3 // 与实际渲染的边框宽度一致
		const radius = 10 // 与实际渲染的圆角一致
		const strokeColor = theme[color].solid
		const fillColor = theme[color].semi
		// 内容区域的尺寸（去掉边框后的可用空间）
		const contentWidth = Math.max(w - borderWidth * 2, 1)
		const contentHeight = Math.max(h - borderWidth * 2, 1)

		// 折叠状态：直接返回简化的 SVG
		if (isCollapsed) {
			// 获取折叠时显示的文本
			let collapsedText = 'Card'
			if (blockId) {
				try {
					const xhr = new XMLHttpRequest()
					xhr.open('POST', '/api/block/getBlockInfo', false)
					xhr.setRequestHeader('Content-Type', 'application/json')
					xhr.send(JSON.stringify({ id: blockId }))
					if (xhr.status >= 200 && xhr.status < 300) {
						const res = JSON.parse(xhr.responseText)
						if (res?.data?.rootTitle) {
							collapsedText = res.data.rootTitle.slice(0, 10) + (res.data.rootTitle.length > 10 ? '...' : '')
						}
					}
				} catch { }
			}
			const collapsedFontSize = Math.min(w / 6, h / 2, 24)
			return (
				<g>
					<rect
						width={w}
						height={h}
						fill={fillColor}
						stroke={strokeColor}
						strokeWidth={borderWidth}
						rx={radius}
						ry={radius}
					/>
					<text
						x={w / 2}
						y={h / 2}
						fill={strokeColor}
						fontSize={collapsedFontSize}
						dominantBaseline="middle"
						textAnchor="middle"
					>
						{collapsedText}
					</text>
				</g>
			)
		}

		let serialized = ''

		const serializeContent = () => {
			if (typeof document === 'undefined') return ''
			const host = document.getElementById(shape.id)
			if (!host) return ''
			const content = host.querySelector('[blockid]') as HTMLElement | null
			if (!content) return ''

			// 二进制转 Base64
			const binaryToBase64 = (binary: string) => {
				let base64 = ''
				const chunkSize = 0x6000 // divisible by 3 to keep padding predictable
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

			// MIME 类型映射
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
				mp4: 'video/mp4',
				webm: 'video/webm',
				ogg: 'video/ogg',
			}

			// 将资源路径转换为 data URL
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
						const mime = mimeMap[ext] || 'application/octet-stream'
						return `data:${mime};base64,${base64}`
					}
				} catch (err) {
					console.warn('Embedding asset failed', err)
				}
				return trimmed
			}

			// 克隆内容
			const clone = content.cloneNode(true) as HTMLElement

			// 扩展的关键样式属性列表（包含更多可能影响外观的属性）
			const EXTENDED_STYLE_PROPS = [
				...CRITICAL_STYLE_PROPS,
				'text-decoration', 'text-transform', 'letter-spacing', 'word-spacing',
				'box-shadow', 'text-shadow', 'transform', 'border-radius', 'border-color',
				'border-width', 'border-style', 'outline', 'position', 'top', 'left', 'right', 'bottom',
				'gap', 'grid-template-columns', 'grid-template-rows', 'flex-wrap', 'flex-grow', 'flex-shrink',
				'min-width', 'min-height', 'list-style', 'list-style-type', 'vertical-align',
				'text-indent', 'cursor', 'user-select', 'backdrop-filter', 'filter'
			]

			// 内联计算样式（使用扩展属性列表）
			const inlineComputedStyles = (source: Element, target: Element, depth = 0) => {
				// 增加递归深度限制
				if (depth > 15) return
				try {
					const computed = window.getComputedStyle(source)
					const styleText = EXTENDED_STYLE_PROPS
						.map((prop) => {
							const value = computed.getPropertyValue(prop)
							// 跳过默认值和空值
							if (!value || value === 'none' || value === 'normal' || value === 'auto') return ''
							return `${prop}:${value};`
						})
						.filter(Boolean)
						.join('')
					const existing = target.getAttribute('style') || ''
					target.setAttribute('style', `${styleText}${existing}`)
				} catch { }

				const sourceChildren = Array.from(source.children)
				const targetChildren = Array.from(target.children)
				const maxChildren = Math.min(sourceChildren.length, targetChildren.length, 150) // 增加子元素限制
				for (let i = 0; i < maxChildren; i++) {
					const srcChild = sourceChildren[i]
					const tgtChild = targetChildren[i]
					if (srcChild && tgtChild) {
						inlineComputedStyles(srcChild, tgtChild, depth + 1)
					}
				}
			}

			inlineComputedStyles(content, clone)

			// 清理不需要的属性
			const attrsToRemove = [
				'contenteditable', 'data-node-id', 'data-node-index', 'updated',
				'data-realwidth', 'data-readonly', 'spellcheck', 'draggable'
			]
			attrsToRemove.forEach(attr => {
				clone.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr))
			})

			// 隐藏滚动条
			clone.querySelectorAll('*').forEach((node) => {
				if (node instanceof HTMLElement) {
					node.style.setProperty('scrollbar-width', 'none', 'important')
					node.style.setProperty('-ms-overflow-style', 'none', 'important')
					node.style.setProperty('overscroll-behavior', 'contain')
				}
			})

			// 处理图片
			clone.querySelectorAll('img').forEach((img) => {
				const embedded = assetToDataUrl(img.getAttribute('src'))
				if (embedded) {
					img.setAttribute('src', embedded)
					img.removeAttribute('crossorigin')
					img.removeAttribute('loading')
				}
				// 处理 srcset
				const srcset = img.getAttribute('srcset')
				if (srcset) {
					const resolvedSet = srcset
						.split(',')
						.map((entry) => {
							const parts = entry.trim().split(/\s+/)
							const url = parts[0]
							const descriptor = parts.slice(1).join(' ')
							const resolved = assetToDataUrl(url)
							return resolved ? (descriptor ? `${resolved} ${descriptor}` : resolved) : ''
						})
						.filter(Boolean)
						.join(', ')
					if (resolvedSet) img.setAttribute('srcset', resolvedSet)
					else img.removeAttribute('srcset')
				}
				// 设置图片样式确保正确显示
				img.style.maxWidth = '100%'
				img.style.height = 'auto'
			})

			// 处理视频：替换为第一帧截图或占位符
			clone.querySelectorAll('video').forEach((video) => {
				const poster = video.getAttribute('poster')
				if (poster) {
					// 如果有海报图，用图片替换视频
					const img = document.createElement('img')
					const embeddedPoster = assetToDataUrl(poster)
					img.setAttribute('src', embeddedPoster || poster)
					img.style.width = video.style.width || '100%'
					img.style.height = video.style.height || 'auto'
					img.style.objectFit = 'cover'
					video.replaceWith(img)
				} else {
					// 无海报时显示视频占位符
					const placeholder = document.createElement('div')
					placeholder.style.cssText = `
						width: ${video.style.width || '100%'};
						height: ${video.style.height || '150px'};
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
						display: flex;
						align-items: center;
						justify-content: center;
						color: white;
						font-size: 14px;
						border-radius: 4px;
					`
					placeholder.textContent = '🎬 Video'
					video.replaceWith(placeholder)
				}
			})

			// 处理 source 元素
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
							const parts = entry.trim().split(/\s+/)
							const url = parts[0]
							const descriptor = parts.slice(1).join(' ')
							const result = assetToDataUrl(url)
							return result ? (descriptor ? `${result} ${descriptor}` : result) : ''
						})
						.filter(Boolean)
						.join(', ')
					if (resolvedSet) sourceEl.setAttribute('srcset', resolvedSet)
					else sourceEl.removeAttribute('srcset')
				}
			})

			// 处理 iframe（替换为占位符）
			clone.querySelectorAll('iframe').forEach((iframe) => {
				const placeholder = document.createElement('div')
				placeholder.style.cssText = `
					width: ${iframe.style.width || '100%'};
					height: ${iframe.style.height || '150px'};
					background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
					display: flex;
					align-items: center;
					justify-content: center;
					color: white;
					font-size: 14px;
					border-radius: 4px;
				`
				placeholder.textContent = '🌐 Embedded Content'
				iframe.replaceWith(placeholder)
			})

			// 处理 canvas（尝试导出为图片）
			const originalCanvases = content.querySelectorAll('canvas')
			const clonedCanvases = clone.querySelectorAll('canvas')
			originalCanvases.forEach((canvas, index) => {
				const clonedCanvas = clonedCanvases[index]
				if (clonedCanvas && canvas instanceof HTMLCanvasElement) {
					try {
						const dataUrl = canvas.toDataURL('image/png')
						const img = document.createElement('img')
						img.src = dataUrl
						img.style.width = canvas.style.width || `${canvas.width}px`
						img.style.height = canvas.style.height || `${canvas.height}px`
						clonedCanvas.replaceWith(img)
					} catch {
						// Canvas 可能受到跨域限制
						const placeholder = document.createElement('div')
						placeholder.style.cssText = `
							width: ${canvas.style.width || canvas.width + 'px'};
							height: ${canvas.style.height || canvas.height + 'px'};
							background: #f0f0f0;
							display: flex;
							align-items: center;
							justify-content: center;
							color: #666;
							font-size: 12px;
						`
						placeholder.textContent = 'Canvas'
						clonedCanvas.replaceWith(placeholder)
					}
				}
			})

			// 处理 SVG 中的 use 元素（尝试内联）
			clone.querySelectorAll('svg use').forEach((use) => {
				const href = use.getAttribute('href') || use.getAttribute('xlink:href')
				if (href && href.startsWith('#')) {
					const targetId = href.slice(1)
					const target = document.getElementById(targetId)
					if (target) {
						const clonedTarget = target.cloneNode(true) as Element
						clonedTarget.removeAttribute('id')
						use.replaceWith(clonedTarget)
					}
				}
			})

			// 设置克隆容器的样式（与实际渲染一致）
			clone.style.width = `${contentWidth}px`
			clone.style.height = `${contentHeight}px`
			clone.style.pointerEvents = 'none'
			clone.style.overflow = 'hidden'
			clone.style.fontSize = `${fontSize}px`
			clone.style.boxSizing = 'border-box'
			clone.style.padding = '0px'

			return clone.outerHTML
		}

		serialized = serializeContent()

		// 全局样式：(隐藏滚动条)、重置一些默认样式
		//*::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
		//*::-webkit-scrollbar-thumb { display: none !important; }
		const globalStyles = serialized
			? `<style xmlns="http://www.w3.org/1999/xhtml">
				* { scrollbar-width: none !important; -ms-overflow-style: none !important; }
				a { color: inherit; text-decoration: none; }
				img { max-width: 100%; height: auto; }
			</style>`
			: ''

		return (
			<g>
				{/* 背景矩形：带边框和圆角 */}
				<rect
					width={w}
					height={h}
					fill={fillColor}
					stroke={strokeColor}
					strokeWidth={borderWidth}
					rx={radius}
					ry={radius}
				/>
				{/* 内容区域：使用 clipPath 裁剪圆角 */}
				<defs>
					<clipPath id={`clip-${shape.id}`}>
						<rect
							x={borderWidth}
							y={borderWidth}
							width={contentWidth}
							height={contentHeight}
							rx={Math.max(radius - borderWidth, 0)}
							ry={Math.max(radius - borderWidth, 0)}
						/>
					</clipPath>
				</defs>
				{serialized ? (
					<foreignObject
						x={borderWidth}
						y={borderWidth}
						width={contentWidth}
						height={contentHeight}
						clipPath={`url(#clip-${shape.id})`}
					>
						<div
							xmlns="http://www.w3.org/1999/xhtml"
							style={{
								width: '100%',
								height: '100%',
								overflow: 'hidden',
								fontSize: `${fontSize}px`,
								backgroundColor: 'transparent',
							}}
							dangerouslySetInnerHTML={{ __html: `${globalStyles}${serialized}` }}
						/>
					</foreignObject>
				) : (
					<text
						x={w / 2}
						y={h / 2}
						fill={strokeColor}
						fontSize={Math.min(fontSize * 0.9, 16)}
						dominantBaseline="middle"
						textAnchor="middle"
					>
						{blockId ? `Block ${blockId.slice(-6)}` : 'Card'}
					</text>
				)}
			</g>
		)
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