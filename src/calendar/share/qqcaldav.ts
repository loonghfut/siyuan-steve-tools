import { showMessage } from 'siyuan';
import { DAVClient, DAVCalendar, DAVCalendarObject } from 'tsdav';

interface CalendarEvent {
    id: string;
    title: string;
    start: Date | null;
    end: Date | null;
    timeZone: string;
    allDay: boolean;
    rrule: string;
    extendedProps: {
        source: string;
        description: string;
        status: string;
        isRecurring: boolean;
        rrule: string;
        allDay: boolean;
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
        if(!calendarId) {
            showMessage('请设置QQ日历', -1, 'error');
            return [];
        }
        try {
            const events = await this.client.fetchCalendarObjects({
                calendar: { url: calendarId },
            });
            
            const processedEvents = events
                .map(event => {
                    const icsData = event.data;
                    // 匹配事件数据块，包括VEVENT之间的所有内容
                    const veventMatches = icsData.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g);
                    
                    if (!veventMatches) return null;
                    
                    // 处理每个VEVENT块
                    const eventData = veventMatches.map(veventBlock => {
                        const veventData = veventBlock.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/)[1];
                        
                        // 提取基本信息
                        const summary = veventData.match(/SUMMARY:(.+?)(?:\r\n|\n|$)/)?.[1] || '';
                        const uid = veventData.match(/UID:(.+?)(?:\r\n|\n|$)/)?.[1];
                        const description = veventData.match(/DESCRIPTION:(.+?)(?:\r\n|\n|$)/)?.[1] || '';
                        
                        // 解析重复规则
                        const rruleMatch = veventData.match(/RRULE:(.+?)(?:\r\n|\n|$)/)?.[1];
                        
                        // 解析开始时间
                        let start: Date | null = null;
                        const dtstart = veventData.match(/DTSTART(?:;[^:]*)?:([^\r\n]+)/)?.[1];
                        if (dtstart) {
                            if (dtstart.includes('T')) {
                                start = new Date(dtstart.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z'));
                            } else {
                                start = new Date(dtstart.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
                            }
                        }
                        
                        // 解析结束时间
                        let end: Date | null = null;
                        const dtend = veventData.match(/DTEND(?:;[^:]*)?:([^\r\n]+)/)?.[1];
                        if (dtend) {
                            if (dtend.includes('T')) {
                                end = new Date(dtend.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z'));
                            } else {
                                end = new Date(dtend.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
                            }
                        }
    
                        // 判断是否为全天事件
                        const isAllDay = !!dtstart && !dtstart.includes('T');
                        
                        // 构建标准日历事件对象
                        return {
                            id: uid || '',
                            title: summary,
                            start: start,
                            end: end,
                            timeZone: 'local',
                            allDay: isAllDay,
                            rrule: rruleMatch || null,
                            extendedProps: {
                                source: 'qqcalendar',
                                description: description,
                                // status: summary.includes('已完成') ? '完成' : '未完成',
                                isRecurring: true,
                                rrule: rruleMatch || '',
                                allDay: isAllDay,
                            }
                        };
                    });
    
                    return eventData;
                })
                .filter((event): event is CalendarEvent[] => event !== null)
                .flat();
    
            return processedEvents;
            
        } catch (error) {
            console.error('获取日历事件失败:', error);
            throw error;
        }
    }
}