import type { TLImageExportOptions } from '@tldraw/tldraw'
import { settingdata } from '@/index'

const DEFAULT_EXPORT_IMAGE_QUALITY = 100
const DEFAULT_EXPORT_PIXEL_RATIO = 2

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min
	return Math.min(max, Math.max(min, value))
}

export function getTldrawExportImageQuality(): number {
	const raw = Number(settingdata?.['tldraw-export-image-quality'] ?? DEFAULT_EXPORT_IMAGE_QUALITY)
	return clamp(raw, 10, 100) / 100
}

export function getTldrawExportPixelRatio(): number {
	const raw = Number(settingdata?.['tldraw-export-pixel-ratio'] ?? DEFAULT_EXPORT_PIXEL_RATIO)
	return clamp(raw, 0.5, 4)
}

export function getTldrawImageExportOptions(): Pick<TLImageExportOptions, 'quality' | 'pixelRatio'> {
	return {
		quality: getTldrawExportImageQuality(),
		pixelRatio: getTldrawExportPixelRatio(),
	}
}
