import {
    registerAttributeViewCellUpdateObserver,
    type AttributeViewCellUpdate,
} from '@/api/attribute-view-cell-lifecycle';
import { scheduleCalendarRefresh } from './calendar-runtime';
import { markCalendarCellWrite, type CalendarWriteReason } from './calendar-self-write';
import { CALENDAR_CELL_WRITE_SOURCE } from './calendar-cell-writes';

function isCalendarWrite(update: AttributeViewCellUpdate): boolean {
    return update.options?.source === CALENDAR_CELL_WRITE_SOURCE;
}

/**
 * Connect Calendar's self-write bookkeeping to the generic AV write queue.
 * The API layer deliberately does not import this feature module.
 */
export function registerCalendarCellWriteLifecycle(): () => void {
    return registerAttributeViewCellUpdateObserver({
        onQueued(update) {
            if (!isCalendarWrite(update) || update.options?.markSelfWrite === false) {
                return;
            }
            markCalendarCellWrite(
                update.avID,
                update.itemID,
                update.keyID,
                update.options?.reason as CalendarWriteReason | undefined,
            );
        },
        onBatchUpdated({ shouldRefresh }) {
            if (shouldRefresh) {
                scheduleCalendarRefresh();
            }
        },
    });
}
