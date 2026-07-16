import type { Plugin } from 'siyuan'
import { upload } from '@/api/api'

export const SLIDE_SCREENSHOT_DATA_FILE = 'slide-screenshots.json'
export const SLIDE_SCREENSHOT_DRAG_TYPE = 'application/st-slide-screenshot'
const SLIDE_SCREENSHOT_ASSET_DIR = '/assets/st_slide_screenshots'

export interface SlideScreenshotRecord {
	id: string
	imageUrl: string
	width: number
	height: number
	name: string
	createdAt: number
	rootId: string
	shapeId: string
	title: string
}

export type NewSlideScreenshotRecord = Omit<SlideScreenshotRecord, 'id' | 'createdAt' | 'imageUrl'> & {
	image: Blob
	id?: string
	createdAt?: number
}

type StoreListener = (items: SlideScreenshotRecord[]) => void

export class SlideScreenshotStore {
	private items: SlideScreenshotRecord[] = []
	private listeners = new Set<StoreListener>()
	private writeQueue: Promise<void> = Promise.resolve()

	constructor(private readonly plugin: Plugin) {}

	async load(): Promise<void> {
		try {
			const raw = await this.plugin.loadData(SLIDE_SCREENSHOT_DATA_FILE)
			const records = Array.isArray(raw) ? raw : raw?.items
			this.items = Array.isArray(records)
				? records.map((item) => this.normalize(item)).filter((item): item is SlideScreenshotRecord => !!item)
				: []
		} catch (error) {
			console.warn('加载 slide 截图暂存数据失败', error)
			this.items = []
		}
		this.notify()
	}

	getAll(): SlideScreenshotRecord[] {
		return this.items.map((item) => ({ ...item }))
	}

	get(id: string): SlideScreenshotRecord | null {
		const item = this.items.find((candidate) => candidate.id === id)
		return item ? { ...item } : null
	}

	subscribe(listener: StoreListener): () => void {
		this.listeners.add(listener)
		listener(this.getAll())
		return () => this.listeners.delete(listener)
	}

	async add(input: NewSlideScreenshotRecord): Promise<SlideScreenshotRecord> {
		const imageUrl = await this.uploadImage(input.image, input.name)
		const item: SlideScreenshotRecord = {
			width: input.width,
			height: input.height,
			name: input.name,
			rootId: input.rootId,
			shapeId: input.shapeId,
			title: input.title,
			imageUrl,
			id: input.id || createId(),
			createdAt: input.createdAt || Date.now(),
		}
		this.items = [item, ...this.items.filter((existing) => existing.id !== item.id)]
		this.notify()
		await this.persist()
		return { ...item }
	}

	async remove(id: string): Promise<boolean> {
		const nextItems = this.items.filter((item) => item.id !== id)
		if (nextItems.length === this.items.length) return false
		this.items = nextItems
		this.notify()
		await this.persist()
		return true
	}

	private async persist(): Promise<void> {
		const snapshot = this.getAll()
		this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
			await this.plugin.saveData(SLIDE_SCREENSHOT_DATA_FILE, {
				version: 2,
				items: snapshot,
			})
		})
		return this.writeQueue
	}

	private normalize(value: any): SlideScreenshotRecord | null {
		if (!value || typeof value !== 'object' || typeof value.imageUrl !== 'string' || !value.imageUrl) return null
		if (typeof value.rootId !== 'string' || typeof value.shapeId !== 'string') return null
		return {
			id: typeof value.id === 'string' && value.id ? value.id : createId(),
			imageUrl: value.imageUrl,
			width: Number(value.width) || 0,
			height: Number(value.height) || 0,
			name: typeof value.name === 'string' && value.name ? value.name : 'Slide',
			createdAt: Number(value.createdAt) || Date.now(),
			rootId: value.rootId,
			shapeId: value.shapeId,
			title: typeof value.title === 'string' ? value.title : '',
		}
	}

	private async uploadImage(blob: Blob, name: string): Promise<string> {
		const extension = extensionForMime(blob.type)
		const fileName = `slide_${safeFileName(name)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`
		const file = new File([blob], fileName, { type: blob.type || 'image/png' })
		const result = await upload(SLIDE_SCREENSHOT_ASSET_DIR, [file])
		const kernelPath = result?.succMap?.[fileName]
		if (!kernelPath) throw new Error('upload slide screenshot failed: no asset path returned')
		return toImageUrl(kernelPath)
	}

	private notify(): void {
		const items = this.getAll()
		this.listeners.forEach((listener) => listener(items))
	}
}

let activeStore: SlideScreenshotStore | null = null

export function setActiveSlideScreenshotStore(store: SlideScreenshotStore): void {
	activeStore = store
}

export function getActiveSlideScreenshotStore(): SlideScreenshotStore | null {
	return activeStore
}

export function clearActiveSlideScreenshotStore(store: SlideScreenshotStore): void {
	if (activeStore === store) activeStore = null
}

function createId(): string {
	return `slide-screenshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toImageUrl(path: string): string {
	const normalized = path.replace(/^\/+/, '').replace(/^data\//, '')
	return `/${normalized}`
}

function safeFileName(value: string): string {
	return value.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 60) || 'slide'
}

function extensionForMime(mime: string): string {
	if (mime === 'image/jpeg') return 'jpg'
	if (mime === 'image/webp') return 'webp'
	if (mime === 'image/svg+xml') return 'svg'
	return 'png'
}

export function slideScreenshotUrlToAssetPath(imageUrl: string): string | null {
	if (!imageUrl) return null
	const assetPath = imageUrl.replace(/^\/+/, '').replace(/^data\//, '')
	return assetPath.startsWith('assets/') ? assetPath : null
}
