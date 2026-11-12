import * as api from '@/api/api';
import { createDailynote } from '@frostime/siyuan-plugin-kits';
import { formatLocalDailyNoteDate, supportsNativeDailyNoteDate } from './av-date';

/**
 * 为指定日期（或当天）在笔记本中创建或获取日记文档 ID。
 * 思源 3.8+ 优先使用原生 `/api/filetree/createDailyNote` 的 `date` 参数，
 * 以便正确复用日记日期属性、目标日模板 `now` 及加密笔记本租约。
 */
export async function createDailyNoteForDate(notebookId: string, date?: Date | string): Promise<string | undefined> {
    const appId = window.siyuan?.ws?.app?.appId;
    if (!date) {
        const res = await api.createDailyNote(appId, notebookId);
        return res?.id;
    }

    const formattedDate = formatLocalDailyNoteDate(date);
    if (formattedDate && supportsNativeDailyNoteDate(window.siyuan?.config?.system?.kernelVersion)) {
        try {
            const res = await api.createDailyNote(appId, notebookId, formattedDate);
            if (res?.id) {
                return res.id;
            }
        } catch (error) {
            console.warn('[Calendar] 原生按日期创建日记失败，回退兼容方案:', error);
        }
    }

    const targetDate = date instanceof Date ? date : new Date(date);
    return await createDailynote(notebookId, targetDate);
}
