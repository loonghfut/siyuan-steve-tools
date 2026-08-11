/**
 * Window the static DOM preview of a Card by top-level SiYuan blocks.
 *
 * The Card itself keeps its normal fixed-size scroll container. This class only
 * mounts the blocks that can be displayed in that container (plus an overscan
 * buffer) and represents the rest with height spacers. It deliberately stores
 * detached blocks as HTML strings rather than Elements, so hidden document
 * content does not remain as a large detached DOM tree.
 */

export interface CardContentVirtualizerOptions {
	/** Called after a fresh window of blocks is mounted. */
	onMount?: (container: HTMLElement) => void | Promise<void>
	/** Fixed nodes, such as the document title, that must always stay mounted. */
	isPinned?: (element: HTMLElement) => boolean
	/**
	 * Return true when the preview must retain its original DOM. Native media and
	 * embedded documents keep loading/playback state on their element instances,
	 * so recreating them from HTML would restart that state.
	 */
	shouldSkipVirtualization?: (content: readonly HTMLElement[]) => boolean
	overscanPx?: number
	minBlockCount?: number
}

interface VirtualBlock {
	html: string
	height: number
}

const DEFAULT_BLOCK_HEIGHT = 56
const MIN_ESTIMATED_HEIGHT = 32
const MAX_ESTIMATED_HEIGHT = 720
const DEFAULT_OVERSCAN_PX = 280
const DEFAULT_MIN_BLOCK_COUNT = 12

function estimateBlockHeight(element: HTMLElement): number {
	const textLength = (element.textContent || '').trim().length
	const lineCount = Math.max(1, Math.ceil(textLength / 42))
	const hasRichContent = Boolean(element.querySelector('img, video, iframe, table, [data-subtype="mermaid"], [data-type="NodeAttributeView"]'))
	const estimated = 20 + lineCount * 24 + (hasRichContent ? 96 : 0)
	return Math.min(MAX_ESTIMATED_HEIGHT, Math.max(MIN_ESTIMATED_HEIGHT, estimated || DEFAULT_BLOCK_HEIGHT))
}

function findIndexAtOffset(blocks: VirtualBlock[], offset: number): number {
	let total = 0
	for (let index = 0; index < blocks.length; index++) {
		total += blocks[index].height
		if (total > offset) return index
	}
	return Math.max(0, blocks.length - 1)
}

function sumHeights(blocks: VirtualBlock[], start: number, end: number): number {
	let total = 0
	for (let index = start; index < end; index++) total += blocks[index].height
	return total
}

export class CardContentVirtualizer {
	private readonly blocks: VirtualBlock[]
	private readonly topSpacer = document.createElement('div')
	private readonly bottomSpacer = document.createElement('div')
	private readonly overscanPx: number
	private readonly onMount?: (container: HTMLElement) => void | Promise<void>
	private mountedStart = -1
	private mountedEnd = -1
	private mountedElements: HTMLElement[] = []
	private updateFrame: number | null = null
	private destroyed = false
	private readonly resizeObserver: ResizeObserver

	static create(container: HTMLElement, options: CardContentVirtualizerOptions = {}): CardContentVirtualizer | null {
		const isPinned = options.isPinned || (() => false)
		const children = Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
		const pinned = children.filter(isPinned)
		const content = children.filter((child) => !isPinned(child))
		if (options.shouldSkipVirtualization?.(content)) return null
		const estimatedContentHeight = content.reduce((total, element) => total + estimateBlockHeight(element), 0)
		const viewportHeight = container.clientHeight
		const exceedsCardViewport = viewportHeight > 0 && estimatedContentHeight > viewportHeight + DEFAULT_OVERSCAN_PX / 2
		const shouldVirtualize =
			content.length > 1 && (
				exceedsCardViewport ||
				content.length >= (options.minBlockCount ?? DEFAULT_MIN_BLOCK_COUNT) ||
				content.reduce((total, element) => total + (element.textContent || '').length, 0) >= 2400
			)

		if (!shouldVirtualize) return null
		return new CardContentVirtualizer(container, pinned, content, options)
	}

	private constructor(
		private readonly container: HTMLElement,
		pinned: HTMLElement[],
		content: HTMLElement[],
		options: CardContentVirtualizerOptions,
	) {
		this.blocks = content.map((element) => ({ html: element.outerHTML, height: estimateBlockHeight(element) }))
		this.overscanPx = options.overscanPx ?? DEFAULT_OVERSCAN_PX
		this.onMount = options.onMount

		this.topSpacer.className = 'card-virtual-spacer card-virtual-spacer--top'
		this.bottomSpacer.className = 'card-virtual-spacer card-virtual-spacer--bottom'
		this.topSpacer.setAttribute('aria-hidden', 'true')
		this.bottomSpacer.setAttribute('aria-hidden', 'true')
		this.topSpacer.style.pointerEvents = 'none'
		this.bottomSpacer.style.pointerEvents = 'none'

		container.replaceChildren(...pinned, this.topSpacer, this.bottomSpacer)
		this.resizeObserver = new ResizeObserver(this.onMountedResize)

		// A detached or newly inserted Card has no dimensions yet. Render a small
		// first window, then recalculate on the next frame after layout settles.
		this.updateWindow()
		requestAnimationFrame(() => this.scheduleUpdate())
	}

	destroy() {
		if (this.destroyed) return
		this.destroyed = true
		this.resizeObserver.disconnect()
		if (this.updateFrame !== null) cancelAnimationFrame(this.updateFrame)
		this.updateFrame = null
	}

	/** Recalculate the mounted window after the Card shape changes size. */
	refresh() {
		this.scheduleUpdate()
	}

	private onMountedResize = (entries: ResizeObserverEntry[]) => {
		let changed = false
		for (const entry of entries) {
			const index = Number((entry.target as HTMLElement).dataset.cardVirtualIndex)
			if (!Number.isInteger(index) || !this.blocks[index]) continue
			const height = Math.max(MIN_ESTIMATED_HEIGHT, Math.ceil(entry.contentRect.height))
			if (Math.abs(this.blocks[index].height - height) >= 1) {
				this.blocks[index].height = height
				changed = true
			}
		}
		if (changed) this.scheduleUpdate()
	}

	private scheduleUpdate() {
		if (this.destroyed || this.updateFrame !== null) return
		this.updateFrame = requestAnimationFrame(() => {
			this.updateFrame = null
			this.updateWindow()
		})
	}

	private updateWindow() {
		if (this.destroyed || this.blocks.length === 0) return

		const fixedHeight = this.topSpacer.offsetTop
		const viewportHeight = Math.max(this.container.clientHeight, DEFAULT_BLOCK_HEIGHT * 4)
		const startOffset = Math.max(0, this.container.scrollTop - fixedHeight - this.overscanPx)
		const endOffset = Math.max(0, this.container.scrollTop - fixedHeight + viewportHeight + this.overscanPx)
		const start = findIndexAtOffset(this.blocks, startOffset)
		let end = findIndexAtOffset(this.blocks, endOffset) + 1
		end = Math.min(this.blocks.length, Math.max(start + 1, end))

		this.topSpacer.style.height = `${sumHeights(this.blocks, 0, start)}px`
		this.bottomSpacer.style.height = `${sumHeights(this.blocks, end, this.blocks.length)}px`

		if (start === this.mountedStart && end === this.mountedEnd) return
		this.mountedStart = start
		this.mountedEnd = end
		this.resizeObserver.disconnect()

		for (const element of this.mountedElements) element.remove()
		const template = document.createElement('template')
		template.innerHTML = this.blocks.slice(start, end).map((block) => block.html).join('')
		const fragment = template.content
		this.mountedElements = Array.from(fragment.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
		for (const [offset, element] of this.mountedElements.entries()) {
			element.dataset.cardVirtualIndex = String(start + offset)
		}
		this.container.insertBefore(fragment, this.bottomSpacer)

		for (const element of this.mountedElements) {
			this.resizeObserver.observe(element)
		}

		void this.onMount?.(this.container)
	}
}
