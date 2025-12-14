/**
 * ABC 音乐记谱渲染器
 */
import { loadScript, unescapeHTML, isRendered, markRendered, renderError, type ContentRenderer } from './content-renderer-base'

const ABC_SELECTOR = '[data-subtype="abc"]'
const ABC_JS_URL = '/stage/protyle/js/abcjs/abcjs-basic-min.js?v=6.5.0'
const ABC_JS_ID = 'plugin-abc-script'

let abcLoadPromise: Promise<any> | null = null

async function ensureABCLoaded(): Promise<any> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('window not available'))
	}
	if ((window as any).ABCJS) {
		return Promise.resolve((window as any).ABCJS)
	}
	if (abcLoadPromise) {
		return abcLoadPromise
	}

	abcLoadPromise = loadScript(ABC_JS_URL, ABC_JS_ID).then(() => (window as any).ABCJS)
	return abcLoadPromise
}

async function renderABCElement(element: Element): Promise<void> {
	const htmlEl = element as HTMLElement
	if (isRendered(htmlEl)) return

	const ABCJS = await ensureABCLoaded()
	if (!ABCJS) throw new Error('ABCJS library not loaded')

	const content = unescapeHTML(htmlEl.getAttribute('data-content') || '')
	if (!content) return

	try {
		markRendered(htmlEl)
		
		// 清空容器
		htmlEl.innerHTML = ''
		
		// 渲染 ABC 记谱
		ABCJS.renderAbc(htmlEl, content, {
			responsive: 'resize'
		})
		
		htmlEl.classList.remove('ft__error')
	} catch (err: any) {
		renderError(htmlEl, err)
	}
}

export const abcRenderer: ContentRenderer = {
	name: 'abc',
	selector: ABC_SELECTOR,
	
	async ensureLoaded() {
		await ensureABCLoaded()
	},
	
	async renderElement(element: Element) {
		await renderABCElement(element)
	},
	
	async renderAll(container: HTMLElement) {
		const elements = container.querySelectorAll(ABC_SELECTOR)
		await Promise.all(Array.from(elements).map(el => renderABCElement(el)))
	}
}
