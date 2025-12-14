/**
 * PlantUML 图表渲染器
 */
import { loadScript, unescapeHTML, isRendered, markRendered, renderError, type ContentRenderer } from './content-renderer-base'

const PLANTUML_SELECTOR = '[data-subtype="plantuml"]'
const PLANTUML_JS_URL = '/stage/protyle/js/plantuml/plantuml-encoder.min.js?v=0.0.0'
const PLANTUML_JS_ID = 'plugin-plantuml-script'
const PLANTUML_SERVER = 'https://www.plantuml.com/plantuml/svg/'

let plantumlLoadPromise: Promise<any> | null = null

async function ensurePlantUMLLoaded(): Promise<any> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('window not available'))
	}
	if ((window as any).plantumlEncoder) {
		return Promise.resolve((window as any).plantumlEncoder)
	}
	if (plantumlLoadPromise) {
		return plantumlLoadPromise
	}

	plantumlLoadPromise = loadScript(PLANTUML_JS_URL, PLANTUML_JS_ID).then(() => (window as any).plantumlEncoder)
	return plantumlLoadPromise
}

async function renderPlantUMLElement(element: Element): Promise<void> {
	const htmlEl = element as HTMLElement
	if (isRendered(htmlEl)) return

	const plantumlEncoder = await ensurePlantUMLLoaded()
	if (!plantumlEncoder) throw new Error('PlantUML encoder library not loaded')

	const content = unescapeHTML(htmlEl.getAttribute('data-content') || '')
	if (!content) return

	try {
		markRendered(htmlEl)
		
		// 编码 PlantUML 内容
		const encoded = plantumlEncoder.encode(content)
		const url = PLANTUML_SERVER + encoded
		
		// 创建图片元素
		const img = document.createElement('img')
		img.src = url
		img.alt = 'PlantUML Diagram'
		img.style.maxWidth = '100%'
		
		// 清空容器并插入图片
		htmlEl.innerHTML = ''
		htmlEl.appendChild(img)
		
		htmlEl.classList.remove('ft__error')
	} catch (err: any) {
		renderError(htmlEl, err)
	}
}

export const plantumlRenderer: ContentRenderer = {
	name: 'plantuml',
	selector: PLANTUML_SELECTOR,
	
	async ensureLoaded() {
		await ensurePlantUMLLoaded()
	},
	
	async renderElement(element: Element) {
		await renderPlantUMLElement(element)
	},
	
	async renderAll(container: HTMLElement) {
		const elements = container.querySelectorAll(PLANTUML_SELECTOR)
		await Promise.all(Array.from(elements).map(el => renderPlantUMLElement(el)))
	}
}
