import { settingdata } from '@/index'

const DEFAULT_LOW_DETAIL_THRESHOLD = 48
const MAX_LOW_DETAIL_THRESHOLD = 500

/**
 * The persisted key predates SingleBlock support. Keep it stable so existing
 * user preferences continue to apply to both Card and SingleBlock shapes.
 */
export function getShapeLowDetailThreshold(): number {
	const configuredThreshold = Number(settingdata['tldraw-card-low-detail-threshold'])
	if (!Number.isFinite(configuredThreshold)) return DEFAULT_LOW_DETAIL_THRESHOLD
	return Math.min(MAX_LOW_DETAIL_THRESHOLD, Math.max(0, configuredThreshold))
}

/** Keep lightweight-preview text close to 20 screen pixels where the shape allows it. */
export function getShapeLowDetailFontSize(minDimension: number, efficientZoom: number): number {
	const safeDimension = Math.max(0, minDimension)
	const safeZoom = Math.max(0.01, efficientZoom)
	const availableFontSize = Math.max(12, safeDimension * 0.42)
	return Math.round(Math.min(availableFontSize, 20 / safeZoom))
}
