/**
 * ECharts 图表渲染器
 */
import { loadScript, unescapeHTML, isRendered, markRendered, renderError, type ContentRenderer } from './content-renderer-base'

const ECHARTS_SELECTOR = '[data-subtype="echarts"]'
const MINDMAP_SELECTOR = '[data-subtype="mindmap"]'
const ECHARTS_JS_URL = '/stage/protyle/js/echarts/echarts.min.js?v=5.3.2'
const ECHARTS_GL_URL = '/stage/protyle/js/echarts/echarts-gl.min.js?v=2.0.9'
const ECHARTS_JS_ID = 'plugin-echarts-script'
const ECHARTS_GL_ID = 'plugin-echarts-gl-script'

let echartsLoadPromise: Promise<any> | null = null

async function ensureEChartsLoaded(): Promise<any> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('window not available'))
	}
	if ((window as any).echarts) {
		return Promise.resolve((window as any).echarts)
	}
	if (echartsLoadPromise) {
		return echartsLoadPromise
	}

	echartsLoadPromise = loadScript(ECHARTS_JS_URL, ECHARTS_JS_ID)
		.then(() => loadScript(ECHARTS_GL_URL, ECHARTS_GL_ID))
		.then(() => (window as any).echarts)

	return echartsLoadPromise
}

async function renderEChartsElement(element: Element, isMindmap = false): Promise<void> {
	const htmlEl = element as HTMLElement
	if (isRendered(htmlEl)) return

	const echarts = await ensureEChartsLoaded()
	if (!echarts) throw new Error('ECharts library not loaded')

	const content = unescapeHTML(htmlEl.getAttribute('data-content') || '')
	if (!content) return

	try {
		markRendered(htmlEl)
		
		// 清空容器并设置尺寸
		htmlEl.innerHTML = ''
		htmlEl.style.height = htmlEl.getAttribute('data-height') || '400px'
		
		let option
		if (isMindmap) {
			// 思维导图特殊处理
			option = parseMindmapOption(content)
		} else {
			// 普通 ECharts 配置
			option = JSON.parse(content)
		}
		
		// 创建图表实例
		const chart = echarts.init(htmlEl)
		chart.setOption(option)
		
		// 响应式调整
		const resizeObserver = new ResizeObserver(() => {
			chart.resize()
		})
		resizeObserver.observe(htmlEl)
		
		// 保存实例以便后续销毁
		;(htmlEl as any).__echartsInstance__ = chart
		;(htmlEl as any).__resizeObserver__ = resizeObserver
		
		htmlEl.classList.remove('ft__error')
	} catch (err: any) {
		renderError(htmlEl, err)
	}
}

function parseMindmapOption(content: string): any {
	// 简化的思维导图解析，实际应该更复杂
	// 这里仅作示例
	try {
		return JSON.parse(content)
	} catch {
		// 如果不是JSON，尝试简单的文本解析
		return {
			series: [{
				type: 'tree',
				data: [{ name: content }],
				layout: 'radial',
				symbol: 'emptyCircle',
				symbolSize: 7
			}]
		}
	}
}

export const echartsRenderer: ContentRenderer = {
	name: 'echarts',
	selector: ECHARTS_SELECTOR,
	
	async ensureLoaded() {
		await ensureEChartsLoaded()
	},
	
	async renderElement(element: Element) {
		await renderEChartsElement(element, false)
	},
	
	async renderAll(container: HTMLElement) {
		const elements = container.querySelectorAll(ECHARTS_SELECTOR)
		await Promise.all(Array.from(elements).map(el => renderEChartsElement(el, false)))
	}
}

export const mindmapRenderer: ContentRenderer = {
	name: 'mindmap',
	selector: MINDMAP_SELECTOR,
	
	async ensureLoaded() {
		await ensureEChartsLoaded()
	},
	
	async renderElement(element: Element) {
		await renderEChartsElement(element, true)
	},
	
	async renderAll(container: HTMLElement) {
		const elements = container.querySelectorAll(MINDMAP_SELECTOR)
		await Promise.all(Array.from(elements).map(el => renderEChartsElement(el, true)))
	}
}
