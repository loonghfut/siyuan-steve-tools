import { showMessage } from 'siyuan';

interface CalendarEvent {
    id: string;
    title: string;
    start: Date | null;
    end: Date | null;
    timeZone: string;
    allDay: boolean;
    rrule?: string;
    extendedProps: {
        source: string;
        description: string;
        status: string;
        isRecurring: boolean;
        rrule?: string;
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
        // 修改为正确的QQ邮箱CalDAV服务器地址
        this.serverUrl = 'https://dav.qq.com/.well-known/caldav';
        this.credentials = { username, password };

        // 构建Basic认证头
        const auth = btoa(`${username}:${password}`);
        this.headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/xml; charset=utf-8',
            'User-Agent': 'SiYuan-Steve-Tools/1.0',
            'Depth': '1'
        };
    }

    async init() {
        try {
            // 测试连接 - 先测试根路径
            await this.makeRequest('OPTIONS', '/');
            console.log('QQ日历连接成功');

            // 尝试获取当前用户信息
            const userInfo = await this.getCurrentUser();
            console.log('用户信息:', userInfo);
        } catch (e) {
            console.error('QQ日历登录失败:', e);
            showMessage('QQ日历登录失败，请检查网络，QQ邮箱配置', -1, 'error');
        }
    }

    private async makeRequest(method: string, path: string, body?: string): Promise<Response> {
        // 对于获取事件的请求，需要特殊处理URL
        let url: string;

        if (method === 'REPORT' && path.startsWith('/calendar/')) {
            // 获取事件时使用不同的基础URL
            url = `https://dav.qq.com${path}`;
        } else {
            // 其他请求使用原来的serverUrl
            url = `${this.serverUrl}${path}`;
        }

        try {
            const requestHeaders = { ...this.headers };

            // 为PROPFIND和REPORT请求添加Depth头
            if (method === 'PROPFIND' || method === 'REPORT') {
                requestHeaders['Depth'] = '1';
            }

            const response = await fetch(url, {
                method,
                headers: requestHeaders,
                body: body || undefined,
            });

            console.log(`${method} ${url} - Status: ${response.status}`);

            if (!response.ok && response.status !== 207) { // 207 Multi-Status is OK for WebDAV
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            console.error(`请求失败 ${method} ${url}:`, error);
            throw error;
        }
    }

    // 获取当前用户信息
    async getCurrentUser(): Promise<string> {
        try {
            const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
    <D:prop>
        <D:current-user-principal />
    </D:prop>
</D:propfind>`;

            const response = await this.makeRequest('PROPFIND', '/', propfindBody);
            const xmlText = await response.text();
            console.log('Current user response:', xmlText);

            // 解析用户主路径
            const principalMatch = xmlText.match(/<D:current-user-principal[^>]*>\s*<D:href[^>]*>(.*?)<\/D:href>/);
            return principalMatch ? principalMatch[1] : '/cgi-bin/caldav/user/';
        } catch (error) {
            console.error('获取用户信息失败:', error);
            return '/cgi-bin/caldav/user/';
        }
    }

    async getCalendars(): Promise<DAVCalendar[]> {
        try {
            // 先获取用户的主路径
            const userPrincipal = await this.getCurrentUser();
            console.log('User principal:', userPrincipal);

            // 尝试多个可能的路径
            const possiblePaths = [
                userPrincipal,
                '/cgi-bin/caldav/user/',
                '/cgi-bin/caldav/',
                '/caldav/',
                `${userPrincipal}calendar/`,
                '/cgi-bin/caldav/user/calendar/'
            ];

            for (const path of possiblePaths) {
                try {
                    console.log(`尝试路径: ${path}`);
                    const calendars = await this.tryGetCalendarsFromPath(path);
                    if (calendars.length > 0) {
                        console.log(`成功从路径 ${path} 获取到 ${calendars.length} 个日历`);
                        return calendars;
                    }
                } catch (error) {
                    console.log(`路径 ${path} 失败:`, error.message);
                    continue;
                }
            }

            console.log('所有路径都失败了，返回空数组');
            showMessage('未找到可用的日历，请检查QQ邮箱日历设置', -1, 'error');
            return [];
        } catch (error) {
            console.error('获取日历列表失败:', error);
            showMessage('获取日历列表失败，请检查网络，QQ邮箱配置', -1, 'error');
            return [];
        }
    }

    private async tryGetCalendarsFromPath(path: string): Promise<DAVCalendar[]> {
        // PROPFIND 请求获取日历列表
        const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop>
        <D:displayname />
        <D:resourcetype />
        <C:calendar-description />
        <D:getctag />
        <C:supported-calendar-component-set />
    </D:prop>
</D:propfind>`;

        const response = await this.makeRequest('PROPFIND', path, propfindBody);
        const xmlText = await response.text();
        console.log(`Path ${path} response:`, xmlText);

        // 解析XML响应
        const calendars = this.parseCalendarsFromXML(xmlText);
        return calendars;
    }

    private parseCalendarsFromXML(xmlText: string): DAVCalendar[] {
        const calendars: DAVCalendar[] = [];

        try {
            // 使用正则表达式解析XML（处理不同的命名空间前缀）
            const responseMatches = xmlText.match(/<[A-Z]:response[^>]*>([\s\S]*?)<\/[A-Z]:response>/g);

            if (responseMatches) {
                for (const responseMatch of responseMatches) {
                    const hrefMatch = responseMatch.match(/<[A-Z]:href[^>]*>(.*?)<\/[A-Z]:href>/);
                    const displayNameMatch = responseMatch.match(/<[A-Z]:displayname[^>]*>(.*?)<\/[A-Z]:displayname>/);
                    const ctagMatch = responseMatch.match(/<[A-Z]:getctag[^>]*>(.*?)<\/[A-Z]:getctag>/);
                    const descriptionMatch = responseMatch.match(/<[A-Z]:calendar-description[^>]*>(.*?)<\/[A-Z]:calendar-description>/);

                    // 检查是否为日历资源 - 查找 <D:calendar /> 或其他变体
                    const isCalendar = responseMatch.match(/<[A-Z]:calendar\s*\/?>/) ||
                        responseMatch.includes('calendar') &&
                        responseMatch.match(/<[A-Z]:comp\s+name="VEVENT"/);

                    // 过滤掉非日历项目（inbox、outbox等）
                    const isValidCalendar = hrefMatch && displayNameMatch && isCalendar &&
                        !hrefMatch[1].includes('/inbox/') &&
                        !hrefMatch[1].includes('/outbox/') &&
                        !hrefMatch[1].includes('%40') && // 过滤用户主目录
                        hrefMatch[1].endsWith('/') &&
                        displayNameMatch[1].trim() !== '';

                    if (isValidCalendar) {
                        let url = hrefMatch[1];

                        // 保持原始URL格式，不添加.ics后缀
                        // url从 /calendar/F23atnjU6_DDnQtpjZoAACm/ 保持为这个格式

                        const displayName = displayNameMatch[1];
                        const ctag = ctagMatch ? ctagMatch[1] : undefined;
                        const description = descriptionMatch ? descriptionMatch[1] : undefined;

                        console.log(`找到日历: ${displayName} - ${url}`);

                        calendars.push({
                            url: url,
                            displayName: displayName,
                            ctag: ctag,
                            description: description
                        });
                    }
                }
            }

            console.log(`总共解析到 ${calendars.length} 个日历`);
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
            // 构建正确的获取事件URL
            // 从 /calendar/F23atnjU6_DDnQtpjZoAACm/ 转换为正确的请求URL
            let requestUrl = calendarUrl;

            // 确保URL以/结尾
            if (!requestUrl.endsWith('/')) {
                requestUrl += '/';
            }

            console.log(`获取日历事件: ${requestUrl}`);

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

            const response = await this.makeRequest('REPORT', requestUrl, reportBody);
            const xmlText = await response.text();
            console.log('事件响应:', xmlText);

            // 解析事件数据
            const events = this.parseEventsFromXML(xmlText);
            console.log(`解析到 ${events.length} 个事件AAAAAAAAAAAAAAAAAAAAAAAA`);
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
            // 处理不同命名空间前缀 - 使用 [A-Z]: 来匹配任意前缀
            const responseMatches = xmlText.match(/<[A-Z]:response[^>]*>([\s\S]*?)<\/[A-Z]:response>/g);

            if (responseMatches) {
                for (const responseMatch of responseMatches) {
                    // 查找calendar-data标签，可能有不同的命名空间前缀（如D:calendar-data）
                    const calendarDataMatch = responseMatch.match(/<[A-Z]:calendar-data[^>]*>([\s\S]*?)<\/[A-Z]:calendar-data>/);

                    if (calendarDataMatch) {
                        let icsData = calendarDataMatch[1].trim();
                        
                        // 解码XML实体（QQ邮箱返回的数据包含XML实体编码）
                        icsData = icsData
                            .replace(/&#x0D;&#x0A;/g, '\r\n')  // 替换回车换行
                            .replace(/&#x0D;/g, '\r')         // 替换回车
                            .replace(/&#x0A;/g, '\n')         // 替换换行
                            .replace(/&amp;/g, '&')          // 替换&符号
                            .replace(/&lt;/g, '<')           // 替换<符号
                            .replace(/&gt;/g, '>')           // 替换>符号
                            .replace(/&quot;/g, '"')         // 替换引号
                            .replace(/&apos;/g, "'");        // 替换单引号
                        
                        console.log('解码后的ICS数据:', icsData.substring(0, 300) + '...');
                        
                        const parsedEvents = this.parseICSData(icsData);
                        events.push(...parsedEvents);
                    }
                }
            }
            
            console.log(`成功解析 ${events.length} 个事件`);
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
                console.log(`找到 ${veventMatches.length} 个VEVENT块`);
                
                for (const veventBlock of veventMatches) {
                    const veventData = veventBlock.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/)?.[1];

                    if (veventData) {
                        console.log('处理VEVENT数据:', veventData.substring(0, 200) + '...');
                        const event = this.parseVEventData(veventData);
                        if (event) {
                            console.log('成功解析事件:', event.title);
                            events.push(event);
                        }
                    }
                }
            } else {
                console.log('未找到VEVENT块');
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

            console.log(`解析事件: ${summary}, UID: ${uid}`);

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

            const event = {
                id: uid || '',
                title: summary,
                start: start,
                end: end,
                timeZone: 'local',
                allDay: isAllDay,
  
                extendedProps: {
                    source: 'qqcalendar',
                    description: description,
                    status: '未完成',
                    isRecurring: !!rruleMatch,
                  
                    allDay: isAllDay,
                }
            };

            console.log('解析完成的事件:', event);
            return event;
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

}