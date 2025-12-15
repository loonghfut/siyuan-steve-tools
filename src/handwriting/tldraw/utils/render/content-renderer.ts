/**
 * 统一内容渲染管理器
 * 集成所有渲染器，提供统一的渲染接口
 * 
 * 优化：
 * - 支持空闲调度，在交互时暂停渲染
 * - 分帧渲染，避免一次性渲染过多内容
 */
import { type ContentRenderer } from './content-renderer-base'
import { mathRenderer } from './math-renderer'
import { mermaidRenderer } from './mermaid-renderer'
import { echartsRenderer, mindmapRenderer } from './echarts-renderer'
import { abcRenderer } from './abc-renderer'
import { flowchartRenderer } from './flowchart-renderer'
import { graphvizRenderer } from './graphviz-renderer'
import { plantumlRenderer } from './plantuml-renderer'
import { scheduleIdleRender, isInteracting } from '../idle-scheduler'

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

// 用于生成唯一的渲染任务 ID
let renderTaskIdCounter = 0

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
 * 使用空闲调度渲染容器内的所有内容
 * 在交互时（拖动、缩放等）会暂停渲染，避免卡顿
 * @param container 容器元素
 * @param rendererNames 要使用的渲染器名称列表，如果为空则使用所有渲染器
 * @param priority 优先级（数字越小优先级越高，默认为 10）
 * @returns Promise，渲染完成时 resolve
 */
export async function renderAllContentIdle(
	container: HTMLElement,
	rendererNames?: string[],
	priority = 10
): Promise<void> {
	const taskId = `render-${++renderTaskIdCounter}`
	
	const renderersToUse = rendererNames
		? rendererNames.map(name => renderersByName.get(name)).filter(r => r !== undefined) as ContentRenderer[]
		: allRenderers

	// 如果没有需要渲染的内容，直接返回
	if (renderersToUse.length === 0) return

	// 检查是否有需要渲染的元素
	const hasElementsToRender = renderersToUse.some(renderer => {
		const elements = container.querySelectorAll(renderer.selector)
		return elements.length > 0
	})

	if (!hasElementsToRender) return

	// 如果不在交互中，直接同步渲染（更快的响应）
	if (!isInteracting()) {
		await renderAllContent(container, rendererNames)
		return
	}

	// 在交互中，使用空闲调度
	await scheduleIdleRender(taskId, async () => {
		await renderAllContent(container, rendererNames)
	}, priority)
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
