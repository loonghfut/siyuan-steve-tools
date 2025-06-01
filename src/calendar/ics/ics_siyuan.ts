import * as api from "@/api";
import { showMessage } from "siyuan";
import steveTools, { settingdata } from "@/index";

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
            title: "导入ICS日程",
            position: "right",
            callback: async () => {
                if (!this.settings['cal-ics-subscribe-import-note-id']) {
                    showMessage('请先设置导入日记的ID', 3000, 'error');
                    return;
                }
                if (!this.settings['cal-ics-subscribe-url']) {
                    showMessage('请先设置ICS订阅URL', 3000, 'error');
                    return;
                }
                const dayid = await api.createDailyNote(window.siyuan.ws.app.appId, this.settings['cal-ics-subscribe-import-note-id'])
                console.log('创建的日记ID:', dayid);
                if (!dayid.id) {
                    showMessage('无法创建日记，请检查设置的ID是否正确', 3000, 'error');
                    return;
                }
                await this.importFromICS(this.settings['cal-ics-subscribe-url'], dayid.id);
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

    /**
     * 解析日期时间
     */
    private parseDateTime(dateTimeStr: string, params: Record<string, string>): Date {
        // 处理日期格式：YYYYMMDD 或 YYYYMMDDTHHMMSS 或 YYYYMMDDTHHMMSSZ
        let cleanStr = dateTimeStr.replace(/[TZ]/g, '');

        if (cleanStr.length === 8) {
            // 仅日期 YYYYMMDD
            const year = parseInt(cleanStr.substring(0, 4));
            const month = parseInt(cleanStr.substring(4, 6)) - 1;
            const day = parseInt(cleanStr.substring(6, 8));
            return new Date(year, month, day);
        } else if (cleanStr.length >= 14) {
            // 日期时间 YYYYMMDDHHMMSS
            const year = parseInt(cleanStr.substring(0, 4));
            const month = parseInt(cleanStr.substring(4, 6)) - 1;
            const day = parseInt(cleanStr.substring(6, 8));
            const hour = parseInt(cleanStr.substring(8, 10));
            const minute = parseInt(cleanStr.substring(10, 12));
            const second = parseInt(cleanStr.substring(12, 14));

            const date = new Date(year, month, day, hour, minute, second);

            // 如果是UTC时间（以Z结尾），转换为本地时间
            if (dateTimeStr.endsWith('Z')) {
                return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
            }

            return date;
        }

        return new Date();
    }

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
        content += `状态： ${statusMap[event.status] || '未知'}\n\n`;

        // 添加描述
        if (event.description) {
            content += `描述：\n\n${event.description}\n\n`;
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
            const sqlStr = `
                SELECT id FROM blocks 
                WHERE root_id = '${documentId}' 
                AND ial LIKE '%${uid}%'
            `;
            const result = await api.sql(sqlStr);
            return result.length > 0;
        } catch (error) {
            console.error('检查事件是否存在时出错:', error);
            return false;
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
                console.log(`生成超级块内容: ${blockContent}`);
                // 插入到文档
                await api.appendBlock("markdown", blockContent, documentId);
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