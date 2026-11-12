import { openWindow, showMessage } from 'siyuan';
import { calendarSettings as settingdata } from '@/calendar/core/calendar-context';
import * as api from '@/api/api';
import { createDailyNoteForDate } from '@/calendar/data/daily-note';
import { createEmptyScheduleBlockquoteMarkdown } from '@/calendar/features/schedule-blockquote';

/** Opens an empty schedule block in a new editor window. */
export async function openScheduleEditor() {
    if (!settingdata['cal-create-pos'] || !settingdata['cal-db-id']) {
        showMessage('请先设置日程创建位置和日程创建数据库');
        return;
    }

    const dailyNoteId = await createDailyNoteForDate(settingdata['cal-create-pos']);
    if (!dailyNoteId) {
        showMessage('无法创建日记，请检查日程创建位置设置');
        return;
    }
    const blockId = await api.generateSiyuanID() as string;
    const headingBlockId = await api.generateSiyuanID() as string;
    const paragraphBlockId = await api.generateSiyuanID() as string;
    await api.appendBlock(
        'markdown',
        createEmptyScheduleBlockquoteMarkdown(blockId, headingBlockId, paragraphBlockId),
        dailyNoteId,
    );
    openWindow({ height: 500, width: 400, doc: { id: blockId } });
}
