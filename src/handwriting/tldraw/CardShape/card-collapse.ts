import type { ICardShape } from './card-shape-types'

export function getCardCollapsedHeight(shape: ICardShape) {
	const fontSize = shape.props.fontSize || 16
	return Math.max(fontSize * 6, shape.props.isMain ? 260 : 100)
}

export function buildCardCollapseUpdate(shape: ICardShape, nextCollapsed: boolean) {
	const nextProps: ICardShape['props'] = {
		...shape.props,
		isCollapsed: nextCollapsed,
	}

	if (nextCollapsed) {
		nextProps.preCollapseHeight = shape.props.h
		nextProps.h = getCardCollapsedHeight(shape)
	} else if (shape.props.preCollapseHeight && shape.props.preCollapseHeight > 0) {
		nextProps.h = shape.props.preCollapseHeight
	}

	return {
		id: shape.id,
		type: 'card' as const,
		props: nextProps,
	}
}
