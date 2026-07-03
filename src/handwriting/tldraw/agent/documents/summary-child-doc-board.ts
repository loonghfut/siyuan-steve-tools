import { openTab, type Plugin } from 'siyuan'
import {
    createDocWithMd,
    exportMdContent,
    getBlockByID,
    getHPathByID,
    setBlockAttrs,
    sql,
} from '@/api/api'
import { getInstance } from '../../tldraw-instance-manager'

export type SummaryChildDocWhiteboardOptions = {
    docId: string
    summaryMarkdown: string
    childTitle?: string
    openWhiteboard?: boolean
    insertMindmap?: boolean
    select?: boolean
    zoom?: boolean
    waitMs?: number
}

export type SourceDocSummaryInput = {
    docId: string
    title: string
    box: string
    path: string
    hPath: string
    sourceMarkdown: string
    truncated: boolean
    instructions: string[]
}

export async function readSourceDocForSummary(docId: string, maxChars: number): Promise<SourceDocSummaryInput> {
    const sourceDoc = await resolveDocumentBlock(docId)
    const sourceHPath = await resolveDocumentHPath(sourceDoc)
    const exported = await exportMdContent(sourceDoc.id)
    const sourceMarkdown = String((exported as any)?.content || '')
    const truncated = sourceMarkdown.length > maxChars

    return {
        docId: sourceDoc.id,
        title: getDocumentTitle(sourceDoc),
        box: sourceDoc.box,
        path: sourceDoc.path,
        hPath: sourceHPath,
        sourceMarkdown: truncated ? sourceMarkdown.slice(0, maxChars) : sourceMarkdown,
        truncated,
        instructions: [
            'Summarize the source document into hierarchical Markdown.',
            'Use heading blocks to represent levels; prefer ## through ###### and avoid # headings.',
            'Call this action again with docId and summaryMarkdown to create the child document whiteboard mindmap.',
        ],
    }
}

export async function createSummaryChildDocWhiteboard(
    plugin: Plugin,
    options: SummaryChildDocWhiteboardOptions
) {
    const sourceDoc = await resolveDocumentBlock(options.docId)
    const sourceTitle = getDocumentTitle(sourceDoc)
    const sourceHPath = await resolveDocumentHPath(sourceDoc)
    const childTitle = sanitizeDocTitle(options.childTitle || `${sourceTitle} Summary Mindmap`)
    const markdown = normalizeSummaryMarkdown(options.summaryMarkdown, sourceTitle)
    const childHPath = await buildUniqueChildDocHPath(sourceDoc.box, sourceHPath, childTitle)
    const created = await createDocWithMd(sourceDoc.box, childHPath, markdown)
    const childDocId = normalizeCreatedDocId(created)

    if (!childDocId) {
        throw new Error('Failed to create summary child document.')
    }

    const childDoc = await waitForDocumentBlock(childDocId)
    const createdChildHPath = await resolveDocumentHPath(childDoc)
    assertCreatedUnderSource(sourceDoc, sourceHPath, childDoc, createdChildHPath, childHPath)

    await setBlockAttrs(childDocId, {
        'custom-st-summary-source-doc': sourceDoc.id,
        'custom-st-summary-kind': 'tldraw-mindmap',
    })

    let whiteboardOpened = false
    let mindmap: unknown = null
    let pendingReason: string | null = null

    if (options.openWhiteboard !== false) {
        await openSummaryWhiteboard(plugin, childDocId, childTitle)
        whiteboardOpened = true
    }

    if (options.insertMindmap !== false) {
        const instance = await waitForOpenWhiteboard(childDocId, options.waitMs ?? 8000)
        if (instance) {
            mindmap = await (instance as any).insertDocOutlineMindmapForAgent({
                docId: childDocId,
                whiteboardId: childDocId,
                select: options.select !== false,
                zoom: options.zoom !== false,
            })
        } else {
            pendingReason = `Whiteboard ${childDocId} did not finish opening before timeout.`
        }
    }

    return {
        sourceDocId: sourceDoc.id,
        childDocId,
        childTitle,
        childPath: childHPath,
        childHPath: createdChildHPath,
        requestedChildHPath: childHPath,
        childStoragePath: childDoc.path,
        whiteboardOpened,
        mindmapInserted: Boolean(mindmap),
        pendingReason,
        retry: pendingReason
            ? {
                action: 'tldraw_insert_doc_outline_mindmap',
                args: { docId: childDocId, whiteboardId: childDocId, select: options.select !== false, zoom: options.zoom !== false },
            }
            : null,
        mindmap,
    }
}

async function resolveDocumentBlock(id: string): Promise<Block> {
    const block = await getBlockByID(id)
    if (!block) throw new Error(`Document or block not found: ${id}`)
    if (block.type === 'd') return block

    const rootId = block.root_id
    if (!rootId || rootId === id) {
        throw new Error(`Block ${id} is not a document and has no root document.`)
    }

    const root = await getBlockByID(rootId)
    if (!root || root.type !== 'd') {
        throw new Error(`Root document not found for block: ${id}`)
    }
    return root
}

async function waitForDocumentBlock(docId: string, timeoutMs = 3000): Promise<Block> {
    const started = Date.now()
    let lastError: unknown = null
    while (Date.now() - started <= timeoutMs) {
        try {
            return await resolveDocumentBlock(docId)
        } catch (error) {
            lastError = error
        }
        await sleep(150)
    }
    throw lastError instanceof Error ? lastError : new Error(`Document not found after creation: ${docId}`)
}

async function resolveDocumentHPath(doc: Block): Promise<string> {
    const hPath = normalizeHPath(doc.hpath)
    if (hPath) return hPath

    const apiHPath = normalizeHPath(await getHPathByID(doc.id))
    if (apiHPath) return apiHPath

    throw new Error(`Failed to resolve document human-readable path: ${doc.id}`)
}

function getDocumentTitle(doc: Block): string {
    return sanitizeDocTitle(doc.content || doc.name || lastPathPart(doc.hpath || doc.path) || doc.id)
}

function normalizeCreatedDocId(value: unknown): string {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>
        return typeof obj.id === 'string' ? obj.id : ''
    }
    return ''
}

function normalizeSummaryMarkdown(markdown: string, sourceTitle: string): string {
    const body = String(markdown || '').trim()
    if (!body) throw new Error('summaryMarkdown cannot be empty.')

    const withoutH1 = body.replace(/^(#{1,6})(\s+)/gm, (match, hashes: string, space: string) => {
        if (hashes.length === 1) return `##${space}`
        return match
    })

    if (/^#{2,6}\s+/m.test(withoutH1)) {
        return `${withoutH1}\n`
    }

    return `## ${sanitizeHeadingText(sourceTitle)}\n\n${withoutH1}\n`
}

async function buildUniqueChildDocHPath(box: string, sourceHPath: string, title: string): Promise<string> {
    const parentPath = normalizeHPath(sourceHPath)
    if (!parentPath) throw new Error('Source document hpath is empty.')

    const baseName = sanitizePathPart(title) || 'summary-mindmap'
    const firstPath = joinHPath(parentPath, baseName)
    if (!(await docHPathExists(box, firstPath))) return firstPath

    const stamp = formatTimestamp(new Date())
    const stampedPath = joinHPath(parentPath, `${baseName}-${stamp}`)
    if (!(await docHPathExists(box, stampedPath))) return stampedPath

    return joinHPath(parentPath, `${baseName}-${stamp}-${Math.random().toString(36).slice(2, 6)}`)
}

async function docHPathExists(box: string, hPath: string): Promise<boolean> {
    const rows = await sql(
        `SELECT id FROM blocks WHERE box='${escapeSql(box)}' AND hpath='${escapeSql(hPath)}' AND type='d' LIMIT 1`
    )
    return Array.isArray(rows) && rows.length > 0
}

function assertCreatedUnderSource(
    sourceDoc: Block,
    sourceHPath: string,
    childDoc: Block,
    createdChildHPath: string,
    expectedChildHPath: string
) {
    const childHPath = normalizeHPath(createdChildHPath)
    const parentPrefix = `${normalizeHPath(sourceHPath)}/`
    if (childDoc.box !== sourceDoc.box) {
        throw new Error(`Created document is in another notebook: ${childDoc.box}`)
    }
    if (childHPath !== expectedChildHPath) {
        throw new Error(`Created document hpath mismatch: expected ${expectedChildHPath}, got ${childHPath}`)
    }
    if (!childHPath.startsWith(parentPrefix)) {
        throw new Error(`Created document is not under source document: ${childHPath}`)
    }
}

function normalizeHPath(value: unknown): string {
    const raw = String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim()
    if (!raw) return ''
    const withRoot = raw.startsWith('/') ? raw : `/${raw}`
    return withRoot.length > 1 ? withRoot.replace(/\/+$/g, '') : withRoot
}

function joinHPath(parent: string, child: string): string {
    return `${normalizeHPath(parent)}/${child}`.replace(/\/+/g, '/')
}

async function openSummaryWhiteboard(plugin: Plugin, whiteboardId: string, title: string) {
    await openTab({
        app: plugin.app,
        custom: {
            id: plugin.name + 'steveTool-whiteboard',
            title,
            icon: 'iconSTWhiteboard',
            data: {
                text: 'steveTool-whiteboard' + whiteboardId,
                rootid: whiteboardId,
            },
        },
        position: 'right',
    })
}

async function waitForOpenWhiteboard(whiteboardId: string, waitMs: number) {
    const started = Date.now()
    while (Date.now() - started <= waitMs) {
        const instance = getInstance(whiteboardId)
        if (instance) {
            try {
                const summary = (instance as any).getAgentSummary?.()
                if (summary?.isOpen) return instance
            } catch {
                return instance
            }
        }
        await sleep(200)
    }
    return null
}

function sleep(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function sanitizeDocTitle(value: string): string {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'Summary Mindmap'
}

function sanitizeHeadingText(value: string): string {
    return sanitizeDocTitle(value).replace(/^#+\s*/, '')
}

function sanitizePathPart(value: string): string {
    return sanitizeDocTitle(value)
        .replace(/[\\/:*?"<>|#[\]{}^`]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 64)
}

function lastPathPart(path: string): string {
    const raw = String(path || '').split('/').filter(Boolean).pop() || ''
    return raw.replace(/\.sy$/i, '')
}

function formatTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function escapeSql(value: string): string {
    return String(value || '').replace(/'/g, "''")
}
