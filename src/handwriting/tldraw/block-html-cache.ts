/**
 * 块内容 HTML 缓存模块
 * 用于缓存 SingleBlockShape 的静态 HTML 内容，避免每次都创建 Protyle 实例
 * 
 * 缓存策略：只缓存 API 获取的原始 DOM，渲染（公式、图表等）在实际显示时执行
 * 
 * 优化：
 * - 使用空闲调度，在拖动画布时暂停加载
 * - 批量请求合并，减少网络请求次数
 * - 分帧处理，避免阻塞主线程
 */

import * as api from '@/api/api'
import { isInteracting } from './utils/idle-scheduler'

interface CacheEntry {
	html: string
	timestamp: number
	blockId: string
}

// 全局 HTML 内容缓存
const htmlCache = new Map<string, CacheEntry>()

// 缓存过期时间（10分钟）
const CACHE_TTL_MS = 10 * 60 * 1000

// 最大缓存条目数
const MAX_CACHE_SIZE = 100

// ===== 批量请求队列 =====
interface PendingRequest {
	blockId: string
	fontSize: number
	resolve: (html: string | null) => void
}

let pendingQueue: PendingRequest[] = []
let batchTimer: ReturnType<typeof setTimeout> | null = null
let rafId: number | null = null

// 批量延迟时间，在交互时使用更长的延迟
const BATCH_DELAY_MS = 50 // 正常延迟
const BATCH_DELAY_INTERACTING_MS = 200 // 交互时延迟

// 每批最多处理的块数量，避免单次请求过多
const MAX_BATCH_SIZE = 10

/**
 * 处理批量请求队列
 * 优化：在交互时推迟处理，分批处理避免阻塞
 */
async function processBatchQueue(): Promise<void> {
	batchTimer = null
	rafId = null
	
	if (pendingQueue.length === 0) return
	
	// 如果正在交互，推迟处理
	if (isInteracting()) {
		scheduleBatchProcessing()
		return
	}
	
	// 取出当前队列中的部分请求（限制批次大小）
	const batchSize = Math.min(pendingQueue.length, MAX_BATCH_SIZE)
	const currentBatch = pendingQueue.splice(0, batchSize)
	
	// 收集所有需要请求的 blockId（排除已缓存的）
	const toFetch: Map<string, PendingRequest[]> = new Map()
	for (const req of currentBatch) {
		const cached = getCachedHtml(req.blockId)
		if (cached) {
			// 已有缓存，直接返回
			req.resolve(cached)
			continue
		}
		// 同一个 blockId 可能有多个请求，收集起来
		const existing = toFetch.get(req.blockId)
		if (existing) {
			existing.push(req)
		} else {
			toFetch.set(req.blockId, [req])
		}
	}
	
	if (toFetch.size === 0) {
		// 如果还有剩余的请求，继续调度
		if (pendingQueue.length > 0) {
			scheduleBatchProcessing()
		}
		return
	}
	
	// 批量获取 DOM
	try {
		const blockIds = Array.from(toFetch.keys())
		const result = await api.getBlockDOMs(blockIds)
		
		// 处理结果
		for (const [blockId, requests] of toFetch) {
			const dom = result?.[blockId]
			if (dom) {
				const fontSize = requests[0].fontSize
				const html = wrapBlockDomHtml(dom, fontSize)
				setCachedHtml(blockId, html)
				for (const req of requests) {
					req.resolve(html)
				}
			} else {
				for (const req of requests) {
					req.resolve(null)
				}
			}
		}
	} catch (e) {
		console.warn('批量获取块 DOM 失败:', e)
		// 出错时，所有请求返回 null
		for (const requests of toFetch.values()) {
			for (const req of requests) {
				req.resolve(null)
			}
		}
	}
	
	// 如果还有剩余的请求，继续调度
	if (pendingQueue.length > 0) {
		scheduleBatchProcessing()
	}
}

/**
 * 调度批量处理
 * 使用 requestAnimationFrame 确保在下一帧处理，避免阻塞当前帧
 */
function scheduleBatchProcessing() {
	if (batchTimer !== null || rafId !== null) return
	
	const delay = isInteracting() ? BATCH_DELAY_INTERACTING_MS : BATCH_DELAY_MS
	
	// 使用 RAF + setTimeout 组合，确保不阻塞交互
	rafId = requestAnimationFrame(() => {
		rafId = null
		batchTimer = setTimeout(processBatchQueue, delay)
	})
}

/**
 * 请求块的 DOM（会自动批量合并）
 * @param blockId 块 ID
 * @param fontSize 字体大小
 * @returns 包装后的 HTML 或 null
 */
export function requestBlockDOM(blockId: string, fontSize: number): Promise<string | null> {
	return new Promise((resolve) => {
		// 先检查缓存
		const cached = getCachedHtml(blockId)
		if (cached) {
			resolve(cached)
			return
		}
		
		// 加入队列
		pendingQueue.push({ blockId, fontSize, resolve })
		
		// 调度处理
		scheduleBatchProcessing()
	})
}

/**
 * 获取缓存的 HTML 内容
 */
export function getCachedHtml(blockId: string): string | null {
	const entry = htmlCache.get(blockId)
	if (!entry) return null
	
	// 检查是否过期
	if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
		htmlCache.delete(blockId)
		return null
	}
	
	return entry.html
}

/**
 * 设置缓存的 HTML 内容
 */
export function setCachedHtml(blockId: string, html: string): void {
	// 如果缓存已满，移除最旧的条目
	if (htmlCache.size >= MAX_CACHE_SIZE) {
		let oldestKey: string | null = null
		let oldestTime = Infinity
		for (const [key, entry] of htmlCache) {
			if (entry.timestamp < oldestTime) {
				oldestTime = entry.timestamp
				oldestKey = key
			}
		}
		if (oldestKey) {
			htmlCache.delete(oldestKey)
		}
	}
	
	htmlCache.set(blockId, {
		html,
		timestamp: Date.now(),
		blockId,
	})
}

/**
 * 使缓存失效
 */
export function invalidateCache(blockId: string): void {
	htmlCache.delete(blockId)
}

/**
 * 清空所有缓存
 */
export function clearAllCache(): void {
	htmlCache.clear()
}

/**
 * 从 DOM 克隆中提取静态 HTML，保留完整的内联样式
 * @param container 包含 Protyle 内容的容器
 * @param _fontSize 字体大小（保留参数以保持接口一致）
 */
export function extractStaticHtml(container: HTMLElement, _fontSize: number): string {
	const wysiwyg = container.querySelector('.protyle-wysiwyg') as HTMLElement
	if (!wysiwyg) return ''
	
	const clone = wysiwyg.cloneNode(true) as HTMLElement
	
	// 递归内联计算样式到每个元素
	const inlineComputedStyles = (source: Element, target: Element) => {
		if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) return
		
		const computed = window.getComputedStyle(source)
		// 关键样式属性列表 - 保留影响外观的样式
		const keyProps = [
			'color', 'background-color', 'background',
			'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration',
			'line-height', 'letter-spacing', 'text-align',
			'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
			'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
			'border', 'border-radius', 'border-color', 'border-width', 'border-style',
			'display', 'flex-direction', 'align-items', 'justify-content', 'gap',
			'white-space', 'word-break', 'overflow-wrap',
			'opacity', 'visibility',
			'box-shadow', 'text-shadow',
		]
		
		const styleText = keyProps
			.map((prop) => {
				const value = computed.getPropertyValue(prop)
				return value ? `${prop}:${value}` : ''
			})
			.filter(Boolean)
			.join(';')
		
		const existing = target.getAttribute('style') || ''
		if (styleText) {
			target.setAttribute('style', `${styleText};${existing}`)
		}
		
		// 递归处理子元素
		const sourceChildren = Array.from(source.children)
		const targetChildren = Array.from(target.children)
		for (let i = 0; i < sourceChildren.length; i++) {
			const srcChild = sourceChildren[i]
			const tgtChild = targetChildren[i]
			if (srcChild && tgtChild) {
				inlineComputedStyles(srcChild, tgtChild)
			}
		}
	}
	
	// 应用计算样式
	inlineComputedStyles(wysiwyg, clone)
	
	// 移除可编辑属性
	clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))
	
	// 移除不需要的数据属性
	clone.querySelectorAll('[data-node-id]').forEach((el) => el.removeAttribute('data-node-id'))
	clone.querySelectorAll('[data-node-index]').forEach((el) => el.removeAttribute('data-node-index'))
	clone.querySelectorAll('[updated]').forEach((el) => el.removeAttribute('updated'))
	clone.querySelectorAll('[data-realwidth]').forEach((el) => el.removeAttribute('data-realwidth'))
	clone.querySelectorAll('[data-readonly]').forEach((el) => el.removeAttribute('data-readonly'))
	
	// 禁用交互但保留原有样式
	clone.style.pointerEvents = 'none'
	clone.style.userSelect = 'none'
	
	return clone.outerHTML
}

/**
 * 从 Protyle 宿主提取并缓存静态 HTML
 * 注意：只缓存原始 DOM，不执行内容渲染
 */
export function cacheFromProtyleHost(blockId: string, host: HTMLElement, fontSize: number): string {
	const html = extractStaticHtml(host, fontSize)
	if (!html) return html
	setCachedHtml(blockId, html)
	return html
}

/**
 * 通过 API 直接获取块的 DOM HTML
 * 这是最准确的方式，返回与思源编辑器完全一致的 DOM
 */
export async function getBlockDOM(blockId: string): Promise<string | null> {
	try {
		const result = await api.getBlockDOMs([blockId])
		if (result && result[blockId]) {
			return result[blockId]
		}
	} catch (e) {
		console.warn('获取块 DOM 失败:', e)
	}
	return null
}

/**
 * 批量获取块的 DOM HTML
 */
export async function getBlockDOMs(blockIds: string[]): Promise<Record<string, string>> {
	try {
		const result = await api.getBlockDOMs(blockIds)
		return result || {}
	} catch (e) {
		console.warn('批量获取块 DOM 失败:', e)
		return {}
	}
}

/**
 * 通过 SQL 获取块内容（markdown），作为备用方案
 */
export async function getBlockContent(blockId: string): Promise<{ markdown: string; content: string; type: string } | null> {
	try {
		const block = await api.getBlockByID(blockId)
		if (block) {
			return {
				markdown: block.markdown || '',
				content: block.content || '',
				type: block.type || 'p',
			}
		}
	} catch (e) {
		console.warn('获取块内容失败:', e)
	}
	return null
}

/**
 * 包装从 API 获取的 DOM HTML，添加必要的样式
 * 注意：此函数仅做 DOM 包装，不执行内容渲染（如公式、图表等）
 * 渲染应该在实际挂载到页面时调用 renderAllContent
 */
export function wrapBlockDomHtml(domHtml: string, fontSize: number): string {
	const processed = domHtml
		.replace(/contenteditable="true"/g, 'contenteditable="false"')
		.replace(/spellcheck="[^"]*"/g, 'spellcheck="false"')

	return `<div class="protyle-wysiwyg protyle-wysiwyg--attr" style="font-size: ${fontSize}px; pointer-events: none; user-select: none;">${processed}</div>`
}

/**
 * 渲染块内容为 HTML（备用方案，当 getBlockDOM 失败时使用）
 * 注意：此函数仅做 HTML 包装，不执行内容渲染（如公式、图表等）
 * 渲染应该在实际挂载到页面时调用 renderAllContent
 */
export function renderSimpleBlockHtml(content: string, fontSize: number): string {
	let html = content
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		.replace(/`(.+?)`/g, '<code style="background: rgba(128,128,128,0.1); padding: 0 4px; border-radius: 3px; font-family: monospace;">$1</code>')
		.replace(/\n/g, '<br>')

	const fallback = '<span style="opacity: 0.5; font-style: italic;">空内容</span>'
	return `<div class="protyle-wysiwyg protyle-wysiwyg--attr" style="font-size: ${fontSize}px; padding: 8px 16px; pointer-events: none; user-select: none; line-height: 1.6; word-break: break-word;"><div class="p" data-type="NodeParagraph"><div contenteditable="false" spellcheck="false">${html || fallback}</div></div></div>`
}

/**
 * 预加载指定块的内容到缓存
 * 可用于视口内即将可见的块
 */

export async function preloadBlockContent(blockId: string, fontSize: number): Promise<void> {
	// 如果已有缓存，跳过
	if (getCachedHtml(blockId)) return
	
	// 优先使用 getBlockDOM API
	const dom = await getBlockDOM(blockId)
	if (dom) {
		const html = wrapBlockDomHtml(dom, fontSize)
		setCachedHtml(blockId, html)
		return
	}
	
	// 备用：使用简化渲染
	const content = await getBlockContent(blockId)
	if (content) {
		const html = renderSimpleBlockHtml(content.content || content.markdown, fontSize)
		setCachedHtml(blockId, html)
	}
}
