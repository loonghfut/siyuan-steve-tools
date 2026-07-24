export const SPECIAL_CALENDAR_SOURCES = [
    'icsSubscription',
    'lifelog',
    'recurring',
] as const;

export type SpecialCalendarSource = typeof SPECIAL_CALENDAR_SOURCES[number];

export const SPECIAL_CALENDAR_SOURCE_LABELS: Record<SpecialCalendarSource, string> = {
    icsSubscription: 'ICS订阅日历',
    lifelog: 'Lifelog 记录',
    recurring: '周期事件',
};

const specialSourceIds = new Set<string>(SPECIAL_CALENDAR_SOURCES);

export function isSpecialCalendarSource(sourceId: string): sourceId is SpecialCalendarSource {
    return specialSourceIds.has(sourceId);
}
