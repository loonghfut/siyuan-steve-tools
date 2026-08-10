/**
 * 统一内容渲染管理器
 * 使用思源自带的 ProtyleMethod 进行渲染
 * 
 * 优化：
 * - 支持空闲调度，在交互时暂停渲染
 * - 使用思源原生渲染方法，保证一致性
 */
import { Protyle, ProtyleMethod } from 'siyuan'
import { IdleRenderCancelledError, isIdleRenderCancelledError, isInteracting, scheduleIdleRender } from '../idle-scheduler'
import { getBlockDOMsWithEmbed } from '@/api/api'

// 用于生成唯一的渲染任务 ID
let renderTaskIdCounter = 0

// CDN 配置（可根据需要自定义）
const CDN = undefined // 使用思源默认 CDN

/**
 * 渲染容器内的所有内容
 * @param container 容器元素
 */
export async function renderAllContent(container: HTMLElement, signal?: AbortSignal): Promise<void> {
	const throwIfAborted = () => {
		if (signal?.aborted) throw new IdleRenderCancelledError()
	}

	try {
		throwIfAborted()
		// 已被 React 替换的预览不应继续触发网络/DOM 渲染。
		if (signal && !container.isConnected) return
		// 处理嵌入块
		const embedNodes = Array.from(
			container.querySelectorAll('[data-type="NodeBlockQueryEmbed"]')
		);

		if (embedNodes.length > 0) {
			const idsToResolve = embedNodes
				.map((node) => node.getAttribute('data-node-id')?.trim() || '')
				.filter(Boolean);
			const uniqueIds = Array.from(new Set(idsToResolve));

			if (uniqueIds.length > 0) {
				try {
					const embedDomMap = await getBlockDOMsWithEmbed(uniqueIds);
					throwIfAborted()
					if (embedDomMap) {
						const buildFragmentFromHtml = (html: string) => {
							const temp = document.createElement('div');
							temp.innerHTML = html;
							const fragment = document.createDocumentFragment();
							while (temp.firstChild) {
								fragment.appendChild(temp.firstChild);
							}
							return fragment;
						};

						embedNodes.forEach((node) => {
							const targetId = node.getAttribute('data-node-id')?.trim();
							if (!targetId) return;
							const replacementHtml = embedDomMap[targetId];
							if (!replacementHtml) return;
							const fragment = buildFragmentFromHtml(replacementHtml);
							node.replaceWith(fragment);
						});
					}
				} catch (err) {
					console.error('获取嵌入 DOM 内容失败:', err);
				}
			}
		}

		// 使用思源的渲染方法
		ProtyleMethod.mathRender(container, CDN, false)
		ProtyleMethod.mermaidRender(container, CDN)
		ProtyleMethod.chartRender(container, CDN)
		ProtyleMethod.mindmapRender(container, CDN)
		ProtyleMethod.abcRender(container, CDN)
		ProtyleMethod.flowchartRender(container, CDN)
		ProtyleMethod.graphvizRender(container, CDN)
		ProtyleMethod.plantumlRender(container, CDN)
		// ProtyleMethod.htmlRender(container)
		ProtyleMethod.highlightRender(container)

		// avRender is asynchronous and records a render token on each database view.
		// Rendering the whole container once avoids concurrent calls invalidating each
		// other's token; the temporary Protyle must remain alive until it settles.
		const attributeViews = Array.from(
			container.querySelectorAll<HTMLElement>('[data-type="NodeAttributeView"][data-av-id]')
		)
		const blockId = attributeViews.find((view) => Boolean(view.dataset.nodeId))?.dataset.nodeId
		const needsAttributeViewRender = attributeViews.some(
			(view) => view.getAttribute('data-render') !== 'true'
		)
		if (blockId && needsAttributeViewRender && window.siyuan?.ws?.app) {
			let temporaryProtyle: Protyle | null = null
			try {
				temporaryProtyle = new Protyle(window.siyuan.ws.app, document.createElement('div'), {
					blockId,
					rootId: blockId,
				})
				await ProtyleMethod.avRender(container, temporaryProtyle.protyle)
				throwIfAborted()
			} finally {
				try {
					temporaryProtyle?.destroy()
				} catch (err) {
					console.warn('销毁数据库临时 Protyle 失败:', err)
				}
			}
		}

	} catch (err) {
		if (!isIdleRenderCancelledError(err)) {
			console.warn('内容渲染失败:', err)
		}
		throw err
	}
}

/**
 * 使用空闲调度渲染容器内的所有内容
 * 在交互时（拖动、缩放等）会暂停渲染，避免卡顿
 * @param container 容器元素
 * @param priority 优先级（数字越小优先级越高，默认为 10）
 * @returns Promise，渲染完成时 resolve
 */
export async function renderAllContentIdle(
	container: HTMLElement,
	priority = 10,
	taskId?: string,
	forceIdle = false
): Promise<void> {
	const effectiveTaskId = taskId || `render-${++renderTaskIdCounter}`

	// 非交互、且调用方未明确要求延后时立即完成，保持普通内容的响应速度。
	if (!forceIdle && !isInteracting()) {
		await renderAllContent(container)
		return
	}

	try {
		await scheduleIdleRender(effectiveTaskId, async (signal) => {
			await renderAllContent(container, signal)
		}, priority)
	} catch (error) {
		// 组件 cleanup 主动取消是预期控制流；调用方不应因此把预览标成失败。
		if (isIdleRenderCancelledError(error)) return
		throw error
	}
}

/**
 * 渲染HTML字符串中的所有内容
 * @param html HTML字符串
 * @returns 渲染后的HTML字符串
 */
export async function renderHtmlContent(html: string): Promise<string> {
	if (typeof document === 'undefined') return html

	try {
		const wrapper = document.createElement('div')
		wrapper.innerHTML = html
		await renderAllContent(wrapper)
		return wrapper.innerHTML
	} catch (err) {
		console.warn('HTML内容渲染失败:', err)
		return html
	}
}
