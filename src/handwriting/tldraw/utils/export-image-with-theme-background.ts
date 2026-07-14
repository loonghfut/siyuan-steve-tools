import type { Editor, TLImageExportOptions, TLShapeId } from '@tldraw/tldraw'

const THEME_BACKGROUND_VARIABLE = '--b3-theme-background'

export function getSiyuanThemeBackgroundColor(): string {
	const root = document.documentElement
	const body = document.body
	return (
		getComputedStyle(root).getPropertyValue(THEME_BACKGROUND_VARIABLE).trim() ||
		getComputedStyle(body).getPropertyValue(THEME_BACKGROUND_VARIABLE).trim() ||
		'#ffffff'
	)
}

/** Export transparent tldraw content, then composite it over SiYuan's theme background when enabled. */
export async function toPngWithSiyuanThemeBackground(
	editor: Editor,
	shapeIds: TLShapeId[],
	options: Omit<TLImageExportOptions, 'format' | 'background'> = {}
): Promise<Blob> {
	const image = await editor.toImage(shapeIds, {
		...options,
		format: 'png',
		background: false,
	})
	if (!editor.getInstanceState().exportBackground) {
		return image.blob
	}
	const bitmap = await createImageBitmap(image.blob)
	const canvas = document.createElement('canvas')
	canvas.width = bitmap.width
	canvas.height = bitmap.height
	const context = canvas.getContext('2d')
	if (!context) {
		bitmap.close()
		throw new Error('Could not create image canvas')
	}
	context.fillStyle = getSiyuanThemeBackgroundColor()
	context.fillRect(0, 0, canvas.width, canvas.height)
	context.drawImage(bitmap, 0, 0)
	bitmap.close()

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
	if (!blob) throw new Error('Could not create PNG')
	return blob
}

export async function downloadPng(blob: Blob, filename = 'whiteboard.png'): Promise<void> {
	const url = URL.createObjectURL(blob)
	try {
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = filename
		anchor.click()
	} finally {
		URL.revokeObjectURL(url)
	}
}

export async function copyPng(blob: Blob): Promise<void> {
	await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
