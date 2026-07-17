import * as api from '@/api/api';
import { WHITEBOARD_STORAGE_DIR, WhiteboardFileManager } from '../../../../whiteboard-file-manager';
import { getAllInstanceIds, getInstance } from '../../../../tldraw-instance-manager';
import { buildTldrawLink } from '../../../../utils/link-builder';
import { extractSnapshotRecordSummary, parseSnapshotContent } from '../summaries/snapshot-summary';
import {
    booleanArgWithFallback,
    clampNumber,
    stringArg,
} from '../core/args';

type AgentActionResult = Promise<{ result?: string; error?: string }>;

type WhiteboardDirEntry = IResReadDir & {
    mtime?: string | number;
    hMtime?: string;
    size?: number;
    hSize?: string;
};

type WhiteboardListItem = {
    id: string;
    fileName: string;
    path: string;
    fileMtime: number;
    fileMtimeText?: string;
    fileSize?: number;
    fileSizeText?: string;
    isOpen: boolean;
    link: string;
    blockExists?: boolean;
    blockType?: string;
    blockSubType?: string;
    blockCreatedAt?: number;
    blockCreatedAtIso?: string;
    blockUpdatedAt?: number;
    blockUpdatedAtIso?: string;
    docId?: string;
    docTitle?: string;
    docCreatedAt?: number;
    docCreatedAtIso?: string;
    docUpdatedAt?: number;
    docUpdatedAtIso?: string;
    docPath?: string;
    tags?: string[];
    title?: string;
    metadataError?: string;
    effectiveUpdatedAt?: number;
    effectiveUpdatedAtIso?: string;
    effectiveUpdatedAtSource?: string;
};

type WhiteboardSortBy = 'updated' | 'title' | 'id' | 'shapeCount';

export async function listWhiteboardsForAgent(args: Record<string, unknown>): AgentActionResult {
    try {
        const limit = clampNumber(args.limit, 1, 100, 30);
        const includeDocMetadata = booleanArgWithFallback(args.includeDocMetadata, true);
        const includeSnapshotSummary = booleanArgWithFallback(args.includeSnapshotSummary, true);
        const includeShapeSamples = booleanArgWithFallback(args.includeShapeSamples, false);
        const summaryLimit = includeSnapshotSummary
            ? clampNumber(args.summaryLimit, 0, 50, Math.min(limit, 30))
            : 0;
        const query = stringArg(args.query)?.toLowerCase();
        const sortBy = normalizeWhiteboardSortBy(args.sortBy);
        const sortOrder = stringArg(args.sortOrder) === 'asc' ? 'asc' : 'desc';
        const files = (await api.readDir(WHITEBOARD_STORAGE_DIR)) as unknown as WhiteboardDirEntry[];
        const openIds = new Set(getAllInstanceIds());
        const entries = (files || [])
            .filter((file) => !file.isDir && file.name.startsWith('tldraw-data-') && file.name.endsWith('.json'))
            .map((file) => {
                const id = extractWhiteboardId(file.name);
                return {
                    id,
                    fileName: file.name,
                    path: `${WHITEBOARD_STORAGE_DIR}/${file.name}`,
                    fileMtime: parseSyTimestamp(file.mtime),
                    fileMtimeText: file.hMtime ? String(file.hMtime) : undefined,
                    fileSize: typeof file.size === 'number' ? file.size : undefined,
                    fileSizeText: file.hSize ? String(file.hSize) : undefined,
                    isOpen: openIds.has(id),
                    link: buildTldrawLink(id),
                };
            });

        const withMetadata = includeDocMetadata
            ? await mapWithConcurrency(entries, 6, enrichWhiteboardMetadata)
            : entries.map((entry) => ({
                ...entry,
                effectiveUpdatedAt: entry.fileMtime || 0,
                effectiveUpdatedAtSource: entry.fileMtime ? 'file' : undefined,
            }));
        const filtered = query
            ? withMetadata.filter((item) => whiteboardMatchesQuery(item, query))
            : withMetadata;
        const preloadedSnapshots = new Map<string, Awaited<ReturnType<typeof getWhiteboardListSnapshotSummary>>>();
        if (sortBy === 'shapeCount' && includeSnapshotSummary) {
            const snapshots = await mapWithConcurrency(filtered, 4, async (item) => ({
                id: item.id,
                snapshot: await getWhiteboardListSnapshotSummary(item.id, getInstance(item.id)?.getAgentSummary() || null, false),
            }));
            snapshots.forEach((item) => preloadedSnapshots.set(item.id, item.snapshot));
        }
        const sorted = filtered.sort((a, b) => compareWhiteboards(a, b, sortBy, sortOrder, preloadedSnapshots));
        const selected = sorted.slice(0, limit);
        const whiteboards = await mapWithConcurrency(selected, 4, async (item, index) => {
            const instance = getInstance(item.id);
            const liveSummary = instance ? instance.getAgentSummary({ includeShapeSamples }) : null;
            const snapshotSummary = index < summaryLimit
                ? preloadedSnapshots.get(item.id) || await getWhiteboardListSnapshotSummary(item.id, liveSummary, includeShapeSamples)
                : undefined;
            return {
                ...item,
                title: liveSummary?.title || (item as any).title || (item as any).docTitle || item.id,
                isOpen: Boolean(instance),
                snapshot: snapshotSummary,
            };
        });

        const totals = buildWhiteboardListTotals(filtered, whiteboards.length, summaryLimit);
        return {
            result: JSON.stringify({
                whiteboards,
                totals,
                safety: {
                    fullSnapshotJsonReturned: false,
                    shapeTextReturnedByDefault: false,
                    includeShapeSamples,
                    snapshotSummariesLimitedTo: summaryLimit,
                },
            }, null, 2),
        };
    } catch (error) {
        return { error: stringifyError(error) };
    }
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            results[current] = await mapper(items[current], current);
        }
    });
    await Promise.all(workers);
    return results;
}

function extractWhiteboardId(fileName: string): string {
    const prefix = 'tldraw-data-';
    const base = fileName.endsWith('.json') ? fileName.slice(0, -'.json'.length) : fileName;
    if (!base.startsWith(prefix)) return base;

    const strictMatch = base.match(/^tldraw-data-(\d{14}-[a-z0-9]+)(?:$|[-_])/i);
    if (strictMatch) return strictMatch[1];

    const candidate = base.slice(prefix.length);
    const candidateMatch = candidate.match(/^(\d{14}-[a-z0-9]+)/i);
    if (candidateMatch) return candidateMatch[1];

    return candidate;
}

function normalizeWhiteboardSortBy(value: unknown): WhiteboardSortBy {
    const raw = stringArg(value);
    if (raw === 'title' || raw === 'id' || raw === 'shapeCount') return raw;
    return 'updated';
}

async function enrichWhiteboardMetadata(item: WhiteboardListItem): Promise<WhiteboardListItem> {
    if (!isSafeSiyuanBlockId(item.id)) {
        return addEffectiveUpdatedAt({
            ...item,
            blockExists: false,
            metadataError: 'whiteboard id is not a safe SiYuan block id; block metadata was not queried',
        });
    }

    try {
        const block = await api.getBlockByID(item.id);
        if (!block) {
            return addEffectiveUpdatedAt({
                ...item,
                blockExists: false,
                title: item.id,
            });
        }

        const blockCreatedAt = parseSyTimestamp(block.created);
        const blockUpdatedAt = parseSyTimestamp(block.updated);
        const tags = extractTags(block.tag);
        let docBlock: Block | undefined;
        if (block.root_id && isSafeSiyuanBlockId(block.root_id)) {
            try {
                docBlock = await api.getBlockByID(block.root_id);
            } catch {
                docBlock = undefined;
            }
        }

        const docCreatedAt = parseSyTimestamp(docBlock?.created);
        const docUpdatedAt = parseSyTimestamp(docBlock?.updated);
        return addEffectiveUpdatedAt({
            ...item,
            blockExists: true,
            blockType: block.type,
            blockSubType: block.subtype,
            blockCreatedAt,
            blockCreatedAtIso: toIsoString(blockCreatedAt),
            blockUpdatedAt,
            blockUpdatedAtIso: toIsoString(blockUpdatedAt),
            docId: block.root_id || undefined,
            docTitle: clampListText(docBlock?.fcontent || docBlock?.content || block.fcontent || block.content || item.id, 120),
            docCreatedAt,
            docCreatedAtIso: toIsoString(docCreatedAt),
            docUpdatedAt,
            docUpdatedAtIso: toIsoString(docUpdatedAt),
            docPath: clampListText(docBlock?.hpath || block.hpath || '', 200) || undefined,
            tags,
            title: clampListText(docBlock?.fcontent || docBlock?.content || item.id, 120),
        });
    } catch (error) {
        return addEffectiveUpdatedAt({
            ...item,
            metadataError: stringifyError(error),
        });
    }
}

function addEffectiveUpdatedAt(item: WhiteboardListItem): WhiteboardListItem {
    const candidates = [
        { value: item.blockUpdatedAt || 0, source: 'blockUpdatedAt' },
        { value: item.docUpdatedAt || 0, source: 'docUpdatedAt' },
        { value: item.fileMtime || 0, source: 'fileMtime' },
        { value: item.blockCreatedAt || 0, source: 'blockCreatedAt' },
        { value: item.docCreatedAt || 0, source: 'docCreatedAt' },
    ].filter((candidate) => candidate.value > 0);
    const best = candidates.sort((a, b) => b.value - a.value)[0];
    return {
        ...item,
        effectiveUpdatedAt: best?.value || 0,
        effectiveUpdatedAtIso: toIsoString(best?.value || 0),
        effectiveUpdatedAtSource: best?.source,
    };
}

async function getWhiteboardListSnapshotSummary(
    whiteboardId: string,
    liveSummary: any | null,
    includeShapeSamples: boolean,
) {
    const instance = getInstance(whiteboardId);
    if (instance && liveSummary) {
        const boardSnapshot = instance.getAgentBoardSnapshotSummary();
        return {
            source: 'open-editor',
            pageCount: liveSummary.pageCount,
            shapeCount: liveSummary.shapeCount,
            assetCount: liveSummary.assetCount,
            storeRecordCount: boardSnapshot.storeRecordCount,
            approxJsonBytes: boardSnapshot.approxJsonBytes,
            shapeTypeCounts: liveSummary.shapeTypeCounts || {},
            selectedShapeIds: liveSummary.selectedShapeIds || [],
            sampleShapes: includeShapeSamples
                ? (liveSummary.sampleShapes || []).slice(0, 8).map(summarizeShapeSampleForList)
                : undefined,
        };
    }

    try {
        const content = await WhiteboardFileManager.readWhiteboardFile(whiteboardId);
        if (!content) {
            return {
                source: 'saved-file',
                error: `Whiteboard file not found: ${whiteboardId}`,
            };
        }
        return summarizeSavedSnapshotForList(content, includeShapeSamples);
    } catch (error) {
        return {
            source: 'saved-file',
            error: stringifyError(error),
        };
    }
}

function summarizeSavedSnapshotForList(content: string, includeShapeSamples: boolean) {
    const data = parseSnapshotContent(content);
    const { records, shapes, pages, assets, shapeTypeCounts, linkedBlockShapeCount } = extractSnapshotRecordSummary(data);
    return {
        source: 'saved-file',
        pageCount: pages.length,
        shapeCount: shapes.length,
        assetCount: assets.length,
        storeRecordCount: records.length,
        approxJsonBytes: new Blob([content]).size,
        shapeTypeCounts,
        linkedBlockShapeCount,
        bounds: summarizeShapeBounds(shapes),
        pages: pages.slice(0, 10).map((page: any) => ({
            id: String(page.id || ''),
            name: page.name ? clampListText(String(page.name), 80) : undefined,
            index: page.index ? String(page.index) : undefined,
        })),
        sampleShapes: includeShapeSamples
            ? shapes.slice(0, 8).map(summarizeShapeSampleForList)
            : undefined,
    };
}

function summarizeShapeSampleForList(shape: any) {
    return {
        id: String(shape?.id || ''),
        type: String(shape?.type || 'unknown'),
        x: Number(shape?.x || 0),
        y: Number(shape?.y || 0),
        bounds: summarizeSingleShapeBounds(shape),
        props: summarizeListShapeProps(shape?.props),
    };
}

function summarizeSingleShapeBounds(shape: any) {
    const x = Number(shape?.x || 0);
    const y = Number(shape?.y || 0);
    return {
        x,
        y,
        w: Number(shape?.props?.w ?? shape?.props?.width ?? 1) || 1,
        h: Number(shape?.props?.h ?? shape?.props?.height ?? 1) || 1,
    };
}

function summarizeListShapeProps(props: any): Record<string, unknown> {
    if (!props || typeof props !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const key of ['w', 'h', 'color', 'geo', 'isMain', 'isCollapsed']) {
        if (props[key] !== undefined) out[key] = props[key];
    }
    if (props.blockId !== undefined) {
        out.blockId = props.blockId || null;
        out.isLinkedBlock = Boolean(props.blockId);
    }
    if (props.text !== undefined) out.hasText = true;
    if (props.richText !== undefined) out.hasRichText = true;
    if (props.name !== undefined) out.hasName = true;
    if (props.script !== undefined || props.code !== undefined) out.hasScriptLikeProps = true;
    return out;
}

function summarizeShapeBounds(shapes: any[]) {
    if (!shapes.length) return undefined;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const shape of shapes) {
        const x = Number(shape?.x || 0);
        const y = Number(shape?.y || 0);
        const w = Number(shape?.props?.w ?? shape?.props?.width ?? 0) || 1;
        const h = Number(shape?.props?.h ?? shape?.props?.height ?? 0) || 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return undefined;
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
    };
}

function compareWhiteboards(
    a: WhiteboardListItem,
    b: WhiteboardListItem,
    sortBy: WhiteboardSortBy,
    sortOrder: 'asc' | 'desc',
    snapshots?: Map<string, Awaited<ReturnType<typeof getWhiteboardListSnapshotSummary>>>,
): number {
    const direction = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'title') {
        return direction * String(a.title || a.docTitle || a.id).localeCompare(String(b.title || b.docTitle || b.id));
    }
    if (sortBy === 'id') {
        return direction * a.id.localeCompare(b.id);
    }
    if (sortBy === 'shapeCount') {
        const aCount = Number(snapshots?.get(a.id)?.shapeCount || 0);
        const bCount = Number(snapshots?.get(b.id)?.shapeCount || 0);
        return direction * (aCount - bCount);
    }
    return direction * ((a.effectiveUpdatedAt || 0) - (b.effectiveUpdatedAt || 0));
}

function whiteboardMatchesQuery(item: WhiteboardListItem, query: string): boolean {
    const haystack = [
        item.id,
        item.fileName,
        item.title,
        item.docTitle,
        item.docId,
        item.docPath,
        ...(item.tags || []),
    ].filter(Boolean).join('\n').toLowerCase();
    return haystack.includes(query);
}

function buildWhiteboardListTotals(items: WhiteboardListItem[], returned: number, summaryLimit: number) {
    return {
        matched: items.length,
        returned,
        open: items.filter((item) => item.isOpen).length,
        linkedToExistingBlock: items.filter((item) => item.blockExists).length,
        withMetadataErrors: items.filter((item) => item.metadataError).length,
        snapshotSummariesRequested: summaryLimit,
    };
}

function parseSyTimestamp(value?: string | number | null): number {
    if (!value) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return 0;
    const digitsOnly = value.replace(/[^0-9]/g, '');
    if (digitsOnly.length >= 14) {
        const y = Number(digitsOnly.slice(0, 4));
        const m = Number(digitsOnly.slice(4, 6)) - 1;
        const d = Number(digitsOnly.slice(6, 8));
        const hh = Number(digitsOnly.slice(8, 10));
        const mm = Number(digitsOnly.slice(10, 12));
        const ss = Number(digitsOnly.slice(12, 14));
        return new Date(y, m, d, hh, mm, ss).getTime();
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function toIsoString(ms: number): string | undefined {
    return ms > 0 && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function isSafeSiyuanBlockId(id: string): boolean {
    return /^\d{14}-[a-z0-9]{7}$/i.test(id);
}

function extractTags(raw: string | undefined): string[] {
    if (!raw) return [];
    const matches = raw.match(/#([^#]+)#/g) || [];
    return matches.map((tag) => clampListText(tag.replace(/#/g, ''), 40)).filter(Boolean);
}

function clampListText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
