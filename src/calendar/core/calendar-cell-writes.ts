import type { AVCellWriteOptions } from '@/api/attribute-view-cell-lifecycle';
import type { CalendarWriteReason } from './calendar-self-write';

export const CALENDAR_CELL_WRITE_SOURCE = 'calendar';

/** Options used for AV writes initiated by the Calendar feature itself. */
export function calendarCellWriteOptions(reason: CalendarWriteReason): AVCellWriteOptions {
    return {
        source: CALENDAR_CELL_WRITE_SOURCE,
        reason,
        suppressPostRefresh: true,
    };
}
