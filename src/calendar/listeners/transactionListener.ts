import type steveTools from '@/index';
import * as api from '@/api/api';
import { scheduleCalendarRefresh } from '@/calendar/core/calendar-runtime';
import {
    invalidateKramdownCache,
    invalidateViewValueCache,
    statusMap,
} from '@/calendar/data/calendar-data';
import { interceptFetch } from '@/api/network-interceptor';
import { isLifelogSelfWrite, ATTRS } from '@/lifelog/contracts';
import {
    isCalendarSelfBlockWrite,
    isCalendarSelfCellWrite,
    getCalendarSelfCellWriteReason,
    markCalendarBlockWrite,
} from '@/calendar/core/calendar-self-write';
import {
    syncBoundScheduleTaskItems,
} from '@/calendar/listeners/bound-task-block-sync';
import { syncTaskBlockStatusToCalendar } from '@/calendar/listeners/task-block-status-sync';

interface WsOp { action: string;[k: string]: any }
interface WsMsg { cmd: string; data?: any[] }

interface CalendarListenerHost {
  av_ids: Array<{ id: string }>;
  avButton(): void;
  isAutoSyncingUpdateEnabled(): boolean;
  isListening(): boolean;
  scheduleCalendarUpdate(delay?: number): void;
  getManagedCalendarAvIds(): Promise<string[]>;
}

/**
 * 判断一个 updateAttrs 操作是不是 lifelog 模块自己刚写入的（自反射）。
 * 命中则跳过全量日历刷新——因为 lifelog 写完属性后会自己发
 * LIFELOG_CHANGED_EVENT 通知日历做局部增量更新，再走全量 refresh 是重复劳动。
 *
 * 判定条件（任一命中即视为自写）：
 *   1. op.id 命中 pendingWrittenIds（最可靠）
 *   2. op.data 里包含 lifelog 专属属性名（custom-lifelog-*），作为兜底：
 *      多窗口 / 多次连续写入时，pendingWrittenIds 可能已被清理，
 *      但 lifelog 属性是本插件专属，普通编辑不会写它们。
 */
function isLifelogSelfUpdateAttrs(op: WsOp): boolean {
    const id: string | undefined = op.id;
    if (id && isLifelogSelfWrite(id)) return true;
    const data = op.data;
    if (typeof data === 'string') {
        // lifelog 自定义属性前缀（custom-lifelog-）。普通用户编辑不会写出这些属性。
        const lifelogAttrNames = Object.values(ATTRS) as string[];
        for (const name of lifelogAttrNames) {
            if (data.includes(name)) return true;
        }
    }
    return false;
}

const STATUS_SYNC_DEDUPE_TTL_MS = 2_000;
const statusSyncQueues = new Map<string, Promise<void>>();
const recentStatusSyncs = new Map<string, { status: string; expiresAt: number; promise: Promise<void> }>();

function getTaskListItemCompletion(op: WsOp): boolean | undefined {
    if (op.action !== 'update' || typeof op.id !== 'string' || typeof op.data !== 'string') {
        return undefined;
    }
    const taskItem = new DOMParser().parseFromString(op.data, 'text/html')
        .querySelector<HTMLElement>('[data-type="NodeListItem"][data-subtype="t"][data-task][data-node-id]');
    if (!taskItem || taskItem.dataset.nodeId !== op.id) {
        return undefined;
    }
    return taskItem.getAttribute('data-task') !== ' ';
}

function getTaskStateChanges(transactions: any): Array<{ taskBlockId: string; completed: boolean }> {
    if (!Array.isArray(transactions)) {
        return [];
    }
    const changes: Array<{ taskBlockId: string; completed: boolean }> = [];
    for (const transaction of transactions) {
        const undoById = new Map<string, WsOp>();
        for (const undo of transaction?.undoOperations || []) {
            if (typeof undo?.id === 'string') {
                undoById.set(undo.id, undo);
            }
        }
        for (const operation of transaction?.doOperations || []) {
            const completed = getTaskListItemCompletion(operation);
            const previous = undoById.get(operation?.id);
            const previousCompleted = previous ? getTaskListItemCompletion(previous) : undefined;
            if (completed !== undefined && previousCompleted !== undefined && completed !== previousCompleted) {
                changes.push({ taskBlockId: operation.id, completed });
            }
        }
    }
    return changes;
}

async function syncStatusToTaskItems(blockId: string, status: string): Promise<void> {
    const normalizedStatus = status || '未完成';
    const now = Date.now();
    const recent = recentStatusSyncs.get(blockId);
    if (recent && recent.status === normalizedStatus && recent.expiresAt > now) {
        return recent.promise;
    }

    const previous = statusSyncQueues.get(blockId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
        // 这次属性写入来自日程同步，标记其 WS 回声以避免额外的日历刷新。
        markCalendarBlockWrite(blockId, 'status');
        await api.setBlockAttrs(blockId, {
            'custom-st-event': statusMap[normalizedStatus],
        });
        await syncBoundScheduleTaskItems(blockId, normalizedStatus);
    });
    statusSyncQueues.set(blockId, next);

    const sync = { status: normalizedStatus, expiresAt: now + STATUS_SYNC_DEDUPE_TTL_MS, promise: next };
    recentStatusSyncs.set(blockId, sync);
    window.setTimeout(() => {
        if (recentStatusSyncs.get(blockId) === sync && sync.expiresAt <= Date.now()) {
            recentStatusSyncs.delete(blockId);
        }
    }, STATUS_SYNC_DEDUPE_TTL_MS);

    void next.then(() => {
        if (statusSyncQueues.get(blockId) === next) {
            statusSyncQueues.delete(blockId);
        }
        if (recentStatusSyncs.get(blockId) === sync) {
            sync.promise = Promise.resolve();
        }
    }, error => {
        if (statusSyncQueues.get(blockId) === next) {
            statusSyncQueues.delete(blockId);
        }
        if (recentStatusSyncs.get(blockId) === sync) {
            recentStatusSyncs.delete(blockId);
        }
        console.warn('同步日程状态到任务块失败:', blockId, error);
    });
    return next;
}

async function isStatusKeyInAv(avID: string, keyID: string): Promise<boolean> {
  if (!avID || !keyID) return false;
  const keys = await api.getAttributeViewKeysByAvID(avID);
  if (!Array.isArray(keys)) return false;
  const statusKey = keys.find((key: any) => key?.name === '状态');
  return Boolean(statusKey && statusKey.id === keyID);
}

function isTaskOrListUpdateHtml(data: unknown): boolean {
  if (typeof data !== 'string' || !data.startsWith('<div ')) {
    return false;
  }
  return data.includes('data-marker=') || data.includes('data-task=') || data.includes('data-subtype="t"');
}

async function syncTaskStatusIfNeeded(
  avID: string,
  itemID: string,
  keyID: string,
  mSelectContent: string,
  canSyncStatus: boolean,
  statusKeyCache?: Map<string, boolean>,
  resolveBoundBlockId?: (targetItemID: string) => Promise<string | undefined>,
): Promise<void> {
  if (!canSyncStatus || !itemID || !keyID) return;
  if (getCalendarSelfCellWriteReason(avID, itemID, keyID) === 'task') {
    return;
  }
  try {
    let isStatus = statusKeyCache?.get(keyID);
    if (isStatus === undefined) {
      isStatus = await isStatusKeyInAv(avID, keyID);
      statusKeyCache?.set(keyID, isStatus);
    }
    if (!isStatus) return;
    const blockId = resolveBoundBlockId
      ? await resolveBoundBlockId(itemID)
      : await api.getAttributeViewBoundBlockIDsByItemIDs(avID, [itemID]).then(data => data[itemID]);
    if (!blockId) return;
    await syncStatusToTaskItems(blockId, mSelectContent);
  } catch (err) {
    console.error('状态列变化处理失败', err);
  }
}

export function registerTransactionListener(plugin: steveTools, calendarHost: CalendarListenerHost) {
  const wsMainHandler = async (e) => {
    const msg: WsMsg = e.detail;
    // 处理同步结束触发（以前直接在 module-calendar 里监听 ws，现在统一在这里）
    if (calendarHost.isAutoSyncingUpdateEnabled()) {
      if (msg.cmd === 'syncing') {
        if (calendarHost.isAutoSyncingUpdateEnabled() && calendarHost.isListening()) {
          calendarHost.scheduleCalendarUpdate(2000);
        }
      }
    }
    if (msg.cmd !== 'transactions') return;
    // 一次事务可带多条 doOperation。只读取第一条会漏掉批量编辑，既无法失效
    // 对应 AV 缓存，也可能让日历一直显示旧数据。
    const operations = (msg.data || []).flatMap(transaction => transaction?.doOperations || []);
    if (operations.length === 0) return;

    // 只有 AV 相关写入才需要查询受管理 AV 集合；普通块属性变更不应因此
    // 额外执行两次 blocks SQL。
    const hasAttributeViewWrite = operations.some(op =>
      (op.action === 'updateAttrViewCell'
        || op.action === 'updateAttrViewCells'
        || op.action === 'replaceAttrViewBlock')
      && !!op.avID
    );
    const managedAvIds = hasAttributeViewWrite
      ? new Set(await calendarHost.getManagedCalendarAvIds())
      : new Set<string>();
    let refreshNeeded = false;

    for (const op of operations) {
      const action = op.action;
      if (action === 'updateAttrViewCell') {
        // 与日程无关的 AV 编辑不再触发所有已打开日历重新加载。
        if (!op.avID || !managedAvIds.has(op.avID)) continue;
        const itemID: string = op.itemID || op.rowID || '';
        const isCalendarSelfWrite = isCalendarSelfCellWrite(op.avID, itemID, op.keyID);
        if (!isCalendarSelfWrite) {
          invalidateViewValueCache(op.avID);
          refreshNeeded = true;
        } else {
          console.debug('[CalendarSelfWrite] skip ws-main updateAttrViewCell refresh', op.avID, itemID);
        }

        if (Array.isArray(op?.data?.mSelect)) {
          await syncTaskStatusIfNeeded(
            op.avID,
            itemID,
            op.keyID,
            op.data.mSelect[0]?.content || '',
            Boolean(calendarHost.av_ids?.some(item => item.id === op.avID)),
          );
        }
        continue;
      }

      if (action === 'updateAttrViewCells' && Array.isArray(op.cellUpdates)) {
        if (!op.avID || !managedAvIds.has(op.avID)) continue;
        const canSyncStatus = Boolean(calendarHost.av_ids?.some(item => item.id === op.avID));
        const statusKeyCache = new Map<string, boolean>();
        const candidateItemIds = Array.from(new Set(
          op.cellUpdates
            .filter((cell: any) => Array.isArray(cell?.data?.mSelect))
            .map((cell: any) => cell?.itemID || cell?.rowID)
            .filter(Boolean)
        )) as string[];
        let boundBlockMap: Record<string, string> | null = null;
        const resolveBoundBlockId = async (targetItemID: string): Promise<string | undefined> => {
          if (!boundBlockMap) {
            boundBlockMap = candidateItemIds.length > 0
              ? await api.getAttributeViewBoundBlockIDsByItemIDs(op.avID, candidateItemIds)
              : {};
          }
          return boundBlockMap[targetItemID];
        };

        for (const cell of op.cellUpdates) {
          if (!cell) continue;
          const itemID: string = cell.itemID || cell.rowID || '';
          const isCalendarSelfWrite = isCalendarSelfCellWrite(op.avID, itemID, cell.keyID);
          if (!isCalendarSelfWrite) {
            invalidateViewValueCache(op.avID);
            refreshNeeded = true;
          }
          if (Array.isArray(cell?.data?.mSelect)) {
            await syncTaskStatusIfNeeded(
              op.avID,
              itemID,
              cell.keyID,
              cell.data.mSelect[0]?.content || '',
              canSyncStatus,
              statusKeyCache,
              resolveBoundBlockId,
            );
          }
        }
        continue;
      }

      if (action === 'replaceAttrViewBlock') {
        if (!op.avID || !managedAvIds.has(op.avID)) continue;
        invalidateViewValueCache(op.avID);
        refreshNeeded = true;
        continue;
      }

      if (action === 'updateAttrs') {
        // 块属性变更无法直接得知它是否绑定到日程 AV，保留原有刷新语义；
        // 同时仅失效相应块的文本缓存，避免下一次转换使用旧 kramdown。
        if (isLifelogSelfUpdateAttrs(op)) continue;
        if (isCalendarSelfBlockWrite(op.id)) {
          console.debug('[CalendarSelfWrite] skip ws-main updateAttrs', op.id);
          continue;
        }
        invalidateKramdownCache(op.id);
        refreshNeeded = true;
        continue;
      }

      if (action === 'update') {
        invalidateKramdownCache(op.id);
        if (isTaskOrListUpdateHtml(op.data)) {
          refreshNeeded = true;
        }
      }
    }

    if (refreshNeeded) {
      calendarHost.avButton();
      scheduleCalendarRefresh();
    }
  };

  plugin.eventBus.on('ws-main', wsMainHandler);

  // 追加：前端网络请求监听（仅监听 /api/av/* 的成功响应）
  // 用途：在 WebSocket 广播到达前，尽早感知“状态”列的变动并同步 block 自定义属性
  const interceptorHandle = interceptFetch({
    filter: (url, method) => method === 'POST'
      && (url.includes('/api/av/') || url.includes('/api/transactions')),
    onResponse: async (ctx) => {
      try {
        if (!ctx.resOk || ctx.resStatus !== 200) return;
        const responseCode = typeof ctx.resBody === 'object' && ctx.resBody !== null
          ? (ctx.resBody as any).code
          : undefined;
        // 思源内核契约接口失败时同样返回 HTTP 200（code !== 0），需统一拦截
        if (responseCode !== undefined && responseCode !== 0) return;

        const url = ctx.url;
        const body = (ctx.reqBody || {}) as any;

        if (url.includes('/api/transactions')) {
          // 本插件更新任务 marker 使用 /api/block/batchUpdateTaskListItemMarker，
          // 内核仅通过 WebSocket 广播结果，不会再由前端发起 /api/transactions。
          // 因此这里只处理用户实际提交的 transaction，天然不会监听到插件自身写入。
          const changes = getTaskStateChanges(body.transactions);
          if (changes.length === 0) return;

          const managedAvIds = await calendarHost.getManagedCalendarAvIds();
          for (const change of changes) {
            await syncTaskBlockStatusToCalendar(
              change.taskBlockId,
              change.completed,
              managedAvIds,
            );
          }
          return;
        }

        // 只对我们关心的数据库进行处理
        const avID: string | undefined = body?.avID;
        if (!avID) return;
        const managedAvIds = new Set(await calendarHost.getManagedCalendarAvIds());
        const canSyncStatus = Boolean(calendarHost.av_ids?.some(item => item.id === avID));
        if (!managedAvIds.has(avID) && !canSyncStatus) return;

        // 抽取选择值（兼容 select/mSelect）
        const getSelectValue = (v: any): string | undefined => {
          if (!v) return undefined;
          if (Array.isArray(v.mSelect) && v.mSelect[0]?.content) return v.mSelect[0].content;
          if (v.select?.content) return v.select.content;
          return undefined;
        };

        // 1) 单项更新：/api/av/setAttributeViewBlockAttr
        if (url.includes('/api/av/setAttributeViewBlockAttr')) {
          const itemID: string | undefined = body?.itemID;
          const keyID: string | undefined = body?.keyID;
          const selectValue = getSelectValue(body?.value);
          if (!itemID || !keyID) return;

          if (canSyncStatus && await isStatusKeyInAv(avID, keyID)) {
            if (getCalendarSelfCellWriteReason(avID, itemID, keyID) === 'task') {
              return;
            }
            const map = await api.getAttributeViewBoundBlockIDsByItemIDs(avID, [itemID]);
            const blockId = map[itemID];
            if (!blockId) return;
            await syncStatusToTaskItems(blockId, selectValue || '');
            return;
          }
          // 其他列：刷新视图——但若是日历自写则跳过
          if (isCalendarSelfCellWrite(avID, itemID, keyID)) {
            console.debug('[CalendarSelfWrite] skip network setAttributeViewBlockAttr', avID, itemID);
            return;
          }
          try { calendarHost.avButton(); } catch { }
          try { scheduleCalendarRefresh(); } catch { }
          return;
        }

        // 2) 批量更新：/api/av/batchSetAttributeViewBlockAttrs
        if (url.includes('/api/av/batchSetAttributeViewBlockAttrs') && Array.isArray(body?.values)) {
          const values: Array<{ keyID: string; itemID: string; value: any } & Record<string, any>> = body.values;
          if (values.length === 0) return;
          const itemIDs = Array.from(new Set(values.map(v => v.itemID).filter(Boolean)));
          if (itemIDs.length === 0) return;

          const statusKeyCache = new Map<string, boolean>();
          let boundBlockMap: Record<string, string> | null = null;
          let refreshNeeded = false;
          for (const v of values) {
            let isStatus = false;
            if (canSyncStatus) {
              const cached = statusKeyCache.get(v.keyID);
              if (cached === undefined) {
                isStatus = await isStatusKeyInAv(avID, v.keyID);
                statusKeyCache.set(v.keyID, isStatus);
              } else {
                isStatus = cached;
              }
            }
            if (isStatus) {
              if (getCalendarSelfCellWriteReason(avID, v.itemID, v.keyID) === 'task') {
                continue;
              }
              if (!boundBlockMap) {
                boundBlockMap = await api.getAttributeViewBoundBlockIDsByItemIDs(avID, itemIDs);
              }
              const blockId = boundBlockMap[v.itemID];
              if (!blockId) continue;
              const selectValue = getSelectValue(v.value);
              await syncStatusToTaskItems(blockId, selectValue || '');
              continue;
            }
            // 非状态列：标记需要刷新
            if (!isCalendarSelfCellWrite(avID, v.itemID, v.keyID)) {
              refreshNeeded = true;
            }
          }
          if (refreshNeeded) {
            try { calendarHost.avButton(); } catch { }
            try { scheduleCalendarRefresh(); } catch { }
          }
          return;
        }
      } catch (err) {
        console.warn('transactionListener 网络拦截处理失败:', err);
      }
    },
  });

  return () => {
    try {
      plugin.eventBus.off('ws-main', wsMainHandler);
    } catch (error) {
      console.warn('移除日历 transaction ws-main 监听失败', error);
    }
    try {
      interceptorHandle.stop();
    } catch (error) {
      console.warn('停止日历 transaction fetch 拦截失败', error);
    }
  };
}
