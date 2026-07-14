import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

export type BranchDirection = 'right' | 'left'
export type BranchLineStyle = 'curve-solid' | 'elbow-solid' | 'straight-solid' | 'curve-dashed' | 'frame-floating'

export type IBranchShape = TLBaseShape<
	'branch',
	{
		w: number
		h: number
		color: TLDefaultColorStyle
		leftChildIds?: string[]
		rightChildIds: string[]
		rootShapeId?: string
		rootX?: number
		direction: string
		horizontalGap: number
		verticalGap: number
		lineWidth: number
		lineStyle?: BranchLineStyle
		snapDistance: number
		showBackground?: boolean
		version?: number
	}
>

export type BranchChildShape = {
	id: string
	type: 'card' | 'single-block' | 'branch'
	x: number
	y: number
	props: {
		w: number
		h: number
		[key: string]: unknown
	}
}
