import { createShapePropsMigrationIds, createShapePropsMigrationSequence, toRichText } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('bezier-connector', {
	AddColorAndStrokeWidth: 1,
	AddStrokeStyle: 2,
	AddRichTextLabel: 3,
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
				if (props.strokeStyle !== 'solid' && props.strokeStyle !== 'dashed' && props.strokeStyle !== 'flowing') {
					props.strokeStyle = 'solid'
				}
			},
			down(props: any) {
				delete props.strokeStyle
			},
		},
		{
			id: versions.AddRichTextLabel,
			up(props: any) {
				// 添加富文本标签支持
				if (props.richText === undefined) {
					props.richText = toRichText('')
				}
				if (props.labelPosition === undefined) {
					props.labelPosition = 0.5
				}
				if (props.font === undefined) {
					props.font = 'draw'
				}
				if (props.size === undefined) {
					props.size = 'm'
				}
				if (props.scale === undefined) {
					props.scale = 1
				}
			},
			down(props: any) {
				delete props.richText
				delete props.labelPosition
				delete props.font
				delete props.size
				delete props.scale
			},
		},
	],
})
