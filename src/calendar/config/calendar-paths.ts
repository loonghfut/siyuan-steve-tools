const DEFAULT_ICS_FILE_NAME = 'calendar.ics';

export const CALENDAR_EVENTS_JSON_PATH = 'data/public/stevetools/events.json';

export const calendarPaths = {
    icsDataPath: `data/public/stevetools/${DEFAULT_ICS_FILE_NAME}`,
    icsPublicPath: `public/stevetools/${DEFAULT_ICS_FILE_NAME}`,
};

export function configureCalendarPaths(icsFileName: string): void {
    const fileName = icsFileName || DEFAULT_ICS_FILE_NAME;
    calendarPaths.icsDataPath = `data/public/stevetools/${fileName}`;
    calendarPaths.icsPublicPath = `public/stevetools/${fileName}`;
}
