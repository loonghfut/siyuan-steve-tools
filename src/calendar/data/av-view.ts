import type { ViewItem } from '../core/types.ts';

export interface ExtractedAvViewItems {
    valid: boolean;
    items: ViewItem[];
}

/**
 * 从 `/api/av/renderAttributeView` 返回的元数据载荷中提取视图列表。
 *
 * 当服务端返回错误字符串（如 `"/api/av/renderAttributeViewerror"`）、空值或缺少 `views` 时，
 * 安全返回空数组（或在存在 `viewID` 时回退为单视图），避免调用方因访问 `view.views.map` 抛出 TypeError。
 */
export function extractViewItemsFromAvResponse(
    avResponse: any,
    fallbackAvId: string,
    blockId?: string,
): ExtractedAvViewItems {
    if (!avResponse || typeof avResponse !== 'object') {
        return { valid: false, items: [] };
    }

    const rootid = typeof avResponse.id === 'string' && avResponse.id ? avResponse.id : fallbackAvId;
    const rootname = avResponse.name ? `${avResponse.name}-` : '';

    let rawViews: any[];
    if (Array.isArray(avResponse.views)) {
        rawViews = avResponse.views;
    } else if (typeof avResponse.viewID === 'string' && avResponse.viewID) {
        rawViews = [{ id: avResponse.viewID, name: avResponse.view?.name || '' }];
    } else {
        return { valid: false, items: [] };
    }

    const items: ViewItem[] = [];
    for (const viewItem of rawViews) {
        if (!viewItem || typeof viewItem !== 'object' || !viewItem.id) {
            continue;
        }
        items.push({
            rootid,
            viewId: viewItem.id,
            name: rootname + (viewItem.name || ''),
            blockId: blockId || undefined,
        });
    }

    return { valid: true, items };
}
