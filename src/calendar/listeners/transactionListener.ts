import steveTools, { settingdata } from '@/index';
import * as api from '@/api/api';
import { scheduleCalendarRefresh } from '@/calendar/core/calendar-runtime';
import {
    invalidateKramdownCache,
    invalidateViewValueCache,
    statusMap,
} from '@/calendar/data/calendar-data';
import { interceptFetch } from '@/api/network-interceptor';
import { isLifelogSelfWrite, ATTRS } from '@/lifelog/module-lifelog';
import {
    isCalendarSelfBlockWrite,
    isCalendarSelfCellWrite,
} from '@/calendar/core/calendar-self-write';
import { completeBoundSuperBlockTaskItems } from '@/calendar/listeners/bound-task-block-sync';

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

export function registerTransactionListener(plugin: steveTools, calendarHost: CalendarListenerHost) {
  const wsMainHandler = async (e) => {
    const msg: WsMsg = e.detail;
    // 处理同步结束触发（以前直接在 module-calendar 里监听 ws，现在统一在这里）
    if (settingdata["cal-auto-syncing-update"] == true) {
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

    // 只有 AV 单元格写入才需要查询受管理 AV 集合；普通块属性变更不应因此
    // 额外执行两次 blocks SQL。
    const hasAttributeViewCellWrite = operations.some(op =>
      op.action === 'updateAttrViewCell' && !!op.avID
    );
    const managedAvIds = hasAttributeViewCellWrite
      ? new Set(await calendarHost.getManagedCalendarAvIds())
      : new Set<string>();
    let refreshNeeded = false;

    for (const op of operations) {
      const action = op.action;
      if (action === 'updateAttrViewCell') {
        // 与日程无关的 AV 编辑不再触发所有已打开日历重新加载。
        if (!op.avID || !managedAvIds.has(op.avID)) continue;
        const isCalendarSelfWrite = isCalendarSelfCellWrite(op.avID, op.rowID, op.keyID);
        if (!isCalendarSelfWrite) {
          invalidateViewValueCache(op.avID);
          refreshNeeded = true;
        } else {
          console.debug('[CalendarSelfWrite] skip ws-main updateAttrViewCell refresh', op.avID, op.rowID);
        }

        if (op?.data?.mSelect?.[0]?.content && op.rowID && op.keyID
            && calendarHost.av_ids?.some(item => item.id === op.avID)) {
          try {
            const blockId = await api.getAttributeViewBoundBlockIDsByItemIDs(op.avID, [op.rowID]).then(data => data[op.rowID]);
            const avDetails = await api.getAttributeViewKeys(blockId);
            let statusKeyDefinition: any;
            if (avDetails && avDetails[0]?.keyValues) {
              const statusKeyValue = avDetails[0].keyValues.find(kv => kv.key && kv.key.name === '状态');
              if (statusKeyValue) statusKeyDefinition = statusKeyValue.key;
            }
            if (statusKeyDefinition && statusKeyDefinition.id === op.keyID) {
              const status = op.data.mSelect[0].content;
              await api.setBlockAttrs(blockId, { 'custom-st-event': statusMap[status] });
              if (status === '完成') {
                await completeBoundSuperBlockTaskItems(blockId);
              }
            }
          } catch (err) {
            console.error('状态列变化处理失败', err);
          }
        }
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
        const data = op.data;
        if (typeof data === 'string' && data.startsWith('<div data-marker')) {
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
    filter: (url, method) => method === 'POST' && url.includes('/api/av/'),
    onResponse: async (ctx) => {
      try {
        if (!ctx.resOk || ctx.resStatus !== 200) return;
        const url = ctx.url;
        const body = (ctx.reqBody || {}) as any;

        // 只对我们关心的数据库进行处理
        const avID: string | undefined = body?.avID;
        if (!avID || !calendarHost.av_ids?.some(item => item.id === avID)) return;

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

          // 确认该 keyID 是“状态”字段
          const map = await api.getAttributeViewBoundBlockIDsByItemIDs(avID, [itemID]);
          const blockId = map[itemID];
          if (!blockId) return;

          const avDetails = await api.getAttributeViewKeys(blockId);
          let statusKeyDefinition: any;
          if (avDetails && avDetails[0]?.keyValues) {
            const statusKeyValue = avDetails[0].keyValues.find((kv: any) => kv.key && kv.key.name === '状态');
            if (statusKeyValue) statusKeyDefinition = statusKeyValue.key;
          }
          const isStatus = !!(statusKeyDefinition && statusKeyDefinition.id === keyID);
          if (isStatus && selectValue) {
            // 状态列：根据值设置自定义属性
            await api.setBlockAttrs(blockId, { 'custom-st-event': statusMap[selectValue] });
            if (selectValue === '完成') {
              await completeBoundSuperBlockTaskItems(blockId);
            }
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
          // 先收集所有涉及的 itemID，并映射到 blockId
          const itemIDs = Array.from(new Set(values.map(v => v.itemID).filter(Boolean)));
          if (itemIDs.length === 0) return;
          const map = await api.getAttributeViewBoundBlockIDsByItemIDs(avID, itemIDs);

          // 为每条涉及“状态”字段做属性设置，其它字段统一做一次刷新
          let refreshNeeded = false;
          for (const v of values) {
            const blockId = map[v.itemID];
            if (!blockId) continue;

            const avDetails = await api.getAttributeViewKeys(blockId);
            let statusKeyDefinition: any;
            if (avDetails && avDetails[0]?.keyValues) {
              const statusKeyValue = avDetails[0].keyValues.find((kv: any) => kv.key && kv.key.name === '状态');
              if (statusKeyValue) statusKeyDefinition = statusKeyValue.key;
            }
            const isStatus = !!(statusKeyDefinition && statusKeyDefinition.id === v.keyID);
            if (isStatus) {
              const selectValue = getSelectValue(v.value);
              if (selectValue) {
                await api.setBlockAttrs(blockId, { 'custom-st-event': statusMap[selectValue] });
                if (selectValue === '完成') {
                  await completeBoundSuperBlockTaskItems(blockId);
                }
                continue;
              }
              // 没有值（被清空等），无法设置映射，改为刷新
              refreshNeeded = true;
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
