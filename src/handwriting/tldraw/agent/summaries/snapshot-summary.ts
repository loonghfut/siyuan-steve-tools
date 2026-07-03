export type SnapshotRecordSummary = {
    records: any[];
    pages: any[];
    shapes: any[];
    assets: any[];
    storeRecordCount: number;
    shapeTypeCounts: Record<string, number>;
    linkedBlockShapeCount: number;
};

export function summarizeSavedSnapshot(whiteboardId: string, content: string) {
    const data = parseSnapshotContent(content);
    const { records, shapes, pages, assets, shapeTypeCounts, linkedBlockShapeCount } = extractSnapshotRecordSummary(data);
    return {
        id: whiteboardId,
        isOpen: false,
        pageCount: pages.length,
        shapeCount: shapes.length,
        assetCount: assets.length,
        storeRecordCount: records.length,
        approxJsonBytes: content.length,
        shapeTypeCounts,
        linkedBlockShapeCount,
        sampleShapes: shapes.slice(0, 20).map((shape: any) => ({
            id: String(shape.id),
            type: String(shape.type),
            x: Number(shape.x || 0),
            y: Number(shape.y || 0),
            bounds: summarizeShapeBounds(shape),
            props: summarizeProps(shape.props),
        })),
    };
}

export function summarizeSnapshotObject(whiteboardId: string, snapshot: unknown, source?: string) {
    const { records, shapes, pages, assets, shapeTypeCounts, linkedBlockShapeCount } = extractSnapshotRecordSummary(snapshot);
    const json = JSON.stringify(snapshot);
    return {
        id: whiteboardId,
        source,
        pageCount: pages.length,
        shapeCount: shapes.length,
        assetCount: assets.length,
        storeRecordCount: records.length,
        approxJsonBytes: json.length,
        shapeTypeCounts,
        linkedBlockShapeCount,
        pages: pages.slice(0, 50).map((page) => ({
            id: String(page.id || ''),
            name: page.name ? String(page.name) : undefined,
            index: page.index ? String(page.index) : undefined,
        })),
    };
}

function summarizeShapeBounds(shape: any) {
    const x = Number(shape?.x || 0);
    const y = Number(shape?.y || 0);
    return {
        x,
        y,
        w: Number(shape?.props?.w ?? shape?.props?.width ?? 1) || 1,
        h: Number(shape?.props?.h ?? shape?.props?.height ?? 1) || 1,
    };
}

export function parseSnapshotContent(content: string | object): unknown {
    if (typeof content === 'string') return JSON.parse(content);
    return content;
}

export function extractSnapshotRecordSummary(snapshot: unknown): SnapshotRecordSummary {
    const candidates = getSnapshotCandidates(snapshot);
    let best = buildCandidateRecordSummary(snapshot);

    for (const candidate of candidates) {
        const summary = buildCandidateRecordSummary(candidate);
        if (scoreRecordSummary(summary) > scoreRecordSummary(best)) {
            best = summary;
        }
    }

    return best;
}

function summarizeProps(props: any): Record<string, unknown> {
    if (!props || typeof props !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const key of ['w', 'h', 'color', 'geo', 'name', 'text']) {
        if (props[key] !== undefined) out[key] = props[key];
    }
    if (props.blockId !== undefined) {
        out.blockId = props.blockId || null;
        out.isLinkedBlock = Boolean(props.blockId);
    }
    if (props.richText) out.richText = '[richText]';
    return out;
}

function buildCandidateRecordSummary(candidate: unknown): SnapshotRecordSummary {
    const records = new Map<string, any>();
    const pages = new Map<string, any>();
    const shapes = new Map<string, any>();
    const assets = new Map<string, any>();

    const addRecord = (record: any, key: string | undefined, forcedKind?: 'page' | 'shape' | 'asset') => {
        if (!record || typeof record !== 'object') return;
        const materialized = record.id || !key ? record : { ...record, id: key };
        const id = String(materialized.id || key || `${forcedKind || 'record'}:${records.size}`);
        records.set(id, materialized);

        if (forcedKind === 'page' || isPageRecord(materialized, key)) pages.set(id, materialized);
        if (forcedKind === 'shape' || isShapeRecord(materialized, key)) shapes.set(id, materialized);
        if (forcedKind === 'asset' || isAssetRecord(materialized, key)) assets.set(id, materialized);
    };

    const addObjectEntries = (value: any, forcedKind?: 'page' | 'shape' | 'asset') => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            value.forEach((record) => addRecord(record, undefined, forcedKind));
            return;
        }
        Object.entries(value).forEach(([key, record]) => addRecord(record, key, forcedKind));
    };

    const doc = candidate as any;
    addObjectEntries(doc?.store);
    addObjectEntries(doc?.records);
    addObjectEntries(doc?.pages, 'page');
    addObjectEntries(doc?.pageStates, 'page');
    addObjectEntries(doc?.session?.pageStates, 'page');
    addObjectEntries(doc?.shapes, 'shape');
    addObjectEntries(doc?.assets, 'asset');

    const shapeList = Array.from(shapes.values());
    const shapeTypeCounts = shapeList.reduce<Record<string, number>>((acc, shape: any) => {
        const type = String(shape?.type || shape?.shapeType || 'unknown');
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});
    const linkedBlockShapeCount = shapeList.filter((shape: any) =>
        typeof shape?.props?.blockId === 'string' && shape.props.blockId
    ).length;

    return {
        records: Array.from(records.values()),
        pages: Array.from(pages.values()),
        shapes: shapeList,
        assets: Array.from(assets.values()),
        storeRecordCount: records.size,
        shapeTypeCounts,
        linkedBlockShapeCount,
    };
}

function getSnapshotCandidates(snapshot: unknown): unknown[] {
    const out: unknown[] = [];
    const seen = new Set<unknown>();
    const add = (value: unknown) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        out.push(value);
    };

    add(snapshot);
    const root = snapshot as any;
    add(root?.document);
    add(root?.snapshot);
    add(root?.data);
    add(root?.data?.document);
    add(root?.data?.snapshot);
    add(root?.result);
    add(root?.result?.document);
    add(root?.result?.snapshot);

    return out;
}

function scoreRecordSummary(summary: SnapshotRecordSummary): number {
    return summary.shapes.length * 1000 + summary.pages.length * 100 + summary.assets.length * 10 + summary.records.length;
}

function isPageRecord(record: any, key?: string) {
    const id = String(record?.id || key || '');
    return record?.typeName === 'page' || id.startsWith('page:') || key?.startsWith('page:') || record?.type === 'page';
}

function isShapeRecord(record: any, key?: string) {
    const id = String(record?.id || key || '');
    if (record?.typeName === 'shape' || id.startsWith('shape:') || key?.startsWith('shape:')) return true;
    if (!record?.props || typeof record?.type !== 'string') return false;
    return record.x !== undefined || record.y !== undefined || record.parentId !== undefined;
}

function isAssetRecord(record: any, key?: string) {
    const id = String(record?.id || key || '');
    return record?.typeName === 'asset' || id.startsWith('asset:') || key?.startsWith('asset:') || record?.type === 'asset';
}
