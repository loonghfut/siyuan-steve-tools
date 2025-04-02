import { useState, useEffect, useRef } from 'react'
import React from 'react';
import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
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
	getDefaultProps(): ICardShape['props'] {
		return {
			w: 300,
			h: 300,
			color: 'black',
			showMask: true,
			blockId: '',
			isNewlyCreated: true
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
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const protyleRef = useRef<any>(null)
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const containerRef = useRef<HTMLDivElement>(null)

		// eslint-disable-next-line react-hooks/rules-of-hooks
		useEffect(() => {
			setIsEditingState(isEditing);
		}, [isEditing]);
		useEffect(() => {
			//检查块是否存在
			const container = containerRef.current;
			const blockId = container?.getAttribute('blockid');
			// console.log('container', container);
			// console.log('id', shape.props.blockId, "/n shapeid", shape.id);
			// console.log('blockId', blockId);
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
				api.getBlockByID(blockId).then((res) => {
					if (res) {
						// console.log('块存在:', res);
					} else {
						showMessage('块不存在,已被删除');
						this.editor.deleteShape(shape.id);
					}
				});
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
						console.log('bbbbbbbbbb', protyleRef.current.protyle.wysiwyg);
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
						console.log('当前TLdraw实例ID:', tldrawId);
						if (!settingdata["tl-draw-create-note-id"] && !tldrawId) {
							showMessage('配置不完整,请检查设置');
							return;
						}
						const daynote_id = (await api.createDailyNote(window.siyuan.ws.app.appId, settingdata["tl-draw-create-note-id"])).id
						if (!daynote_id) {
							showMessage('未找到日记块');
							return;
						}
						const idid = await api.generateSiyuanID() as string;

						const redata = await api.appendBlock("markdown", `{{{row

{: id="${await api.generateSiyuanID() as string}"}

{: id="${await api.generateSiyuanID() as string}"}
}}}
{: id="${idid}" custom-st-tldraw="1" }`, tldrawId || daynote_id)
						// const id = iddata[0].doOperations[0].id;
						blockId = redata[0].doOperations[0].id;
						// console.log('redata', redata);
						//延时一会儿，等待块渲染完成
						console.log("1");
						console.log('blockId222222221111111', blockId, "iiiiiii/n", shape.id);
						const eeee = this.editor.updateShape({
							id: shape.id,
							type: shape.type,
							props: {
								...shape.props,
								blockId: blockId,
							},
						});
						// console.log("2", this.editor.getShape(shape.id));
						// console.log('editor', eeee);
						// console.log('blo2', (this.editor.getShape(shape.id) as ICardShape).props.blockId);
					}

					await new Promise((resolve) => setTimeout(resolve, 200));

					if (!blockId) {
						showMessage('未找到块');
						return;
					}
					const pt = new Protyle(window.siyuan.ws.app, containerRef.current, {
						blockId: blockId,
						// rootId: blockId,
						defId: blockId,
						render: {
							breadcrumb: true,
							gutter: true,
							// title:true,
							breadcrumbDocName: true,
							// scroll:false,
						},
						// action: ["cb-get-focus"],
						mode: "wysiwyg",
					});
					// pt.focusBlock(blockId);
					protyleRef.current = pt;
					if (containerRef.current) {
						containerRef.current.setAttribute('blockid', blockId);
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