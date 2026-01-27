import { DefaultColorStyle, DefaultFontStyle, DefaultSizeStyle, RecordProps, T, vecModelValidator } from '@tldraw/tldraw'
import { IBezierConnectorShape } from './bezier-connector-types'

/**
 * 贝塞尔连接器形状的属性验证器
 */
export const bezierConnectorShapeProps: RecordProps<IBezierConnectorShape> = {
	start: vecModelValidator,
	end: vecModelValidator,
	color: DefaultColorStyle,
	strokeWidth: T.number,
	strokeStyle: T.optional(T.literalEnum('solid', 'dashed', 'flowing')),
	richText: T.any,
	labelPosition: T.number,
	font: DefaultFontStyle,
	size: DefaultSizeStyle,
	scale: T.number,
}
