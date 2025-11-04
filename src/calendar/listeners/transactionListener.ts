import steveTools, { settingdata } from '@/index';
import { M_calendar } from '@/calendar/module-calendar';
import * as api from '@/api/api';
import { refreshKanban } from '@/calendar/kanban';
import { statusMap } from '@/calendar/myF';
import { interceptFetch } from '@/api/network-interceptor';

interface WsOp { action: string;[k: string]: any }
interface WsMsg { cmd: string; data?: any[] }

export function registerTransactionListener(plugin: steveTools, M_calendar: M_calendar) {
  plugin.eventBus.on('ws-main', async (e) => {
    const msg: WsMsg = e.detail;
    // 处理同步结束触发（以前直接在 module-calendar 里监听 ws，现在统一在这里）
    if (settingdata["cal-auto-syncing-update"] == true) {
      if (msg.cmd === 'syncing') {
        if (M_calendar.isAutoSyncingUpdateEnabled() && M_calendar.isListening()) {
          M_calendar.scheduleCalendarUpdate(2000);
        }
      }
    }
    if (msg.cmd !== 'transactions') return;
    const op: WsOp | undefined = msg?.data?.[0]?.doOperations?.[0];
    if (!op) return;
    const action = op.action;
    if (action === 'updateAttrs' || action === 'updateAttrViewCell') {
      M_calendar.avButton();
      refreshKanban();
      if (op.avID && op?.data?.mSelect?.[0]?.content && op.rowID && op.keyID) {
        if (M_calendar.av_ids && M_calendar.av_ids.map(i => i.id).includes(op.avID)) {
          try {
            const blockId = await api.getAttributeViewBoundBlockIDsByItemIDs(op.avID, [op.rowID]).then(data => data[op.rowID]);
            const avDetails = await api.getAttributeViewKeys(blockId);
            // console.log("获取到的属性视图信息🚧🚧:", avDetails);
            let statusKeyDefinition: any;
            if (avDetails && avDetails[0]?.keyValues) {
              const statusKeyValue = avDetails[0].keyValues.find(kv => kv.key && kv.key.name === '状态');
              if (statusKeyValue) statusKeyDefinition = statusKeyValue.key;
            }
            if (statusKeyDefinition && statusKeyDefinition.id === op.keyID) {
              await api.setBlockAttrs(blockId, { 'custom-st-event': statusMap[op.data.mSelect[0].content] });
            }
          } catch (err) {
            console.error('状态列变化处理失败', err);
          }
        }
      }
    }
    if (action === 'update') {
      const data = op.data;
      if (typeof data === 'string' && data.startsWith('<div data-marker')) {
        refreshKanban();
      }
    }
  });

  // 追加：前端网络请求监听（仅监听 /api/av/* 的成功响应）
  // 用途：在 WebSocket 广播到达前，尽早感知“状态”列的变动并同步 block 自定义属性
  interceptFetch({
    filter: (url, method) => method === 'POST' && url.includes('/api/av/'),
    onResponse: async (ctx) => {
      try {
        if (!ctx.resOk || ctx.resStatus !== 200) return;
        const url = ctx.url;
        const body = (ctx.reqBody || {}) as any;

        // 只对我们关心的数据库进行处理
        const avID: string | undefined = body?.avID;
        if (!avID || !M_calendar.av_ids || !M_calendar.av_ids.map(i => i.id).includes(avID)) return;

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
          if (!itemID || !keyID || !selectValue) return;

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
          if (statusKeyDefinition && statusKeyDefinition.id === keyID) {
            await api.setBlockAttrs(blockId, { 'custom-st-event': statusMap[selectValue] });
          }
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

          // 为每条涉及“状态”字段的更新设置自定义属性
          for (const v of values) {
            const selectValue = getSelectValue(v.value);
            if (!selectValue) continue;
            const blockId = map[v.itemID];
            if (!blockId) continue;

            const avDetails = await api.getAttributeViewKeys(blockId);
            let statusKeyDefinition: any;
            if (avDetails && avDetails[0]?.keyValues) {
              const statusKeyValue = avDetails[0].keyValues.find((kv: any) => kv.key && kv.key.name === '状态');
              if (statusKeyValue) statusKeyDefinition = statusKeyValue.key;
            }
            if (statusKeyDefinition && statusKeyDefinition.id === v.keyID) {
              await api.setBlockAttrs(blockId, { 'custom-st-event': statusMap[selectValue] });
            }
          }
          return;
        }
      } catch (err) {
        console.warn('transactionListener 网络拦截处理失败:', err);
      }
    },
  });
}
