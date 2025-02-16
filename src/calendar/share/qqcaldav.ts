import { DAVClient, DAVCalendar, DAVCalendarObject } from 'tsdav';

interface CalendarEvent {
    id: string;
    title: string;
    start: Date | null;
    end: Date | null;
    extendedProps: {
        source: string;
        description: string;
        status: string;
    };
}

export class CalDAVClient {
    private client: DAVClient;
    
    constructor(username: string, password: string) {
        console.log(username, password);
        this.client = new DAVClient({
            serverUrl: 'https://dav.qq.com/.well-known/caldav',
            credentials: {
                username, // QQ邮箱完整地址
                password  // 授权码
            },
            defaultAccountType: 'caldav',
            authMethod: 'Basic'
        });
    }

    async init() {
        await this.client.login();
    }

    async getCalendars(): Promise<DAVCalendar[]> {
        try {
            const calendars = await this.client.fetchCalendars();
            return calendars;
        } catch (error) {
            console.error('获取日历列表失败:', error);
            throw error;
        }
    }

    async getEvents(calendarId: string): Promise<CalendarEvent[]> {
        try {
            const events = await this.client.fetchCalendarObjects({
                calendar: { url: calendarId },
            });

            return events
                .map(event => {
                    const icsData = event.data;
                    const veventMatch = icsData.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/);
                    
                    if (veventMatch) {
                        const veventData = veventMatch[1];
                        const summary = veventData.match(/SUMMARY:(.+)/)?.[1] || '';
                        const start = veventData.match(/DTSTART(?:;[^:]*)?:(.+)/)?.[1];
                        const end = veventData.match(/DTEND(?:;[^:]*)?:(.+)/)?.[1];
                        const description = veventData.match(/DESCRIPTION:(.+)/)?.[1] || '';
                        const uid = veventData.match(/UID:(.+)/)?.[1];

                        return {
                            id: uid,
                            title: summary,
                            start: start ? new Date(start.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) : null,
                            end: end ? new Date(end.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')) : null,
                            extendedProps: {
                                source: 'qqcalendar',
                                description: description,
                                status: summary.includes('已完成') ? '完成' : '未完成'
                            }
                        };
                    }
                    return null;
                })
                .filter((event): event is CalendarEvent => event !== null);
        } catch (error) {
            console.error('获取日历事件失败:', error);
            throw error;
        }
    }

}