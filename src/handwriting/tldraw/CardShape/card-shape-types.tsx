import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

export type CardRenderMode = string //'inherit' | 'static-dom' | 'live-protyle'

// A type for our custom card shape
export type ICardShape = TLBaseShape<
	'card',
	{
		w: number
		h: number
		color: TLDefaultColorStyle,
		showMask: boolean,
		blockId: string // 添加 blockId 属性
		isNewlyCreated?: boolean
		fontSize?: number // 添加字体大小属性
		isMain?: boolean // 添加是否为主卡片属性
		version?: number // 添加 vision 属性
		refreshNonce?: number // 添加 refreshNonce 属性
		isCollapsed?: boolean // 添加折叠状态属性
		preCollapseHeight?: number // 折叠前的高度，用于展开时恢复
		collapsedTextSize?: number // 折叠后的文字大小
		collapsedTextAlign?: string // 折叠后的文字对齐方式：left | center | right
		renderMode?: string// 每块渲染模式优先级高于全局  'inherit' | 'static-dom' | 'live-protyle'
	}
>