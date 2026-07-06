import { openTab } from 'siyuan';
import {
    createDocWithMd,
    getBlockByID,
    getHPathByID,
    lsNotebooks,
    sql,
} from '@/api/api';
import { booleanArg, stringArg } from '../../core/args';
import { getFocusedInstanceId } from '../../../tldraw-instance-manager';
import { disabledResult, jsonResult, stringifyError, type AgentActionContext, type AgentActionDefinition } from '../shared';

export function createOpenWhiteboardAction(context: AgentActionContext): AgentActionDefinition {
    return {
        name: 'tldraw_open_whiteboard',
        description: 'Open an STtools tldraw whiteboard tab. To open an existing board, pass whiteboardId/rootId/id. To create and open a new whiteboard, omit whiteboardId or pass createNew:true/newWhiteboard:true; the tool creates the backing SiYuan document itself. Optional args: title string, notebook/box/notebookId string, path/hPath string for the exact document path, parentDocId/sourceDocId string for sibling placement, markdown/contentMarkdown string for initial document content.',
        handler: async (args) => {
            const disabled = disabledResult();
            if (disabled) return disabled;
            try {
                const whiteboardId = normalizeExistingWhiteboardId(args);
                const title = stringArg(args.title || args.name);
                const createNew =
                    booleanArg(args.createNew) === true ||
                    booleanArg(args.newWhiteboard) === true ||
                    booleanArg(args.new) === true ||
                    !whiteboardId;

                if (createNew) {
                    const created = await createAndOpenNewWhiteboard(context, args);
                    return jsonResult(created);
                }

                await openWhiteboardTab(context, whiteboardId, title || `Whiteboard ${whiteboardId}`);
                return jsonResult({
                    whiteboardId,
                    created: false,
                    opened: true,
                    title: title || `Whiteboard ${whiteboardId}`,
                });
            } catch (error) {
                return { error: stringifyError(error) };
            }
        },
    };
}

type NewWhiteboardPlacement = {
    notebook: string;
    hPath: string;
    title: string;
    markdown: string;
    source: 'explicit-path' | 'sibling-doc' | 'focused-whiteboard' | 'first-notebook';
};

function normalizeExistingWhiteboardId(args: Record<string, unknown>): string | undefined {
    const raw = stringArg(args.whiteboardId || args.rootId || args.id);
    if (!raw) return undefined;
    const normalized = raw.toLowerCase();
    if (normalized === 'new' || normalized === 'create-new' || normalized === 'new-whiteboard') return undefined;
    return raw;
}

async function createAndOpenNewWhiteboard(
    context: AgentActionContext,
    args: Record<string, unknown>
) {
    const placement = await resolveNewWhiteboardPlacement(args);
    const createdDoc = await createDocWithMd(placement.notebook, placement.hPath, placement.markdown);
    const whiteboardId = normalizeCreatedDocId(createdDoc);
    if (!whiteboardId) {
        throw new Error('Failed to create backing SiYuan document for the new whiteboard.');
    }

    const doc = await waitForDocumentBlock(whiteboardId);
    const title = getDocumentTitle(doc) || placement.title;
    await openWhiteboardTab(context, whiteboardId, title);

    return {
        whiteboardId,
        docId: whiteboardId,
        created: true,
        opened: true,
        title,
        notebook: placement.notebook,
        requestedHPath: placement.hPath,
        hPath: await resolveDocumentHPath(doc),
        placementSource: placement.source,
    };
}

async function openWhiteboardTab(context: AgentActionContext, whiteboardId: string, title: string) {
    await openTab({
        app: context.plugin.app,
        custom: {
            id: context.plugin.name + 'steveTool-whiteboard',
            title,
            icon: 'iconSTWhiteboard',
            data: {
                text: 'steveTool-whiteboard' + whiteboardId,
                rootid: whiteboardId,
            },
        },
        position: 'right',
    });
}

async function resolveNewWhiteboardPlacement(args: Record<string, unknown>): Promise<NewWhiteboardPlacement> {
    const title = sanitizeDocTitle(stringArg(args.title || args.name) || 'New Whiteboard');
    const markdown = normalizeInitialMarkdown(stringArg(args.markdown || args.contentMarkdown));
    const explicitNotebook = stringArg(args.notebook || args.notebookId || args.box);
    const explicitPath = normalizeHPath(stringArg(args.hPath || args.path));

    if (explicitNotebook && explicitPath) {
        return {
            notebook: explicitNotebook,
            hPath: await buildUniqueDocHPath(explicitNotebook, explicitPath),
            title,
            markdown,
            source: 'explicit-path',
        };
    }

    const referenceDocId = stringArg(args.parentDocId || args.sourceDocId || args.docId);
    const referenceDoc = referenceDocId ? await resolveDocumentBlock(referenceDocId) : await resolveFocusedWhiteboardDocument();
    if (referenceDoc) {
        const referenceHPath = await resolveDocumentHPath(referenceDoc);
        return {
            notebook: explicitNotebook || referenceDoc.box,
            hPath: await buildUniqueDocHPath(explicitNotebook || referenceDoc.box, joinHPath(getParentHPath(referenceHPath), title)),
            title,
            markdown,
            source: referenceDocId ? 'sibling-doc' : 'focused-whiteboard',
        };
    }

    if (explicitNotebook) {
        return {
            notebook: explicitNotebook,
            hPath: await buildUniqueDocHPath(explicitNotebook, joinHPath('/', title)),
            title,
            markdown,
            source: 'explicit-path',
        };
    }

    const notebook = await getFirstNotebookId();
    return {
        notebook,
        hPath: await buildUniqueDocHPath(notebook, joinHPath('/', title)),
        title,
        markdown,
        source: 'first-notebook',
    };
}

async function resolveFocusedWhiteboardDocument(): Promise<Block | null> {
    const focusedId = getFocusedInstanceId();
    if (!focusedId) return null;
    try {
        return await resolveDocumentBlock(focusedId);
    } catch {
        return null;
    }
}

async function resolveDocumentBlock(id: string): Promise<Block> {
    const block = await getBlockByID(id);
    if (!block) throw new Error(`Document or block not found: ${id}`);
    if (block.type === 'd') return block;

    const rootId = block.root_id;
    if (!rootId || rootId === id) {
        throw new Error(`Block ${id} is not a document and has no root document.`);
    }

    const root = await getBlockByID(rootId);
    if (!root || root.type !== 'd') {
        throw new Error(`Root document not found for block: ${id}`);
    }
    return root;
}

async function waitForDocumentBlock(docId: string, timeoutMs = 3000): Promise<Block> {
    const started = Date.now();
    let lastError: unknown = null;
    while (Date.now() - started <= timeoutMs) {
        try {
            return await resolveDocumentBlock(docId);
        } catch (error) {
            lastError = error;
        }
        await sleep(150);
    }
    throw lastError instanceof Error ? lastError : new Error(`Document not found after creation: ${docId}`);
}

async function resolveDocumentHPath(doc: Block): Promise<string> {
    const hPath = normalizeHPath(doc.hpath);
    if (hPath) return hPath;

    const apiHPath = normalizeHPath(await getHPathByID(doc.id));
    if (apiHPath) return apiHPath;

    throw new Error(`Failed to resolve document human-readable path: ${doc.id}`);
}

async function buildUniqueDocHPath(notebook: string, requestedHPath: string): Promise<string> {
    const normalized = normalizeHPath(requestedHPath) || '/New Whiteboard';
    if (!(await docHPathExists(notebook, normalized))) return normalized;

    const parent = getParentHPath(normalized);
    const baseName = lastPathPart(normalized) || 'New Whiteboard';
    const stamped = joinHPath(parent, `${baseName}-${formatTimestamp(new Date())}`);
    if (!(await docHPathExists(notebook, stamped))) return stamped;

    return joinHPath(parent, `${baseName}-${formatTimestamp(new Date())}-${Math.random().toString(36).slice(2, 6)}`);
}

async function docHPathExists(notebook: string, hPath: string): Promise<boolean> {
    const rows = await sql(
        `SELECT id FROM blocks WHERE box='${escapeSql(notebook)}' AND hpath='${escapeSql(hPath)}' AND type='d' LIMIT 1`
    );
    return Array.isArray(rows) && rows.length > 0;
}

async function getFirstNotebookId(): Promise<string> {
    const result = await lsNotebooks();
    const notebooks = Array.isArray((result as any)?.notebooks) ? (result as any).notebooks : [];
    const notebook = notebooks.find((item: any) => item && item.closed !== true) || notebooks[0];
    const id = stringArg(notebook?.id || notebook?.box);
    if (!id) {
        throw new Error('No notebook is available. Pass notebook/box when creating a new whiteboard.');
    }
    return id;
}

function normalizeCreatedDocId(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        return typeof obj.id === 'string' ? obj.id : '';
    }
    return '';
}

function normalizeInitialMarkdown(markdown: string | undefined): string {
    if (markdown && markdown.trim()) return `${markdown.trim()}\n`;
    return '';
}

function getDocumentTitle(doc: Block): string {
    return sanitizeDocTitle(doc.content || doc.name || lastPathPart(doc.hpath || doc.path) || doc.id);
}

function sanitizeDocTitle(value: string): string {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\\/:*?"<>|#[\]{}^`]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'New Whiteboard';
}

function normalizeHPath(value: unknown): string {
    const raw = String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim();
    if (!raw) return '';
    const withRoot = raw.startsWith('/') ? raw : `/${raw}`;
    return withRoot.length > 1 ? withRoot.replace(/\/+$/g, '') : withRoot;
}

function joinHPath(parent: string, child: string): string {
    return `${normalizeHPath(parent)}/${sanitizeDocTitle(child)}`.replace(/\/+/g, '/');
}

function getParentHPath(hPath: string): string {
    const normalized = normalizeHPath(hPath);
    if (!normalized || normalized === '/') return '/';
    const index = normalized.lastIndexOf('/');
    return index <= 0 ? '/' : normalized.slice(0, index);
}

function lastPathPart(path: string): string {
    return String(path || '').split('/').filter(Boolean).pop()?.replace(/\.sy$/i, '') || '';
}

function formatTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function escapeSql(value: string): string {
    return String(value || '').replace(/'/g, "''");
}

function sleep(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
