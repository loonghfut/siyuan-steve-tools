import { TLBaseShape, TLDefaultColorStyle } from '@tldraw/tldraw'

export type IJsShape = TLBaseShape<
	'js-shape',
	{
		w: number
		h: number
		color: TLDefaultColorStyle
		script: string
		/**
		 * 是否在属性发生变化时自动重新执行脚本。
		 * 默认 true。
		 */
		autoRun?: boolean
		/**
		 * 允许脚本渲染的 DOM 接收指针事件，从而支持交互。
		 * 默认 false（以避免影响画布选择/拖拽）。
		 */
		interactive?: boolean
		/**
		 * 自定义数据，供脚本持久化保存（JSON 字符串）。
		 */
		data?: string
	}
>
