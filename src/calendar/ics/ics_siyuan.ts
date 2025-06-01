import * as api from "@/api";
import { showMessage } from "siyuan";
import steveTools, { settingdata } from "@/index";
import { createDailynote } from "@frostime/siyuan-plugin-kits";

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
}

export class ICSImporter {
    private plugin: steveTools;
    private processedEventUIDs: Set<string> = new Set();
    private settings: any;

    constructor(plugin: steveTools) {
        this.plugin = plugin;
        this.settings = settingdata;
        this.init();
    }

    async init() {
        console.log('ICSImporter init called');
        //获取日记id
this.plugin.addTopBar({
            icon: "iconSTcal",
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

                if (importMode === 'daily-notes') {
                    await this.importEventsToDailyNotes(icsUrl, notebookIdForImport);
                } else { // 'single-document' 模式 (原行为：在指定笔记本中创建新日记)
                    // 为今天在指定的笔记本中创建一个新的日记文档
                    const dailyNoteResponse = await api.createDailyNote(window.siyuan.ws.app.appId, notebookIdForImport);
                    console.log('创建的日记ID (单文档模式):', dailyNoteResponse);
                    if (!dailyNoteResponse || !dailyNoteResponse.id) {
                        showMessage('无法创建日记 (单文档模式)，请检查设置的笔记本ID是否正确', 3000, 'error');
                        return;
                    }
                    // 将所有日程导入到这个新创建的日记文档中
                    await this.importEventsToDocument(icsUrl, dailyNoteResponse.id);
                }
            }
        })
    }


    /**
     * 从URL获取ICS文件内容
     */
    private async fetchICSContent(url: string): Promise<string> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error('获取ICS文件失败:', error);
            throw new Error(`无法获取ICS文件: ${error.message}`);
        }
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

        return events;
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

    /**
     * 生成日程超级块内容
     */
    private generateEventBlock(event: ICSEvent): string {
        const startTimeStr = this.formatDateTime(event.startTime, event.isAllDay);
        const endTimeStr = event.endTime ? this.formatDateTime(event.endTime, event.isAllDay) : '';

        let content = `{{{row\n`;
        content += `### ${event.title}\n\n`;

        // 添加时间信息
        if (event.isAllDay) {
            content += `日期： ${startTimeStr}\n\n`;
        } else {
            content += `开始时间： ${startTimeStr}\n\n`;
            if (endTimeStr) {
                content += `结束时间： ${endTimeStr}\n\n`;
            }
        }

        // 添加地点
        if (event.location) {
            content += `地点： ${event.location}\n\n`;
        }

        // 添加状态
        const statusMap = {
            'TENTATIVE': '待定',
            'CONFIRMED': '已确认',
            'CANCELLED': '已取消'
        };
        if (event.status && statusMap[event.status]) {
            content += `状态： ${statusMap[event.status]}\n\n`;
        }

        // 添加描述
        if (event.description) {
            // Regex to find URLs
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            let processedDescription = event.description;
            let match;
            // Store matches to avoid modifying the string while iterating
            const matches = [];
            while ((match = urlRegex.exec(event.description)) !== null) {
            matches.push(match[0]);
            }
            // Replace URLs with Markdown links
            matches.forEach(url => {
            processedDescription = processedDescription.replace(url, `[${url}](${url})`);
            });
            content += `描述：\n\n${processedDescription}\n\n`;
        }

        // 添加重复规则
        if (event.recurrence) {
            content += `重复规则： ${event.recurrence}\n\n`;
        }

        // 添加唯一标识符（隐藏在属性中）
        content += `}}}\n{: custom-ics-id="${event.uid}" custom-ics-event="true"}`;

        return content;
    }

    /**
     * 检查文档中是否已存在指定UID的日程
     */
    private async checkEventExists(documentId: string, uid: string): Promise<boolean> {
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

                const blockContent = this.generateEventBlock(event);
                try {
                    await api.prependBlock("markdown", blockContent, dailyNoteId);
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

                // 生成超级块内容
                const blockContent = this.generateEventBlock(event);
                // console.log(`生成超级块内容: ${blockContent}`);
                // 插入到文档
                await api.prependBlock("markdown", blockContent,documentId);
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
}