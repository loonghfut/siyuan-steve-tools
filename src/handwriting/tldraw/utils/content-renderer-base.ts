/**
 * 内容渲染器基础工具
 * 提供脚本/样式加载、HTML转义等通用功能
 */

// 脚本加载缓存，避免重复加载
const scriptLoadPromises = new Map<string, Promise<void>>()
// 样式加载记录
const loadedStyles = new Set<string>()

/**
 * 动态加载脚本
 * @param src 脚本URL
 * @param id 脚本DOM元素的ID（用于去重）
 * @returns Promise，脚本加载完成时resolve
 */
export function loadScript(src: string, id: string): Promise<void> {
	// 已经加载过，直接返回缓存的Promise
	if (scriptLoadPromises.has(id)) {
		return scriptLoadPromises.get(id)!
	}

	// 检查DOM中是否已存在
	if (document.getElementById(id)) {
		const resolved = Promise.resolve()
		scriptLoadPromises.set(id, resolved)
		return resolved
	}

	const promise = new Promise<void>((resolve, reject) => {
		const script = document.createElement('script')
		script.src = src
		script.id = id
		script.onload = () => resolve()
		script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
		document.head.appendChild(script)
	})

	scriptLoadPromises.set(id, promise)
	return promise
}

/**
 * 动态加载样式表
 * @param href 样式表URL
 * @param id 样式DOM元素的ID（用于去重）
 */
export function loadStyle(href: string, id: string): void {
	// 已经加载过，直接返回
	if (loadedStyles.has(id)) return
	if (document.getElementById(id)) {
		loadedStyles.add(id)
		return
	}

	const link = document.createElement('link')
	link.rel = 'stylesheet'
	link.href = href
	link.id = id
	document.head.appendChild(link)
	loadedStyles.add(id)
}

/**
 * 反转义HTML内容
 * @param raw 原始HTML字符串（可能包含转义字符）
 * @returns 反转义后的纯文本
 */
export function unescapeHTML(raw: string): string {
	if (!raw) return ''
	const div = document.createElement('div')
	div.innerHTML = raw
	return div.textContent || div.innerText || ''
}

/**
 * 检查元素是否已被渲染
 * @param element 要检查的元素
 * @param attr 渲染标记属性名，默认为 'data-render'
 * @returns 是否已渲染
 */
export function isRendered(element: Element, attr = 'data-render'): boolean {
	return element.getAttribute(attr) === 'true'
}

/**
 * 标记元素为已渲染
 * @param element 要标记的元素
 * @param attr 渲染标记属性名，默认为 'data-render'
 */
export function markRendered(element: Element, attr = 'data-render'): void {
	element.setAttribute(attr, 'true')
}

/**
 * 渲染错误处理
 * @param element 渲染失败的元素
 * @param error 错误信息
 */
export function renderError(element: Element, error: any): void {
	const htmlEl = element as HTMLElement
	const errorMsg = error?.message || error?.toString() || '渲染错误'
	htmlEl.innerHTML = `<span style="color: red; font-size: 12px;">渲染失败: ${errorMsg}</span>`
	htmlEl.classList.add('ft__error')
}

/**
 * 通用渲染器接口
 */
export interface ContentRenderer {
	/**
	 * 渲染器名称
	 */
	name: string

	/**
	 * CSS选择器，用于查找需要渲染的元素
	 */
	selector: string

	/**
	 * 确保渲染所需的依赖库已加载
	 * @returns Promise，依赖加载完成时resolve
	 */
	ensureLoaded(): Promise<void>

	/**
	 * 渲染单个元素
	 * @param element 要渲染的DOM元素
	 */
	renderElement(element: Element): Promise<void>

	/**
	 * 批量渲染容器内的所有匹配元素
	 * @param container 容器元素
	 */
	renderAll(container: HTMLElement): Promise<void>
}
