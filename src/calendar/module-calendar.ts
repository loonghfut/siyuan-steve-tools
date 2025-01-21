import steveTools from "@/index";
import { createEvents, EventAttributes } from 'ics';
import * as api from "@/api"
import { showMessage, openTab, Dialog } from "siyuan";
import * as ic from "@/icon"
declare const siyuan: any;
import { run } from "./calendar";
export let calendarpath = 'data/public/stevetools/calendar.ics';
let calendarpath2 = 'public/stevetools/calendar.ics';//订阅地址
export const eventsPath = 'data/public/stevetools/events.json';
export const cal_id = '';
export let linkToCalendar = '';
import * as myF from "./myF";
let allEvents: EventAttributes[] = [];

let this_settingdata: any = {};
let islisten = true;

export class M_calendar {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    private isUpdating: boolean = false;
    public av_ids: any;

    async init(settingdata) {
        this_settingdata = settingdata;
        calendarpath = `data/public/stevetools/${settingdata["cal-url"]}`;
        calendarpath2 = `public/stevetools/${settingdata["cal-url"]}`;
        steveTools.outlog(calendarpath);
        this.plugin.addIcons(`
    <symbol id="iconSTcal" viewBox="0 0 500 500">
       ${ic.steveTools_cal}
    </symbol>  
        `);
        this.checkAndCreateEventsFile(eventsPath);
        linkToCalendar = calendarpath2;
        this.plugin.eventBus.on("loaded-protyle-dynamic", this.avButton.bind(this));
        // this.plugin.eventBus.on("loaded-protyle-static", this.avButton.bind(this));
        this.plugin.eventBus.on("switch-protyle", this.avButton.bind(this));

        // steveTools.outlog(this_settingdata["cal-hand-update"]);
        if (this_settingdata["cal-hand-update"] == true) {
            this.plugin.addTopBar({
                icon: "iconSTcal",
                title: "立刻生成ics文件",
                position: "right",
                callback: async () => {
                    await this.getEventsFromSiYuanDatabase()
                    showMessage("日历文件生成结束", 3000, "info");
                    // await this.addEvent(Mevents, eventsPath);
                    // await this.generateICSFromEventsFile(eventsPath, calendarpath);
                }
            });
        }
        if (this_settingdata["cal-show-view"] == true) {
            this.plugin.addTopBar({
                icon: "iconCalendar",
                title: "日程视图",
                position: "left",
                callback: async () => {
                    await this.openRiChengView();
                }
            });
        }

        if (this_settingdata["cal-auto-update"] == true) {
            steveTools.outlog("自动更新日历文件");
            //监听
            siyuan.ws.ws.addEventListener('message', async (e) => {
                if (!islisten) {
                    return;
                }
                // if (1) { return; }
                const msg = JSON.parse(e.data);
                if (msg.cmd === "transactions") {
                    // steveTools.outlog(msg);
                    if (msg.data[0].doOperations[0].action === "updateAttrViewCell") {//BUG:同时添加会崩溃，无法稳定复现
                        // steveTools.outlog("更新了一个属性视图");
                        const avids = await this.getAVreferenceid();
                        //加上周期
                        const avids_zq = await this.getAVreferenceid('周期');
                        steveTools.outlog(avids);
                        if (avids.includes(msg.data[0].doOperations[0].avID) || avids_zq.includes(msg.data[0].doOperations[0].avID)) {
                            steveTools.outlog("更新了日程信息");
                            //延时执行
                            this.avButton();//数据库每次更新都会重新加载页面
                            if (!this.isUpdating) {
                                this.isUpdating = true;
                                setTimeout(async () => {
                                    await this.getEventsFromSiYuanDatabase();
                                    steveTools.outlog("更新日历文件<2>");
                                    this.isUpdating = false;
                                }, 3000);
                            }
                        } else {
                            // steveTools.outlog("avID 不在 avids 数组中");
                        }
                    }

                }
                // steveTools.outlog(msg);
            });

            //每15分钟调用一次await this.getEventsFromSiYuanDatabase()
            setInterval(async () => {
                await this.getEventsFromSiYuanDatabase()
                steveTools.outlog("自动更新日历文件<1>");
            }, 600000);
        }
    }

    async onLayoutReady() {
        this.av_ids = await this.getAVreferenceid_pro();
        const targetNode = document.body;
        const config = { childList: true, subtree: true };
        const observer = new MutationObserver(this.callback.bind(this)); // 监听点击数据库按键的弹窗变化
        observer.observe(targetNode, config);
    }

    async callback(mutationsList: MutationRecord[]) {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.removedNodes.forEach(async (node) => {
                    if (node instanceof HTMLElement && node.matches('div[data-key="dialog-attr"].b3-dialog--open')) {
                        // steveTools.outlog('Dialog closed');
                        await this.getEventsFromSiYuanDatabase();
                        islisten = true;
                    }
                });
                mutation.addedNodes.forEach(async (node) => {
                    if (node instanceof HTMLElement && node.matches('div[data-key="dialog-attr"]')) {
                        // steveTools.outlog('Dialog opened');
                        islisten = false;
                    }
                });
            }
        }
    };


    private avButton() {
        setTimeout(async () => {
            const targetSpans = Array.from(document.querySelectorAll('span[data-type="av-add-more"]'))
                .filter(span => span.closest('[name="日程"]') || span.closest('[name="周期"]'));
            // steveTools.outlog(targetSpans, "targetSpans");

            targetSpans.forEach(targetSpan => {
                // 检查目标元素的右边是否已经存在按钮
                if (!targetSpan.nextSibling || !(targetSpan.nextSibling instanceof HTMLElement) || !targetSpan.nextSibling.classList.contains('my-plugin-button')) {
                    // 创建一个新的按钮元素
                    const button = document.createElement('button');
                    button.innerText = '日程视图';
                    button.className = 'block__icon ariaLabel my-plugin-button'; // 确保样式统一，并添加一个标识类

                    // 添加按钮点击事件
                    button.addEventListener('click', async () => {
                        steveTools.outlog('按钮被点击了');
                        await this.openRiChengViewDialog();
                    });
                    // 将按钮插入到目标 <span> 元素的右边
                    targetSpan.parentNode.insertBefore(button, targetSpan.nextSibling);
                }
            });
        }, 500); // 延迟 500 毫秒
    }

    async openRiChengViewDialog() {

        const id = new Date().getTime().toString();
        let calendar: any;
        const dialog = new Dialog({
            title: null,
            content: `<div><div id='calendar-${id}' class="mb-3"></div></div>`,
            width: '70%',
            height: '86.66%',
            disableClose: false,
            hideCloseIcon: true,
            resizeCallback: () => {
                calendar.updateSize();
            },
        });

        setTimeout(async () => {
            calendar = await run(id);
        }, 100);
    }

    async openRiChengView() {

        // steveTools.outlog(viewValue);
        //时间戳
        const id = new Date().getTime().toString();
        let calendar: any;
        const tab = await openTab({
            app: window.siyuan.ws.app,
            custom: {
                icon: "iconSTcal",
                title: `日程视图`,
                // data: {
                //     text: "This is my custom tab",
                // },
                id: this.plugin.name + 'calview',
            },
            // position: "right",
            keepCursor: false
        });
        steveTools.outlog(tab);
        tab.panelElement.innerHTML = `
      <div  id='calendarfu-${id}' ><div id='calendar-${id}' ></div></div>`;
        calendar = await run(id);
        const calendarDiv = document.getElementById(`calendar-${id}`);
        if (calendarDiv) {
            const resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    // steveTools.outlog('Calendar container resized:', width, height);
                    if (width == 0 || height == 0) {
                        // resizeObserver.disconnect();
                        steveTools.outlog('ResizeObserver disconnected');
                    }
                    // 如果日历组件有 resize 方法，在这里调用
                    calendar.updateSize();
                }
            });
            //如果已存在resizeObserver则先断开
            resizeObserver.disconnect();
            resizeObserver.observe(calendarDiv);
        }

    }


    onunload() {
        steveTools.outlog("M_calendar unloaded");
    }

    getCalUrl() {
        // steveTools.outlog(this_settingdata["cal-enable"]);
        if (this_settingdata["cal-enable"] == true) {
            const currentHost = "（思源伺服地址）";
            // linkToCalendar = currentHost + "/" + calendarpath2;
            showMessage("日历订阅链接：" + currentHost + "/" + calendarpath2 + "", 0, "info");
            return
        }
        showMessage("请先启用日历订阅模块", 6000, "info");
    }
    // 生成ICS文件
    // async generateICS(events: EventAttributes[], filePath: string) {
    //     try {
    //         // 使用ics库生成ICS内容
    //         const { error, value: calendarContent } = createEvents(events.map(event => {
    //             const defaultStart: [number, number, number] = [
    //                 new Date().getFullYear(),
    //                 new Date().getMonth() + 1,
    //                 new Date().getDate()
    //             ];
    //             return {
    //                 ...event,
    //                 // 确保必要字段存在且格式正确
    //                 start: event.start || defaultStart,
    //                 title: event.title || '未命名事件'
    //             };
    //         }));

    //         if (error) {
    //             console.error('生成ICS内容时出错：', error);
    //             return;
    //         }

    //         // 将ICS内容转换为Blob
    //         const fileBlob = new Blob([calendarContent], { type: 'text/calendar' });

    //         // 使用api.putFile上传文件
    //         const response = await api.putFile(filePath, false, fileBlob);
    //         steveTools.outlog(response);
    //     } catch (error) {
    //         console.error('上传ICS文件时出错：', error);
    //     }
    // }

    // 保存事件数据到JSON文件
    async saveEvents(events: EventAttributes[], filePath: string) {
        try {
            const eventsJson = JSON.stringify(events);
            const fileBlob = new Blob([eventsJson], { type: 'application/json' });
            await api.putFile(filePath, false, fileBlob);
            steveTools.outlog('事件数据已保存到' + filePath);
        } catch (error) {
            console.error('保存事件数据时出错：', error);
        }
    }

    // 从JSON文件生成ICS文件
    // 新增转换函数
    // private convertArrayTimeToDate(timeArray: number[]): [number, number, number, number, number] {
    //     return [timeArray[0], timeArray[1], timeArray[2], timeArray[3] || 0, timeArray[4] || 0];
    // }

    private convertEventFormat(eventData: any[][]): EventAttributes[] {
        const events: EventAttributes[] = [];

        // 处理常规事件数组
        if (Array.isArray(eventData[0])) {
            eventData[0].forEach((event: any) => {
                events.push({
                    start: event.start,
                    end: event.end,
                    title: event.title,
                    description: event.description,
                    status: event.status
                });
            });
        }

        // 处理周期性事件
        if (Array.isArray(eventData[1])) {
            eventData[1].forEach((recurringEvent: any) => {
                events.push({
                    start: recurringEvent.start,
                    title: recurringEvent.title,
                    description: recurringEvent.description,
                    recurrenceRule: recurringEvent.recurrenceRule,
                    duration: recurringEvent.duration // Add default duration of 1 hour for recurring events
                });
            });
        }

        return events;
    }

    // 修改后的generateICSFromEventsFile函数
    async generateICSFromEventsFile(jsonFilePath: string, icsFilePath: string) {
        try {
            const eventsBlob = await api.getFileBlob(jsonFilePath);
            if (!eventsBlob) {
                console.error('读取事件数据失败');
                return;
            }
            const eventsJson = await eventsBlob.text();
            const rawEvents = JSON.parse(eventsJson);

            // 使用新的转换函数
            const convertedEvents = this.convertEventFormat(rawEvents);

            // 生成ICS内容
            const { error, value: icsContent } = createEvents(convertedEvents);
            if (error) {
                console.error('生成ICS内容时出错：', error);
                return;
            }

            const fileBlob = new Blob([icsContent], { type: 'text/calendar' });
            await api.putFile(icsFilePath, false, fileBlob);
            steveTools.outlog('ICS文件已生成到' + icsFilePath);
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
            // steveTools.outlog(await fileBlob.text());
            steveTools.outlog('新事件已添加并保存到' + jsonFilePath);
        } catch (error) {
            console.error('添加事件时出错：', error);
        }
    }

    // 检查并创建events.json文件
    async checkAndCreateEventsFile(filePath: string) {
        try {
            const response = await api.getFile(filePath);
            // steveTools.outlog(response);
            if (response.code === 404) {//TODO待改进判断
                // 如果文件不存在，创建一个空的events.json文件
                //删除其他.ics文件
                const emptyEvents: EventAttributes[] = [];
                const eventsJson = JSON.stringify(emptyEvents);
                const fileBlob = new Blob([eventsJson], { type: 'application/json' });
                await api.putFile(filePath, false, fileBlob);
                steveTools.outlog('已创建空的 ' + filePath);
            } else {
                steveTools.outlog(filePath + ' 文件已存在');
            }
        } catch (error) {
            console.error('检查或创建 events.json 文件时出错：', error);
        }
    }

    // 从思源数据库中获取日程信息数据库的av-id
    async getAVreferenceid(forwhat: string = '日程') {
        const sqlStr = `SELECT markdown
        FROM blocks
        WHERE name = '${forwhat}'
        AND markdown LIKE '%NodeAttributeView%data-av-id%';`
            ;
        const res = await api.sql(sqlStr);
        steveTools.outlog(res);
        const avIds = res.map(item => extractDataAvId(item.markdown)).filter(id => id !== null);
        steveTools.outlog(avIds); // 输出: ['20241213113357-m9b143e', ...]
        return avIds;

    }
    async getAVreferenceid_pro(forwhat: string = '日程') {
        const sqlStr = `SELECT markdown, content 
        FROM blocks 
        WHERE name = '${forwhat}'
        AND markdown LIKE '%NodeAttributeView%data-av-id%';`;

        const res = await api.sql(sqlStr);
        // steveTools.outlog("RES:::::::::",res);
        steveTools.outlog(res);

        const avIds = res.map(item => ({
            id: extractDataAvId(item.markdown),
            name: item.content?.split(' ')[0] || 'N/A'
        })).filter(item => item.id !== null);

        steveTools.outlog(avIds); // 输出: [{id: '20241213113357-m9b143e', name: '...'}, ...]
        steveTools.outlog("avIds", avIds);
        return avIds;
    }
    // 从思源数据库中获取日程信息
    // 辅助函数
    private getColumnIdByName(columns: any[], name: string): string {
        const column = columns.find(col => col.name === name);
        return column?.id || '';
    }

    private getCellValue(cells: any[], columnId: string) {
        const cell = cells.find(cell => cell.value.keyID === columnId);
        return cell?.value;
    }

    private processRegularEvents(response: any) {
        const { columns, rows } = response.view;

        // 获取列ID
        const eventColumnId = this.getColumnIdByName(columns, "事件");
        const dateColumnId = this.getColumnIdByName(columns, "开始时间");
        const descColumnId = this.getColumnIdByName(columns, "描述");
        const statusColumnId = this.getColumnIdByName(columns, "状态");

        return rows.map(row => {
            const eventValue = this.getCellValue(row.cells, eventColumnId);
            const dateValue = this.getCellValue(row.cells, dateColumnId);
            const descValue = this.getCellValue(row.cells, descColumnId);
            const statusValue = this.getCellValue(row.cells, statusColumnId);

            return {
                blockContent: eventValue?.block?.content || 'N/A',
                dateContent: dateValue?.date?.content || 0,
                dateContent2: dateValue?.date?.content2 || 0,
                textContent: descValue?.text?.content || 'N/A',
                status: statusValue?.mSelect?.[0]?.content || '未完成2'
            };
        });
    }

    private processRecurringEvents(response: any) {
        const { columns, rows } = response.view;

        // 获取列ID
        const eventColumnId = this.getColumnIdByName(columns, "事件");
        const dateColumnId = this.getColumnIdByName(columns, "开始时间");
        const durationColumnId = this.getColumnIdByName(columns, "持续时间");
        const ruleColumnId = this.getColumnIdByName(columns, "重复规则");
        const descColumnId = this.getColumnIdByName(columns, "描述");

        return rows.map(row => {
            const eventValue = this.getCellValue(row.cells, eventColumnId);
            const dateValue = this.getCellValue(row.cells, dateColumnId);
            const durationValue = this.getCellValue(row.cells, durationColumnId);
            const ruleValue = this.getCellValue(row.cells, ruleColumnId);
            const descValue = this.getCellValue(row.cells, descColumnId);

            return {
                blockContent: eventValue?.block?.content || 'N/A',
                dateContent: dateValue?.date?.content || 0,
                duration: durationValue?.number?.content || 1,
                rule: ruleValue?.text?.content || 'N/A',
                textContent: descValue?.text?.content || 'N/A'
            };
        });
    }

    async getEventsFromSiYuanDatabase() {
        try {
            steveTools.outlog('开始生成ics文件');

            // 清理旧文件
            const listfiles = await api.readDir('data/public/stevetools/');
            for (const file of Object.values(listfiles)) {
                if (!file.isDir && file.name.endsWith('.ics')) {
                    await api.removeFile('data/public/stevetools/' + file.name);
                }
            }

            allEvents = [];

            // 处理常规事件
            const avIds = await this.getAVreferenceid();
            const viewIDs = await myF.getViewId(avIds);
            const viewValue = await myF.getViewValue(viewIDs);
            // steveTools.outlog("EEEEEEEEEEEEEEEEEView data:", viewValue);
            const result = transformEvents(viewValue);
            await this.addEventToGlobal(result);

            // 处理周期事件
            const avids_zq = await this.getAVreferenceid("周期");
            const viewIDs_zq = await myF.getViewId(avids_zq);
            const viewValue_zq = await myF.getViewValue(viewIDs_zq, true);
            steveTools.outlog("EEEEEEEEEEEEEEEEEView data:", viewValue_zq);
            const result_zq = transformEvents(viewValue_zq, true);
            await this.addEventToGlobal(result_zq);


            await this.uploadAllEventsToFile(eventsPath);
            await this.generateICSFromEventsFile(eventsPath, calendarpath);

        } catch (error) {
            console.error('生成日历文件时发生错误:', error);
            throw error;
        }
    }

    async runAddEvent(result: any, isZq: boolean = false) {
        if (isZq == false) {
            let i = 0;
            for (const item of result) {
                //检测item是否符合要求
                if (!item.dateContent || !item.dateContent2 || !item.textContent || !item.blockContent) {
                    steveTools.outlog('Invalid event data:', item);
                    i++;
                    showMessage('存在不符合要求的数据（请检查数据库格式），已跳过' + i + '条数据', 6000, "info", "tiao");
                    continue;
                }
                const endtime = convertTimestampToArray(item.dateContent2);
                const starttime = convertTimestampToArray(item.dateContent);
                const description = item.textContent;
                const title = item.blockContent;
                const status = item.status === "完成" ? "CONFIRMED" : "TENTATIVE";

                const newEvent: EventAttributes = {
                    start: starttime,
                    startInputType: 'local',
                    startOutputType: 'local',
                    end: endtime, // 指定结束时间
                    endInputType: 'local',
                    endOutputType: 'local',
                    title: title,
                    description: description,
                    status: status,
                    // location: 'Office'
                }
                await this.addEventToGlobal(newEvent);
                // steveTools.outlog(newEvent,"ttttiaos");
            }
        } else {//周期事件
            let i = 0;
            for (const item of result) {
                //检测item是否符合要求
                if (!item.dateContent || !item.textContent || !item.blockContent || !item.rule) {
                    steveTools.outlog('Invalid event data:', item);
                    i++;
                    showMessage('存在不符合要求的周期数据（请检查数据库格式），已跳过' + i + '条数据', 6000, "info", "tiao");
                    continue;
                }
                const duration = { hours: item.duration };
                const starttime = convertTimestampToArray(item.dateContent);
                const description = item.textContent;
                const title = item.blockContent;
                // const frequency = mapFrequency(item.frequency);//TODO
                const recurrenceRule = item.rule
                const newEvent: EventAttributes = {
                    start: starttime,
                    startInputType: 'local',
                    startOutputType: 'local',
                    duration: duration, // 指定持续时间
                    title: title,
                    description: description,
                    recurrenceRule: recurrenceRule,
                }
                await this.addEventToGlobal(newEvent);
                // steveTools.outlog(newEvent,"ttttiaos");
            }
        }
    }

    // 添加新事件到全局变量
    async addEventToGlobal(newEvent: EventAttributes) {
        try {
            // 将新事件添加到全局事件数组
            allEvents.push(newEvent);
            steveTools.outlog('新事件已添加到全局变量');
        } catch (error) {
            console.error('添加事件到全局变量时出错：', error);
        }
        steveTools.outlog("Aevent::::::::::::::::::::", allEvents);
    }

    // 上传全局事件数据到JSON文件
    async uploadAllEventsToFile(jsonFilePath: string) {
        try {
            // 将全局事件数组保存回JSON文件
            const updatedEventsJson = JSON.stringify(allEvents);
            steveTools.outlog("updatedEventsJson", allEvents);
            const fileBlob = new Blob([updatedEventsJson], { type: 'application/json' });
            await api.putFile(jsonFilePath, false, fileBlob);
            steveTools.outlog('所有事件已保存到' + jsonFilePath);
        } catch (error) {
            console.error('上传事件到文件时出错：', error);
        }
    }

    async importMoBan() {
        let notebookId = getSTCalendarNotebookId((await api.lsNotebooks()).notebooks);
        steveTools.outlog("ceshi1", notebookId);
        if (!notebookId) {
            showMessage("已创建名为“ST日程管理”的笔记本", 3000, "info");
            await api.createNotebook("ST日程管理");
            notebookId = getSTCalendarNotebookId((await api.lsNotebooks()).notebooks);
        }
        //获取模板zip文件
        try {
            const file = await api.getFileBlob("/data/plugins/siyuan-steve-tools/asset/日程.sy.zip");
            await api.importSY(notebookId, file);
        } catch (e) {
            steveTools.outlog(e);
        }
        showMessage("已导入日程模板", 3000, "info");
    }

}


function getSTCalendarNotebookId(notebooks): string | null {
    const stCalendarNotebook = notebooks.find(notebook => notebook.name === "ST日程管理");
    return stCalendarNotebook ? stCalendarNotebook.id : null;
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

// type FrequencyType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
// const mapFrequency = (chinese: string): FrequencyType => {
//     const frequencyMap: Record<string, FrequencyType> = {
//         '每天': 'DAILY',
//         '每周': 'WEEKLY',
//         '每月': 'MONTHLY',
//         '每年': 'YEARLY'
//     };
//     return frequencyMap[chinese] || 'WEEKLY';
// };


// const targetElement = document.querySelector('div[contenteditable="false"][data-av-id="20241213113357-m9b143e"][data-av-type="table"][data-node-id="20241003141312-30yk3cr"][data-type="NodeAttributeView"][class="av"][custom-sy-av-view="20241213113357-tuugpcw"][name="日程"]');
// steveTools.outlog(targetElement);
// if (targetElement) {
//     // 创建新的元素
//     const newElement = document.createElement('span');
//     // newElement.setAttribute('data-type', 'av-switcher');
//     newElement.classList.add('block__icon');
//     newElement.setAttribute('data-position', '8bottom');
//     newElement.setAttribute('aria-label', '日历视图');

//     const svgElement = document.createElement('svg');
//     const useElement = document.createElement('use');
//     useElement.setAttribute('xlink:href', '#iconCalendar');
//     svgElement.appendChild(useElement);

//     newElement.appendChild(svgElement);



//     // 插入新的元素到目标元素中
//     const targetSubElement = targetElement.querySelector('.fn__flex .av__views');
//     if (targetSubElement) {
//         targetSubElement.appendChild(newElement);
//         // 添加点击事件处理
//         newElement.addEventListener('click', function () {

//         });
//     }
// }

function transformEvents(inputEvents, isZQ: boolean = false) {
    function timestampToArray(timestamp) {
        const date = new Date(timestamp);
        return [
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate(),
            date.getHours(),
            date.getMinutes()
        ];
    }

    const transformedEvents = inputEvents[0].data.map(event => {
        // Base event object with common properties
        const baseEvent = {
            start: timestampToArray(event.开始时间.start),
            startInputType: "local",
            startOutputType: "local",
            title: event.事件.content,
            description: event.描述.content
        };

        // Add properties based on event type
        if (isZQ) {
            return {
                ...baseEvent,
                recurrenceRule: event.重复规则.content,
                duration: { hours: event.持续时间.content }
            };
        } else {
            return {
                ...baseEvent,
                end: timestampToArray(event.开始时间.end),
                endInputType: "local",
                endOutputType: "local",
                status: event.状态.content === "完成" ? "CONFIRMED" : "TENTATIVE"
            };
        }
    });

    return transformedEvents;
}