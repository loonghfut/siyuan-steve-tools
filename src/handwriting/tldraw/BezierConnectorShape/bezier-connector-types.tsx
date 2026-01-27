import { TLBaseShape, TLDefaultColorStyle, TLDefaultFontStyle, TLDefaultSizeStyle, TLRichText, VecModel } from '@tldraw/tldraw'

/**
 * 贝塞尔连接器形状类型定义
 * 用于连接 Card 和 SingleBlock 形状
 */
export type IBezierConnectorShape = TLBaseShape<
	'bezier-connector',
	{
		/** 起点坐标（未绑定时使用） */
		start: VecModel
		/** 终点坐标（未绑定时使用） */
		end: VecModel
		/** 线条颜色 */
		color: TLDefaultColorStyle
		/** 线条宽度 */
		strokeWidth: number
		/** 线条样式 */
		strokeStyle?: 'solid' | 'dashed' | 'flowing'
		/** 标签富文本内容 */
		richText: TLRichText
		/** 标签位置（0-1，沿曲线的位置） */
		labelPosition: number
		/** 字体样式 */
		font: TLDefaultFontStyle
		/** 字号 */
		size: TLDefaultSizeStyle
		/** 缩放比例 */
		scale: number
	}
>

/**
 * 端口类型：start 表示输出端口，end 表示输入端口
 */
export type PortTerminal = 'start' | 'end'

/**
 * 端口定义
 */
export interface ShapePort extends VecModel {
	/** 端口唯一标识 */
	id: string
	/** 端口类型 */
	terminal: PortTerminal
}

/**
 * 端口标识符
 */
export interface PortIdentifier {
	/** 形状 ID */
	shapeId: string
	/** 端口 ID */
	portId: string
}
