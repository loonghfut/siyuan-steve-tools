import { showMessage } from 'siyuan';
import { calendarModules as moduleInstances, calendarSettings as settingdata } from '@/calendar/core/calendar-context';
import { getPreferredCalendar } from '@/calendar/core/calendar-runtime';
import { av_ids, filterViewId, OUTcalendar } from '@/calendar/ui/calendar-view';
import { createEventInDatabase, getViewId } from '@/calendar/data/calendar-data';
import { formatLocalDateTimeInput } from './quick-add/cursor-blocks';

export interface ScheduleTarget {
    isdirect: boolean;
    directid: string;
}

const DEFAULT_TARGET: ScheduleTarget = { isdirect: false, directid: '' };
const recentCreations = new Map<string, { startedAt: number; request: Promise<unknown> | null }>();

function getEffectiveFilterViewIds(): string[] {
    const configViewIds = moduleInstances['M_calendar']?.calConfig?.getViewIds?.();
    if (Array.isArray(configViewIds) && configViewIds.length > 0) {
        return configViewIds;
    }
    return filterViewId;
}

async function getEffectiveAvIds(): Promise<string[]> {
    if (Array.isArray(av_ids) && av_ids.length > 0) {
        return av_ids;
    }
    return (await moduleInstances['M_calendar']?.getAVreferenceid?.()) || [];
}

function getSelectedDatabaseId(viewIds: Awaited<ReturnType<typeof getViewId>>) {
    const activeFilterIds = getEffectiveFilterViewIds();
    return viewIds.find(view => activeFilterIds.includes(view.viewId))?.rootid;
}

function runDeduplicatedCreation<T>(dedupKey: string, factory: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = recentCreations.get(dedupKey);
    if (existing?.request && now - existing.startedAt < 1000) {
        return existing.request as Promise<T>;
    }

    const request = factory().finally(() => {
        setTimeout(() => {
            const cur = recentCreations.get(dedupKey);
            if (cur?.request === request) {
                recentCreations.delete(dedupKey);
            }
        }, 1000);
    });

    recentCreations.set(dedupKey, { startedAt: now, request });
    return request;
}

/** Creates a schedule using the database currently selected in the calendar. */
export function createSchedule(
    status = '',
    target: ScheduleTarget = DEFAULT_TARGET,
    refreshAfterCreate = true,
) {
    const dedupKey = `selected:${target.isdirect ? target.directid : 'dialog'}`;
    return runDeduplicatedCreation(dedupKey, async () => {
        const effectiveAvIds = await getEffectiveAvIds();
        const viewIds = await getViewId(effectiveAvIds);
        const selectedDbId = getSelectedDatabaseId(viewIds) || settingdata['cal-db-id'];
        const targetCalendar = getPreferredCalendar() || OUTcalendar;
        return createEventInDatabase(
            formatLocalDateTimeInput(new Date()),
            targetCalendar,
            undefined,
            selectedDbId,
            status,
            target,
            refreshAfterCreate,
        );
    });
}

/** Creates a schedule in the database configured in settings. */
export function createScheduleInConfiguredDatabase(
    status = '',
    target: ScheduleTarget = DEFAULT_TARGET,
    refreshAfterCreate = true,
) {
    const configuredDbId = settingdata['cal-db-id'];
    if (!configuredDbId) {
        showMessage('请先设置日程创建数据库');
        return Promise.resolve(false);
    }

    const dedupKey = `configured:${configuredDbId}:${target.isdirect ? target.directid : 'dialog'}`;
    return runDeduplicatedCreation(dedupKey, async () => {
        const targetCalendar = getPreferredCalendar() || OUTcalendar;
        return createEventInDatabase(
            formatLocalDateTimeInput(new Date()),
            targetCalendar,
            undefined,
            configuredDbId,
            status,
            target,
            refreshAfterCreate,
        );
    });
}
