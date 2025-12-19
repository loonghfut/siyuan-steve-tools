import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('bezier-connector', {
	AddColorAndStrokeWidth: 1,
	AddStrokeStyle: 2,
})

/**
 * 贝塞尔连接器形状的迁移配置
 */
export const bezierConnectorShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddColorAndStrokeWidth,
			up(props: any) {
				// Use tldraw official color tokens instead of hardcoded hex.
				// Align with other shapes which default to 'black'.
				props.color = props.color ?? 'black'
				props.strokeWidth = props.strokeWidth ?? 2
			},
			down(props: any) {
				delete props.color
				delete props.strokeWidth
			},
		},
		{
			id: versions.AddStrokeStyle,
			up(props: any) {
				if (props.strokeStyle !== 'solid' && props.strokeStyle !== 'dashed') {
					props.strokeStyle = 'solid'
				}
			},
			down(props: any) {
				delete props.strokeStyle
			},
		},
	],
})
