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
        this.serverUrl = 'https://dav.qq.com'; // Unified base URL
        this.credentials = { username, password };

        // 构建Basic认证头
        const auth = btoa(`${username}:${password}`);
        this.headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/xml; charset=utf-8',
            'User-Agent': 'SiYuan/3.1.32 https://b3log.org/siyuan Electron Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SiYuan/3.1.32 Chrome/134.0.6998.205 Electron/35.5.0 Safari/537.36',
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
        // 统一 URL 构建逻辑
        let pathSuffix = path;
        const isEventSpecificPath = (method === 'REPORT' && path.startsWith('/calendar/')) ||
            ((method === 'PUT' || method === 'DELETE') && path.includes('.ics'));

        if (!isEventSpecificPath) {
            // 对于非事件特定路径（如 PROPFIND, OPTIONS），路径是相对于 /calendar 端点的
            // this.serverUrl (https://dav.qq.com) + /calendar + original path
            pathSuffix = `/calendar${path}`; 
        }

        const url = `${this.serverUrl}${pathSuffix}`;

        try {
            const requestHeaders = { ...this.headers };

            // 为PROPFIND和REPORT请求添加Depth头
            if (method === 'PROPFIND' || method === 'REPORT') {
                requestHeaders['Depth'] = '1';
            }

            // 将 headers 转换为 forwardProxy API 期望的格式
            const proxyHeaders: Array<{ [key: string]: string }> = [];
            for (const key in requestHeaders) {
                if (Object.prototype.hasOwnProperty.call(requestHeaders, key)) {
                    proxyHeaders.push({ [key]: requestHeaders[key] });
                }
            }

            const proxyPayload: {
                url: string;
                method: string;
                headers: Array<{ [key: string]: string }>;
                payload?: string;
                payloadEncoding?: string;
                responseEncoding?: string;
                timeout: number;
                contentType?: string; // 可选，如果 CalDAV 的 Content-Type 需要通过此字段指定
            } = {
                url: url,
                method: method,
                headers: proxyHeaders, // CalDAV 请求的头部，包括 Content-Type
                // payloadEncoding: "text", // CalDAV body 通常是 XML/ICS 文本
                // responseEncoding: "text", // 期望代理返回文本格式的 body
                timeout: 15000,// 设置代理请求超时时间 (毫秒)
                contentType: requestHeaders['Content-Type']
            };

            if (body !== undefined) {
                proxyPayload.payload = body;
                console.log(`代理请求 ${method} ${url} - Payload:`, body);
            }
            // 如果 CalDAV 的 Content-Type 需要通过 proxyPayload.contentType 指定，可以在这里设置
            proxyPayload.contentType = requestHeaders['Content-Type'] || 'application/xml; charset=utf-8';


            // 假设代理 API 部署在 "/api/network/forwardProxy"
            const proxyApiUrl = "/api/network/forwardProxy";

            const proxyApiResponse = await fetch(proxyApiUrl, {
                method: 'POST', // forwardProxy API 自身使用 POST 方法
                headers: {
                    'Content-Type': 'application/json', // 发送给代理 API 的请求体是 JSON
                },
                body: JSON.stringify(proxyPayload),
            });

            if (!proxyApiResponse.ok) {
                const errorText = await proxyApiResponse.text();
                console.error(`代理请求 ${proxyApiUrl} 失败: ${proxyApiResponse.status} ${proxyApiResponse.statusText}`, errorText);
                throw new Error(`代理请求失败: ${proxyApiResponse.status} ${proxyApiResponse.statusText} - ${errorText}`);
            }

            const proxyResult = await proxyApiResponse.json();

            // 检查代理本身是否报告错误 (gulu.Ret 结构)
            if (proxyResult.code !== 0 && proxyResult.code !== undefined) {
                console.error(`代理转发错误 ${method} ${url}: ${proxyResult.msg}`, proxyResult.data);
                // 根据代理返回的错误信息构造一个 Response 对象或直接抛出错误
                // 为了与原有逻辑兼容，尝试从 proxyResult.data 中获取状态码
                const errorStatus = proxyResult.data?.status || 503; // Service Unavailable or custom
                const errorStatusText = proxyResult.msg || `Proxy forwarding error`;
                const errorBody = proxyResult.data?.body || proxyResult.msg || `Proxy error: ${errorStatusText}`;

                // 返回一个表示代理错误的 Response 对象
                return new Response(errorBody, {
                    status: errorStatus,
                    statusText: this.getStatusText(errorStatus, errorStatusText),
                    headers: new Headers(proxyResult.data?.headers || {}),
                });
            }

            // 代理成功转发请求，并从目标服务器获取了响应
            if (proxyResult.data && proxyResult.data.status !== undefined) {
                const actualStatus = proxyResult.data.status;
                const actualBody = proxyResult.data.body; // 已经是字符串，因为 responseEncoding: "text"
                const actualHeaders = new Headers(proxyResult.data.headers || {});

                console.log(`${method} ${url} (通过代理) - Status: ${actualStatus}`);

                // 创建一个模拟原始 fetch 返回的 Response 对象
                const emulatedResponse = new Response(actualBody, {
                    status: actualStatus,
                    statusText: this.getStatusText(actualStatus, proxyResult.data.statusText), // 尝试使用代理提供的statusText
                    headers: actualHeaders,
                });

                // 原有的状态检查逻辑
                if (!emulatedResponse.ok && emulatedResponse.status !== 207) { // 207 Multi-Status is OK for WebDAV
                    throw new Error(`HTTP ${emulatedResponse.status}: ${emulatedResponse.statusText} (来自 ${url} 通过代理)`);
                }
                return emulatedResponse;
            } else {
                // 代理返回了预料之外的结构
                console.error(`未预期的代理响应结构 ${method} ${url}:`, proxyResult);
                throw new Error(`未预期的代理响应结构。代理返回: ${JSON.stringify(proxyResult)}`);
            }

        } catch (error) {
            console.error(`请求失败 ${method} ${url} (通过代理):`, error);
            throw error;
        }
    }

    // 辅助函数：获取状态码对应的文本描述
    private getStatusText(status: number, defaultText?: string): string {
        if (defaultText && defaultText.trim() !== "") return defaultText;
        switch (status) {
            case 200: return 'OK';
            case 201: return 'Created';
            case 204: return 'No Content';
            case 207: return 'Multi-Status';
            case 400: return 'Bad Request';
            case 401: return 'Unauthorized';
            case 403: return 'Forbidden';
            case 404: return 'Not Found';
            case 500: return 'Internal Server Error';
            case 503: return 'Service Unavailable';
            default: return 'Status ' + status;
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
                // '/cgi-bin/caldav/user/',
                // '/cgi-bin/caldav/',
                '/caldav/',
                `/`,
                // '/cgi-bin/caldav/user/calendar/'
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
                    isRecurring: true,

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
    /**
         * 更新已有事件
         * @param calendarUrl 日历URL
         * @param uid 事件UID
         * @param event 更新的事件数据
         */
    async updateEvent(calendarUrl: string, uid: string, event: {
        title?: string;
        description?: string;
        start?: Date;
        end?: Date;
        isAllDay?: boolean;
        recurrenceRule?: string;
    }): Promise<boolean> {
        if (!calendarUrl || !uid) {
            showMessage('参数不完整', -1, 'error');
            throw new Error('参数不完整');
        }

        try {
            // 先获取当前事件
            const events = await this.getEvents(calendarUrl);

            // 查找匹配UID的事件
            const targetEvent = events.find(e => e.id === uid);
            if (!targetEvent) {
                console.error('未找到要修改的事件:', uid);
                showMessage('未找到要修改的事件', -1, 'error');
                return false;
            }

            // 构建更新后的事件数据
            const updatedEvent = {
                title: event.title || targetEvent.title,
                description: event.description || targetEvent.extendedProps.description,
                start: event.start || targetEvent.start!,
                end: event.end || targetEvent.end!,
                isAllDay: event.isAllDay ?? targetEvent.allDay,
                recurrenceRule: event.recurrenceRule || targetEvent.rrule
            };

            // 删除旧事件并创建新事件
            await this.deleteEvent(calendarUrl, uid);
            await this.createEvent(calendarUrl, updatedEvent);

            showMessage('事件已成功更新', 3000, 'info');
            return true;
        } catch (error) {
            console.error('更新QQ日历事件失败:', error);
            showMessage('更新QQ日历事件失败', -1, 'error');
            throw error;
        }
    }

    /**
     * 删除事件
     * @param calendarUrl 日历URL
     * @param uid 事件UID
     */
    async deleteEvent(calendarUrl: string, uid: string): Promise<boolean> {
        if (!calendarUrl || !uid) {
            showMessage('参数不完整', -1, 'error');
            throw new Error('参数不完整');
        }

        try {
            // 构建事件URL
            let eventUrl = calendarUrl;
            if (!eventUrl.endsWith('/')) {
                eventUrl += '/';
            }
            eventUrl += `${uid}.ics`;

            // DELETE 请求删除事件
            const response = await this.makeRequest('DELETE', eventUrl);

            if (response.ok || response.status === 404) {
                showMessage('事件已成功删除', 3000, 'info');
                return true;
            } else {
                throw new Error(`删除失败: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('删除QQ日历事件失败:', error);
            showMessage('删除QQ日历事件失败', -1, 'error');
            throw error;
        }
    }
    /**
     * 创建新事件（简化版本）
     * @param calendarUrl 日历URL
     * @param event 事件数据
     */
    async createEvent_new(calendarUrl: string, event: {
        summary: string;
        start: Date;
        end: Date;
        description?: string;
        allDay?: boolean;
    }): Promise<string> {
        return await this.createEvent(calendarUrl, {
            title: event.summary,
            description: event.description,
            start: event.start,
            end: event.end,
            isAllDay: event.allDay
        });
    }

    /**
     * 生成唯一ID
     */
    private generateUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 格式化日期为iCalendar格式
     */
    private formatDate(date: Date, allDay: boolean = false): string {
        if (allDay) {
            return date.toISOString().replace(/[-:]/g, '').split('T')[0];
        }
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }
}