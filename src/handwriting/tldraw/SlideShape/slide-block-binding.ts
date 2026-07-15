import { sql } from '@/api/api'
import { buildTldrawLink } from '../utils/link-builder'

export const SLIDE_SHAPE_ID_ATTR = 'custom-st-slide-id'

export interface SlideScreenshotMarkdownOptions {
	assetPath: string
	name: string
	shapeId: string
	rootId: string
	title?: string
}

/**
 * Slide 与思源图片块之间只通过 shapeId 属性关联，块 ID 永不写入白板快照。
 */
export async function findSlideScreenshotBlockId(shapeId: string): Promise<string | null> {
	const normalizedShapeId = String(shapeId || '').trim()
	if (!normalizedShapeId) return null

	const escapedShapeId = normalizedShapeId.replace(/'/g, "''")
	const rows = await sql(
		`SELECT block_id FROM attributes WHERE name = '${SLIDE_SHAPE_ID_ATTR}' AND value = '${escapedShapeId}' AND type = 'b' ORDER BY rowid DESC LIMIT 1`
	)
	const blockId = String(rows?.[0]?.block_id || '').trim()
	return blockId || null
}

export function buildSlideScreenshotMarkdown(options: SlideScreenshotMarkdownOptions): string {
	const alt = options.name || 'slide'
	const link = buildTldrawLink(options.rootId, options.rootId, options.title || '', options.shapeId)
	return `![${alt}](${options.assetPath})\n{: ${SLIDE_SHAPE_ID_ATTR}="${options.shapeId}" custom-tldraw-link="${link}" }`
}
