export function getShapeHostElement(shapeId: string, root?: ParentNode): HTMLElement | null {
	if (typeof document === 'undefined') return null
	const searchRoot = root ?? document

	if (searchRoot instanceof Document) {
		const hostById = searchRoot.getElementById(shapeId)
		if (hostById) return hostById
	}

	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		const escapedShapeId = CSS.escape(shapeId)
		const hostById = searchRoot.querySelector<HTMLElement>(`#${escapedShapeId}`)
		if (hostById) return hostById

		const hostByDataShapeId = searchRoot.querySelector<HTMLElement>(
			`[data-shape-id="${CSS.escape(shapeId)}"]`
		)
		if (hostByDataShapeId) return hostByDataShapeId
	}

	return (
		Array.from(searchRoot.querySelectorAll<HTMLElement>('[id], [data-shape-id]')).find(
			(el) => el.id === shapeId || el.getAttribute('data-shape-id') === shapeId
		) || null
	)
}
