import { Editor, TLShapeId } from '@tldraw/tldraw'
import { SlideShape } from './SlideShapeUtil'
import { clearSvgExportSnapshotCache } from '../utils/export-dom-snapshot'
import { getTldrawImageExportOptions } from '../utils/export-image-options'
import { prepareSvgExportSnapshots } from '../utils/export-snapshot-preparer'

export type SlideScreenshotFormat = 'png' | 'svg'

export interface CaptureSlideScreenshotOptions {
	format?: SlideScreenshotFormat
	pixelRatio?: number
	quality?: number
	padding?: number
	background?: boolean
	includeSlideOutline?: boolean
	updateShape?: boolean
}

export interface CaptureSlideScreenshotResult {
	dataUrl: string
	blob: Blob
	width: number
	height: number
	format: SlideScreenshotFormat
}

function intersects(a: { minX: number; maxX: number; minY: number; maxY: number }, b: { minX: number; maxX: number; minY: number; maxY: number }) {
	return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY)
}

export async function captureSlideScreenshot(
	editor: Editor,
	slideId: TLShapeId,
	opts: CaptureSlideScreenshotOptions = {}
): Promise<CaptureSlideScreenshotResult | null> {
	const slide = editor.getShape<SlideShape>(slideId)
	if (!slide || slide.type !== 'slide') {
		return null
	}

	const slideBounds = editor.getShapePageBounds(slideId)
	if (!slideBounds) {
		return null
	}

	const imageExportOptions = getTldrawImageExportOptions()
	const {
		format = 'png',
		pixelRatio = imageExportOptions.pixelRatio ?? (typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 2),
		quality = imageExportOptions.quality ?? 1,
		padding = 0,
		background = true,
		includeSlideOutline = false,
		updateShape = false,
	} = opts

	const pageId = slide.parentId
	const shapesOnPage = editor.getSortedChildIdsForParent(pageId)

	const shapeIdsForExport = new Set<TLShapeId>()
	for (const shapeId of shapesOnPage) {
		if (shapeId === slideId) continue
		const shape = editor.getShape(shapeId)
		if (!shape || shape.type === 'slide') continue
		const bounds = editor.getShapeMaskedPageBounds(shapeId) ?? editor.getShapePageBounds(shapeId)
		if (!bounds) continue
		if (intersects(bounds, slideBounds)) {
			shapeIdsForExport.add(shapeId)
		}
	}

	if (includeSlideOutline) {
		shapeIdsForExport.add(slideId)
	}

	const idsToExport = Array.from(shapeIdsForExport)
	const exportBounds = slideBounds.clone().expandBy(padding)

	let width = exportBounds.width
	let height = exportBounds.height

	let blob: Blob | null = null
	let dataUrl = ''

	if (idsToExport.length > 0) {
		try {
			await prepareSvgExportSnapshots(editor, idsToExport)
			if (format === 'svg') {
				const svgResult = await editor.getSvgString(idsToExport, {
					bounds: exportBounds,
					background,
				})
				if (!svgResult) {
					return null
				}
				width = svgResult.width
				height = svgResult.height
				blob = new Blob([svgResult.svg], { type: 'image/svg+xml' })
				dataUrl = await blobToDataUrl(blob)
			} else {
				const imageResult = await editor.toImage(idsToExport, {
					format,
					pixelRatio,
					quality,
					bounds: exportBounds,
					background,
				})
				blob = imageResult.blob
				width = imageResult.width
				height = imageResult.height
				dataUrl = await blobToDataUrl(blob)
			}
		} finally {
			clearSvgExportSnapshotCache()
		}
	} else {
		const backgroundColor = background ? 'var(--b3-theme-background)' : 'transparent'
		if (format === 'svg') {
			const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:${backgroundColor}"/>`
			blob = new Blob([svg], { type: 'image/svg+xml' })
			dataUrl = await blobToDataUrl(blob)
		} else {
			const canvas = document.createElement('canvas')
			const scaledWidth = Math.max(1, Math.round(width * pixelRatio))
			const scaledHeight = Math.max(1, Math.round(height * pixelRatio))
			canvas.width = scaledWidth
			canvas.height = scaledHeight
			const ctx = canvas.getContext('2d')
			if (!ctx) {
				return null
			}
			ctx.scale(pixelRatio, pixelRatio)
			ctx.fillStyle = background ? backgroundColor : 'transparent'
			ctx.fillRect(0, 0, width, height)
			blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), 'image/png'))
			if (!blob) {
				return null
			}
			dataUrl = await blobToDataUrl(blob)
		}
	}

	if (updateShape && dataUrl && slide.props.screenshot !== dataUrl) {
		editor.updateShape({
			id: slideId,
			type: 'slide',
			props: { screenshot: dataUrl },
		})
	}

	return {
		dataUrl,
		blob: blob!,
		width,
		height,
		format,
	}
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as data URL'))
		reader.readAsDataURL(blob)
	})
}
