import type { Calendar } from '@fullcalendar/core';

/** Active FullCalendar instances owned by this plugin. */
export const activeCalendars: Calendar[] = [];

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let peerRefreshTimer: ReturnType<typeof setTimeout> | undefined;
const peerRefreshExclusions = new Set<Calendar>();

function pruneInactiveCalendars() {
    for (let index = activeCalendars.length - 1; index >= 0; index--) {
        if (!document.body.contains(activeCalendars[index].el)) {
            activeCalendars.splice(index, 1);
        }
    }
}

function refetchCalendars(calendars: Iterable<Calendar>) {
    for (const calendar of calendars) {
        try {
            calendar.refetchEvents();
        } catch (error) {
            console.warn('刷新日历实例失败', error);
        }
    }
}

export function registerCalendarInstance(calendar: Calendar) {
    pruneInactiveCalendars();
    if (!activeCalendars.includes(calendar)) {
        activeCalendars.push(calendar);
    }
}

export function unregisterCalendarInstance(calendar: Calendar) {
    const index = activeCalendars.indexOf(calendar);
    if (index >= 0) {
        activeCalendars.splice(index, 1);
    }
}

/** Debounced refresh for all visible calendar instances. */
export function scheduleCalendarRefresh(delayMs = 200) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        pruneInactiveCalendars();
        refetchCalendars(activeCalendars);
    }, delayMs);
}

/**
 * Refresh every visible calendar except the instance that already applied a
 * local update. Multiple callers are coalesced into one refresh pass.
 */
export function refetchPeerCalendars(originator: Calendar | null, delayMs = 200) {
    if (originator) {
        peerRefreshExclusions.add(originator);
    }
    if (peerRefreshTimer) return;

    peerRefreshTimer = setTimeout(() => {
        peerRefreshTimer = undefined;
        pruneInactiveCalendars();
        const excluded = new Set(peerRefreshExclusions);
        peerRefreshExclusions.clear();
        refetchCalendars(activeCalendars.filter(calendar => !excluded.has(calendar)));
    }, delayMs);
}
