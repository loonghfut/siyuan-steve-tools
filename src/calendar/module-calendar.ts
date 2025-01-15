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
let allEvents: EventAttributes[] = [];

let this_settingdata: any = {};
let islisten = true;

export class M_calendar {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    private isUpdating: boolean = false;

    async init(settingdata) {
        this_settingdata = settingdata;
        calendarpath = `data/public/stevetools/${settingdata["cal-url"]}`;
        calendarpath2 = `public/stevetools/${settingdata["cal-url"]}`;
        console.log(calendarpath);
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

        // console.log(this_settingdata["cal-hand-update"]);
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
                    //测试
                    // 获取特定的元素
                    //测试
                }
            });
        }

        if (this_settingdata["cal-auto-update"] == true) {
            console.log("自动更新日历文件");
            //监听
            siyuan.ws.ws.addEventListener('message', async (e) => {
                if (!islisten) {
                    return;
                }
                const msg = JSON.parse(e.data);
                if (msg.cmd === "transactions") {
                    // console.log(msg);
                    if (msg.data[0].doOperations[0].action === "updateAttrViewCell") {//BUG:同时添加会崩溃，无法稳定复现
                        // console.log("更新了一个属性视图");
                        const avids = await this.getAVreferenceid();
                        //加上周期
                        const avids_zq = await this.getAVreferenceid('周期');
                        console.log(avids);
                        if (avids.includes(msg.data[0].doOperations[0].avID) || avids_zq.includes(msg.data[0].doOperations[0].avID)) {
                            console.log("更新了日程信息");
                            //延时执行
                            this.avButton();//数据库每次更新都会重新加载页面
                            if (!this.isUpdating) {
                                this.isUpdating = true;
                                setTimeout(async () => {
                                    await this.getEventsFromSiYuanDatabase();
                                    console.log("更新日历文件<2>");
                                    this.isUpdating = false;
                                }, 3000);
                            }
                        } else {
                            // console.log("avID 不在 avids 数组中");
                        }
                    }

                }
                // console.log(msg);
            });

            //每15分钟调用一次await this.getEventsFromSiYuanDatabase()
            setInterval(async () => {
                await this.getEventsFromSiYuanDatabase()
                console.log("自动更新日历文件<1>");
            }, 600000);
        }
    }

    async onLayoutReady() {
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
                        // console.log('Dialog closed');
                        await this.getEventsFromSiYuanDatabase();
                        islisten = true;
                    }
                });
                mutation.addedNodes.forEach(async (node) => {
                    if (node instanceof HTMLElement && node.matches('div[data-key="dialog-attr"]')) {
                        // console.log('Dialog opened');
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
            // console.log(targetSpans, "targetSpans");

            targetSpans.forEach(targetSpan => {
                // 检查目标元素的右边是否已经存在按钮
                if (!targetSpan.nextSibling || !(targetSpan.nextSibling instanceof HTMLElement) || !targetSpan.nextSibling.classList.contains('my-plugin-button')) {
                    // 创建一个新的按钮元素
                    const button = document.createElement('button');
                    button.innerText = '日程视图';
                    button.className = 'block__icon ariaLabel my-plugin-button'; // 确保样式统一，并添加一个标识类

                    // 添加按钮点击事件
                    button.addEventListener('click', async () => {
                        console.log('按钮被点击了');
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
        // dialog.data = `<div id='calendar-${id}' class="mb-3"></div>`;
        // calendar = await run(ics,id);
        const ics = await api.getFileBlob(calendarpath);
        setTimeout(async () => {
            calendar = await run(ics, id);
        }, 100);
    }

    async openRiChengView() {
        const ics = await api.getFileBlob(calendarpath);
        console.log(ics);
        //时间戳
        const id = new Date().getTime().toString();
        let calendar: any;
        const tab = await openTab({
            app: this.plugin.app,
            custom: {
                icon: "iconSTcal",
                title: `日程视图`,
                data: {
                    text: "This is my custom tab",
                },
                id: this.plugin.name + 'calview',
            },
            // position: "right",
            keepCursor: false
        });
        console.log(tab);
        tab.panelElement.innerHTML = `
  <div  id='calendarfu-${id}' ><div id='calendar-${id}' ></div></div>`;
        calendar = await run(ics, id);
        const calendarDiv = document.getElementById(`calendar-${id}`);
        if (calendarDiv) {
            const resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    // console.log('Calendar container resized:', width, height);
                    if (width == 0 || height == 0) {
                        // resizeObserver.disconnect();
                        console.log('ResizeObserver disconnected');
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

    showhelp() {
        // new Dialog({
        //     title: null,
        //     content: ``,
        //     width: '70%',
        //     height: '80vh',
        //     disableClose: false,
        //     hideCloseIcon: true,
        // });
    
    }



    onunload() {
        console.log("M_calendar unloaded");
    }

    getCalUrl() {
        // console.log(this_settingdata["cal-enable"]);
        if (this_settingdata["cal-enable"] == true) {
            const currentHost = window.location.host;
            // linkToCalendar = currentHost + "/" + calendarpath2;
            showMessage("日历订阅链接：" + currentHost + "/" + calendarpath2, 0, "info");
            return
        }
        showMessage("请先启用日历订阅模块", 6000, "info");
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
            steveTools.outlog(response);
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
            steveTools.outlog('事件数据已保存到' + filePath);
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
            // console.log(await fileBlob.text());
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

    // 从思源数据库中获取日程信息
    async getEventsFromSiYuanDatabase() {
        console.log('开始生成ics文件');
        //删除多余的ics文件
        const listfiles = await api.readDir('data/public/stevetools/');
        // console.log(listfiles);
        for (const file of Object.values(listfiles)) {
            if (!file.isDir && file.name.endsWith('.ics')) {
                await api.removeFile('data/public/stevetools/' + file.name);
            }
        }
        //获取av-id
        const avIds = await this.getAVreferenceid();
        allEvents = [];
        for (const avId of avIds) {
            // const response = await api.getFile(`data/storage/av/${avId}.json`);
            const response = await api.renderAttributeView(avId);
            console.log(response);
            if (response && response.view) {
                const result = response.view.rows.map(row => {
                    return {
                        blockContent: row.cells[0]?.value?.block?.content || 'N/A',//标题
                        dateContent2: row.cells[1]?.value?.date?.content2 || 0,//结束时间
                        dateContent: row.cells[1]?.value?.date?.content || 0,//开始时间
                        textContent: row.cells[2]?.value?.text?.content || 'N/A', //描述
                        status: row.cells[3]?.value?.mSelect?.[0]?.content || '未完成2' //状态
                    };
                });
                await this.runAddEvent(result);
                console.log("2222", result);
                steveTools.outlog(result);
            } else {
                console.error(`Invalid response for avId ${avId}:`, response);
            }
        }
        //周期部分
        const avIds_zq = await this.getAVreferenceid('周期');
        for (const avId of avIds_zq) {
            const response = await api.renderAttributeView(avId);
            console.log(response);
            if (response && response.view) {
                const result = response.view.rows.map(row => {
                    return {
                        blockContent: row.cells[0]?.value?.block?.content || 'N/A',  //标题
                        dateContent: row.cells[1]?.value?.date?.content || 0,           //日期
                        textContent: row.cells[4]?.value?.text?.content || 'N/A',       //描述
                        rule: row.cells[3]?.value?.text?.content || 'N/A',         //频率规则
                        duration: row.cells[2]?.value?.number?.content || 1,         //持续时间  
                    };
                });
                await this.runAddEvent(result, true);
                console.log("22221111111", result);
                steveTools.outlog(result);
            } else {
                console.error(`Invalid response for avId ${avId}:`, response);
            }
        }


        await this.uploadAllEventsToFile(eventsPath);
        await this.generateICSFromEventsFile(eventsPath, calendarpath);

    }

    async runAddEvent(result: any, isZq: boolean = false) {
        if (isZq == false) {
            let i = 0;
            for (const item of result) {
                //检测item是否符合要求
                if (!item.dateContent || !item.dateContent2 || !item.textContent || !item.blockContent) {
                    console.log('Invalid event data:', item);
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
                // console.log(newEvent,"ttttiaos");
            }
        } else {//周期事件
            let i = 0;
            for (const item of result) {
                //检测item是否符合要求
                if (!item.dateContent || !item.textContent || !item.blockContent || !item.rule) {
                    console.log('Invalid event data:', item);
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
                // console.log(newEvent,"ttttiaos");
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
    }

    // 上传全局事件数据到JSON文件
    async uploadAllEventsToFile(jsonFilePath: string) {
        try {
            // 将全局事件数组保存回JSON文件
            const updatedEventsJson = JSON.stringify(allEvents);
            const fileBlob = new Blob([updatedEventsJson], { type: 'application/json' });
            await api.putFile(jsonFilePath, false, fileBlob);
            steveTools.outlog('所有事件已保存到' + jsonFilePath);
        } catch (error) {
            console.error('上传事件到文件时出错：', error);
        }
    }

    async importMoBan() {
        let notebookId = getSTCalendarNotebookId((await api.lsNotebooks()).notebooks);
        console.log("ceshi1", notebookId);
        if (!notebookId) {
            showMessage("已创建名为“ST日程管理”的笔记本", 3000, "info");
            await api.createNotebook("ST日程管理");
             notebookId =  getSTCalendarNotebookId((await api.lsNotebooks()).notebooks);
        }
        //获取模板zip文件
        try{
        const file = await api.getFileBlob("/data/plugins/siyuan-steve-tools/asset/日程.sy.zip");
        await api.importSY(notebookId, file);
        }catch(e){
            console.log(e);
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
// console.log(targetElement);
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