import { useState, useEffect, useRef, ReactElement } from 'react'
import React from 'react';
import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	SvgExportContext,
	TLResizeInfo,
	TLShape,
	getDefaultColorTheme,
	resizeBox,
} from '@tldraw/tldraw'
import { cardShapeMigrations } from './card-shape-migrations'
import { cardShapeProps } from './card-shape-props'
import { ICardShape } from './card-shape-types'
import { Protyle, showMessage } from 'siyuan';
import * as api from '@/api';
import { settingdata } from '@/index';

let isCreatingBlock = false;
let lastCreatedBlockId = null;
let pendingCreationPromise = null;


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
		const bounds = this.editor.getShapeGeometry(shape).bounds
		const theme = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
		const isEditing = this.editor.getEditingShapeId() === shape.id;
		const [isEditingState, setIsEditingState] = useState(isEditing);
		
		const protyleRef = useRef(null)

		
		const containerRef = useRef<HTMLDivElement>(null)

		
		useEffect(() => {
			setIsEditingState(isEditing);
		}, [isEditing]);

		useEffect(() => {
			if (protyleRef.current && protyleRef.current.protyle && protyleRef.current.protyle.wysiwyg) {
				protyleRef.current.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 16}px`;
			} else if (containerRef.current) {
				const protyleElement = containerRef.current.querySelector(".protyle-wysiwyg");
				if (protyleElement) {
					(protyleElement as HTMLElement).style.fontSize = `${shape.props.fontSize || 16}px`;
				}
			}
		}, [shape.props.fontSize]);

		useEffect(() => {
			//检查块是否存在
			const container = containerRef.current;
			const blockId = container?.getAttribute('blockid');
			// console.log('containerAAAAAA啊', container);
			// console.log('id', shape.props.blockId, "/n shapeid", shape.id);
			// console.log('blockId', blockId);
			if (protyleRef.current) {
				if (isEditingState) {
					protyleRef.current.enable();
					// console.log('进入编辑状态', protyleRef.current.protyle.wysiwyg);
				} else {
					protyleRef.current.disable();
					// console.log('退出编辑状态', protyleRef.current.protyle.wysiwyg);
				}
			}
			if (!shape.props.blockId) {
				this.editor.updateShape({
					id: shape.id,
					type: shape.type,
					props: {
						...shape.props,
						blockId: blockId,
					},
				});
			}
			if (blockId) {
				// console.log('检查块是否存在:', blockId);
				// Add delay before checking if block exists to avoid unnecessary API calls
				if (shape.props.isNewlyCreated) {
					this.editor.updateShape({
						id: shape.id,
						type: shape.type,
						props: {
							...shape.props,
							isNewlyCreated: false,
						},
					});
				} else {
					const checkBlockExistence = setTimeout(() => {
						api.getBlockByID(blockId).then((res) => {
							if (res) {
								// console.log('块存在:', res);
							} else {
								showMessage('块不存在,已被删除');
								this.editor.deleteShape(shape.id);
							}
						});
					}, 4000);
					return () => clearTimeout(checkBlockExistence);
				}
			}
		}, [isEditingState]);
		// eslint-disable-next-line react-hooks/rules-of-hooks
		useEffect(() => {
			// 确保容器和SiYuan API都已加载
			if (containerRef.current && window.siyuan && window.siyuan.ws && window.siyuan.ws.app) {
				// 如果已有Protyle实例，先清理
				if (protyleRef.current) {
					// 如果Protyle有销毁方法，调用它
					if (protyleRef.current.destroy) {
						protyleRef.current.destroy();
						// console.log('bbbbbbbbbb', protyleRef.current.protyle.wysiwyg);
					}
					protyleRef.current = null;
				}

				const createBlockIfNeeded = async () => {
					let blockId = null;
					// 如果元素上没有找到，则使用shape.props中的blockId
					if (containerRef.current) {
						blockId = containerRef.current.getAttribute('blockid');
						// console.log('获取到的blockId', blockId);
					}

					// console.log('shape', shape.props.blockId);
					if (!blockId) {
						blockId = shape.props.blockId;
					}

					if (!blockId) {
						const editorElement = containerRef.current?.closest('.tldraw__editor');
						const tldrawId = editorElement?.getAttribute('data-tldraw-id');
						const title = editorElement?.getAttribute('data-tldraw-title');
						console.log('当前TLdraw实例ID:', tldrawId);

						if (!settingdata["tl-draw-create-note-id"] && !tldrawId) {
							showMessage('配置不完整,请检查设置');
							return;
						}

						// 检查是否有其他操作正在创建块
						if (isCreatingBlock) {
							// 如果有，等待那个操作完成并使用它创建的块ID
							try {
								if (pendingCreationPromise) {
									blockId = await pendingCreationPromise;
									if (blockId) {
										this.editor.updateShape({
											id: shape.id,
											type: shape.type,
											props: {
												...shape.props,
												blockId: blockId,
											},
										});
									}
								}
							} catch (err) {
								console.error("等待块创建失败:", err);
							}
						} else {
							// 设置锁，标记正在创建块
							isCreatingBlock = true;

							try {
								// 创建一个Promise，其他实例可以等待它
								pendingCreationPromise = (async () => {
									const daynote_id = (await api.createDailyNote(window.siyuan.ws.app.appId, settingdata["tl-draw-create-note-id"])).id
									if (!daynote_id) {
										showMessage('未找到日记块');
										return null;
									}
									const idid = await api.generateSiyuanID() as string;
									const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
									const link = `siyuan://plugins/siyuan-steve-tools/?rootid=${tldrawId}&blockid=${idid}&title=${title}`;
									const redata = await api.appendBlock("markdown", `##### [${timestamp}](${link})
{: id="${idid}" custom-st-tldraw="1" }`, tldrawId || daynote_id)

									const newBlockId = redata[0].doOperations[0].id;
									lastCreatedBlockId = newBlockId;
									return newBlockId;
								})();

								// 等待块创建完成
								blockId = await pendingCreationPromise;

								// 更新当前shape
								this.editor.updateShape({
									id: shape.id,
									type: shape.type,
									props: {
										...shape.props,
										blockId: blockId,
									},
								});
							} catch (error) {
								console.error("创建块失败:", error);
							} finally {
								// 释放锁
								isCreatingBlock = false;
								// 一段时间后清除缓存的Promise和ID
								setTimeout(() => {
									pendingCreationPromise = null;
								}, 5000);
							}
						}
					}

					// 如果仍然没有blockId，显示错误
					if (!blockId) {
						showMessage('未找到块');
						return;
					}
					const pt = new Protyle(window.siyuan.ws.app, containerRef.current, {
						blockId: blockId,
						rootId: blockId,
						defId: blockId,
						render: {
							breadcrumb: shape.props.isMain,
							gutter: true,
							title: shape.props.isMain,
							breadcrumbDocName: shape.props.isMain,
							// scroll:false,
						},
						// action: ["cb-get-focus"],
						mode: "wysiwyg",
						// typewriterMode: true,
						after: (protyle: Protyle) => {
							// console.log('after');
							protyle.protyle.wysiwyg.preventKeyup = true;
							// protyle.resize();
							// console.log('after', protyle.wysiwyg);
						}
					});
					// pt.focusBlock(blockId);

					protyleRef.current = pt;
					if (containerRef.current) {
						containerRef.current.setAttribute('blockid', blockId);
					}
					// 应用字体大小设置
					if (pt.protyle && pt.protyle.wysiwyg && pt.protyle.wysiwyg.element) {
						pt.protyle.wysiwyg.element.style.fontSize = `${shape.props.fontSize || 16}px`;
					}
					// console.log('bbbQQQQQbbb', containerRef);
				};
				// 创建新的Protyle实例
				createBlockIfNeeded();

			}

			// 组件卸载时清理
			return () => {
				if (protyleRef.current && protyleRef.current.destroy) {
					protyleRef.current.destroy();
					protyleRef.current = null;
				}
			};
		}, [shape.id]);
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
					}}
				></div>
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