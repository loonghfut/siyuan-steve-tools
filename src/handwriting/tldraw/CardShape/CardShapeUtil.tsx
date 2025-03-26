import { useState, useEffect, useRef } from 'react'
import React from 'react';
import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	TLResizeInfo,
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
	// [4]
	getDefaultProps(): ICardShape['props'] {
		return {
			w: 300,
			h: 300,
			color: 'black',
			showMask: true,
			blockId: ''
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
			const container = containerRef.current;
			if (container && isEditingState) {
			  const handleInternalWheel = (e: WheelEvent) => {
				e.stopPropagation();
				// 允许默认滚动行为
			  };
			  
			  container.addEventListener('wheel', handleInternalWheel, { passive: true });
			  return () => {
				container.removeEventListener('wheel', handleInternalWheel);
			  };
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
						console.log('bbbbbbbbbb',protyleRef.current.protyle.wysiwyg);
					}
					protyleRef.current = null;
				}

				const createBlockIfNeeded = async () => {
					let blockId = shape.props.blockId;
					if (!blockId) {
						const daynote_id = (await api.createDailyNote(window.siyuan.ws.app.appId, settingdata["cal-create-pos"])).id
						if (!daynote_id) {
							showMessage('未找到日记块');
							return;
						}
						const idid = await api.generateSiyuanID() as string;

						await api.appendBlock("markdown", `{{{row

{: id="${await api.generateSiyuanID() as string}"}

{: id="${await api.generateSiyuanID() as string}"}
}}}
{: id="${idid}" custom-st-tldraw="1" }`, daynote_id)
						// const id = iddata[0].doOperations[0].id;
						blockId = idid;
					}
					if (!blockId) {
						showMessage('未找到块');
						return;
					}
					 const pt = new Protyle(window.siyuan.ws.app, containerRef.current, {
						blockId: blockId,
						render: {
							breadcrumb: true,
							gutter: true,
							title:true,
							breadcrumbDocName: true,
							scroll:false,
						},
						action: ["cb-get-focus"],
						mode: "wysiwyg",
					});
					protyleRef.current = pt;
					console.log('aaaaaaaaaaaa',pt.protyle.wysiwyg);
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
		}, [shape.id, shape.props.blockId]); // 添加 shape.props.blockId 作为依赖项
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
					border: '1px solid black',
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
					style={{
						width: '100%',
						height: '100%',
						overflow: 'hidden',
						pointerEvents: isEditingState ? 'all' : 'none',
						// 创建独立的坐标上下文
						position: 'relative',
						isolation: 'isolate',
						touchAction: isEditingState ? 'auto' : 'none',
						contain: 'strict', // 强力隔离
					}}
				></div>
			</HTMLContainer>
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