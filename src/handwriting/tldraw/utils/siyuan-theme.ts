import type { Editor, TLTheme } from '@tldraw/tldraw'

/**
 * 从思源根元素读取 CSS 变量的实际颜色值。
 *
 * tldraw 的 Canvas 2D 渲染无法直接解析思源的 CSS 变量，所以这里必须
 * 先通过 computed style 取出变量最终值，再写入 tldraw 的 TLTheme。
 */
export function getSiyuanColor(variableName: string): string {
	if (typeof document === 'undefined') return ''

	return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
}

function getSiyuanColorOrFallback(variableName: string, fallback: string): string {
	return getSiyuanColor(variableName) || fallback
}

/**
 * 将颜色转换为带透明度的 rgba 值。
 *
 * 思源主题变量可能是 hex、rgb 或 hsl。借助 Canvas 的颜色解析能力统一
 * 转换，避免直接给 `rgb(...)` 拼接 hex alpha 后缀造成无效颜色。
 */
// function withAlpha(color: string, alpha: number): string {
// 	if (typeof document === 'undefined') return color

// 	const canvas = document.createElement('canvas')
// 	const context = canvas.getContext('2d')
// 	if (!context) return color

// 	context.fillStyle = '#000000'
// 	context.fillStyle = color
// 	const normalizedColor = context.fillStyle
// 	const rgb = normalizedColor.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[,/]\s*[\d.]+)?\s*\)$/i)

// 	if (!rgb) return color

// 	return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
// }

function getSiyuanColorMode(): 'light' | 'dark' {
	return document.documentElement.getAttribute('data-theme-mode') === 'dark' ? 'dark' : 'light'
}

function getThemeColor(variableName: string, fallback: string): string {
	return getSiyuanColorOrFallback(variableName, fallback)
}

/**
 * 将当前思源主题同步到 tldraw 的 default theme。
 *
 * 只覆盖当前颜色模式，保留另一种模式的已有配置；切换思源主题后再次
 * 调用本函数即可读取新的 computed style 并刷新 Canvas 颜色。
 */
export function syncTldrawThemeFromSiyuan(editor: Editor): void {
	const defaultTheme = editor.getTheme('default')
	if (!defaultTheme) return

	const colorMode = getSiyuanColorMode()
	const currentColors = defaultTheme.colors[colorMode]
	const textColor = getThemeColor('--b3-theme-on-background', currentColors.text)
	const backgroundColor = getThemeColor('--b3-theme-background', currentColors.background)
	const primaryColor = getThemeColor('--b3-theme-primary', currentColors.selectionStroke)
	const borderColor = getThemeColor('--b3-border-color', currentColors.noteBorder)
	const onPrimaryColor = getSiyuanColorOrFallback('--b3-theme-on-primary', '#ffffff')
	const errorColor = getSiyuanColorOrFallback('--b3-theme-error', primaryColor)

	const colors = {
		...currentColors,
		text: textColor,
		background: backgroundColor,
		negativeSpace: backgroundColor,
		// cursor: textColor,
		noteBorder: borderColor,
		selectionStroke: primaryColor,
		// selectionFill: withAlpha(primaryColor, 0.005),
		selectedContrast: onPrimaryColor,
		brushStroke: primaryColor,
		// brushFill: withAlpha(primaryColor, 0.082),
		snap: primaryColor,
		laser: errorColor,
	}

	const theme: TLTheme = {
		...defaultTheme,
		colors: {
			...defaultTheme.colors,
			[colorMode]: colors,
		},
	}

	editor.updateTheme(theme)
	editor.setColorMode(colorMode)
}
