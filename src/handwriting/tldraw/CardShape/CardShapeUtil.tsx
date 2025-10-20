import { useState, useEffect, useRef, ReactElement } from 'react'
import React from 'react';
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
import { ICardShape } from './card-shape-types'
import { Protyle, showMessage } from 'siyuan';
import * as api from '@/api/api';
import { settingdata } from '@/index';

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


		// 仅在编辑时创建 Protyle 实例
		const protyleRef = useRef<Protyle | null>(null)
		// Protyle 的承载元素（脱离 containerRef 创建，再 append 进去）
		const protyleHostRef = useRef<HTMLDivElement | null>(null)
		// 非编辑态下的静态预览节点（由 Protyle contentElement 克隆而来）
		const staticPreviewRef = useRef<HTMLElement | null>(null)


		const containerRef = useRef<HTMLDivElement>(null)


		useEffect(() => {
			setIsEditingState(isEditing);
		}, [isEditing]);

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
			if (!containerRef.current || !window.siyuan?.ws?.app) return;
			const renderMode = (settingdata["card-render-mode"] || "static-dom") as "static-dom" | "live-protyle";

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
					setTimeout(() => { try { obs.disconnect(); } catch {} finish(); }, timeout);
				});
			};

			const mountProtyle = async () => {
				let blockId: string | null = containerRef.current!.getAttribute('blockid') || shape.props.blockId || null;
				if (!blockId) {
					const editorElement = containerRef.current!.closest('.tldraw__editor');
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
					} else if (!blockId) {
						isCreatingBlock = true;
						try {
							pendingCreationPromise = (async () => {
								const idid = await api.generateSiyuanID() as string;
								const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
								const link = `siyuan://plugins/siyuan-steve-tools/?rootid=${tldrawId}&blockid=${idid}&title=${title}`;
								const redata = await api.appendBlock("markdown", `##### [${timestamp}](${link})[🔗](${link})
{: id="${idid}" custom-st-tldraw="1" }

{: custom-st-tldraw-none="1" }
`, tldrawId!)
								const newBlockId = redata[0].doOperations[0].id;
								return newBlockId;
							})();
							blockId = await pendingCreationPromise;
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

				// 保存到 shape.props 并到容器属性
				this.editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, blockId } });
				containerRef.current!.setAttribute('blockid', blockId);

				// 创建独立 host，并在其中初始化 Protyle，再 append 到 containerRef
				const host = document.createElement('div');
				host.style.width = '100%';
				host.style.height = '100%';
				host.style.overflow = 'hidden';
				protyleHostRef.current = host;

				let resolveReady: (() => void) | null = null;
				const readyPromise = new Promise<void>(r => resolveReady = r);
				const pt = new Protyle(window.siyuan.ws.app, host, {
					blockId: blockId,
					rootId: blockId,
					defId: blockId,
					render: {
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

				protyleRef.current = pt;
				containerRef.current!.appendChild(host);
				if (pt.protyle?.wysiwyg?.element) {
					pt.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 16}px`;
				}
				await readyPromise.catch(() => {});
			};

			const useStaticPreviewFromProtyle = async () => {
				if (!protyleRef.current) return;
				const ce = protyleRef.current.protyle?.contentElement as HTMLElement | undefined;
				if (!ce) return;
				// 保险起见，再等待一次渲染完成
				await waitForProtyleRendered(protyleRef.current);
				// 克隆只读 DOM
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
				try { protyleRef.current.destroy(); } catch {}
				protyleRef.current = null;
				protyleHostRef.current = null;
				// 挂载克隆预览
				staticPreviewRef.current = clone;
				if (containerRef.current) {
					containerRef.current.appendChild(clone);
				}
			};

			(async () => {
				if (isEditingState) {
					// 进入编辑：移除静态预览，创建并启用 Protyle
					if (staticPreviewRef.current?.parentElement === containerRef.current) {
						containerRef.current.removeChild(staticPreviewRef.current);
					}
					staticPreviewRef.current = null;
					if (!protyleRef.current) {
						await mountProtyle();
					}
					if (protyleHostRef.current && containerRef.current && protyleHostRef.current.parentElement !== containerRef.current) {
						containerRef.current.appendChild(protyleHostRef.current);
					}
					try { protyleRef.current?.enable(); } catch {}
				} else {
					// 非编辑
					if (renderMode === 'static-dom') {
						// 若已有 Protyle，用其生成静态预览后销毁实例；若没有且有 blockId，则临时创建->克隆->销毁
						if (protyleRef.current) {
							await useStaticPreviewFromProtyle();
						} else {
							const id = containerRef.current?.getAttribute('blockid') || shape.props.blockId;
							if (id) {
								await mountProtyle();
								if (protyleRef.current) await waitForProtyleRendered(protyleRef.current);
								await useStaticPreviewFromProtyle();
							}
						}
					} else {
						// live-protyle：保留实例但禁用交互
						if (!protyleRef.current) {
							await mountProtyle();
						}
						if (staticPreviewRef.current?.parentElement === containerRef.current) {
							containerRef.current.removeChild(staticPreviewRef.current);
						}
						staticPreviewRef.current = null;
						if (protyleHostRef.current && containerRef.current && protyleHostRef.current.parentElement !== containerRef.current) {
							containerRef.current.appendChild(protyleHostRef.current);
						}
						try { protyleRef.current?.disable(); } catch {}
					}
				}
			})()

			// 组件卸载清理
			return () => {
				// 卸载：清理静态预览与 Protyle/host
				if (staticPreviewRef.current?.parentElement) {
					staticPreviewRef.current.parentElement.removeChild(staticPreviewRef.current);
				}
				staticPreviewRef.current = null;
				// 彻底销毁 Protyle，并清理 host
				if (protyleRef.current) {
					try { protyleRef.current.destroy(); } catch {}
					protyleRef.current = null;
				}
				if (protyleHostRef.current?.parentElement) {
					protyleHostRef.current.parentElement.removeChild(protyleHostRef.current);
				}
				protyleHostRef.current = null;
			};
		}, [isEditingState, shape.id]);
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
						contain: 'strict', // 强力隔离
						padding: '0px', // 为内容添加最小边距
						// borderRadius: 'inherit', // 继承父元素的圆角
					}}
				>
					{/* 非编辑态下也使用 Protyle host 进行渲染，无需额外占位 */}
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
		// 获取当前主题颜色（考虑暗黑模式）
		const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode });
		// 获取卡片的背景色
		const backgroundColor = theme[shape.props.color].semi;
		// 获取卡片的边框/文字颜色
		const textColor = theme[shape.props.color].solid;

		// 返回一个 SVG 组合，包含背景矩形和提示文字
		return (
			<g>
				<rect
					width={shape.props.w}
					height={shape.props.h}
					fill={backgroundColor}
					stroke={textColor} // 使用文字颜色作为边框色
					strokeWidth={1}
				/>
				<text
					x={shape.props.w / 2} // 水平居中
					y={shape.props.h / 2} // 垂直居中
					textAnchor="middle" // 水平对齐方式
					dominantBaseline="middle" // 垂直对齐方式
					fill={textColor} // 文字颜色
					fontSize={Math.min(shape.props.w / 10, shape.props.h / 5, 16)} // 动态调整字体大小，最大16
					fontFamily="sans-serif"
				>
					要完整内容请自行截图
				</text>
			</g>
		);
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