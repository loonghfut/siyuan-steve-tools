import { showMessage } from 'siyuan';

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

interface DAVCalendar {
    url: string;
    displayName: string;
    ctag?: string;
    description?: string;
}

export class CalDAVClient {
    private serverUrl: string;
    private credentials: { username: string; password: string };
    private headers: { [key: string]: string };

    constructor(username: string, password: string) {
        this.serverUrl = 'https://dav.qq.com/.well-known/caldav';
        this.credentials = { username, password };
        
        // 构建Basic认证头
        const auth = btoa(`${username}:${password}`);
        this.headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/xml; charset=utf-8',
            'User-Agent': 'SiYuan-Steve-Tools/1.0'
        };
    }

    async init() {
        try {
            // 测试连接
            await this.makeRequest('OPTIONS', '/');
            console.log('QQ日历连接成功');
        } catch (e) {
            console.error('QQ日历登录失败:', e);
            showMessage('QQ日历登录失败，请检查网络，QQ邮箱配置', -1, 'error');
        }
    }

    private async makeRequest(method: string, path: string, body?: string): Promise<Response> {
        const url = `${this.serverUrl}${path}`;
        
        try {
            const response = await fetch(url, {
                method,
                headers: this.headers,
                body: body || undefined,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            console.error(`请求失败 ${method} ${url}:`, error);
            throw error;
        }
    }

    async getCalendars(): Promise<DAVCalendar[]> {
        try {
            // PROPFIND 请求获取日历列表
            const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop>
        <D:displayname />
        <D:resourcetype />
        <C:calendar-description />
        <D:getctag />
    </D:prop>
</D:propfind>`;

            const response = await this.makeRequest('PROPFIND', '/cgi-bin/caldav/user/', propfindBody);
            const xmlText = await response.text();
            
            // 解析XML响应
            const calendars = this.parseCalendarsFromXML(xmlText);
            return calendars;
        } catch (error) {
            console.error('获取日历列表失败:', error);
            showMessage('获取日历列表失败，请检查网络，QQ邮箱配置', -1, 'error');
            return [];
        }
    }

    private parseCalendarsFromXML(xmlText: string): DAVCalendar[] {
        const calendars: DAVCalendar[] = [];
        
        try {
            // 使用正则表达式解析XML（简单处理）
            const responseMatches = xmlText.match(/<D:response[^>]*>([\s\S]*?)<\/D:response>/g);
            
            if (responseMatches) {
                for (const responseMatch of responseMatches) {
                    const hrefMatch = responseMatch.match(/<D:href[^>]*>(.*?)<\/D:href>/);
                    const displayNameMatch = responseMatch.match(/<D:displayname[^>]*>(.*?)<\/D:displayname>/);
                    const resourceTypeMatch = responseMatch.match(/<C:calendar\s*\/>/);
                    
                    if (hrefMatch && displayNameMatch && resourceTypeMatch) {
                        calendars.push({
                            url: hrefMatch[1],
                            displayName: displayNameMatch[1],
                        });
                    }
                }
            }
        } catch (error) {
            console.error('解析日历XML失败:', error);
        }
        
        return calendars;
    }

    async getEvents(calendarUrl: string): Promise<CalendarEvent[]> {
        if (!calendarUrl) {
            showMessage('请设置QQ日历', -1, 'error');
            return [];
        }

        try {
            // REPORT 请求获取事件
            const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop>
        <D:getetag />
        <C:calendar-data />
    </D:prop>
    <C:filter>
        <C:comp-filter name="VCALENDAR">
            <C:comp-filter name="VEVENT" />
        </C:comp-filter>
    </C:filter>
</C:calendar-query>`;

            const response = await this.makeRequest('REPORT', calendarUrl, reportBody);
            const xmlText = await response.text();
            
            // 解析事件数据
            const events = this.parseEventsFromXML(xmlText);
            return events;
        } catch (error) {
            console.error('获取日历事件失败:', error);
            showMessage('获取日历事件失败，请检查网络，QQ邮箱配置', -1, 'error');
            return [];
        }
    }

    private parseEventsFromXML(xmlText: string): CalendarEvent[] {
        const events: CalendarEvent[] = [];
        
        try {
            const responseMatches = xmlText.match(/<D:response[^>]*>([\s\S]*?)<\/D:response>/g);
            
            if (responseMatches) {
                for (const responseMatch of responseMatches) {
                    const calendarDataMatch = responseMatch.match(/<C:calendar-data[^>]*>([\s\S]*?)<\/C:calendar-data>/);
                    
                    if (calendarDataMatch) {
                        const icsData = calendarDataMatch[1].trim();
                        const parsedEvents = this.parseICSData(icsData);
                        events.push(...parsedEvents);
                    }
                }
            }
        } catch (error) {
            console.error('解析事件XML失败:', error);
        }
        
        return events;
    }

    private parseICSData(icsData: string): CalendarEvent[] {
        const events: CalendarEvent[] = [];
        
        try {
            // 匹配事件数据块
            const veventMatches = icsData.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g);
            
            if (veventMatches) {
                for (const veventBlock of veventMatches) {
                    const veventData = veventBlock.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/)?.[1];
                    
                    if (veventData) {
                        const event = this.parseVEventData(veventData);
                        if (event) {
                            events.push(event);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('解析ICS数据失败:', error);
        }
        
        return events;
    }

    private parseVEventData(veventData: string): CalendarEvent | null {
        try {
            // 提取基本信息
            const summary = veventData.match(/SUMMARY:(.+?)(?:\r\n|\n|$)/)?.[1] || '';
            const uid = veventData.match(/UID:(.+?)(?:\r\n|\n|$)/)?.[1];
            const description = veventData.match(/DESCRIPTION:(.+?)(?:\r\n|\n|$)/)?.[1] || '';
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

            return {
                id: uid || '',
                title: summary,
                start: start,
                end: end,
                timeZone: 'local',
                allDay: isAllDay,
                rrule: rruleMatch || '',
                extendedProps: {
                    source: 'qqcalendar',
                    description: description,
                    status: '未完成',
                    isRecurring: !!rruleMatch,
                    rrule: rruleMatch || '',
                    allDay: isAllDay,
                }
            };
        } catch (error) {
            console.error('解析事件数据失败:', error);
            return null;
        }
    }

    async createEvent(calendarUrl: string, event: {
        title: string;
        description?: string;
        start: Date;
        end: Date;
        isAllDay?: boolean;
        recurrenceRule?: string;
    }): Promise<string> {
        if (!calendarUrl) {
            showMessage('请设置QQ日历', -1, 'error');
            throw new Error('未设置QQ日历');
        }

        try {
            // 生成唯一的UID
            const uid = `siyuan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // 构建iCalendar格式的事件
            const icsData = this.buildICSData(uid, event);

            // PUT 请求创建事件
            const eventUrl = `${calendarUrl}${uid}.ics`;
            await this.makeRequest('PUT', eventUrl, icsData);

            showMessage('事件已成功添加到QQ日历', 3000, 'info');
            return uid;
        } catch (error) {
            console.error('创建QQ日历事件失败:', error);
            showMessage('创建QQ日历事件失败', -1, 'error');
            throw error;
        }
    }

    private buildICSData(uid: string, event: {
        title: string;
        description?: string;
        start: Date;
        end: Date;
        isAllDay?: boolean;
        recurrenceRule?: string;
    }): string {
        const formatDate = (date: Date, isAllDay = false) => {
            if (isAllDay) {
                return date.toISOString().replace(/[-:]/g, '').substring(0, 8);
            }
            return date.toISOString().replace(/[-:]/g, '').substring(0, 15) + 'Z';
        };

        let icsData = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//SiYuan//Steve-Tools Calendar//CN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `SUMMARY:${event.title}`
        ];

        // 添加开始和结束时间
        if (event.isAllDay) {
            icsData.push(`DTSTART;VALUE=DATE:${formatDate(event.start, true)}`);
            icsData.push(`DTEND;VALUE=DATE:${formatDate(event.end, true)}`);
        } else {
            icsData.push(`DTSTART:${formatDate(event.start)}`);
            icsData.push(`DTEND:${formatDate(event.end)}`);
        }

        // 添加描述
        if (event.description) {
            icsData.push(`DESCRIPTION:${event.description}`);
        }

        // 添加重复规则
        if (event.recurrenceRule) {
            icsData.push(`RRULE:${event.recurrenceRule}`);
        }

        // 添加创建时间
        icsData.push(`DTSTAMP:${formatDate(new Date())}`);

        // 结束事件
        icsData.push('END:VEVENT');
        icsData.push('END:VCALENDAR');

        return icsData.join('\r\n');
    }

    // 其他方法可以类似地使用原生fetch重写...
}