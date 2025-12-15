/**
 * Graphviz 图形渲染器
 */
import { loadScript, unescapeHTML, isRendered, markRendered, renderError, type ContentRenderer } from './render/content-renderer-base'

const GRAPHVIZ_SELECTOR = '[data-subtype="graphviz"]'
const GRAPHVIZ_JS_URL = '/stage/protyle/js/graphviz/viz.js?v=3.11.0'
const GRAPHVIZ_JS_ID = 'plugin-graphviz-script'

let graphvizLoadPromise: Promise<any> | null = null

async function ensureGraphvizLoaded(): Promise<any> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('window not available'))
	}
	if ((window as any).Viz) {
		return Promise.resolve((window as any).Viz)
	}
	if (graphvizLoadPromise) {
		return graphvizLoadPromise
	}

	graphvizLoadPromise = loadScript(GRAPHVIZ_JS_URL, GRAPHVIZ_JS_ID).then(() => (window as any).Viz)
	return graphvizLoadPromise
}

async function renderGraphvizElement(element: Element): Promise<void> {
	const htmlEl = element as HTMLElement
	if (isRendered(htmlEl)) return

	const Viz = await ensureGraphvizLoaded()
	if (!Viz) throw new Error('Graphviz library not loaded')

	const content = unescapeHTML(htmlEl.getAttribute('data-content') || '')
	if (!content) return

	try {
		markRendered(htmlEl)
		
		// 创建 Viz 实例并渲染
		const viz = new Viz()
		const svg = await viz.renderSVGElement(content)
		
		// 清空容器并插入SVG
		htmlEl.innerHTML = ''
		htmlEl.appendChild(svg)
		
		htmlEl.classList.remove('ft__error')
	} catch (err: any) {
		renderError(htmlEl, err)
	}
}

export const graphvizRenderer: ContentRenderer = {
	name: 'graphviz',
	selector: GRAPHVIZ_SELECTOR,
	
	async ensureLoaded() {
		await ensureGraphvizLoaded()
	},
	
	async renderElement(element: Element) {
		await renderGraphvizElement(element)
	},
	
	async renderAll(container: HTMLElement) {
		const elements = container.querySelectorAll(GRAPHVIZ_SELECTOR)
		await Promise.all(Array.from(elements).map(el => renderGraphvizElement(el)))
	}
}
