const MAX_LIGHTWEIGHT_PREVIEW_LENGTH = 36

/**
 * Produce a compact plain-text summary that is safe to persist in shape props.
 * The input is content that has already been loaded for the full preview.
 */
export function getLightweightPreviewTextFromHtml(html: string): string {
	if (!html || typeof document === 'undefined') return ''

	const container = document.createElement('div')
	container.innerHTML = html
	container.querySelectorAll('script, style, svg, button, input, textarea').forEach((element) => element.remove())
	return normalizeLightweightPreviewText(container.textContent || '')
}

export function getLightweightPreviewTextFromElement(element: HTMLElement | null): string {
	if (!element) return ''
	return normalizeLightweightPreviewText(element.textContent || '')
}

export function normalizeLightweightPreviewText(text: string): string {
	const normalized = text.replace(/\s+/g, ' ').trim()
	if (normalized.length <= MAX_LIGHTWEIGHT_PREVIEW_LENGTH) return normalized
	return `${normalized.slice(0, MAX_LIGHTWEIGHT_PREVIEW_LENGTH - 3)}...`
}
