import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

export type ISingleBlockShape = TLBaseShape<
	'single-block',
	{
		w: number
		h: number
		color: TLDefaultColorStyle
		blockId: string
		/** 新建时标记：首次创建时为 true，用于延迟在编辑时创建思源块 */
		isNewlyCreated?: boolean
		fontSize?: number
		refreshNonce?: number
		/** 是否在按 Enter 创建新形状时自动与其建立连接（箭头） */
		connectOnEnter?: boolean
		/** 是否允许与其他形状建立绑定（自动或手动） */
		allowBinding?: boolean
        /** 是否使用透明背景并且不显示边框 */
        transparentBackground?: boolean
	}
>
