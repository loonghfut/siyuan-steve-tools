import { EventInput } from '@fullcalendar/core';
import ICAL from 'ical.js';
import { fetchSyncPost } from 'siyuan';

export class ICSSubscription {
    private subscriptionUrls: string[] = [];
    private events: EventInput[] = [];
    
    constructor(urls: string[]) {
        if (urls && urls.length > 0) {
            this.subscriptionUrls = urls;
        }
    }
    
    public async init() {
        await this.refreshEvents();
    }
    
    public addSubscription(url: string) {
        if (!this.subscriptionUrls.includes(url)) {
            this.subscriptionUrls.push(url);
        }
    }
    
    public removeSubscription(url: string) {
        this.subscriptionUrls = this.subscriptionUrls.filter(u => u !== url);
    }
    
    public async refreshEvents(): Promise<EventInput[]> {
        this.events = [];
        
        for (const url of this.subscriptionUrls) {
            try {
                const events = await this.fetchAndParseICS(url);
                this.events.push(...events);
            } catch (error) {
                console.error(`Failed to fetch or parse ICS from ${url}:`, error);
            }
        }
        
        return this.events;
    }
    
    public getEvents(): EventInput[] {
        return this.events;
    }
    
private async fetchAndParseICS(url: string): Promise<EventInput[]> {
        try {
            // 参数验证
            if (!url || typeof url !== 'string') {
                console.error('URL参数无效:', url);
                throw new Error('URL参数无效');
            }

            // 使用fetchSyncPost进行同步调用
            const response = await fetchSyncPost("/api/network/forwardProxy", {
                url: url,
                method: "GET",
                timeout: 15000, // 15秒超时，ICS文件可能较大
                contentType: "text/calendar", // 期望的响应类型
                headers: [
                    { "User-Agent": "SiYuan-Plugin-Calendar/1.0" },
                    { "Accept": "text/calendar, text/plain, application/octet-stream, */*" },
                    { "Cache-Control": "no-cache" } // 避免缓存问题
                ],
                responseEncoding: "text" // 期望的响应编码
            });

            // 检查代理请求本身的响应
            if (response.code !== 0) {
                console.error(`代理请求失败 for ${url}:`, response.msg);
                throw new Error(response.msg || '代理请求失败');
            }

            // 检查通过代理获取到的远程HTTP状态
            if (response.data && response.data.status >= 400) {
                console.error(`HTTP error for ${url}:`, response.data.status, response.data.body);
                throw new Error(`HTTP ${response.data.status}: 无法访问ICS文件`);
            }

            const icsContent = response.data.body;

            // 内容验证 (如果需要，您需要实现 validateICSContent 方法)
            // if (!this.validateICSContent(icsContent)) {
            //     console.error('获取到的内容不是有效的ICS格式 for url:', url);
            //     throw new Error('获取到的内容不是有效的ICS格式');
            // }

            return this.parseICSData(icsContent, url);

        } catch (error) {
            console.error(`Error fetching or parsing ICS from ${url}:`, error);
            // 保持与原 fetchAndParseICS 行为一致，出错时返回空数组
            return [];
        }
    }
    
    private parseICSData(icsData: string, sourceUrl: string): EventInput[] {
        const parsedEvents: EventInput[] = [];
        
        try {
            const jcalData = ICAL.parse(icsData);
            const comp = new ICAL.Component(jcalData);
            const vevents = comp.getAllSubcomponents('vevent');
            
            for (const vevent of vevents) {
                const event = new ICAL.Event(vevent);
                
                // 处理单次事件
                if (!event.isRecurring()) {
                    // Remove http/https links from description
                    //滴答清单特殊处理
                    const description = event.description 
                        ? event.description.replace(/https?:\/\/\S+/g, '')
                        : '';
                    
                    parsedEvents.push({
                        id: event.uid + '@' + sourceUrl,
                        title: event.summary,
                        start: event.startDate.toJSDate(),
                        end: event.endDate.toJSDate(),
                        description: description,
                        allDay: event.startDate.isDate,
                        extendedProps: {
                            source: 'ics-subscription',
                            sourceUrl: sourceUrl
                        }
                    });
                } else {
                    // 处理重复事件
                    const iterator = event.iterator();
                    let next;
                    
                    // 获取接下来一年内的事件实例
                    const oneYearFromNow = new Date();
                    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
                    
                    while ((next = iterator.next()) && next.toJSDate() < oneYearFromNow) {
                        const dtstart = next.clone();
                        const dtend = dtstart.clone();
                        dtend.addDuration(event.duration);
                        
                        parsedEvents.push({
                            id: event.uid + '@' + dtstart.toUnixTime() + '@' + sourceUrl,
                            title: event.summary,
                            start: dtstart.toJSDate(),
                            end: dtend.toJSDate(),
                            description: event.description,
                            allDay: dtstart.isDate,
                            extendedProps: {
                                source: 'ics-subscription',
                                sourceUrl: sourceUrl,
                                recurringEventId: event.uid
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing ICS data:', error);
        }
        
        return parsedEvents;
    }
}