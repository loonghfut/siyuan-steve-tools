import steveTools from "@/index";
import { createEvents, EventAttributes } from 'ics';
import * as api from "@/api"
import { showMessage } from "siyuan";
import { addSettings } from './calsettings';

export const calendarpath = 'data/public/stevetools/calendar.ics';
export const eventsPath = 'data/public/stevetools/events.json';
export const cal_id = '';
let allEvents: EventAttributes[] = [];

export class M_calendar {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    init() {
        addSettings(this.plugin.settingUtils);
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
                await this.getEventsFromSiYuanDatabase()
                // await this.addEvent(Mevents, eventsPath);
                // await this.generateICSFromEventsFile(eventsPath, calendarpath);
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
            // console.log(await fileBlob.text());
            this.plugin.outlog('新事件已添加并保存到' + jsonFilePath);
        } catch (error) {
            console.error('添加事件时出错：', error);
        }
    }

    // 检查并创建events.json文件
    async checkAndCreateEventsFile(filePath: string) {
        try {
            const response = await api.getFile(filePath);
            // this.plugin.outlog(response);
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

    // 从思源数据库中获取日程信息数据库的av-id
    async getAVreferenceid() {
        const sqlStr = `SELECT markdown
        FROM blocks
        WHERE name = '日程'
        AND markdown LIKE '%NodeAttributeView%data-av-id%';`
            ;
        const res = await api.sql(sqlStr);
        console.log(res);
        const avIds = res.map(item => extractDataAvId(item.markdown)).filter(id => id !== null);
        console.log(avIds); // 输出: ['20241213113357-m9b143e', ...]
        return avIds;
    }

    // 从思源数据库中获取日程信息
    async getEventsFromSiYuanDatabase() {
        const avIds = await this.getAVreferenceid();
        allEvents = [];
        for (const avId of avIds) {
            // const response = await api.getFile(`data/storage/av/${avId}.json`);
            const response = await api.renderAttributeView(avId);
            console.log(response);
            if (response && response.view) {
                const result = response.view.rows.map(row => {
                    return {
                        blockContent: row.cells[0]?.value?.block?.content || 'N/A',
                        dateContent2: row.cells[1]?.value?.date?.content2 || 0,
                        dateContent: row.cells[1]?.value?.date?.content || 0,
                        textContent: row.cells[2]?.value?.text?.content || 'N/A'
                    };
                });
                await this.runAddEvent(result);
                console.log(result);

            } else {
                console.error(`Invalid response for avId ${avId}:`, response);
            }
        }
        // console.log(events);
        await this.uploadAllEventsToFile(eventsPath);
        await this.generateICSFromEventsFile(eventsPath, calendarpath);
    }

    async runAddEvent(result: any) {
        let i = 0;
        for (const item of result) {
            //检测item是否符合要求
            if (!item.dateContent || !item.dateContent2 || !item.textContent || !item.blockContent) {
                console.log('Invalid event data:', item);
                i++;
                showMessage('存在不符合要求的数据（请检查数据库格式），已跳过'+i+'条数据',6000,"info","tiao");
                continue;
            }
            const endtime = convertTimestampToArray(item.dateContent2);
            const starttime = convertTimestampToArray(item.dateContent);
            const description = item.textContent;
            const title = item.blockContent;

            const newEvent: EventAttributes = {
                start: starttime,
                startInputType: 'local',
                startOutputType: 'local',
                end: endtime, // 指定结束时间
                endInputType: 'local',
                endOutputType: 'local',
                title: title,
                description: description
                // location: 'Office'
            }
            await this.addEventToGlobal(newEvent);
            // console.log(newEvent,"ttttiaos");
        }
    }

    // 添加新事件到全局变量
    async addEventToGlobal(newEvent: EventAttributes) {
        try {
            // 将新事件添加到全局事件数组
            allEvents.push(newEvent);
            this.plugin.outlog('新事件已添加到全局变量');
        } catch (error) {
            console.error('添加事件到全局变量时出错：', error);
        }
    }

    // 上传全局事件数据到JSON文件
    async uploadAllEventsToFile(jsonFilePath: string) {
        try {
            // 将全局事件数组保存回JSON文件
            const updatedEventsJson = JSON.stringify(allEvents);
            const fileBlob = new Blob([updatedEventsJson], { type: 'application/json' });
            await api.putFile(jsonFilePath, false, fileBlob);
            this.plugin.outlog('所有事件已保存到' + jsonFilePath);
        } catch (error) {
            console.error('上传事件到文件时出错：', error);
        }
    }

}



function extractDataAvId(markdown: string): string | null {
    const regex = /data-av-id="([^"]+)"/;
    const match = markdown.match(regex);
    return match ? match[1] : null;
}


function convertTimestampToArray(timestamp: number): [number, number, number, number, number] {
    const date = new Date(timestamp);
    const offset = 8 * 60; // 东八区的偏移量，单位为分钟
    const localDate = new Date(date.getTime() + offset * 60 * 1000);
    return [
        localDate.getUTCFullYear(),
        localDate.getUTCMonth() + 1, // 月份从0开始，所以需要加1
        localDate.getUTCDate(),
        localDate.getUTCHours(),
        localDate.getUTCMinutes()
    ];
}



