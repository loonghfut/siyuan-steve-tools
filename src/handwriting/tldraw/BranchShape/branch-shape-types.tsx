import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

export type BranchDirection = 'right' | 'left'

export type IBranchShape = TLBaseShape<
	'branch',
	{
		w: number
		h: number
		color: TLDefaultColorStyle
		/** 旧版兼容字段：等价于右侧连接 */
		childIds: string[]
		leftChildIds?: string[]
		rightChildIds?: string[]
		rootX?: number
		direction: string
		horizontalGap: number
		verticalGap: number
		lineWidth: number
		snapDistance: number
		version?: number
	}
>

export type BranchChildShape = {
	id: string
	type: 'card' | 'single-block'
	x: number
	y: number
	props: {
		w: number
		h: number
		[key: string]: unknown
	}
}
