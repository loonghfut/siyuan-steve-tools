import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

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
	}
>