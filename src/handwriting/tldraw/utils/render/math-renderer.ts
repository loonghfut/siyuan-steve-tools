/**
 * KaTeX 数学公式渲染器
 */
import { loadScript, loadStyle, unescapeHTML, isRendered, markRendered, renderError, type ContentRenderer } from '../render/content-renderer-base'

const MATH_SELECTOR = '[data-subtype="math"]'
const KATEX_CSS_ID = 'plugin-katex-style'
const KATEX_CSS_URL = '/stage/protyle/js/katex/katex.min.css?v=0.16.9'
const KATEX_JS_URL = '/stage/protyle/js/katex/katex.min.js?v=0.16.9'
const KATEX_JS_ID = 'plugin-katex-script'
const KATEX_MHCHEM_URL = '/stage/protyle/js/katex/mhchem.min.js?v=0.16.9'
const KATEX_MHCHEM_ID = 'plugin-katex-mhchem'
let katexLoadPromise: Promise<any> | null = null

function getMacros(): Record<string, string> {
	if (typeof window === 'undefined') return {}
	try {
		const raw = window?.siyuan?.config?.editor?.katexMacros
		if (!raw) return {}
		return JSON.parse(raw)
	} catch (err) {
		console.warn('KaTeX 宏配置解析失败', err)
		return {}
	}
}

function renderKatexElement(katex: any, mathElement: Element, macros: Record<string, string>): void {
	const htmlEl = mathElement as HTMLElement
	if (isRendered(htmlEl)) return
	markRendered(htmlEl)
	
	const isBlock = htmlEl.tagName === 'DIV'
	const content = unescapeHTML(htmlEl.getAttribute('data-content') || '')
	try {
		const mathHTML = katex.renderToString(content, {
			displayMode: isBlock,
			output: 'html',
			macros,
			trust: true,
			strict: (errorCode: string) => (errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn'),
		})
		if (isBlock) {
			// 公式块居中显示
			htmlEl.style.display = 'flex'
			htmlEl.style.justifyContent = 'center'
			htmlEl.style.alignItems = 'center'
			htmlEl.style.width = '100%'
			htmlEl.style.textAlign = 'center'
			if (!htmlEl.firstElementChild) {
				htmlEl.innerHTML = '<div><span></span></div>'
			}
			const target = (htmlEl.firstElementChild?.firstElementChild || htmlEl.firstElementChild) as HTMLElement | null
			if (target) {
				target.classList.remove('ft__error')
				target.setAttribute('contenteditable', 'false')
				target.style.display = 'inline-block'
				target.style.textAlign = 'center'
				target.innerHTML = mathHTML
			}
		} else {
			htmlEl.classList.remove('ft__error')
			htmlEl.innerHTML = mathHTML
		}
	} catch (err: any) {
		renderError(htmlEl, err)
	}
}

function ensureKatexLoaded(): Promise<any> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('window not available'))
	}
	if ((window as any).katex) {
		return Promise.resolve((window as any).katex)
	}
	if (katexLoadPromise) {
		return katexLoadPromise
	}
	
	katexLoadPromise = new Promise((resolve, reject) => {
		try {
			// 加载 CSS
			loadStyle(KATEX_CSS_URL, KATEX_CSS_ID)
			
			// 加载 KaTeX 主脚本
			loadScript(KATEX_JS_URL, KATEX_JS_ID)
				.then(() => loadScript(KATEX_MHCHEM_URL, KATEX_MHCHEM_ID))
				.then(() => resolve((window as any).katex))
				.catch(reject)
		} catch (err) {
			reject(err)
		}
	})
	
	return katexLoadPromise
}

export async function renderMathInDOM(container: HTMLElement): Promise<void> {
	if (typeof window === 'undefined') return
	let katex = (window as any).katex
	if (!katex) {
		try {
			katex = await ensureKatexLoaded()
		} catch (err) {
			console.warn('KaTeX 加载失败', err)
			return
		}
	}
	const macros = getMacros()
	const mathElements = container.querySelectorAll(MATH_SELECTOR)
	mathElements.forEach((el) => renderKatexElement(katex, el, macros))
}

export async function renderMathInHtml(html: string): Promise<string> {
	if (typeof document === 'undefined') return html
	try {
		const wrapper = document.createElement('div')
		wrapper.innerHTML = html
		await renderMathInDOM(wrapper)
		return wrapper.innerHTML
	} catch (err) {
		console.warn('公式渲染失败', err)
		return html
	}
}

export const mathRenderer: ContentRenderer = {
	name: 'math',
	selector: MATH_SELECTOR,
	
	async ensureLoaded() {
		await ensureKatexLoaded()
	},
	
	async renderElement(element: Element) {
		const katex = await ensureKatexLoaded()
		const macros = getMacros()
		renderKatexElement(katex, element, macros)
	},
	
	async renderAll(container: HTMLElement) {
		await renderMathInDOM(container)
	}
}
