const MATH_SELECTOR = '[data-subtype="math"]'
const RENDERED_ATTR = 'data-render'
const KATEX_CSS_ID = 'plugin-katex-style'
const KATEX_CSS_URL = '/stage/protyle/js/katex/katex.min.css?v=0.16.9'
const KATEX_JS_URL = '/stage/protyle/js/katex/katex.min.js?v=0.16.9'
const KATEX_MHCHEM_URL = '/stage/protyle/js/katex/mhchem.min.js?v=0.16.9'
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

function unescapeHTML(raw: string): string {
	if (!raw) return ''
	const div = document.createElement('div')
	div.innerHTML = raw
	return div.textContent || div.innerText || ''
}

function renderElement(katex: any, mathElement: Element, macros: Record<string, string>): void {
	const htmlEl = mathElement as HTMLElement
	if (htmlEl.getAttribute(RENDERED_ATTR) === 'true') return
	htmlEl.setAttribute(RENDERED_ATTR, 'true')
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
			if (!htmlEl.firstElementChild) {
				htmlEl.innerHTML = '<div><span></span></div>'
			}
			const target = (htmlEl.firstElementChild?.firstElementChild || htmlEl.firstElementChild) as HTMLElement | null
			if (target) {
				target.classList.remove('ft__error')
				target.setAttribute('contenteditable', 'false')
				target.innerHTML = mathHTML
			}
		} else {
			htmlEl.classList.remove('ft__error')
			htmlEl.innerHTML = mathHTML
		}
	} catch (err: any) {
		htmlEl.innerHTML = `<span style="color: red;">${err?.message || '公式渲染错误'}</span>`
		htmlEl.classList.add('ft__error')
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
			if (!document.getElementById(KATEX_CSS_ID)) {
				const link = document.createElement('link')
				link.id = KATEX_CSS_ID
				link.rel = 'stylesheet'
				link.href = KATEX_CSS_URL
				document.head.appendChild(link)
			}
			const script1 = document.createElement('script')
			script1.src = KATEX_JS_URL
			script1.onload = () => {
				const script2 = document.createElement('script')
				script2.src = KATEX_MHCHEM_URL
				script2.onload = () => resolve((window as any).katex)
				script2.onerror = reject
				document.head.appendChild(script2)
			}
			script1.onerror = reject
			document.head.appendChild(script1)
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
	mathElements.forEach((el) => renderElement(katex, el, macros))
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
