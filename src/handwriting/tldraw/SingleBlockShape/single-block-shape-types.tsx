import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

export type ISingleBlockShape = TLBaseShape<
	'single-block',
	{
		w: number
		h: number
		color: TLDefaultColorStyle
		blockId: string
		fontSize?: number
		refreshNonce?: number
		/** 是否在按 Enter 创建新形状时自动与其建立连接（箭头） */
		connectOnEnter?: boolean
	}
>
