export function getShapeHostElement(shapeId: string): HTMLElement | null {
	if (typeof document === 'undefined') return null

	const hostById = document.getElementById(shapeId)
	if (hostById) return hostById

	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		const hostByDataShapeId = document.querySelector<HTMLElement>(
			`[data-shape-id="${CSS.escape(shapeId)}"]`
		)
		if (hostByDataShapeId) return hostByDataShapeId
	}

	return (
		Array.from(document.querySelectorAll<HTMLElement>('[data-shape-id]')).find(
			(el) => el.getAttribute('data-shape-id') === shapeId
		) || null
	)
}
