import { openWindow, showMessage } from 'siyuan';
import { calendarSettings as settingdata } from '@/calendar/core/calendar-context';
import * as api from '@/api/api';

/** Opens an empty schedule block in a new editor window. */
export async function openScheduleEditor() {
    if (!settingdata['cal-create-pos'] || !settingdata['cal-db-id']) {
        showMessage('请先设置日程创建位置和日程创建数据库');
        return;
    }

    const dailyNote = await api.createDailyNote(window.siyuan.ws.app.appId, settingdata['cal-create-pos']);
    const blockId = await api.generateSiyuanID() as string;
    await api.appendBlock(
        'dom',
        `<div data-node-id="${blockId}" data-type="NodeSuperBlock" class="sb" data-sb-layout="row"><div data-node-id="${await api.generateSiyuanID()}" data-type="NodeParagraph" class="p"><div contenteditable="true" spellcheck="false"></div><div class="protyle-attr" contenteditable="false">​</div></div><div data-node-id="${await api.generateSiyuanID()}" data-type="NodeParagraph" class="p"><div contenteditable="true" spellcheck="false"></div><div class="protyle-attr" contenteditable="false">​</div></div><div class="protyle-attr" contenteditable="false">​</div></div>`,
        dailyNote.id,
    );
    openWindow({ height: 500, width: 400, doc: { id: blockId } });
}
