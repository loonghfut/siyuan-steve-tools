import { EventInput } from '@fullcalendar/core';
import ICAL from 'ical.js';

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
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch ICS file: ${response.statusText}`);
            }
            
            const icsData = await response.text();
            console.log('Fetched ICS data:', icsData);
            return this.parseICSData(icsData, url);
        } catch (error) {
            console.error(`Error fetching ICS from ${url}:`, error);
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