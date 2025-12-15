/**
 * ECharts 图表渲染器
 */
import { loadScript, unescapeHTML, isRendered, markRendered, renderError, type ContentRenderer } from './render/content-renderer-base'

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
		// console.log('Rendering ECharts element with content:', htmlEl)
		// 保留原有的 style 属性中的尺寸信息
		const computedStyle = window.getComputedStyle(htmlEl)
		const inlineStyle = htmlEl.getAttribute('style') || ''
		const extractInline = (name: string) => {
			const match = inlineStyle.match(new RegExp(`${name}\s*:\s*([^;]+)`))
			return match ? match[1].trim() : ''
		}
        // console.log('Computed styles0:', htmlEl.style.cssText)
		const existingHeight = htmlEl.style.height || extractInline('height') || computedStyle.height
		const existingWidth = htmlEl.style.width || extractInline('width') || computedStyle.width
		const existingMinHeight = htmlEl.style.minHeight || extractInline('min-height') || computedStyle.minHeight
		console.log('Existing dimensions:', { existingHeight, existingWidth, existingMinHeight })
        // 清空容器内容
		htmlEl.innerHTML = ''
		
		// 恢复或设置尺寸
		if (existingHeight && existingHeight !== 'auto' && existingHeight !== '0px') {
			htmlEl.style.height = existingHeight
		} else {
			htmlEl.style.height = htmlEl.getAttribute('data-height') || '400px'
		}
		
		if (existingWidth && existingWidth !== 'auto' && existingWidth !== '0px') {
			htmlEl.style.width = existingWidth
		} else {
			htmlEl.style.width = '100%'
		}
		
		if (existingMinHeight && existingMinHeight !== 'auto' && existingMinHeight !== '0px') {
			htmlEl.style.minHeight = existingMinHeight
		} else {
			htmlEl.style.minHeight = existingHeight || '300px'
		}
		 console.log('Computed styles1:', htmlEl.style.cssText)
		// 确保容器有实际尺寸，延迟初始化图表
		await new Promise(resolve => setTimeout(resolve, 0))
		
		let option
		if (isMindmap) {
			// 思维导图特殊处理
			option = parseMindmapOption(content, echarts)
		} else {
			// 普通 ECharts 配置
			option = JSON.parse(content)
		}
		
		// 创建图表实例
		const chart = echarts.init(htmlEl)
		chart.setOption(option, true)
		
		// 响应式调整
		const resizeObserver = new ResizeObserver(() => {
			try {
				chart.resize()
			} catch (err) {
				// 忽略resize错误
			}
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

function parseMindmapOption(content: string, echarts: any): any {
	try {
		// 尝试解析为 JSON 配置
		const parsed = JSON.parse(content)
		// 如果已经是完整的 ECharts 配置，直接返回
		if (parsed.series) {
			return parsed
		}
		// 否则构建思维导图配置
		return buildMindmapOption(parsed, echarts)
	} catch {
		// 解析失败，尝试简单文本解析
		return buildSimpleMindmapOption(content, echarts)
	}
}

function buildMindmapOption(data: any, echarts: any): any {
	return {
		tooltip: {
			trigger: 'item',
			triggerOn: 'mousemove'
		},
		series: [{
			type: 'tree',
			data: Array.isArray(data) ? data : [data],
			orient: 'LR',
			layout: 'orthogonal',
			roam: true,
			initialTreeDepth: -1,
			label: {
				position: 'left',
				verticalAlign: 'middle',
				align: 'right'
			},
			leaves: {
				label: {
					position: 'right',
					verticalAlign: 'middle',
					align: 'left'
				}
			},
			expandAndCollapse: true,
			animationDuration: 550,
			animationDurationUpdate: 750
		}]
	}
}

function buildSimpleMindmapOption(content: string, echarts: any): any {
	// 简单文本转为基础树状图
	return {
		tooltip: {
			trigger: 'item',
			triggerOn: 'mousemove'
		},
		series: [{
			type: 'tree',
			data: [{ 
				name: content || '思维导图',
				children: []
			}],
			orient: 'LR',
			layout: 'orthogonal',
			roam: true,
			label: {
				position: 'left',
				verticalAlign: 'middle',
				align: 'right'
			},
			leaves: {
				label: {
					position: 'right',
					verticalAlign: 'middle',
					align: 'left'
				}
			}
		}]
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
