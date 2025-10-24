import * as api from "@/api/api";
import { fetchSyncPost, showMessage } from "siyuan";
import steveTools, { settingdata, moduleInstances } from "@/index";
import { createDailynote } from "@frostime/siyuan-plugin-kits";
import { getViewId, getViewValue } from "../myF";

interface ICSEvent {
    uid: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime?: Date;
    location?: string;
    isAllDay: boolean;
    recurrence?: string;
    status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
    tags?: string[];
}

export class ICSImporter {
    private plugin: steveTools;
    private settings: any;
    private topBarButton: any; // 添加对顶栏按钮的引用

    constructor(plugin: steveTools) {
        this.plugin = plugin;
        this.settings = settingdata;
        this.init();
    }

    async init() {
        console.log('ICSImporter init called');
        //获取日记id
        this.topBarButton = this.plugin.addTopBar({
            icon: "iconArrowDown",
            title: "导入ICS日程", // 标题可以考虑根据模式动态变化或在设置中说明
            position: "right",
            callback: async () => {
                const icsUrl = this.settings['cal-ics-subscribe-url'];
                // 此 ID 始终为笔记本 ID
                const notebookIdForImport = this.settings['cal-ics-subscribe-import-note-id'];
                // 从设置中读取导入模式，默认为 'single-document'
                const importMode = this.settings['cal-ics-import-mode'] || 'single-document';

                if (!icsUrl) {
                    showMessage('请先设置ICS订阅URL', 3000, 'error');
                    return;
                }
                if (!notebookIdForImport) {
                    // 统一提示信息，因为 notebookIdForImport 始终是笔记本ID
                    showMessage('请先设置用于导入操作的笔记本ID', 3000, 'error');
                    return;
                }

                // 同步开始时恢复原图标
                this.updateTopBarIcon("iconArrowDown");

                try {
                    if (importMode === 'daily-notes') {
                        await this.importEventsToDailyNotes(icsUrl, notebookIdForImport);
                    } else {
                        const dailyNoteResponse = await api.createDailyNote(window.siyuan.ws.app.appId, notebookIdForImport);
                        console.log('创建的日记ID (单文档模式):', dailyNoteResponse);
                        if (!dailyNoteResponse || !dailyNoteResponse.id) {
                            showMessage('无法创建日记 (单文档模式)，请检查设置的笔记本ID是否正确', 3000, 'error');
                            return;
                        }
                        // 将所有日程导入到这个新创建的日记文档中
                        await this.importEventsToDocument(icsUrl, dailyNoteResponse.id);
                    }
                } finally {
                    console.log('导入操作完成');
                }
            }
        });

        // 在后台检查ICS更新
        this.checkForUpdatesInBackground().catch(err => {
            console.error("后台ICS更新检查出错:", err);
        });
    }

    /**
     * 更新顶栏按钮图标
     */
    private updateTopBarIcon(iconName: string) {
        if (this.topBarButton) {
            const svgUse = this.topBarButton.querySelector('svg use');
            if (svgUse) {
                svgUse.setAttribute('xlink:href', `#${iconName}`);
            }
        }
    }

    /**
     * 从URL获取ICS文件内容
     */
    private async fetchICSContent(url: string): Promise<string> {
        try {
            // 参数验证
            if (!url || typeof url !== 'string') {
                throw new Error('URL参数无效');
            }

            // 使用fetchSyncPost进行同步调用
            const response = await fetchSyncPost("/api/network/forwardProxy", {
                url: url,
                method: "GET",
                timeout: 15000, // 15秒超时，ICS文件可能较大
                contentType: "text/calendar",
                headers: [
                    { "User-Agent": "SiYuan-Plugin-Calendar/1.0" },
                    { "Accept": "text/calendar, text/plain, application/octet-stream, */*" },
                    { "Cache-Control": "no-cache" } // 避免缓存问题
                ],
                responseEncoding: "text"
            });

            // 检查响应
            if (response.code !== 0) {
                throw new Error(response.msg || '代理请求失败');
            }

            // 检查HTTP状态
            if (response.data.status >= 400) {
                throw new Error(`HTTP ${response.data.status}: 无法访问ICS文件`);
            }

            const icsContent = response.data.body;

            // 内容验证
            if (!this.validateICSContent(icsContent)) {
                throw new Error('获取到的内容不是有效的ICS格式');
            }

            return icsContent;

        } catch (error) {
            console.error('获取ICS文件失败:', { url, error });
            const err = error instanceof Error ? error : new Error(String(error));
            throw new Error(`无法获取ICS文件 (${url}): ${err.message}`);
        }
    }

    // 辅助方法：验证ICS内容
    private validateICSContent(content: any): content is string {
        if (!content || typeof content !== 'string') {
            return false;
        }

        // 检查ICS文件的基本结构
        const hasCalendarStart = content.includes('BEGIN:VCALENDAR');
        const hasCalendarEnd = content.includes('END:VCALENDAR');

        return hasCalendarStart && hasCalendarEnd;
    }

    /**
     * 解析ICS文件内容
     */
    private parseICSContent(icsContent: string): ICSEvent[] {
        const events: ICSEvent[] = [];
        const lines = icsContent.split(/\r?\n/);
        let currentEvent: Partial<ICSEvent> | null = null;
        let isInEvent = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            // 处理折行（以空格或制表符开头的行）
            while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) {
                i++;
                line += lines[i].trim();
            }

            if (line === 'BEGIN:VEVENT') {
                isInEvent = true;
                currentEvent = {};
            } else if (line === 'END:VEVENT' && isInEvent && currentEvent) {
                if (currentEvent.uid && currentEvent.title) {
                    events.push(currentEvent as ICSEvent);
                }
                currentEvent = null;
                isInEvent = false;
            } else if (isInEvent && currentEvent) {
                this.parseEventProperty(line, currentEvent);
            }
        }

        // 按开始时间排序事件
        return this.sortEventsByTime(events);
    }

    /**
     * 按开始时间对事件进行排序
     */
    private sortEventsByTime(events: ICSEvent[]): ICSEvent[] {
        return events.sort((a, b) => {
            // 如果事件没有开始时间，排在最后
            if (!a.startTime && !b.startTime) return 0;
            if (!a.startTime) return 1;
            if (!b.startTime) return -1;

            // 按开始时间升序排序（最早的在前）
            const timeA = a.startTime.getTime();
            const timeB = b.startTime.getTime();

            if (timeA < timeB) return -1;
            if (timeA > timeB) return 1;

            // 如果开始时间相同，按标题排序保证稳定性
            return a.title.localeCompare(b.title);
        });
    }

    /**
     * 解析事件属性
     */
    private parseEventProperty(line: string, event: Partial<ICSEvent>): void {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) return;

        const property = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);

        // 解析属性名和参数
        const [propName, ...params] = property.split(';');
        const paramObj: Record<string, string> = {};
        params.forEach(param => {
            const [key, val] = param.split('=');
            if (key && val) {
                paramObj[key] = val;
            }
        });

        switch (propName) {
            case 'UID':
                event.uid = value;
                break;
            case 'SUMMARY':
                event.title = this.unescapeText(value);
                break;
            case 'DESCRIPTION':
                event.description = this.unescapeText(value);
                break;
            case 'LOCATION':
                event.location = this.unescapeText(value);
                break;
            case 'DTSTART':
                event.startTime = this.parseDateTime(value, paramObj);
                event.isAllDay = paramObj.VALUE === 'DATE';
                break;
            case 'DTEND':
                event.endTime = this.parseDateTime(value, paramObj);
                break;
            case 'RRULE':
                event.recurrence = value;
                break;
            case 'STATUS':
                event.status = value as ICSEvent['status'];
                break;
        }
    }

    // /**
    //  * 解析日期时间
    //  */
    // private parseDateTime(dateTimeStr: string, params: Record<string, string>): Date {
    //     // 处理日期格式：YYYYMMDD 或 YYYYMMDDTHHMMSS 或 YYYYMMDDTHHMMSSZ
    //     let cleanStr = dateTimeStr.replace(/[TZ]/g, '');

    //     if (cleanStr.length === 8) {
    //         // 仅日期 YYYYMMDD
    //         const year = parseInt(cleanStr.substring(0, 4));
    //         const month = parseInt(cleanStr.substring(4, 6)) - 1;
    //         const day = parseInt(cleanStr.substring(6, 8));
    //         return new Date(year, month, day);
    //     } else if (cleanStr.length >= 14) {
    //         // 日期时间 YYYYMMDDHHMMSS
    //         const year = parseInt(cleanStr.substring(0, 4));
    //         const month = parseInt(cleanStr.substring(4, 6)) - 1;
    //         const day = parseInt(cleanStr.substring(6, 8));
    //         const hour = parseInt(cleanStr.substring(8, 10));
    //         const minute = parseInt(cleanStr.substring(10, 12));
    //         const second = parseInt(cleanStr.substring(12, 14));

    //         const date = new Date(year, month, day, hour, minute, second);

    //         // 如果是UTC时间（以Z结尾），转换为本地时间
    //         if (dateTimeStr.endsWith('Z')) {
    //             return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    //         }

    //         return date;
    //     }

    //     return new Date();
    // }

    /**
     * 反转义文本
     */
    private unescapeText(text: string): string {
        return text
            .replace(/\\n/g, '\n')
            .replace(/\\,/g, ',')
            .replace(/\\;/g, ';')
            .replace(/\\\\/g, '\\');
    }

    /**
     * 格式化日期时间为可读格式
     */
    private formatDateTime(date: Date, isAllDay: boolean): string {
        if (isAllDay) {
            return date.toLocaleDateString('zh-CN');
        }
        return date.toLocaleString('zh-CN');
    }

    private formatDateOnly(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatShortTime(date: Date, isAllDay: boolean): string {
        if (isAllDay) {
            return '全天';
        }
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');
        return `${hour}:${minute}`;
    }

    private formatDateTimeCompact(date: Date, isAllDay: boolean): string {
        if (isAllDay) {
            return this.formatDateOnly(date);
        }
        return `${this.formatDateOnly(date)} ${this.formatShortTime(date, false)}`;
    }

    /**
     * 简单的模板变量替换
     */
    private renderTemplate(template: string, data: any): string {
        let result = template;

        // 处理普通占位符 {{variable}}
        result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            const value = data[key];
            if (value === undefined || value === null || value === '') {
                return '';
            }
            return String(value);
        });

        // 移除空行（包含只有空格的行）
        result = result.replace(/^\s*[\r\n]/gm, '').replace(/\n\s*\n/g, '\n');

        return result;
    }

    /**
     * 生成日程超级块内容
     * 返回渲染后的内容与可选的模板内指定块 ID（当模板包含 {{SYID}} 时生成并返回）
     */
    private async generateEventBlock(event: ICSEvent): Promise<{ content: string; blockId?: string }> {
        // 获取自定义模板内容，如果没有则使用默认内容
        const contentTemplate = this.settings['cal-ics-custom-template'] || this.getDefaultContentTemplate();

        // 准备模板数据
        const isAllDay = event.isAllDay === true;
        const startTimeStr = event.startTime ? this.formatDateTime(event.startTime, isAllDay) : '';
        const endTimeStr = event.endTime ? this.formatDateTime(event.endTime, isAllDay) : '';
        const startDateOnly = event.startTime ? this.formatDateOnly(event.startTime) : '';
        const endDateOnly = event.endTime ? this.formatDateOnly(event.endTime) : '';
        const startCompact = event.startTime ? this.formatDateTimeCompact(event.startTime, isAllDay) : '';
        const endCompact = event.endTime ? this.formatDateTimeCompact(event.endTime, isAllDay) : '';
        const shortStartTime = event.startTime ? this.formatShortTime(event.startTime, isAllDay) : '';
        const shortEndTime = event.endTime ? this.formatShortTime(event.endTime, isAllDay) : '';

        // 处理状态映射
        const statusMap = {
            'TENTATIVE': '待定',
            'CONFIRMED': '已确认',
            'CANCELLED': '已取消'
        };
        const statusText = event.status && statusMap[event.status] ? statusMap[event.status] : '';

        // 处理描述中的URL链接
        let processedDescription = event.description || '';
        if (processedDescription) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches: string[] = [];
            let match;
            while ((match = urlRegex.exec(event.description || '')) !== null) {
                matches.push(match[0]);
            }
            matches.forEach(url => {
                processedDescription = processedDescription.replace(url, `[${url}](${url})`);
            });
        }

        // 处理标签
        const tagsText = event.tags && event.tags.length > 0 ?
            event.tags.map(tag => `#${tag}`).join(' ') : '';

    // 仅当模板包含 {{SYID}} 时，生成一个思源块 ID 供模板内部使用（不绑定到最外层超级块）
    const needSYID = /\{\{\s*SYID\s*\}\}/.test(contentTemplate);
    const syid = needSYID ? await api.generateSiyuanID() as string : undefined;

        const templateData = {
            title: event.title || '',
            startTime: startTimeStr,
            endTime: endTimeStr,
            startDate: startDateOnly,
            endDate: endDateOnly,
            startDateTime: startCompact,
            endDateTime: endCompact,
            short_startTime: shortStartTime,
            short_endTime: shortEndTime,
            location: event.location || '',
            description: processedDescription,
            status: statusText,
            recurrence: event.recurrence || '',
            tags: tagsText,
            // 新增：模板可以使用 {{SYID}} 来引用该块 ID；若未启用则为空字符串
            SYID: syid ?? '',
        };

        // 渲染用户自定义的内容部分
        const renderedContent = this.renderTemplate(contentTemplate, templateData);

    // 包装成超级块并添加必要的属性（不在最外层绑定 SYID）
        const content = `{{{row
${renderedContent}
}}}
{: custom-ics-id="${event.uid}" custom-ics-event="true"}

{: custom-ics-id="null" }
`;

    return { content, blockId: syid };
    }

    /**
     * 获取默认模板内容（不包含超级块包装）
     */
    private getDefaultContentTemplate(): string {
        return `### {{title}}

开始时间： {{startTime}}
结束时间： {{endTime}}
地点： {{location}}
状态： {{status}}
标签： {{tags}}
描述：{{description}}
重复规则： {{recurrence}}`;
    }

    /**
     * 检查文档中是否已存在指定UID的日程
     */
    private async checkEventExists(_documentId: string, uid: string): Promise<boolean> {
        try {
            // const sqlStr = `
            //     SELECT id FROM blocks 
            //     WHERE root_id = '${documentId}' 
            //     AND ial LIKE '%${uid}%'
            // `;
            const sqlStr = `
                SELECT id FROM blocks 
                WHERE ial LIKE '%${uid}%'
            `;
            const result = await api.sql(sqlStr);
            return result.length > 0;
        } catch (error) {
            console.error('检查事件是否存在时出错:', error);
            return false;
        }
    }

    /**
    * 获取所有已导入到思源笔记中的ICS事件UID
    */
    private async getAllImportedEventUIDs(): Promise<Set<string>> {
        const importedUIDs = new Set<string>();
        try {
            // 查询包含特定自定义属性的块
            // 假设 'attributes' 列存储块的属性
            const sqlStr = `
                SELECT ial FROM blocks 
                WHERE ial LIKE '%custom-ics-event="true"%' 
                  AND ial LIKE '%custom-ics-id=%' limit 9999999
            `;
            const results: { ial: string }[] = await api.sql(sqlStr);

            const uidRegex = /custom-ics-id="([^"]+)"/;
            for (const row of results) {
                if (row.ial) {
                    const match = row.ial.match(uidRegex);
                    if (match && match[1]) {
                        importedUIDs.add(match[1]);
                    }
                }
            }


            // console.log(`Found ${importedUIDs.size} imported event UIDs from SiYuan.`);
        } catch (error) {
            console.error('获取已导入ICS事件UID时出错:', error);
            showMessage('获取已导入日程列表失败，更新检查可能不准确。', 3000, 'error');
        }
        // console.log("已导入的UIDs:");
        // for (const uid of importedUIDs) {
        //     console.log(uid);
        // }
        return importedUIDs;
    }

    /**
     * 在后台检查ICS源是否有更新
     */
    private async checkForUpdatesInBackground() {
        console.log('开始在后台检查ICS更新...');
        const icsUrl = this.settings['cal-ics-subscribe-url'];
        if (!icsUrl) {
            console.log('ICS订阅URL未设置，跳过更新检查。');
            return;
        }

        try {
            const icsContent = await this.fetchICSContent(icsUrl);
            const remoteEvents = this.parseICSContent(icsContent);

            if (remoteEvents.length === 0) {
                console.log('远程ICS源中未找到事件。');
                return;
            }

            const remoteEventUIDs = new Set(remoteEvents.map(event => event.uid));
            const localEventUIDs = await this.getAllImportedEventUIDs();

            let newEventCount = 0;
            for (const uid of remoteEventUIDs) {
                if (!localEventUIDs.has(uid)) {
                    newEventCount++;
                }
            }

            if (newEventCount > 0) {
                // 更换图标为历史图标，表示有新内容
                this.updateTopBarIcon("iconHistory");

                api.showStatusMessage(`检测到 ${newEventCount} 个新的ICS日程。请点击顶栏按钮手动导入。`, 7000, 'info');

            } else {
                console.log('未检测到新的ICS日程。');
                // 确保图标是原始状态
                this.updateTopBarIcon("iconArrowDown");
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('后台检查ICS更新时出错:', error);
            showMessage(`检查ICS日程更新失败: ${errorMessage}`, 5000, 'error');
        }
    }
    /**
   * 解析日期时间
   * 优化了对 UTC 和全天事件的处理
   */
    private parseDateTime(dateTimeStr: string, params: Record<string, string>): Date {
        const year = parseInt(dateTimeStr.substring(0, 4));
        const month = parseInt(dateTimeStr.substring(4, 6)) - 1; // JS months are 0-11
        const day = parseInt(dateTimeStr.substring(6, 8));

        if (params.VALUE === 'DATE' || dateTimeStr.length === 8) { // 全天事件
            // 对于全天事件，它代表一整天。
            // new Date(year, month, day) 会在本地时间的 00:00:00 创建它。
            return new Date(year, month, day);
        }

        // 期望格式 YYYYMMDDTHHMMSS 或 YYYYMMDDTHHMMSSZ
        if (dateTimeStr.length < 15 || dateTimeStr.indexOf('T') !== 8) { // 时间部分长度不足或格式不正确
            console.warn(`不支持的日期时间格式: ${dateTimeStr}, 将仅使用日期部分。`);
            return new Date(year, month, day); // 回退到仅日期
        }

        const hour = parseInt(dateTimeStr.substring(9, 11));
        const minute = parseInt(dateTimeStr.substring(11, 13));
        const second = parseInt(dateTimeStr.substring(13, 15));

        if (dateTimeStr.endsWith('Z')) {
            // UTC 时间
            return new Date(Date.UTC(year, month, day, hour, minute, second));
        } else {
            // 本地时间 (或浮动时间，解释为本地时间)
            // 注意：此实现未处理带有 TZID 参数的复杂时区情况。
            // 如需完整 TZID 支持，建议使用专门的 iCalendar 解析库。
            return new Date(year, month, day, hour, minute, second);
        }
    }

    /**
     * 新增：按事件日期将日程分别导入到不同的日记中
     */
    async importEventsToDailyNotes(icsUrl: string, notebookIdForDailyNotes: string): Promise<void> {
        try {
            showMessage('开始获取ICS文件 (日记模式)...', 3000, 'info');
            const icsContent = await this.fetchICSContent(icsUrl);
            showMessage('开始解析日程数据 (日记模式)...', 3000, 'info');
            const events = this.parseICSContent(icsContent);

            if (events.length === 0) {
                showMessage('未找到任何日程事件 (日记模式)', 3000);
                return;
            }

            showMessage(`解析到 ${events.length} 个日程事件，开始按日期导入到日记...`, 3000, 'info');

            let importedCount = 0;
            let skippedCount = 0;
            // 缓存 YYYYMMDD -> dailyNoteId，避免重复调用 createDailyNote
            const dailyNoteCache = new Map<string, string>();

            for (const event of events) {
                if (!event.startTime) {
                    console.warn(`事件 "${event.title}" (UID: ${event.uid}) 没有开始时间，无法按日期导入，已跳过。`);
                    skippedCount++;
                    continue;
                }

                // https://github.com/loonghfut/siyuan-steve-tools/issues/73
                // 识别标签
                if (event.description && event.description.includes('#')) {
                    // 匹配所有 #标签，支持中文、英文、数字
                    const tagMatches = event.description.match(/#([\u4e00-\u9fa5\w]+)/g);
                    if (tagMatches) {
                        // 去掉#号，只保留标签内容
                        event.tags = tagMatches.map(tag => tag.replace(/^#/, ''));
                        // 去除原文中的标签和其后紧挨的逗号（英文和中文逗号）
                        event.description = event.description.replace(/#([\u4e00-\u9fa5\w]+)[,，]?/g, '').trim();
                    } else {
                        event.tags = [];
                    }
                }
                console.log(`处理事件:taggggg `, event.tags);

                const eventYear = event.startTime.getFullYear();
                const eventMonth = (event.startTime.getMonth() + 1).toString().padStart(2, '0');
                const eventDay = event.startTime.getDate().toString().padStart(2, '0');
                // Siyuan API createDailyNote 需要的 forDate 格式: YYYYMMDD
                const forDateSiyuan = `${eventYear}${eventMonth}${eventDay}`;

                let dailyNoteId = dailyNoteCache.get(forDateSiyuan);

                if (!dailyNoteId) {
                    try {
                        console.log(`尝试为日期 ${forDateSiyuan} 在笔记本 ${notebookIdForDailyNotes} 中创建/获取日记`);
                        const dateForNote = new Date(eventYear, parseInt(eventMonth) - 1, parseInt(eventDay));
                        const dailyNoteResponse = await createDailynote(notebookIdForDailyNotes, dateForNote);
                        if (!dailyNoteResponse) {
                            showMessage(`无法为日期 ${forDateSiyuan} 创建或获取日记，跳过事件: ${event.title}`, 5000);
                            skippedCount++;
                            continue;
                        }
                        dailyNoteId = dailyNoteResponse;
                        dailyNoteCache.set(forDateSiyuan, dailyNoteId);
                        console.log(`获取/创建日期 ${forDateSiyuan} 的日记ID: ${dailyNoteId}`);
                    } catch (e) {
                        const errorMessage = e instanceof Error ? e.message : String(e);
                        console.error(`为日期 ${forDateSiyuan} 创建日记失败:`, e);
                        showMessage(`为日期 ${forDateSiyuan} 创建日记失败: ${errorMessage}`, 5000, 'error');
                        skippedCount++; // 如果日记创建失败，则跳过此事件
                        continue;
                    }
                }

                // 检查事件是否已在目标日记中存在
                const exists = await this.checkEventExists(dailyNoteId, event.uid);
                if (exists) {
                    skippedCount++;
                    console.log(`跳过已存在的日程: ${event.title} (UID: ${event.uid}) 于日记 ${dailyNoteId}`);
                    continue;
                }

                const { content: blockContent, blockId: targetBlockId } = await this.generateEventBlock(event);
                try {
                    console.log(`将事件反馈`, blockContent);
                    const result = await api.appendBlock("markdown", blockContent, dailyNoteId);

                    // 如果插入成功且启用了数据库功能，添加到数据库
                    if (result && this.settings['cal-ics-add-to-database']) {
                        // 优先使用模板生成的 SYID；否则回退解析 append 结果中的新块 ID
                        let useBlockId = targetBlockId;
                        if (!useBlockId && Array.isArray(result) && result.length > 0 && result[0].doOperations && result[0].doOperations.length > 0) {
                            useBlockId = result[0].doOperations[0].id;
                        }

                        if (useBlockId) {
                            await this.addBlockToDatabase(useBlockId, event);
                            console.log(`已将ICS事件 "${event.title}" 添加到数据库 (日记模式)`);
                        } else {
                            console.warn(`无法确定新创建块的ID，跳过添加到数据库 (日记模式): ${event.title}`);
                        }
                    }

                    importedCount++;
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    console.error(`将事件 "${event.title}" 导入到日记 ${dailyNoteId} 失败:`, e);
                    showMessage(`导入事件 "${event.title}" 失败: ${errorMessage}`, 3000, 'error');
                    skippedCount++; // 导入失败也计入跳过
                }

                // 添加小延时避免请求过快
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            showMessage(
                `日记模式导入完成！新增 ${importedCount} 个日程，跳过 ${skippedCount} 个日程。`,
                5000,
                importedCount > 0 || events.length === 0 ? 'info' : 'error' // 如果没有事件或有导入成功则为info
            );

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('按日记导入ICS日程失败:', error);
            showMessage(`按日记导入失败: ${errorMessage}`, -1, 'error');
        }
    }

    /**
     * 将日程插入到指定文档
     */
    async importEventsToDocument(icsUrl: string, documentId: string): Promise<void> {
        try {
            showMessage('开始获取ICS文件...', 3000, 'info');

            // 1. 获取ICS文件内容
            const icsContent = await this.fetchICSContent(icsUrl);

            showMessage('开始解析日程数据...', 3000, 'info');

            // 2. 解析ICS文件
            const events = this.parseICSContent(icsContent);

            if (events.length === 0) {
                showMessage('未找到任何日程事件', 3000);
                return;
            }

            showMessage(`解析到 ${events.length} 个日程事件，开始导入...`, 3000, 'info');

            // 3. 插入日程到文档
            let importedCount = 0;
            let skippedCount = 0;

            for (const event of events) {
                // 检查是否已存在
                const exists = await this.checkEventExists(documentId, event.uid);
                console.log(`检查UID: ${event.uid} 是否存在: ${exists}`);
                if (exists) {
                    skippedCount++;
                    console.log(`跳过已存在的日程: ${event.title} (UID: ${event.uid})`);
                    continue;
                }

                // https://github.com/loonghfut/siyuan-steve-tools/issues/73
                // 识别标签
                if (event.description && event.description.includes('#')) {
                    // 匹配所有 #标签，支持中文、英文、数字
                    const tagMatches = event.description.match(/#([\u4e00-\u9fa5\w]+)/g);
                    if (tagMatches) {
                        // 去掉#号，只保留标签内容
                        event.tags = tagMatches.map(tag => tag.replace(/^#/, ''));
                        // 去除原文中的标签和其后紧挨的逗号（英文和中文逗号）
                        event.description = event.description.replace(/#([\u4e00-\u9fa5\w]+)[,，]?/g, '').trim();
                    } else {
                        event.tags = [];
                    }
                }
                console.log(`处理事件:taggggg `, event.tags);

                // 生成超级块内容（带指定 SYID）
                const { content: blockContent, blockId: targetBlockId2 } = await this.generateEventBlock(event);

                // 插入到文档
                const result = await api.appendBlock("markdown", blockContent, documentId);
                console.log(`生成超级块内容: ${blockContent}`);
                // 如果插入成功且启用了数据库功能，添加到数据库
                if (result && this.settings['cal-ics-add-to-database']) {
                    // 优先使用模板生成的 SYID；否则回退解析 append 结果中的新块 ID
                    let useBlockId = targetBlockId2;
                    if (!useBlockId && Array.isArray(result) && result.length > 0 && result[0].doOperations && result[0].doOperations.length > 0) {
                        useBlockId = result[0].doOperations[0].id;
                    }

                    if (useBlockId) {
                        await this.addBlockToDatabase(useBlockId, event);
                        console.log(`已将ICS事件 "${event.title}" 添加到数据库`);
                    } else {
                        console.warn(`无法确定新创建块的ID，跳过添加到数据库: ${event.title}`);
                    }
                }

                importedCount++;

                // 添加小延时避免请求过快
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            showMessage(
                `导入完成！新增 ${importedCount} 个日程，跳过 ${skippedCount} 个重复日程`,
                5000,
                'info'
            );

        } catch (error) {
            console.error('导入ICS日程失败:', error);
            showMessage(`导入失败: ${error.message}`, -1, 'error');
        }
    }

    /**
     * 提供给插件调用的公共方法
     */
    async importFromICS(icsUrl: string, documentId?: string): Promise<void> {
        // 如果没有指定文档ID，获取当前打开的文档
        if (!documentId) {
            showMessage('请指定要导入到的文档ID', 3000, 'error');
            return;
        }

        await this.importEventsToDocument(icsUrl, documentId);
    }

    /**
     * 将块添加到指定数据库
     */
    private async addBlockToDatabase(blockId: string, event: ICSEvent): Promise<void> {
        // 检查是否启用数据库功能
        if (!this.settings['cal-ics-add-to-database']) {
            return;
        }

        const databaseId = this.settings['cal-ics-database-id'];
        if (!databaseId) {
            console.warn('ICS导入：未设置数据库ID，跳过添加到数据库');
            return;
        }

        try {
            // 添加块到数据库
            await api.addBlockToDatabase_pro(blockId, databaseId, blockId);
            console.log(`成功将块 ${blockId} 添加到数据库 ${databaseId}`);

            // 添加小延时确保块已添加到数据库
            await new Promise(resolve => setTimeout(resolve, 100));

            // 获取数据库的视图信息以便更新属性
            try {
                const viewValue = await this.getViewValueForDatabase(databaseId);
                if (viewValue) {
                    await this.updateDatabaseAttributes(blockId, databaseId, event, viewValue);
                }
            } catch (error) {
                console.warn('更新数据库属性时出错:', error);
                // 不抛出错误，因为块已经成功添加到数据库
            }

        } catch (error) {
            console.error(`添加块到数据库失败 (blockId: ${blockId}, databaseId: ${databaseId}):`, error);
            // 不抛出错误，避免影响导入流程
        }
    }

    /**
     * 获取数据库的视图信息
     */
    private async getViewValueForDatabase(databaseId: string): Promise<any> {
        try {
            // 获取模块实例
            const calendarModule = moduleInstances?.['M_calendar'];
            if (!calendarModule) {
                console.warn('无法获取日历模块实例');
                return null;
            }

            // 获取可用的数据库信息
            const avIds = await calendarModule.getAVreferenceid_pro();
            if (!avIds || avIds.length === 0) {
                console.warn('无法获取数据库引用ID');
                return null;
            }

            // 查找对应的数据库
            const targetDb = avIds.find(db => db.id === databaseId);
            if (!targetDb) {
                console.warn(`未找到数据库 ${databaseId}`);
                return null;
            }

            // 获取视图ID
            const avIdStrings = avIds.map(db => db.id);
            const viewIDs = await getViewId(avIdStrings);
            if (!viewIDs || viewIDs.length === 0) {
                console.warn('无法获取视图ID');
                return null;
            }

            // 获取视图值
            const viewValue = await getViewValue(viewIDs);
            return viewValue;

        } catch (error) {
            console.error('获取数据库视图信息失败:', error);
            return null;
        }
    }

    /**
     * 从视图数据中获取字段ID（简化版本）
     */
    private async getKeyIDfromViewValue(viewValue: any, keyName: string, databaseId: string): Promise<string | undefined> {
        try {
            if (!viewValue || !Array.isArray(viewValue)) {
                return undefined;
            }

            // 查找指定数据库的视图数据
            for (const view of viewValue) {
                if (view?.from?.rootid === databaseId && view?.data) {
                    for (const item of view.data) {
                        if (item && item[keyName] && item[keyName].keyID) {
                            return item[keyName].keyID;
                        }
                    }
                }
            }

            return undefined;
        } catch (error) {
            console.error(`获取字段ID失败 (keyName: ${keyName}):`, error);
            return undefined;
        }
    }

    /**
     * 更新数据库中块的属性
     */
    private async updateDatabaseAttributes(blockId: string, databaseId: string, event: ICSEvent, viewValue: any): Promise<void> {
        try {
            console.log(`更新数据库属性ICSICS`, event);

            // 批量更新：收集所有需要更新的字段
            const updatePromises: Promise<any>[] = [];
            const itemID = await api.getAttributeViewItemIDsByBoundIDs(databaseId, [blockId]).then(data => data[blockId]);
            if (!itemID) {
                console.warn(`无法获取块 ${blockId} 在数据库 ${databaseId} 中的 itemID，跳过属性更新`);
                return;
            }

            // 更新标题
            const titleKeyID = await this.getKeyIDfromViewValue(viewValue, '事件', databaseId);
            if (titleKeyID && event.title) {
                updatePromises.push(api.updateAttrViewCell_pro(blockId, databaseId, titleKeyID, itemID, event.title, "text"));
            }

            // 更新开始时间和结束时间
            const timeKeyID = await this.getKeyIDfromViewValue(viewValue, '开始时间', databaseId);
            if (timeKeyID && event.startTime) {
                const dateStr = event.startTime instanceof Date ? event.startTime.toISOString() : event.startTime;
                const endStr = event.endTime instanceof Date ? event.endTime.toISOString() : event.endTime;
                updatePromises.push(api.updateAttrViewCell_pro(blockId, databaseId, timeKeyID, itemID, dateStr, "date", endStr));
            }

            // 更新分类为"ICS导入"
            const categoryKeyID = await this.getKeyIDfromViewValue(viewValue, '分类', databaseId);
            if (categoryKeyID) {
                const categoryData = [{ content: "ICS导入" }];
                updatePromises.push(api.updateAttrViewCell_pro(blockId, databaseId, categoryKeyID, itemID, categoryData, "select"));
            }

            // 更新标签
            const tagKeyID = await this.getKeyIDfromViewValue(viewValue, '标签', databaseId);
            if (tagKeyID && event.tags && event.tags.length > 0) {
                const tagData = event.tags.map(tag => ({ content: tag }));
                updatePromises.push(api.updateAttrViewCell_pro(blockId, databaseId, tagKeyID, itemID, tagData, "mSelect"));
            }

            // 更新描述
            const noteKeyID = await this.getKeyIDfromViewValue(viewValue, '描述', databaseId);
            if (noteKeyID && event.description) {
                updatePromises.push(api.updateAttrViewCell_pro(blockId, databaseId, noteKeyID, itemID, event.description, "text"));
            }

            // 等待所有更新完成
            await Promise.all(updatePromises);

        } catch (error) {
            console.error('更新数据库属性失败:', error);
            // 不抛出错误，避免影响导入流程
        }
    }
}