/**
 * Flowchart 流程图渲染器
 */
import { loadScript, unescapeHTML, isRendered, markRendered, renderError, type ContentRenderer } from './render/content-renderer-base'

const FLOWCHART_SELECTOR = '[data-subtype="flowchart"]'
const FLOWCHART_JS_URL = '/stage/protyle/js/flowchart.js/flowchart.min.js?v=1.18.0'
const FLOWCHART_JS_ID = 'plugin-flowchart-script'

let flowchartLoadPromise: Promise<any> | null = null

async function ensureFlowchartLoaded(): Promise<any> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('window not available'))
	}
	if ((window as any).flowchart) {
		return Promise.resolve((window as any).flowchart)
	}
	if (flowchartLoadPromise) {
		return flowchartLoadPromise
	}

	flowchartLoadPromise = loadScript(FLOWCHART_JS_URL, FLOWCHART_JS_ID).then(() => (window as any).flowchart)
	return flowchartLoadPromise
}

async function renderFlowchartElement(element: Element): Promise<void> {
	const htmlEl = element as HTMLElement
	if (isRendered(htmlEl)) return

	const flowchart = await ensureFlowchartLoaded()
	if (!flowchart) throw new Error('Flowchart library not loaded')

	const content = unescapeHTML(htmlEl.getAttribute('data-content') || '')
	if (!content) return

	try {
		markRendered(htmlEl)
		
		// 清空容器
		htmlEl.innerHTML = ''
		
		// 解析并渲染流程图
		const diagram = flowchart.parse(content)
		diagram.drawSVG(htmlEl, {
			'line-width': 2,
			'font-size': 14,
			'font-family': 'sans-serif'
		})
		
		htmlEl.classList.remove('ft__error')
	} catch (err: any) {
		renderError(htmlEl, err)
	}
}

export const flowchartRenderer: ContentRenderer = {
	name: 'flowchart',
	selector: FLOWCHART_SELECTOR,
	
	async ensureLoaded() {
		await ensureFlowchartLoaded()
	},
	
	async renderElement(element: Element) {
		await renderFlowchartElement(element)
	},
	
	async renderAll(container: HTMLElement) {
		const elements = container.querySelectorAll(FLOWCHART_SELECTOR)
		await Promise.all(Array.from(elements).map(el => renderFlowchartElement(el)))
	}
}
