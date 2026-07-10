const ATTRS_TO_REMOVE = [
	'contenteditable',
	'data-node-id',
	'data-node-index',
	'updated',
	'data-realwidth',
	'data-readonly',
	'spellcheck',
	'draggable',
	'data-render',
	'loading',
	'crossorigin',
]

const MIME_MAP: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	bmp: 'image/bmp',
	ico: 'image/x-icon',
	avif: 'image/avif',
	mp4: 'video/mp4',
	webm: 'video/webm',
	ogg: 'video/ogg',
}

function binaryToBase64(binary: string): string {
	let base64 = ''
	const chunkSize = 0x6000
	for (let i = 0; i < binary.length; i += chunkSize) {
		const slice = binary.slice(i, i + chunkSize)
		let normalized = ''
		for (let j = 0; j < slice.length; j++) {
			normalized += String.fromCharCode(slice.charCodeAt(j) & 0xff)
		}
		base64 += btoa(normalized)
	}
	return base64
}

export function assetToDataUrl(rawSrc: string | null): string {
	if (!rawSrc) return ''
	const trimmed = rawSrc.trim()
	if (!trimmed || /^data:/i.test(trimmed) || /^https?:/i.test(trimmed) || trimmed.startsWith('//')) {
		return trimmed
	}

	let logicalPath = trimmed.replace(/^\.\//, '')
	if (logicalPath.startsWith('/')) logicalPath = logicalPath.slice(1)

	let kernelPath = ''
	if (logicalPath.startsWith('assets/')) kernelPath = `/data/${logicalPath}`
	else if (logicalPath.startsWith('data/')) kernelPath = `/${logicalPath}`
	else if (logicalPath.startsWith('/data/')) kernelPath = logicalPath
	else return trimmed

	try {
		const xhr = new XMLHttpRequest()
		xhr.open('POST', '/api/file/getFile', false)
		xhr.overrideMimeType('text/plain; charset=x-user-defined')
		xhr.setRequestHeader('Content-Type', 'application/json')
		xhr.send(JSON.stringify({ path: kernelPath }))
		if (xhr.status >= 200 && xhr.status < 300 && typeof xhr.responseText === 'string') {
			const base64 = binaryToBase64(xhr.responseText)
			const ext = (logicalPath.split('.').pop() || 'png').toLowerCase()
			const mime = MIME_MAP[ext] || 'application/octet-stream'
			return `data:${mime};base64,${base64}`
		}
	} catch (err) {
		console.warn('Embedding asset failed', err)
	}
	return trimmed
}

function getElementsIncludingRoot<T extends Element>(root: Element, selector: string): T[] {
	const result: T[] = []
	if (root.matches(selector)) result.push(root as T)
	root.querySelectorAll<T>(selector).forEach((el) => result.push(el))
	return result
}

function inlineComputedStyles(source: Element, target: Element): void {
	if (!(source instanceof HTMLElement || source instanceof SVGElement)) return
	if (!(target instanceof HTMLElement || target instanceof SVGElement)) return

	try {
		const computed = window.getComputedStyle(source)
		const styleText = Array.from(computed)
			.map((prop) => `${prop}:${computed.getPropertyValue(prop)};`)
			.join('')
		const existing = target.getAttribute('style') || ''
		target.setAttribute('style', `${styleText}${existing}`)
	} catch {
		// ignore nodes that cannot expose computed styles
	}

	const sourceChildren = Array.from(source.children)
	const targetChildren = Array.from(target.children)
	for (let i = 0; i < sourceChildren.length; i++) {
		const srcChild = sourceChildren[i]
		const tgtChild = targetChildren[i]
		if (srcChild && tgtChild) inlineComputedStyles(srcChild, tgtChild)
	}
}

function removeRuntimeAttrs(container: Element): void {
	const nodes = [container, ...Array.from(container.querySelectorAll('*'))]
	for (const node of nodes) {
		for (const attr of ATTRS_TO_REMOVE) {
			node.removeAttribute(attr)
		}
	}
}

function setResolvedSrcset(element: Element): void {
	const srcset = element.getAttribute('srcset')
	if (!srcset) return
	const resolvedSet = srcset
		.split(',')
		.map((entry) => {
			const [url, descriptor] = entry.trim().split(/\s+/, 2)
			const resolved = assetToDataUrl(url)
			return resolved ? (descriptor ? `${resolved} ${descriptor}` : resolved) : ''
		})
		.filter(Boolean)
		.join(', ')
	if (resolvedSet) element.setAttribute('srcset', resolvedSet)
	else element.removeAttribute('srcset')
}

function processImages(container: Element): void {
	getElementsIncludingRoot<HTMLImageElement>(container, 'img').forEach((img) => {
		const embedded = assetToDataUrl(img.getAttribute('src'))
		if (embedded) img.setAttribute('src', embedded)
		setResolvedSrcset(img)
	})
	getElementsIncludingRoot<HTMLSourceElement>(container, 'source').forEach((source) => {
		const embedded = assetToDataUrl(source.getAttribute('src'))
		if (embedded) source.setAttribute('src', embedded)
		setResolvedSrcset(source)
	})
}

function processVideos(container: Element): void {
	getElementsIncludingRoot<HTMLVideoElement>(container, 'video').forEach((video) => {
		const poster = video.getAttribute('poster')
		const replacement = document.createElement('img')
		replacement.setAttribute('src', poster ? assetToDataUrl(poster) || poster : '')
		replacement.style.cssText = video.getAttribute('style') || ''
		replacement.style.objectFit = replacement.style.objectFit || 'cover'
		replacement.alt = 'Video'
		video.replaceWith(replacement)
	})
}

function processCanvases(source: Element, clone: Element): void {
	const sourceCanvases = getElementsIncludingRoot<HTMLCanvasElement>(source, 'canvas')
	const cloneCanvases = getElementsIncludingRoot<HTMLCanvasElement>(clone, 'canvas')
	sourceCanvases.forEach((canvas, index) => {
		const clonedCanvas = cloneCanvases[index]
		if (!clonedCanvas) return
		try {
			const img = document.createElement('img')
			img.src = canvas.toDataURL('image/png')
			img.style.cssText = clonedCanvas.getAttribute('style') || ''
			img.style.width = img.style.width || `${canvas.width}px`
			img.style.height = img.style.height || `${canvas.height}px`
			clonedCanvas.replaceWith(img)
		} catch {
			const placeholder = document.createElement('div')
			placeholder.style.cssText = clonedCanvas.getAttribute('style') || ''
			placeholder.textContent = 'Canvas'
			clonedCanvas.replaceWith(placeholder)
		}
	})
}

function processIframes(container: Element): void {
	getElementsIncludingRoot<HTMLIFrameElement>(container, 'iframe').forEach((iframe) => {
		const placeholder = document.createElement('div')
		placeholder.style.cssText = iframe.getAttribute('style') || ''
		placeholder.textContent = 'Embedded content'
		iframe.replaceWith(placeholder)
	})
}

function processSvgUse(container: Element): void {
	container.querySelectorAll('svg use').forEach((use) => {
		const href = use.getAttribute('href') || use.getAttribute('xlink:href')
		if (!href?.startsWith('#')) return
		const target = document.getElementById(href.slice(1))
		if (!target) return
		const clonedTarget = target.cloneNode(true) as Element
		clonedTarget.removeAttribute('id')
		use.replaceWith(clonedTarget)
	})
}

function hideScrollbars(container: Element): void {
	const nodes = [container, ...Array.from(container.querySelectorAll('*'))]
	for (const node of nodes) {
		if (node instanceof HTMLElement) {
			node.style.setProperty('scrollbar-width', 'none', 'important')
			node.style.setProperty('-ms-overflow-style', 'none', 'important')
		}
	}
}

export function serializeElementForSvgExport(
	source: HTMLElement,
	options: {
		viewportWidth: number
		viewportHeight: number
		fontSize?: number
	}
): string {
	const viewportWidth = Math.max(options.viewportWidth, 1)
	const viewportHeight = Math.max(options.viewportHeight, 1)
	const scrollLeft = source.scrollLeft || 0
	const scrollTop = source.scrollTop || 0
	const scrollWidth = Math.max(source.scrollWidth || 0, source.offsetWidth || 0, viewportWidth)
	const scrollHeight = Math.max(source.scrollHeight || 0, source.offsetHeight || 0, viewportHeight)

	const clone = source.cloneNode(true) as HTMLElement
	inlineComputedStyles(source, clone)
	removeRuntimeAttrs(clone)
	processImages(clone)
	processVideos(clone)
	processCanvases(source, clone)
	processIframes(clone)
	processSvgUse(clone)
	hideScrollbars(clone)

	clone.style.width = `${scrollWidth}px`
	clone.style.minWidth = `${scrollWidth}px`
	clone.style.height = `${scrollHeight}px`
	clone.style.minHeight = `${scrollHeight}px`
	clone.style.overflow = 'visible'
	clone.style.pointerEvents = 'none'
	clone.style.boxSizing = 'border-box'
	if (options.fontSize !== undefined) clone.style.fontSize = `${options.fontSize}px`

	const transform = scrollLeft || scrollTop ? `transform:translate(${-scrollLeft}px, ${-scrollTop}px);` : ''
	return `
		<div style="width:${viewportWidth}px;height:${viewportHeight}px;overflow:hidden;position:relative;box-sizing:border-box;">
			<div style="width:${scrollWidth}px;min-height:${scrollHeight}px;${transform}transform-origin:top left;position:absolute;left:0;top:0;">
				${clone.outerHTML}
			</div>
		</div>
	`
}

export function getSvgExportGlobalStyles(scopeSelector: string): string {
	return `
		<style xmlns="http://www.w3.org/1999/xhtml">
			${scopeSelector}, ${scopeSelector} * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
			${scopeSelector}::-webkit-scrollbar, ${scopeSelector} *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
			${scopeSelector} a { color: inherit; text-decoration: none; }
		</style>
	`
}
