export function summarizeSavedSnapshot(whiteboardId: string, content: string) {
    const data = JSON.parse(content);
    const store = data?.store || {};
    const records = Object.values(store) as any[];
    const shapes = records.filter((record) => record?.typeName === 'shape' || String(record?.id || '').startsWith('shape:'));
    const pages = records.filter((record) => record?.typeName === 'page' || String(record?.id || '').startsWith('page:'));
    const assets = records.filter((record) => record?.typeName === 'asset' || String(record?.id || '').startsWith('asset:'));
    const shapeTypeCounts = shapes.reduce<Record<string, number>>((acc, shape: any) => {
        const type = String(shape.type || 'unknown');
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});
    return {
        id: whiteboardId,
        isOpen: false,
        pageCount: pages.length,
        shapeCount: shapes.length,
        assetCount: assets.length,
        shapeTypeCounts,
        sampleShapes: shapes.slice(0, 20).map((shape: any) => ({
            id: String(shape.id),
            type: String(shape.type),
            x: Number(shape.x || 0),
            y: Number(shape.y || 0),
            props: summarizeProps(shape.props),
        })),
    };
}

function summarizeProps(props: any): Record<string, unknown> {
    if (!props || typeof props !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const key of ['w', 'h', 'color', 'geo', 'blockId', 'name', 'text']) {
        if (props[key] !== undefined) out[key] = props[key];
    }
    if (props.richText) out.richText = '[richText]';
    return out;
}
