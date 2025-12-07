import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('bezier-connector', {
	AddColorAndStrokeWidth: 1,
})

/**
 * 贝塞尔连接器形状的迁移配置
 */
export const bezierConnectorShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddColorAndStrokeWidth,
			up(props: any) {
				props.color = props.color ?? '#666666'
				props.strokeWidth = props.strokeWidth ?? 2
			},
			down(props: any) {
				delete props.color
				delete props.strokeWidth
			},
		},
	],
})
