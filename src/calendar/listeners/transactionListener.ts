import steveTools from '@/index';
import { M_calendar } from '@/calendar/module-calendar';
import * as api from '@/api/api';
import { refreshKanban } from '@/calendar/kanban';
import { statusMap } from '@/calendar/myF';

interface WsOp { action: string; [k: string]: any }
interface WsMsg { cmd: string; data?: any[] }

export function registerTransactionListener(plugin: steveTools, M_calendar: M_calendar) {
  plugin.eventBus.on('ws-main', async (e) => {
    const msg: WsMsg = e.detail;
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
            const avDetails = await api.getAttributeViewKeys(op.id);
            let statusKeyDefinition: any;
            if (avDetails && avDetails[0]?.keyValues) {
              const statusKeyValue = avDetails[0].keyValues.find(kv => kv.key && kv.key.name === '状态');
              if (statusKeyValue) statusKeyDefinition = statusKeyValue.key;
            }
            if (statusKeyDefinition && statusKeyDefinition.id === op.keyID) {
              await api.setBlockAttrs(op.id, { 'custom-st-event': statusMap[op.data.mSelect[0].content] });
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
