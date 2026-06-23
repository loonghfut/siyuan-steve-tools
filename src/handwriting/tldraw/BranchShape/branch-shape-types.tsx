import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

export type BranchDirection = 'right' | 'left'

export type IBranchShape = TLBaseShape<
	'branch',
	{
		w: number
		h: number
		color: TLDefaultColorStyle
		childIds: string[]
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
