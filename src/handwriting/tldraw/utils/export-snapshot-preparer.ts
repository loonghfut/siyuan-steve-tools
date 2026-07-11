import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { settingdata } from '@/index'
import { getShapeHostElement } from './getShapeHostElement'
import {
	clearSvgExportSnapshotCache,
	serializeElementForSvgExportAsync,
	setSvgExportOutlineOnly,
	setCachedSvgExportSnapshot,
} from './export-dom-snapshot'

export interface SvgExportPreparationProgress {
	current: number
	total: number
	shapeId?: TLShapeId
	message: string
}

export interface PrepareSvgExportSnapshotsOptions {
	onProgress?: (progress: SvgExportPreparationProgress) => void
}

const CARD_BORDER_PX = 3
const SINGLE_BLOCK_BORDER_PX = 3
const SINGLE_BLOCK_MIN_HEIGHT = 30
const OUTLINE_ONLY_SHAPE_THRESHOLD = 90

function nextFrame(): Promise<void> {
	if (typeof requestAnimationFrame === 'function') {
		return new Promise((resolve) => requestAnimationFrame(() => resolve()))
	}
	return new Promise((resolve) => setTimeout(resolve, 0))
}

function isExportSnapshotShape(shape: TLShape | undefined): shape is TLShape {
	return !!shape && (shape.type === 'card' || shape.type === 'single-block')
}

function isExportedShape(editor: Editor, shape: TLShape, exportIds: Set<TLShapeId>): boolean {
	let current: TLShape | undefined = shape
	while (current) {
		if (exportIds.has(current.id)) return true
		current = editor.getShape(current.parentId as TLShapeId)
	}
	return false
}

function getCardContentSource(shape: TLShape, root: ParentNode): HTMLElement | null {
	const host = getShapeHostElement(shape.id, root)
	const content = host?.querySelector('[blockid]') as HTMLElement | null
	if (!content) return null

	const props = shape.props as { isCollapsed?: boolean }
	if (!props.isCollapsed) return content

	const collapsedContent = content.querySelector(':scope > .card-shape-collapsed-content') as HTMLElement | null
	return collapsedContent || content
}

function getSingleBlockContentSource(shape: TLShape, root: ParentNode): HTMLElement | null {
	const host = getShapeHostElement(shape.id, root)
	return (host?.querySelector('[blockid]') as HTMLElement | null) ?? null
}

async function serializeShapeSnapshot(editor: Editor, shape: TLShape, root: ParentNode): Promise<string> {
	const props = shape.props as {
		w?: number
		h?: number
		fontSize?: number
		isCollapsed?: boolean
		transparentBackground?: boolean
	}

	if (shape.type === 'card') {
		const border = settingdata["showCardBorder"] !== false ? CARD_BORDER_PX : 0
		const source = getCardContentSource(shape, root)
		if (!source) return ''

		return await serializeElementForSvgExportAsync(source, {
			viewportWidth: Math.max((props.w ?? 1) - border * 2, 1),
			viewportHeight: Math.max((props.h ?? 1) - border * 2, 1),
			fontSize: props.isCollapsed ? undefined : props.fontSize,
		})
	}

	const showBorder = settingdata["showCardBorder"] !== false && !props.transparentBackground
	const border = showBorder ? SINGLE_BLOCK_BORDER_PX : 0
	const source = getSingleBlockContentSource(shape, root)
	if (!source) return ''

	let height = Math.max(props.h ?? SINGLE_BLOCK_MIN_HEIGHT, SINGLE_BLOCK_MIN_HEIGHT)
	try {
		height = editor.getShapeGeometry(shape).bounds.height || height
	} catch {
		// Fall back to persisted shape height when geometry is not available.
	}

	return await serializeElementForSvgExportAsync(source, {
		viewportWidth: Math.max((props.w ?? 1) - border * 2, 1),
		viewportHeight: Math.max(height - border * 2, 1),
		fontSize: props.fontSize,
	})
}

export async function prepareSvgExportSnapshots(
	editor: Editor,
	ids: TLShapeId[],
	options: PrepareSvgExportSnapshotsOptions = {}
): Promise<void> {
	clearSvgExportSnapshotCache()

	if (typeof document === 'undefined') return
	const root = editor.getContainer()

	const exportIds = new Set(ids)
	const shapes = Array.from(editor.getCurrentPageShapeIds())
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => !!shape && isExportedShape(editor, shape, exportIds))
		.filter(isExportSnapshotShape)
	const outlineOnly = shapes.length > OUTLINE_ONLY_SHAPE_THRESHOLD
	setSvgExportOutlineOnly(outlineOnly)

	if (shapes.length === 0) {
		options.onProgress?.({ current: 0, total: 0, message: '准备导出内容' })
		return
	}

	if (outlineOnly) {
		options.onProgress?.({ current: shapes.length, total: shapes.length, message: '形状过多，导出轮廓以提升性能' })
		return
	}

	options.onProgress?.({ current: 0, total: shapes.length, message: '准备导出内容' })
	await nextFrame()

	for (let index = 0; index < shapes.length; index++) {
		const shape = shapes[index]
		const html = await serializeShapeSnapshot(editor, shape, root)
		setCachedSvgExportSnapshot(shape.id, html)

		options.onProgress?.({
			current: index + 1,
			total: shapes.length,
			shapeId: shape.id,
			message: '准备导出内容',
		})
		await nextFrame()
	}
}
