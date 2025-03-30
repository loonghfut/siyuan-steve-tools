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
	}
>