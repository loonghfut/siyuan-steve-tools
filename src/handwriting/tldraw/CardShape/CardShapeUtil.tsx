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
import { Protyle, showMessage } from 'siyuan';
import * as api from '@/api/api';
import { settingdata } from '@/index';
import { enqueueProtyleLoad, ProtyleLoadHandle } from '../protyle-load-queue'
import { shapeLoadManager } from '../shape-load-manager'

let isCreatingBlock = false;
// 仅用于并发创建控制，不再缓存最近创建的块ID
let pendingCreationPromise = null;

// 移除轻量预览相关工具，保持编辑态与非编辑态显示一致（均使用 Protyle 渲染）


export class CardShapeUtil extends ShapeUtil<ICardShape> {
	static override type = 'card' as const
	// [1]
	static override props = cardShapeProps
	// [2]
	static override migrations = cardShapeMigrations

	// [3]
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
		const isViewportCullingEnabled = settingdata['tldraw-viewport-culling'] !== false;
		const tldrawHeaderImage = settingdata['tldraw-header-image'] !== false;
		const [collapsedText, setCollapsedText] = useState<string>('加载中...');
		const isCollapsed = shape.props.isCollapsed || false;


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


		useEffect(() => {
			setIsEditingState(isEditing);
		}, [isEditing]);

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
		// 非编辑态下做一次存在性检查，避免频繁 API 调用
		useEffect(() => {
			const container = containerRef.current;
			const blockId = container?.getAttribute('blockid') || shape.props.blockId;
			if (!shape.props.blockId && blockId) {
				this.editor.updateShape({
					id: shape.id,
					type: shape.type,
					props: { ...shape.props, blockId }
				});
			}
			if (blockId && !isEditingState) {
				if (shape.props.isNewlyCreated) {
					this.editor.updateShape({
						id: shape.id,
						type: shape.type,
						props: { ...shape.props, isNewlyCreated: false }
					});
				} else {
					const h = setTimeout(() => {
						api.getBlockByID(blockId).then((res) => {
							if (!res) {
								showMessage('块不存在,已被删除');
								this.editor.deleteShape(shape.id);
							}
						});
					}, 4000);
					return () => clearTimeout(h);
				}
			}
		}, [isEditingState, shape.props.blockId]);
		// 仅在编辑时保留 Protyle 实例；非编辑时克隆 contentElement 作为静态预览并销毁实例
		useEffect(() => {
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

			if (!containerRef.current || !window.siyuan?.ws?.app) return;
			const globalRenderMode: Exclude<CardRenderMode, 'inherit'> = settingdata["card-render-mode"] === 'live-protyle'
				? 'live-protyle'
				: 'static-dom';
			const requestedRenderMode: CardRenderMode = shape.props.renderMode ?? 'inherit';
			const effectiveRenderMode: Exclude<CardRenderMode, 'inherit'> = requestedRenderMode === 'inherit'
				? globalRenderMode
				: requestedRenderMode;

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

			const mountProtyle = async (priority: number) => {
				if (cancelled) return;
				let blockId: string | null = containerRef.current?.getAttribute('blockid') || shape.props.blockId || null;
				if (!blockId) {
					const editorElement = containerRef.current?.closest('.tldraw__editor');
					const tldrawId = editorElement?.getAttribute('data-tldraw-id');
					const title = editorElement?.getAttribute('data-tldraw-title');
					if (!settingdata["tl-draw-create-note-id"] && !tldrawId) {
						showMessage('配置不完整,请检查设置');
						return;
					}
					if (isCreatingBlock && pendingCreationPromise) {
						try {
							blockId = await pendingCreationPromise;
						} catch (e) {
							console.error('等待块创建失败', e);
						}
						if (cancelled) return;
					} else if (!blockId) {
						isCreatingBlock = true;
						try {
							pendingCreationPromise = (async () => {
								const idid = await api.generateSiyuanID() as string;
								const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
								const link = `https://plugins/siyuan-steve-tools/?rootid=${tldrawId}&blockid=${idid}&title=${title}`;
								const content =
									'###### ' + timestamp + '[🔗](' + link + ')' +
									'\n' +
									'{: id="' + idid + '" custom-st-tldraw="1" }' +
									'\n\n' +
									'{: custom-st-tldraw-none="1" }' +
									'\n';
								const redata = await api.appendBlock("markdown", content, tldrawId!);
								const newBlockId = redata[0].doOperations[0].id;
								return newBlockId;
							})();
							blockId = await pendingCreationPromise;
							if (cancelled) return;
						} catch (err) {
							console.error('创建块失败', err);
						} finally {
							isCreatingBlock = false;
							setTimeout(() => (pendingCreationPromise = null), 5000);
						}
					}
				}

				if (!blockId) {
					showMessage('未找到块');
					return;
				}

				if (cancelled) return;
				this.editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, blockId } });
				containerRef.current?.setAttribute('blockid', blockId);
				if (cancelled) return;

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
						protyleInstance = new Protyle(window.siyuan.ws.app, host, {
						blockId,
						rootId: blockId,
						defId: blockId,
						render: {
							background: (shape.props.showMask && tldrawHeaderImage),
							breadcrumb: shape.props.isMain,
							gutter: true,
							title: shape.props.isMain,
							breadcrumbDocName: shape.props.isMain,
						},
						action: ["cb-get-all", "cb-get-focus"],
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
							try { host.parentElement.removeChild(host); } catch {}
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
						protyleInstance.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 16}px`;
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
			};

			const useStaticPreviewFromProtyle = async () => {
				if (!protyleRef.current || cancelled) return;
				const ce = protyleRef.current.protyle?.contentElement as HTMLElement | undefined;
				if (!ce) return;
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
				clone.style.fontSize = `${shape.props.fontSize || 16}px`;
				// 清理 Protyle host
				if (protyleHostRef.current?.parentElement) {
					protyleHostRef.current.parentElement.removeChild(protyleHostRef.current);
				}
				// 销毁 Protyle 实例
				try { safeDestroyProtyle(protyleRef.current); } catch { }
				protyleRef.current = null;
				protyleHostRef.current = null;
				// 挂载克隆预览
				if (cancelled) return;
				staticPreviewRef.current = clone;
				if (containerRef.current) {
					containerRef.current.appendChild(clone);
				}
			};

			let cancelled = false;

			(async () => {
				if (isEditingState) {
					// 进入编辑：移除静态预览，创建并启用 Protyle
					if (staticPreviewRef.current?.parentElement === containerRef.current) {
						containerRef.current.removeChild(staticPreviewRef.current);
					}
					staticPreviewRef.current = null;
					if (!protyleRef.current) {
						await mountProtyle(0);
						if (cancelled) return;
					}
					if (protyleHostRef.current && containerRef.current && protyleHostRef.current.parentElement !== containerRef.current) {
						containerRef.current.appendChild(protyleHostRef.current);
					}
					try { protyleRef.current?.enable(); } catch { }
				} else {
					// 非编辑
					if (effectiveRenderMode === 'static-dom') {
						// 若已有 Protyle，用其生成静态预览后销毁实例；若没有且有 blockId，则临时创建->克隆->销毁
						if (protyleRef.current) {
							await useStaticPreviewFromProtyle();
							if (cancelled) return;
						} else {
							const id = containerRef.current?.getAttribute('blockid') || shape.props.blockId;
							if (id) {
								await mountProtyle(2);
								if (cancelled) return;
								if (protyleRef.current) await waitForProtyleRendered(protyleRef.current);
								await useStaticPreviewFromProtyle();
								if (cancelled) return;
							}
						}
					} else {
						// live-protyle：保留实例但禁用交互，并尝试刷新内容
						if (!protyleRef.current) {
							await mountProtyle(1);
							if (cancelled) return;
						}
						if (staticPreviewRef.current?.parentElement === containerRef.current) {
							containerRef.current.removeChild(staticPreviewRef.current);
						}
						staticPreviewRef.current = null;
						if (protyleHostRef.current && containerRef.current && protyleHostRef.current.parentElement !== containerRef.current) {
							containerRef.current.appendChild(protyleHostRef.current);
						}
						try { protyleRef.current?.disable(); } catch { }
						try { protyleRef.current?.reload(false); } catch { }
					}
				}
			})()

			// 组件卸载清理
			return () => {
				cancelled = true;
				destroyRuntimeResources();
			};
		}, [destroyRuntimeResources, isEditingState, isInViewport, isViewportCullingEnabled, shape.id, shape.props.blockId, shape.props.refreshNonce, isCollapsed, shape.props.renderMode, canLoad]);
		// 处理双击事件进入编辑模式
		const handleDoubleClick = (e: React.MouseEvent) => {
			if (!isEditingState) {
				e.stopPropagation();
				this.editor.setEditingShape(shape.id);
				setIsEditingState(true);
			}
		};

		const handlePointerEvent = (e: React.PointerEvent) => {
			if (isEditingState) {
				e.stopPropagation(); // 在编辑模式下阻止事件冒泡
			}
		};

		return (
			<HTMLContainer
				id={shape.id}
				style={{
					display: 'flex',
					flexDirection: 'column',
					backgroundColor: theme[shape.props.color].semi,
					color: theme[shape.props.color].solid,
					// 只有在非编辑状态时才禁用指针事件
					position: 'relative',
					isolation: 'isolate',
					pointerEvents: isEditingState ? 'auto' : 'none',
					width: '100%',
					height: '100%',
					overflow: 'auto',
					boxShadow: isEditingState ? '0 0 0 2px #3d8aff' : 'none',
					cursor: isEditingState ? 'text' : 'default',
					padding: 0,
					border: `3px solid ${theme[shape.props.color].solid}`, // 添加颜色边框
					borderRadius: '10px', // 增加圆角
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
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: `${Math.min(shape.props.fontSize, 18)}px`,
							color: theme[shape.props.color].solid,
							gap: '4px',
							padding: '4px',
							opacity: 0.7,
							textAlign: 'center',
						}}>
							<div style={{fontWeight: 600}}>预览延迟加载</div>
							<div style={{fontSize: '12px'}}>靠近中心或进入编辑后加载</div>
						</div>
					)}
				</div>
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
		const { w, h, color, fontSize = 16, blockId } = shape.props
		const border = -10
		const radius = 10
		const strokeColor = theme[color].solid
		const fillColor = theme[color].semi
		let serialized = ''

		const serializeContent = () => {
			if (typeof document === 'undefined') return ''
			const host = document.getElementById(shape.id)
			if (!host) return ''
			const content = host.querySelector('[blockid]') as HTMLElement | null
			if (!content) return ''
			const clone = content.cloneNode(true) as HTMLElement
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
							avif: 'image/avif'
						}
						const mime = mimeMap[ext] || 'image/png'
						return `data:${mime};base64,${base64}`
					}
				} catch (err) {
					console.warn('Embedding asset failed', err)
				}
				return trimmed
			}

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
			clone.style.width = `${Math.max(w - border * 2, 1)}px`
			clone.style.height = `${Math.max(h - border * 2, 1)}px`
			clone.style.pointerEvents = 'none'
			clone.style.overflow = 'hidden'
			clone.style.fontSize = `${fontSize}px`
			clone.style.boxSizing = 'border-box'
			return clone.outerHTML
		}

		serialized = serializeContent()
		const hideScrollbarStyle = serialized
			? '<style xmlns="http://www.w3.org/1999/xhtml">*::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}*::-webkit-scrollbar-thumb{display:none!important;}*{scrollbar-width:none!important;}</style>'
			: ''

		return (
			<g>
				<rect width={w} height={h} fill={fillColor} stroke={strokeColor} strokeWidth={border} rx={radius} ry={radius} />
				{serialized ? (
					<foreignObject x={border} y={border} width={Math.max(w - border * 2, 1)} height={Math.max(h - border * 2, 1)}>
						<div
							xmlns="http://www.w3.org/1999/xhtml"
							style={{ width: '100%', height: '100%', overflow: 'hidden', fontSize: `${fontSize}px` }}
							dangerouslySetInnerHTML={{ __html: `${hideScrollbarStyle}${serialized}` }}
						/>
					</foreignObject>
				) : (
					<text
						x={w / 2}
						y={h / 2}
						fill={strokeColor}
						fontSize={fontSize * 0.9}
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