/**
 * 统一内容渲染管理器
 * 集成所有渲染器，提供统一的渲染接口
 */
import { type ContentRenderer } from './content-renderer-base'
import { mathRenderer } from './math-renderer'
import { mermaidRenderer } from './mermaid-renderer'
import { echartsRenderer, mindmapRenderer } from './echarts-renderer'
import { abcRenderer } from './abc-renderer'
import { flowchartRenderer } from './flowchart-renderer'
import { graphvizRenderer } from './graphviz-renderer'
import { plantumlRenderer } from './plantuml-renderer'

// 所有可用的渲染器
const allRenderers: ContentRenderer[] = [
	mathRenderer,
	mermaidRenderer,
	echartsRenderer,
	mindmapRenderer,
	abcRenderer,
	flowchartRenderer,
	graphvizRenderer,
	plantumlRenderer,
]

// 按名称索引渲染器
const renderersByName = new Map<string, ContentRenderer>()
allRenderers.forEach(r => renderersByName.set(r.name, r))

/**
 * 渲染容器内的所有内容
 * @param container 容器元素
 * @param rendererNames 要使用的渲染器名称列表，如果为空则使用所有渲染器
 */
export async function renderAllContent(container: HTMLElement, rendererNames?: string[]): Promise<void> {
	const renderersToUse = rendererNames
		? rendererNames.map(name => renderersByName.get(name)).filter(r => r !== undefined) as ContentRenderer[]
		: allRenderers

	// 并行渲染所有类型的内容
	await Promise.all(
		renderersToUse.map(renderer => 
			renderer.renderAll(container).catch(err => {
				console.warn(`渲染器 ${renderer.name} 执行失败:`, err)
			})
		)
	)
}

/**
 * 渲染HTML字符串中的所有内容
 * @param html HTML字符串
 * @param rendererNames 要使用的渲染器名称列表，如果为空则使用所有渲染器
 * @returns 渲染后的HTML字符串
 */
export async function renderHtmlContent(html: string, rendererNames?: string[]): Promise<string> {
	if (typeof document === 'undefined') return html
	
	try {
		const wrapper = document.createElement('div')
		wrapper.innerHTML = html
		await renderAllContent(wrapper, rendererNames)
		return wrapper.innerHTML
	} catch (err) {
		console.warn('HTML内容渲染失败:', err)
		return html
	}
}

/**
 * 预加载指定渲染器的依赖库
 * @param rendererNames 要预加载的渲染器名称列表，如果为空则预加载所有
 */
export async function preloadRenderers(rendererNames?: string[]): Promise<void> {
	const renderersToLoad = rendererNames
		? rendererNames.map(name => renderersByName.get(name)).filter(r => r !== undefined) as ContentRenderer[]
		: allRenderers

	await Promise.all(
		renderersToLoad.map(renderer =>
			renderer.ensureLoaded().catch(err => {
				console.warn(`预加载渲染器 ${renderer.name} 失败:`, err)
			})
		)
	)
}

/**
 * 获取指定名称的渲染器
 * @param name 渲染器名称
 * @returns 渲染器实例，如果不存在则返回 undefined
 */
export function getRenderer(name: string): ContentRenderer | undefined {
	return renderersByName.get(name)
}

/**
 * 获取所有可用的渲染器
 * @returns 渲染器列表
 */
export function getAllRenderers(): ContentRenderer[] {
	return [...allRenderers]
}

// 导出各个渲染器以便单独使用
export { mathRenderer } from './math-renderer'
export { mermaidRenderer } from './mermaid-renderer'
export { echartsRenderer, mindmapRenderer } from './echarts-renderer'
export { abcRenderer } from './abc-renderer'
export { flowchartRenderer } from './flowchart-renderer'
export { graphvizRenderer } from './graphviz-renderer'
export { plantumlRenderer } from './plantuml-renderer'

// 导出类型
export type { ContentRenderer } from './content-renderer-base'
