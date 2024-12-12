import steveTools from "@/index";
import { createEvents, EventAttributes } from 'ics';
import * as api from "@/api"

export const calendarpath = 'data/public/stevetools/calendar.ics';
export const eventsPath = 'data/public/stevetools/events.json';

const Mevents: EventAttributes =
{
    start: [2024, 12, 22, 10, 0],
    duration: { hours: 1, minutes: 30 },
    title: 'Meeting with Bob',
    description: 'Discuss project updates',
    location: 'Office',
    // url: 'http://example.com',
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    // organizer: { name: 'Alice', email: 'alice@example.com' },
    attendees: [
        { name: 'Bob', email: 'bob@example.com' }
    ]
}


export class M_calendar {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    init() {
        console.log("ModuleB initialized");
        //         this.plugin.addIcons(`<symbol id="iconFace" viewBox="0 0 32 32">
        //             <path d="M13.667 "></path>
        //             </symbol>
        // `);
        this.checkAndCreateEventsFile(eventsPath);
        this.plugin.addTopBar({
            icon: "iconSearch",
            title: "SteveTools",
            position: "right",
            callback: async () => {
                await this.addEvent(Mevents, eventsPath);
                await this.generateICSFromEventsFile(eventsPath, calendarpath);
            }
        });
    }

    doSomethingElse() {
        console.log("ModuleB is doing something else");
    }
    onunload() {
        console.log("M_calendar unloaded");
    }

    // 生成ICS文件
    async generateICS(events: EventAttributes[], filePath: string) {
        try {
            // 使用ics库生成ICS内容
            const { error, value: icsContent } = createEvents(events);

            if (error) {
                console.error('生成ICS内容时出错：', error);
                return;
            }

            // 将ICS内容转换为Blob
            const fileBlob = new Blob([icsContent], { type: 'text/calendar' });

            // 使用api.putFile上传文件
            const response = await api.putFile(filePath, false, fileBlob);
            this.plugin.outlog(response);
        } catch (error) {
            console.error('上传ICS文件时出错：', error);
        }
    }

    // 保存事件数据到JSON文件
    async saveEvents(events: EventAttributes[], filePath: string) {
        try {
            const eventsJson = JSON.stringify(events);
            const fileBlob = new Blob([eventsJson], { type: 'application/json' });
            await api.putFile(filePath, false, fileBlob);
            this.plugin.outlog('事件数据已保存到' + filePath);
        } catch (error) {
            console.error('保存事件数据时出错：', error);
        }
    }

    // 从JSON文件生成ICS文件
    async generateICSFromEventsFile(jsonFilePath: string, icsFilePath: string) {
        try {
            // 使用api.getFileBlob读取JSON文件
            const eventsBlob = await api.getFileBlob(jsonFilePath);
            if (!eventsBlob) {
                console.error('读取事件数据失败');
                return;
            }
            const eventsJson = await eventsBlob.text();
            const events: EventAttributes[] = JSON.parse(eventsJson);

            // 使用ics库生成ICS内容
            const { error, value: icsContent } = createEvents(events);
            if (error) {
                console.error('生成ICS内容时出错：', error);
                return;
            }

            // 将ICS内容转换为Blob
            const fileBlob = new Blob([icsContent], { type: 'text/calendar' });

            // 使用api.putFile上传ICS文件
            await api.putFile(icsFilePath, false, fileBlob);
            this.plugin.outlog('ICS文件已生成到' + icsFilePath);
        } catch (error) {
            console.error('生成ICS文件时出错：', error);
        }
    }

    // 添加新事件到JSON文件
    async addEvent(newEvent: EventAttributes, jsonFilePath: string) {
        try {
            // 读取现有的事件数据
            const eventsBlob = await api.getFileBlob(jsonFilePath);
            let events: EventAttributes[] = [];
            if (eventsBlob) {
                const eventsJson = await eventsBlob.text();
                events = JSON.parse(eventsJson);
            }

            // 将新事件添加到事件数组
            events.push(newEvent);

            // 将更新后的事件数组保存回JSON文件
            const updatedEventsJson = JSON.stringify(events);
            const fileBlob = new Blob([updatedEventsJson], { type: 'application/json' });
            await api.putFile(jsonFilePath, false, fileBlob);
            this.plugin.outlog('新事件已添加并保存到' + jsonFilePath);
        } catch (error) {
            console.error('添加事件时出错：', error);
        }
    }

    // 检查并创建events.json文件
    async checkAndCreateEventsFile(filePath: string) {
        try {
            const response = await api.getFile(filePath);
            this.plugin.outlog(response);
            if (response.code === 404) {//TODO待改进判断
                // 如果文件不存在，创建一个空的events.json文件
                const emptyEvents: EventAttributes[] = [];
                const eventsJson = JSON.stringify(emptyEvents);
                const fileBlob = new Blob([eventsJson], { type: 'application/json' });
                await api.putFile(filePath, false, fileBlob);
                this.plugin.outlog('已创建空的 ' + filePath);
            } else {
                this.plugin.outlog(filePath + ' 文件已存在');
            }
        } catch (error) {
            console.error('检查或创建 events.json 文件时出错：', error);
        }
    }
}