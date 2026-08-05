import { computed, EditorAtom } from '@tldraw/tldraw'
import type { Editor } from '@tldraw/tldraw'
import { settingdata } from '@/index'

const DEFAULT_LOW_DETAIL_THRESHOLD = 48
const MAX_LOW_DETAIL_THRESHOLD = 500
const DEFAULT_LOW_DETAIL_COUNT_THRESHOLD = 10
const MAX_LOW_DETAIL_COUNT_THRESHOLD = 500

/**
 * The persisted key predates SingleBlock support. Keep it stable so existing
 * user preferences continue to apply to both Card and SingleBlock shapes.
 */
export function getShapeLowDetailThreshold(): number {
	const configuredThreshold = Number(settingdata['tldraw-card-low-detail-threshold'])
	if (!Number.isFinite(configuredThreshold)) return DEFAULT_LOW_DETAIL_THRESHOLD
	return Math.min(MAX_LOW_DETAIL_THRESHOLD, Math.max(0, configuredThreshold))
}

/** Number of Card / SingleBlock shapes visible before low-detail rendering is enabled. */
export function getShapeLowDetailCountThreshold(): number {
	const configuredThreshold = Number(settingdata['tldraw-card-low-detail-count-threshold'])
	if (!Number.isFinite(configuredThreshold)) return DEFAULT_LOW_DETAIL_COUNT_THRESHOLD
	return Math.min(MAX_LOW_DETAIL_COUNT_THRESHOLD, Math.max(0, configuredThreshold))
}

// getRenderingShapes() is relatively expensive for large documents. Keep one
// reactive, cached count per Editor so every Card / SingleBlock component
// observes the same derived value instead of reducing the rendering list.
const VisibleCardAndSingleBlockCount = new EditorAtom('visible card and single-block count', (editor) =>
	computed('visible card and single-block count', () => {
		return editor.getRenderingShapes().reduce((count, { shape }) => {
			return count + (shape.type === 'card' || shape.type === 'single-block' ? 1 : 0)
		}, 0)
	}),
)

/** Count the Card / SingleBlock shapes tldraw currently intends to render in the viewport. */
export function getVisibleCardAndSingleBlockCount(editor: Editor): number {
	return VisibleCardAndSingleBlockCount.get(editor).get()
}

/** Keep lightweight-preview text close to 20 screen pixels where the shape allows it. */
export function getShapeLowDetailFontSize(minDimension: number, efficientZoom: number): number {
	const safeDimension = Math.max(0, minDimension)
	const safeZoom = Math.max(0.01, efficientZoom)
	const availableFontSize = Math.max(12, safeDimension * 0.42)
	return Math.round(Math.min(availableFontSize, 20 / safeZoom))
}
