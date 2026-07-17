/**
 * 画布文本搜索逻辑
 * 提取形状文本并按关键字过滤，供 SearchPanel 使用
 */
import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw'
import { api } from '@frostime/siyuan-plugin-kits'
import type { MindMapNode } from '../MindMapShape/mind-map-shape-types'

export interface SearchResultItem {
    shapeId: TLShapeId
    shapeType: string
    /** 中文类型标签 */
    typeLabel: string
    /** 命中片段（命中词前后各截取一段） */
    snippet: string
    /** 片段内命中起始位置，用于高亮 */
    matchStart: number
    matchLength: number
}

const TYPE_LABELS: Record<string, string> = {
    text: '文本',
    note: '便签',
    geo: '图形',
    arrow: '箭头',
    frame: '画框',
    card: '卡片',
    'single-block': '单块',
    'mind-map': '思维导图',
    slide: '幻灯片',
    branch: 'Branch',
    'bezier-connector': '连接线',
}

export function getShapeTypeLabel(shapeType: string): string {
    return TYPE_LABELS[shapeType] || shapeType
}

/** 递归收集思维导图节点文本（含折叠节点） */
function collectMindMapText(node: MindMapNode | undefined | null): string {
    if (!node) return ''
    const parts: string[] = []
    const walk = (n: MindMapNode) => {
        if (n.text) parts.push(n.text)
        for (const child of n.children || []) walk(child)
    }
    walk(node)
    return parts.join(' ')
}

/**
 * 同步提取单个形状的可搜索文本（返回 '' 表示无文本）
 * card/single-block 的正文在思源块中，需要传入 blockContentCache 才能命中
 */
export function getShapeSearchableText(
    editor: Editor,
    shape: TLShape,
    blockContentCache?: Map<string, string>
): string {
    const props = shape.props as any
    switch (shape.type) {
        case 'slide':
        case 'frame':
            return String(props?.name || '')
        case 'mind-map':
            return collectMindMapText(props?.rootNode)
        case 'card':
        case 'single-block': {
            const blockId = String(props?.blockId || '')
            if (!blockId) return ''
            return blockContentCache?.get(blockId) || ''
        }
        case 'js-shape':
            // 不搜索脚本代码
            return ''
        default:
            try {
                return editor.getShapeUtil(shape).getText(shape) ?? ''
            } catch {
                return ''
            }
    }
}

const SNIPPET_CONTEXT = 30

/** 主搜索函数：大小写不敏感的子串匹配 */
export function searchShapes(
    editor: Editor,
    shapes: TLShape[],
    query: string,
    blockContentCache?: Map<string, string>
): SearchResultItem[] {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const results: SearchResultItem[] = []
    for (const shape of shapes) {
        const raw = getShapeSearchableText(editor, shape, blockContentCache)
        if (!raw) continue
        const text = raw.replace(/\s+/g, ' ').trim()
        const index = text.toLowerCase().indexOf(q)
        if (index < 0) continue

        const start = Math.max(0, index - SNIPPET_CONTEXT)
        const end = Math.min(text.length, index + q.length + SNIPPET_CONTEXT)
        const prefix = start > 0 ? '…' : ''
        const suffix = end < text.length ? '…' : ''
        results.push({
            shapeId: shape.id,
            shapeType: shape.type,
            typeLabel: getShapeTypeLabel(shape.type),
            snippet: prefix + text.slice(start, end) + suffix,
            matchStart: prefix.length + (index - start),
            matchLength: q.length,
        })
    }
    return results
}

/**
 * 批量加载 card/single-block 关联思源块的文本内容
 * 用于深度搜索卡片正文
 */
export async function loadBlockContents(shapes: TLShape[]): Promise<Map<string, string>> {
    const blockIds = Array.from(
        new Set(
            shapes
                .filter((shape) => shape.type === 'card' || shape.type === 'single-block')
                .map((shape) => String((shape.props as any)?.blockId || ''))
                .filter(Boolean)
        )
    )
    const cache = new Map<string, string>()
    if (blockIds.length === 0) return cache

    // 分批 SQL 查询，避免 in 列表过长
    const BATCH_SIZE = 100
    for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batch = blockIds.slice(i, i + BATCH_SIZE)
        const idList = batch.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',')
        try {
            const rows = await api.sql(
                `SELECT id, content FROM blocks WHERE id IN (${idList})`
            )
            for (const row of rows || []) {
                if (row?.id) cache.set(String(row.id), String(row.content || ''))
            }
        } catch (error) {
            console.warn('加载块内容失败:', error)
        }
    }
    return cache
}
