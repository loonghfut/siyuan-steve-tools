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
        // console.log(username, password);
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
        if (!calendarId) {
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


    /**
     * 创建新事件
     * @param calendarId 日历ID
     * @param event 事件数据
     */
    async createEvent(calendarId: string, event: {
        title: string;
        description?: string;
        start: Date;
        end: Date;
        isAllDay?: boolean;
        recurrenceRule?: string;
    }): Promise<string> {
        if (!calendarId) {
            showMessage('请设置QQ日历', -1, 'error');
            throw new Error('未设置QQ日历');
        }

        try {
            // 生成唯一的UID
            const uid = `siyuan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // 构建iCalendar格式的事件
            let icsData = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//SiYuan//Steve-Tools Calendar//CN',
                'CALSCALE:GREGORIAN',
                'METHOD:PUBLISH',
                'BEGIN:VEVENT'
            ];

            // 添加UID
            icsData.push(`UID:${uid}`);

            // 格式化日期时间
            const formatDate = (date: Date, isAllDay = false) => {
                if (isAllDay) {
                    return date.toISOString().replace(/[-:]/g, '').substring(0, 8);
                }
                return date.toISOString().replace(/[-:]/g, '').substring(0, 15) + 'Z';
            };

            // 添加开始和结束时间
            if (event.isAllDay) {
                icsData.push(`DTSTART;VALUE=DATE:${formatDate(event.start, true)}`);
                icsData.push(`DTEND;VALUE=DATE:${formatDate(event.end, true)}`);
            } else {
                icsData.push(`DTSTART:${formatDate(event.start)}`);
                icsData.push(`DTEND:${formatDate(event.end)}`);
            }

            // 添加标题和描述
            icsData.push(`SUMMARY:${event.title}`);
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

            // 上传事件到服务器
            const result = await this.client.createCalendarObject({
                calendar: { url: calendarId },
                filename: `${uid}.ics`,
                iCalString: icsData.join('\r\n')
            });

            showMessage('事件已成功添加到QQ日历', 3000, 'info');
            return uid;
        } catch (error) {
            console.error('创建QQ日历事件失败:', error);
            showMessage('创建QQ日历事件失败', -1, 'error');
            throw error;
        }
    }

    /**
     * 更新已有事件
     * @param calendarId 日历ID
     * @param uid 事件UID
     * @param event 更新的事件数据
     */
    async updateEvent(calendarId: string, uid: string, event: {
        title?: string;
        description?: string;
        start?: Date;
        end?: Date;
        isAllDay?: boolean;
        recurrenceRule?: string;
    }): Promise<void> {
        if (!calendarId || !uid) {
            showMessage('参数不完整', -1, 'error');
            throw new Error('参数不完整');
        }

        try {
            // 先获取当前事件
            const events = await this.client.fetchCalendarObjects({
                calendar: { url: calendarId },
                filters: [{
                    'comp-filter': {
                        _attributes: {
                            name: 'VCALENDAR'
                        },
                        'comp-filter': {
                            _attributes: {
                                name: 'VEVENT'
                            },
                            'prop-filter': {
                                _attributes: {
                                    name: 'UID'
                                },
                                'text-match': {
                                    _attributes: {
                                        'collation': 'i;octet',
                                        'negate-condition': 'no',
                                        'match-type': 'equals'
                                    },
                                    _text: uid
                                }
                            }
                        }
                    }
                }]
            });

            if (events.length === 0) {
                showMessage('未找到要更新的事件', -1, 'error');
                throw new Error('未找到要更新的事件');
            }

            const existingEvent = events[0];
            const icsData = existingEvent.data;

            // 解析现有事件数据
            const veventMatch = icsData.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/);
            if (!veventMatch) {
                throw new Error('无效的事件数据');
            }

            const veventData = veventMatch[1];
            const summary = event.title || veventData.match(/SUMMARY:(.+?)(?:\r\n|\n|$)/)?.[1] || '';
            const description = event.description || veventData.match(/DESCRIPTION:(.+?)(?:\r\n|\n|$)/)?.[1] || '';
            const rrule = event.recurrenceRule || veventData.match(/RRULE:(.+?)(?:\r\n|\n|$)/)?.[1] || '';

            // 构建更新后的事件数据
            let updatedIcsData = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//SiYuan//Steve-Tools Calendar//CN',
                'CALSCALE:GREGORIAN',
                'METHOD:PUBLISH',
                'BEGIN:VEVENT'
            ];

            // 添加UID
            updatedIcsData.push(`UID:${uid}`);

            // 格式化日期时间
            const formatDate = (date: Date, isAllDay = false) => {
                if (isAllDay) {
                    return date.toISOString().replace(/[-:]/g, '').substring(0, 8);
                }
                return date.toISOString().replace(/[-:]/g, '').substring(0, 15) + 'Z';
            };

            // 添加开始和结束时间
            const isAllDay = event.isAllDay ?? (!veventData.match(/DTSTART:/));
            const start = event.start || new Date(veventData.match(/DTSTART(?:;[^:]*)?:([^\r\n]+)/)?.[1]?.replace(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?/, '$1-$2-$3T$4:$5:$6Z') || '');
            const end = event.end || new Date(veventData.match(/DTEND(?:;[^:]*)?:([^\r\n]+)/)?.[1]?.replace(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?/, '$1-$2-$3T$4:$5:$6Z') || '');

            if (isAllDay) {
                updatedIcsData.push(`DTSTART;VALUE=DATE:${formatDate(start, true)}`);
                updatedIcsData.push(`DTEND;VALUE=DATE:${formatDate(end, true)}`);
            } else {
                updatedIcsData.push(`DTSTART:${formatDate(start)}`);
                updatedIcsData.push(`DTEND:${formatDate(end)}`);
            }

            // 添加标题和描述
            updatedIcsData.push(`SUMMARY:${summary}`);
            if (description) {
                updatedIcsData.push(`DESCRIPTION:${description}`);
            }

            // 添加重复规则
            if (rrule) {
                updatedIcsData.push(`RRULE:${rrule}`);
            }

            // 添加修改时间
            updatedIcsData.push(`DTSTAMP:${formatDate(new Date())}`);

            // 结束事件
            updatedIcsData.push('END:VEVENT');
            updatedIcsData.push('END:VCALENDAR');

            // 更新服务器上的事件
            await this.client.updateCalendarObject({
                calendarObject: {
                    url: existingEvent.url,
                    data: updatedIcsData.join('\r\n')
                }
            });

            showMessage('事件已成功更新', 3000, 'info');
        } catch (error) {
            console.error('更新QQ日历事件失败:', error);
            showMessage('更新QQ日历事件失败', -1, 'error');
            throw error;
        }
    }

    /**
     * 删除事件
     * @param calendarId 日历ID
     * @param uid 事件UID
     */
    async deleteEvent(calendarId: string, uid: string): Promise<void> {
        if (!calendarId || !uid) {
            showMessage('参数不完整', -1, 'error');
            throw new Error('参数不完整');
        }

        try {
            // 获取要删除的事件
            const events = await this.client.fetchCalendarObjects({
                calendar: { url: calendarId },
                filters: [{
                    'comp-filter': {
                        _attributes: {
                            name: 'VCALENDAR'
                        },
                        'comp-filter': {
                            _attributes: {
                                name: 'VEVENT'
                            },
                            'prop-filter': {
                                _attributes: {
                                    name: 'UID'
                                },
                                'text-match': {
                                    _attributes: {
                                        'collation': 'i;octet',
                                        'negate-condition': 'no',
                                        'match-type': 'equals'
                                    },
                                    _text: uid
                                }
                            }
                        }
                    }
                }]
            });

            if (events.length === 0) {
                showMessage('未找到要删除的事件', -1, 'error');
                throw new Error('未找到要删除的事件');
            }

            // 删除事件
            await this.client.deleteCalendarObject({
                calendarObject: events[0]
            });

            showMessage('事件已成功删除', 3000, 'info');
        } catch (error) {
            console.error('删除QQ日历事件失败:', error);
            showMessage('删除QQ日历事件失败', -1, 'error');
            throw error;
        }
    }

    /**
     * 同步多个事件到QQ日历
     * @param calendarId 日历ID
     * @param events 要同步的事件数组
     */
    async syncEvents(calendarId: string, events: Array<{
        id?: string;
        title: string;
        description?: string;
        start: Date;
        end: Date;
        isAllDay?: boolean;
        recurrenceRule?: string;
    }>): Promise<void> {
        if (!calendarId) {
            showMessage('请设置QQ日历', -1, 'error');
            throw new Error('未设置QQ日历');
        }

        try {
            // 记录成功和失败的数量
            let successCount = 0;
            let failCount = 0;

            // 依次处理每个事件
            for (const event of events) {
                try {
                    if (event.id) {
                        // 更新已有事件
                        await this.updateEvent(calendarId, event.id, event);
                    } else {
                        // 创建新事件
                        await this.createEvent(calendarId, event);
                    }
                    successCount++;
                } catch (error) {
                    console.error(`同步事件 "${event.title}" 失败:`, error);
                    failCount++;
                }
            }

            showMessage(`同步完成: ${successCount}个成功, ${failCount}个失败`, 3000, 'info');
        } catch (error) {
            console.error('批量同步事件失败:', error);
            showMessage('批量同步事件失败', -1, 'error');
            throw error;
        }
    }

    /**
 * 清空日历中的所有事件
 * @param calendarId 日历ID
 * @param options 选项，如选择特定源的事件删除
 */
    async clearCalendar(calendarId: string, options: {
        onlyFromSource?: string; // 如果指定，只删除来自特定来源的事件
        excludeIds?: string[]; // 排除特定ID的事件
    } = {}): Promise<void> {
        if (!calendarId) {
            showMessage('请设置QQ日历', -1, 'error');
            throw new Error('未设置QQ日历');
        }

        try {
            // 获取所有事件
            const events = await this.getEvents(calendarId);
            console.log(`找到${events.length}个事件`);

            // 根据选项过滤要删除的事件
            const eventsToDelete = events.filter(event => {
                // 如果指定了来源，只删除匹配来源的事件
                if (options.onlyFromSource && event.extendedProps?.source !== options.onlyFromSource) {
                    return false;
                }

                // 如果指定了排除ID，排除这些事件
                if (options.excludeIds && options.excludeIds.includes(event.id)) {
                    return false;
                }

                return true;
            });

            if (eventsToDelete.length === 0) {
                showMessage('没有找到需要删除的事件', 3000, 'info');
                return;
            }

            // 显示确认对话框
            if (confirm(`确定要删除${eventsToDelete.length}个事件吗？此操作不可恢复！`)) {
                let successCount = 0;
                let failCount = 0;

                // 批量删除事件
                for (const event of eventsToDelete) {
                    try {
                        // 获取要删除的事件对象
                        const eventObjects = await this.client.fetchCalendarObjects({
                            calendar: { url: calendarId },
                            filters: [{
                                'comp-filter': {
                                    _attributes: {
                                        name: 'VCALENDAR'
                                    },
                                    'comp-filter': {
                                        _attributes: {
                                            name: 'VEVENT'
                                        },
                                        'prop-filter': {
                                            _attributes: {
                                                name: 'UID'
                                            },
                                            'text-match': {
                                                _attributes: {
                                                    'collation': 'i;octet',
                                                    'negate-condition': 'no',
                                                    'match-type': 'equals'
                                                },
                                                _text: event.id
                                            }
                                        }
                                    }
                                }
                            }]
                        });

                        if (eventObjects.length > 0) {
                            await this.client.deleteCalendarObject({
                                calendarObject: eventObjects[0]
                            });
                            successCount++;
                            console.log(`成功删除事件: ${event.title}`);
                        } else {
                            console.warn(`未找到事件: ${event.title} (ID: ${event.id})`);
                            failCount++;
                        }
                    } catch (error) {
                        console.error(`删除事件失败: ${event.title}`, error);
                        failCount++;
                    }
                }

                showMessage(`清空完成: 成功删除${successCount}个事件，失败${failCount}个`, 3000, "info");
            }
        } catch (error) {
            console.error('清空日历失败:', error);
            showMessage('清空日历失败，请查看控制台错误', -1, 'error');
            throw error;
        }
    }

    // 在 CalDAVClient 类中添加创建事件的方法
    async createEvent_new(calendarId: string, event: {
        summary: string;
        start: Date;
        end: Date;
        description?: string;
        allDay?: boolean;
    }): Promise<string> {
        if (!calendarId) {
            showMessage('请设置QQ日历', -1, 'error');
            return '';
        }

        try {
            // 生成唯一ID
            const uid = this.generateUID();

            // 格式化时间
            const dtstart = this.formatDate(event.start, event.allDay);
            const dtend = this.formatDate(event.end, event.allDay);

            // 创建事件内容
            const icsContent = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//SiYuan//Calendar//CN',
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `SUMMARY:${event.summary}`,
                `DTSTAMP:${this.formatDate(new Date())}`,
                `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${dtstart}`,
                `DTEND${event.allDay ? ';VALUE=DATE' : ''}:${dtend}`,
                event.description ? `DESCRIPTION:${event.description}` : '',
                'STATUS:CONFIRMED',
                'BEGIN:VALARM',
                'ACTION:DISPLAY',
                'TRIGGER:-PT15M',
                `SUMMARY:${event.summary}`,
                'END:VALARM',
                'END:VEVENT',
                'END:VCALENDAR'
            ].filter(Boolean).join('\r\n');

            // 创建事件对象
            await this.client.createCalendarObject({
                calendar: { url: calendarId },
                filename: `${uid}.ics`,
                iCalString: icsContent
            });

            return uid;
        } catch (error) {
            console.error('创建日历事件失败:', error);
            showMessage('创建日历事件失败', -1, 'error');
            throw error;
        }
    }

    // 生成唯一ID
    private generateUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 格式化日期为iCalendar格式
    private formatDate(date: Date, allDay: boolean = false): string {
        if (allDay) {
            return date.toISOString().replace(/[-:]/g, '').split('T')[0];
        }
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }
}