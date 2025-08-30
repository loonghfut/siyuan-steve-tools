import steveTools, { settingdata } from '@/index';
import { M_calendar } from '@/calendar/module-calendar';
import * as api from '@/api/api';
import { refreshKanban } from '@/calendar/kanban';
import { statusMap } from '@/calendar/myF';

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
}
