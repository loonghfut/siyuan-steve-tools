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
	}
>
