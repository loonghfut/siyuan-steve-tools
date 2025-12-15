/**
 * Mermaid 图表渲染器
 */
import { loadScript, unescapeHTML, isRendered, markRendered, renderError, type ContentRenderer } from '../render/content-renderer-base'

const MERMAID_SELECTOR = '[data-subtype="mermaid"]'
const MERMAID_JS_URL = '/stage/protyle/js/mermaid/mermaid.min.js?v=11.6.0'
const MERMAID_JS_ID = 'plugin-mermaid-script'

let mermaidLoadPromise: Promise<any> | null = null

async function ensureMermaidLoaded(): Promise<any> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('window not available'))
	}
	if ((window as any).mermaid) {
		return Promise.resolve((window as any).mermaid)
	}
	if (mermaidLoadPromise) {
		return mermaidLoadPromise
	}

	mermaidLoadPromise = loadScript(MERMAID_JS_URL, MERMAID_JS_ID).then(() => {
		const mermaid = (window as any).mermaid
		if (mermaid) {
			// 初始化 mermaid 配置
			mermaid.initialize({
				startOnLoad: false,
				theme: 'default',
				securityLevel: 'loose',
			})
		}
		return mermaid
	})

	return mermaidLoadPromise
}

async function renderMermaidElement(element: Element): Promise<void> {
	const htmlEl = element as HTMLElement
	if (isRendered(htmlEl)) return

	const mermaid = await ensureMermaidLoaded()
	if (!mermaid) throw new Error('Mermaid library not loaded')

	const content = unescapeHTML(htmlEl.getAttribute('data-content') || '')
	if (!content) return

	try {
		markRendered(htmlEl)
		
		// 生成唯一ID
		const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
		
		// 渲染 mermaid 图表
		const { svg } = await mermaid.render(id, content)
		
		// 插入渲染结果
		if (htmlEl.firstElementChild) {
			htmlEl.firstElementChild.innerHTML = svg
		} else {
			htmlEl.innerHTML = svg
		}
		
		htmlEl.classList.remove('ft__error')
	} catch (err: any) {
		renderError(htmlEl, err)
	}
}

export const mermaidRenderer: ContentRenderer = {
	name: 'mermaid',
	selector: MERMAID_SELECTOR,
	
	async ensureLoaded() {
		await ensureMermaidLoaded()
	},
	
	async renderElement(element: Element) {
		await renderMermaidElement(element)
	},
	
	async renderAll(container: HTMLElement) {
		const elements = container.querySelectorAll(MERMAID_SELECTOR)
		await Promise.all(Array.from(elements).map(el => renderMermaidElement(el)))
	}
}
