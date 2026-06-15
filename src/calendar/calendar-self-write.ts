/**
 * Calendar self-write markers.
 *
 * 当日历模块自身写入 SiYuan AV 单元格 / 块属性时，把 (avID, itemID, keyID) /
 * blockId 登记进短期标记表。下游的 transactionListener (ws-main + fetch 拦截器)
 * 与 api 层的 handlePostBatchUpdateActions 在收到回声时识别为"自写"，跳过
 * refreshKanban 全量刷新链路 —— 因为 FullCalendar 已在本地把事件状态更新好了。
 *
 * 设计参考：lifelog 模块同名机制 module-lifelog.ts 的 pendingWrittenIds /
 * isLifelogSelfWrite —— 这里把模式从单一 blockId 推广到 cell/row/block 三层。
 *
 * TTL = 6000ms，与 calendar.ts 的 pendingCalendarEventPatches 保持一致：
 * 覆盖 API 队列 (≤2000ms) + 批量请求往返 + ws-main 广播延迟，足够命中。
 */

export type CalendarWriteReason =
    | 'drag'
    | 'resize'
    | 'status'
    | 'archive'
    | 'create'
    | 'recurring'
    | 'unscheduled';

interface PendingMark {
    reason?: CalendarWriteReason;
    expiresAt: number;
}

const DEFAULT_TTL_MS = 6000;

const cellMarks = new Map<string, PendingMark>();   // `${avID}:${itemID}:${keyID}`
const rowMarks = new Map<string, PendingMark>();    // `${avID}:${itemID}`
const blockMarks = new Map<string, PendingMark>();  // blockId

function cellKey(avID: string, itemID: string, keyID: string) {
    return `${avID}:${itemID}:${keyID}`;
}

function rowKey(avID: string, itemID: string) {
    return `${avID}:${itemID}`;
}

/** 顺手清理过期项（写入/匹配时调用，避免单独定时器）。 */
function sweepExpired(now: number) {
    for (const [k, v] of cellMarks) if (v.expiresAt <= now) cellMarks.delete(k);
    for (const [k, v] of rowMarks) if (v.expiresAt <= now) rowMarks.delete(k);
    for (const [k, v] of blockMarks) if (v.expiresAt <= now) blockMarks.delete(k);
}

/**
 * 标记一次"日历自写 AV 单元格"。
 * 同时登记 cell 级与 row 级——ws-main 广播的 op 不一定带 keyID，row 级提供降级匹配。
 */
export function markCalendarCellWrite(
    avID: string,
    itemID: string,
    keyID: string,
    reason?: CalendarWriteReason,
    ttlMs: number = DEFAULT_TTL_MS,
): void {
    if (!avID || !itemID) return;
    const now = Date.now();
    const expiresAt = now + ttlMs;
    sweepExpired(now);
    if (keyID) {
        cellMarks.set(cellKey(avID, itemID, keyID), { reason, expiresAt });
    }
    rowMarks.set(rowKey(avID, itemID), { reason, expiresAt });
}

/**
 * 标记一次"日历自写 block 属性"（如 setBlockAttrs({ 'custom-st-event': ... })）。
 * 用于 ws-main 收到 updateAttrs 时的自写识别。
 */
export function markCalendarBlockWrite(
    blockId: string,
    reason?: CalendarWriteReason,
    ttlMs: number = DEFAULT_TTL_MS,
): void {
    if (!blockId) return;
    const now = Date.now();
    sweepExpired(now);
    blockMarks.set(blockId, { reason, expiresAt: now + ttlMs });
}

/**
 * 判断单元格写入是否为自写。
 * 优先精确匹配 (avID + itemID + keyID)；否则降级到 row 级匹配。
 * 命中不消费——批量回声会多次到达，TTL 自然过期足够。
 */
export function isCalendarSelfCellWrite(
    avID?: string,
    itemID?: string,
    keyID?: string,
): boolean {
    if (!avID || !itemID) return false;
    const now = Date.now();
    sweepExpired(now);
    if (keyID) {
        const m = cellMarks.get(cellKey(avID, itemID, keyID));
        if (m && m.expiresAt > now) return true;
    }
    const r = rowMarks.get(rowKey(avID, itemID));
    return !!(r && r.expiresAt > now);
}

/** 判断 block 属性写入是否为自写。 */
export function isCalendarSelfBlockWrite(blockId?: string): boolean {
    if (!blockId) return false;
    const now = Date.now();
    sweepExpired(now);
    const m = blockMarks.get(blockId);
    return !!(m && m.expiresAt > now);
}
