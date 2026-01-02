/**
 * 统一内容渲染管理器
 * 使用思源自带的 ProtyleMethod 进行渲染
 * 
 * 优化：
 * - 支持空闲调度，在交互时暂停渲染
 * - 使用思源原生渲染方法，保证一致性
 */
import { Protyle, ProtyleMethod } from 'siyuan'
import { scheduleIdleRender, isInteracting } from '../idle-scheduler'
import { getBlockDOMsWithEmbed } from '@/api/api'

// 用于生成唯一的渲染任务 ID
let renderTaskIdCounter = 0

// CDN 配置（可根据需要自定义）
const CDN = undefined // 使用思源默认 CDN

/**
 * 渲染容器内的所有内容
 * @param container 容器元素
 */
export async function renderAllContent(container: HTMLElement): Promise<void> {
	try {
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
		
		// 渲染数据库视图：从 container 中提取带有 data-av-id 的元素
		const avElements = container.querySelectorAll('[data-av-id]')
		avElements.forEach(avElement => {
			const blockID = avElement.getAttribute('data-node-id')
			if (blockID) {
				const Tprotyle = new Protyle(window.siyuan.ws.app, document.createElement('div'), { 
					blockId: blockID, 
					rootId: blockID 
				})
				const protyle = Tprotyle.protyle;
				ProtyleMethod.avRender(container, protyle)
				// 销毁临时 Protyle 实例
				Tprotyle.destroy();
			}
		})
	
	} catch (err) {
		console.warn('内容渲染失败:', err)
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
	priority = 10
): Promise<void> {
	const taskId = `render-${++renderTaskIdCounter}`

	// 如果不在交互中，直接同步渲染（更快的响应）
	if (!isInteracting()) {
		await renderAllContent(container)
		return
	}

	// 在交互中，使用空闲调度
	await scheduleIdleRender(taskId, async () => {
		await renderAllContent(container)
	}, priority)
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
