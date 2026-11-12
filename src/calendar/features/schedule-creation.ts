import { calendarModules as moduleInstances, calendarSettings as settingdata } from '@/calendar/core/calendar-context';
import { getPreferredCalendar } from '@/calendar/core/calendar-runtime';
import { av_ids, filterViewId, OUTcalendar } from '@/calendar/ui/calendar-view';
import { createEventInDatabase, getViewId, getViewValue } from '@/calendar/data/calendar-data';

export interface ScheduleTarget {
    isdirect: boolean;
    directid: string;
}

const DEFAULT_TARGET: ScheduleTarget = { isdirect: false, directid: '' };
let recentCreation: { startedAt: number; request: Promise<unknown> | null } = {
    startedAt: 0,
    request: null,
};

function formatLocalDateTime(date: Date) {
    const adjustedDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return adjustedDate.toISOString().slice(0, 16);
}

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

/** Creates a schedule using the database currently selected in the calendar. */
export function createSchedule(
    status = '',
    target: ScheduleTarget = DEFAULT_TARGET,
    refreshAfterCreate = true,
) {
    const now = Date.now();
    if (recentCreation.request && now - recentCreation.startedAt < 1000) {
        return recentCreation.request;
    }

    recentCreation.startedAt = now;
    recentCreation.request = (async () => {
        const effectiveAvIds = await getEffectiveAvIds();
        const viewIds = await getViewId(effectiveAvIds);
        const viewValue = await getViewValue(viewIds);
        const targetCalendar = getPreferredCalendar() || OUTcalendar;
        return createEventInDatabase(
            formatLocalDateTime(new Date()),
            targetCalendar,
            viewValue,
            getSelectedDatabaseId(viewIds),
            status,
            target,
            refreshAfterCreate,
        );
    })().finally(() => {
        setTimeout(() => {
            recentCreation.request = null;
        }, 1000);
    });

    return recentCreation.request;
}

/** Creates a schedule in the database configured in settings. */
export async function createScheduleInConfiguredDatabase(
    status = '',
    target: ScheduleTarget = DEFAULT_TARGET,
    refreshAfterCreate = true,
) {
    const viewIds = await getViewId([settingdata['cal-db-id']]);
    const viewValue = await getViewValue(viewIds);
    const targetCalendar = getPreferredCalendar() || OUTcalendar;
    return createEventInDatabase(
        formatLocalDateTime(new Date()),
        targetCalendar,
        viewValue,
        getSelectedDatabaseId(viewIds),
        status,
        target,
        refreshAfterCreate,
    );
}
