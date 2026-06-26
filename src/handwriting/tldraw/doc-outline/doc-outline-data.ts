import { getDocOutline, getDoc, listDocsByPath, sql } from '@/api/api'

export interface ChildDocItem {
    id: string
    name: string
    icon?: string
    path: string
    box: string
}

export interface OutlineNode {
    id: string
    name?: string
    type?: string
    subType?: string
    depth?: number
    content?: string
    blocks?: OutlineNode[]
    children?: OutlineNode[] | null
}

function stripHtmlEntities(text?: string): string {
    if (!text) return ''
    const withoutTags = text.replace(/<[^>]*>/g, '')
    return withoutTags
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .trim()
}

export async function loadChildDocsForDoc(docId: string, signal?: AbortSignal): Promise<ChildDocItem[]> {
    const docResult = await getDoc(docId)
    if (signal?.aborted) return []

    const box = (docResult as any).box
    const docPath = (docResult as any).path

    if (!box || !docPath) {
        throw new Error('getDoc result missing box or path')
    }

    // SQL 预查询：检查是否有子文档，避免空调用 listDocsByPath
    const parentPath = docPath.replace(/\.sy$/, '')
    const sqlResult = await sql(
        `SELECT id FROM blocks WHERE box = '${box}' AND path LIKE '${parentPath}/%.sy' AND type = 'd' LIMIT 1`
    )
    if (signal?.aborted) return []
    if (!Array.isArray(sqlResult) || sqlResult.length === 0) {
        return []
    }

    let childPath = docPath.replace(/\.sy$/, '')
    if (!childPath.endsWith('/')) childPath += '/'

    const result = await listDocsByPath('', box, childPath)
    if (signal?.aborted) return []

    const data = result as any
    if (!data.files || !Array.isArray(data.files)) return []

    return data.files
        .filter((file: any) => file.id)
        .map((file: any) => ({
            id: file.id,
            name: (file.name || '未命名文档').replace(/\.sy$/, ''),
            icon: file.icon,
            path: file.path,
            box: data.box || box,
        }))
}

function transformOutlineBlock(block: any): OutlineNode {
    return {
        id: block.id,
        name: stripHtmlEntities(block.content || block.name),
        type: block.type,
        subType: block.subType,
        depth: block.depth,
        content: stripHtmlEntities(block.content),
        blocks: block.children?.map(transformOutlineBlock),
        children: null,
    }
}

export async function loadOutlineForDoc(docId: string, signal?: AbortSignal): Promise<OutlineNode[]> {
    const result = await getDocOutline(docId)
    if (signal?.aborted) return []

    const outlineData = result as any
    return outlineData.map((node: any) => ({
        id: node.id,
        name: stripHtmlEntities(node.name),
        type: node.type,
        subType: node.subType,
        depth: node.depth,
        blocks: node.blocks?.map(transformOutlineBlock),
        children: null,
    }))
}

export function collectAllOutlineNodeIds(nodes: OutlineNode[]): string[] {
    const ids: string[] = []
    const collect = (node: OutlineNode) => {
        ids.push(node.id)
        node.blocks?.forEach(collect)
    }
    nodes.forEach(collect)
    return ids
}
