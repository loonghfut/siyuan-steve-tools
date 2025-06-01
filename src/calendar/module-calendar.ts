import steveTools, { frontEnd, settingdata } from "@/index";
import { createEvents, EventAttributes } from 'ics';
import { RRule } from 'rrule';
import * as api from "@/api"
import { showMessage, openTab, Dialog, getFrontend, confirm, Menu } from "siyuan";
import * as ic from "@/icon"
import "./event_style.scss";
declare const siyuan: any;
import { init_viewValue, run, update_av_ids } from "./calendar";
export let calendarpath = 'data/public/stevetools/calendar.ics';
let calendarpath2 = 'public/stevetools/calendar.ics';//订阅地址
export const eventsPath = 'data/public/stevetools/events.json';
export let linkToCalendar = '';
import * as myF from "./myF";
import { handleAddButtonClick, refreshKanban } from "./kanban";
import { globalOpen2 } from "./myK";
import { addquikaddButton, getCursorElement } from "./quickadd";
import { M_caldata } from "./M_caldata";
import { ics_alist } from "./share/alist";
import { ics_s3 } from "./share/s3";
import { CalDAVClient } from "./share/qqcaldav";
import { WebDAVSync } from "./share/webdav";
import { ICSSubscription } from "./share/ics_discribe";
import { Calendar } from "@fullcalendar/core";
import { insertHtml, THIS } from "./insertHtml";
import { ICSImporter } from "./ics/ics_siyuan";



// import { openNewWindowById } from "./myK";
let allEvents: EventAttributes[] = [];

let this_settingdata: any = {};
let islisten = true;
let front: "desktop" | "desktop-window" | "mobile" | "browser-desktop" | "browser-mobile";
const calendarinstance: Map<string, Calendar> = new Map();
export class M_calendar {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    private isUpdating: boolean = false;
    private isSettingAttrs: boolean = false;  // 添加属性声明
    public av_ids: any;
    public calConfig: M_caldata;
    public alistPlugin: ics_alist;
    public s3Client: ics_s3;
    public QQCalDAVClient: CalDAVClient;
    public webdavClient: WebDAVSync;
    public qqFullCalendarEvents;
    public icsSubscription: ICSSubscription;


    async init(settingdata) {
        this.plugin.addTab({
            type: "calendar",
            async init() {
                const id = new Date().getTime().toString();
                let calendar: Calendar
                this.element.innerHTML = `
                <div  id='calendarfu-${id}' ><div id='calendar-${id}' ></div></div>`;
                calendar = await run(id, settingdata["cal-default-view"]);
                this.data.id = id;
                calendarinstance.set(id, calendar);
            },
            async destroy() {
                console.log("销毁日历选项卡", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.destroy();
                    calendarinstance.delete(this.data.id);
                    console.log("销毁日历实例", this.data.id);
                }
            },
            resize() {
                console.log("resize", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.updateSize();
                }
            },
        })
        this.plugin.addTab({
            type: "kanban",
            async init() {
                const id = new Date().getTime().toString();
                let calendar: Calendar
                this.element.innerHTML = `
                <div  id='calendarfu-${id}' ><div id='calendar-${id}' ></div></div>`;
                calendar = await run(id, settingdata["kanban-default-view"] || "kanban");
                this.data.id = id;
                calendarinstance.set(id, calendar);
            },
            async destroy() {
                console.log("销毁日历选项卡", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.destroy();
                    calendarinstance.delete(this.data.id);
                    console.log("销毁日历实例", this.data.id);
                }
            },
            resize() {
                console.log("resize", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.updateSize();
                }
            },
        })
        front = getFrontend();
        this.calConfig = new M_caldata(this.plugin.name);
        await this.calConfig.load();
        // console.log(this.calConfig.getAll());
        this_settingdata = settingdata;
        calendarpath = `data/public/stevetools/${settingdata["cal-url"]}`;
        calendarpath2 = `public/stevetools/${settingdata["cal-url"]}`;
        this.plugin.addIcons(`
    <symbol id="iconSTcal" viewBox="0 0 500 500">
       ${ic.steveTools_cal}
    </symbol>
    <symbol id="iconSTcalKanban" viewBox="0 0 802 802">
        ${ic.steveTools_cal_kanban}
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
        if (this_settingdata["cal-ics-subscribe-import"] == true) {
            const icsImporter = new ICSImporter(this.plugin);
        }
        if (this_settingdata["cal-show-view"] == true) {
            const topBarElement = this.plugin.addTopBar({
                icon: "iconCalendar",
                title: "日程看板视图",
                position: "left",
                callback: async () => {
                    let rect = topBarElement.getBoundingClientRect();
                    this.addMenu(rect);
                    // if (front == "browser-mobile" || front == "mobile") {
                    //     await this.openRiChengViewDialog(true);
                    // } else {
                    //     await this.openRiChengView();
                    // }
                }
            });
        }
        let D_calendar: any;
        this.plugin.addDock({
            config: {
                position: "RightTop",
                size: { width: 250, height: 0 },
                icon: "iconSTcalKanban",
                title: "侧边看板",
            },
            data: null,
            type: "cal-dock-kanban",
            resize: async () => {
                D_calendar.updateSize();
            },
            init: async (dock) => {
                const id = new Date().getTime().toString();
                dock.element.innerHTML = `
                <div id="calendar-${id}" class="cal-dock-container" ></div>
                `;
                setTimeout(async () => {
                    D_calendar = await run(id, 'kanban', '', 'title', 'today,viewFilter,prev,next', '');
                    refreshKanban();
                }, 100);
            },
        });

        let D_calendar_day: any;
        this.plugin.addDock({
            config: {
                position: "RightTop",
                size: { width: 250, height: 0 },
                icon: "iconCalendar",
                title: "今日日程",
            },
            data: null,
            type: "cal-dock-day",
            resize: async () => {
                D_calendar_day.updateSize();
            },
            init: async (dock) => {
                const id = new Date().getTime().toString();
                dock.element.innerHTML = `
                <div id="calendar-${id}" class="cal-dock-container" ></div>
                `;
                setTimeout(async () => {
                    D_calendar_day = await run(id, 'timeGridDay', '', 'title', 'today,viewFilter,prev,next', '');
                }, 100);
            },
        });


        if (this_settingdata["cal-auto-update"] == true) {
            // steveTools.outlog("自动更新日历文件");
            //监听
            siyuan.ws.ws.addEventListener('message', async (e) => {
                if (!islisten) {
                    return;
                }
                // if (1) { return; }
                const msg = JSON.parse(e.data);
                if (msg.cmd === "transactions") {
                    steveTools.outlog(msg);
                    if (msg.data[0].doOperations[0].action === "updateAttrViewCell") {//BUG:同时添加会崩溃，无法稳定复现
                        // steveTools.outlog("更新了一个属性视图");
                        const avids = await this.getAVreferenceid();
                        //加上周期
                        const avids_zq = await this.getAVreferenceid('周期');
                        steveTools.outlog(avids);
                        if (avids.includes(msg.data[0].doOperations[0].avID) || avids_zq.includes(msg.data[0].doOperations[0].avID)) {
                            steveTools.outlog("更新了日程信息");
                            //延时执行
                            if (!this.isUpdating) {
                                this.isUpdating = true;
                                setTimeout(async () => {
                                    await this.getEventsFromSiYuanDatabase();
                                    console.log("更新日历文件<2>");
                                    this.isUpdating = false;
                                }, 10000);
                            }
                        } else {
                            // steveTools.outlog("avID 不在 avids 数组中");
                        }
                        steveTools.outlog("更新了日程信息");
                        //延时执行
                        if (!this.isUpdating) {
                            this.isUpdating = true;
                            setTimeout(async () => {
                                await this.getEventsFromSiYuanDatabase();
                                console.log("更新日历文件<2>");
                                this.isUpdating = false;
                            }, 10000);
                        }
                    }
                    // steveTools.outlog(msg);
                }
            });
            //// 暂时不用
            // 每15分钟调用一次await this.getEventsFromSiYuanDatabase()
            // setInterval(async () => {
            //     await this.getEventsFromSiYuanDatabase()
            //     steveTools.outlog("自动更新日历文件<1>");
            // }, 900000);
        }
        if (this_settingdata["cal-auto-syncing-update"] == true) {
            siyuan.ws.ws.addEventListener('message', async (e) => {
                if (!islisten) {
                    return;
                }
                // if (1) { return; }
                const msg = JSON.parse(e.data);
                if (msg.cmd === "syncing") {
                    steveTools.outlog("更新了日程信息");
                    //延时执行
                    if (!this.isUpdating) {
                        this.isUpdating = true;
                        setTimeout(async () => {
                            await this.getEventsFromSiYuanDatabase();
                            console.log("更新日历文件<2>");
                            this.isUpdating = false;
                        }, 2000);
                    }
                }
            });
        }
        //解决 https://github.com/loonghfut/siyuan-steve-tools/issues/3
        //实现看板实时更新
        //2025-2-9更新为插件api方式监听
        this.plugin.eventBus.on("ws-main", async (e) => {
            const msg = e.detail;
            if (msg.cmd === "transactions") {
                // console.log("newway", msg);
                if (msg.data[0].doOperations[0].action === "updateAttrs" || msg.data[0].doOperations[0].action === "updateAttrViewCell") {
                    // console.log("updateAttrs");
                    this.avButton();
                    // if(msg.data[0].doOperations[0].action === "updateAttrViewCell"){
                    refreshKanban();
                    console.log('trans')
                    //更新背景色
                    if (msg?.data?.[0]?.doOperations?.[0]?.avID &&
                        msg?.data?.[0]?.doOperations?.[0]?.data?.mSelect?.[0]?.content &&
                        msg?.data?.[0]?.doOperations?.[0]?.rowID &&
                        msg?.data?.[0]?.doOperations?.[0]?.keyID) { // 检查 keyID 是否存在

                        const operationDetails = msg.data[0].doOperations[0];
                        const avID = operationDetails.avID;
                        const columnKeyID = operationDetails.keyID; // 变化的列ID
                        const blockID = operationDetails.rowID; // 行ID，即块ID
                        const statusValue = operationDetails.data.mSelect[0].content;

                        //判断是否为事件（判断是否是日程数据库的事件）
                        if (this.av_ids.map(item => item.id).includes(avID)) {
                            try {
                                // 获取属性视图的列信息
                                const avDetails = await api.getAttributeViewKeys(blockID);
                                // console.log("avDetails", avDetails);
                                // 查找名为“状态”的属性列 (key) 的定义
                                let statusKeyDefinition;
                                // console.log("avDetails.keyValues2121", avDetails[0].keyValues);
                                if (avDetails && avDetails[0].keyValues) {
                                    // console.log("avDetails.keyValues", avDetails[0].keyValues);
                                    const statusKeyValue = avDetails[0].keyValues.find(kv => kv.key && kv.key.name === "状态");
                                    // console.log("statusKeyValue", statusKeyValue);
                                    if (statusKeyValue) {
                                        // console.log("statusKeyValue", statusKeyValue);
                                        statusKeyDefinition = statusKeyValue.key;
                                    }
                                }
                                // 如果找到了“状态”列，并且其ID与当前变化的列ID一致
                                if (statusKeyDefinition && statusKeyDefinition.id === columnKeyID) {
                                    console.log(`'状态'列 (ID: ${columnKeyID}) 发生变化: ${statusValue}, BlockID: ${blockID}`);
                                    await api.setBlockAttrs(blockID, { "custom-st-event": myF.statusMap[statusValue] });//TODO优化，防止二次触发
                                }
                            } catch (error) {
                                console.error("处理'状态'列数据变化时出错:", error);
                            }
                        }
                    }
                    // }
                }
                //【】同步更新看板 //TODO优化请求频率
                if (msg.data[0].doOperations[0].action === "update") {
                    const data = msg.data[0].doOperations[0].data;
                    if (data.startsWith('<div data-marker')) {
                        // console.log('asd', data);
                        refreshKanban();
                        console.log("update");
                    }
                }
            }
        });
    }

    async onLayoutReady() {
        this.plugin.eventBus.on('switch-protyle', (e) => {
            // console.log("切换思源块:", e);
            // this.currentid = e.detail.protyle.block.rootID;
            // console.log(this.currentid);
            addquikaddButton(e);
        });

        //悬浮显示
        if (this_settingdata["cal-show-float-view"]) {
            run("1");
        }
        //
        //配置实现只在某一端上传ics
        const selectToPics = this_settingdata["SelectTOPics"];
        if (!selectToPics || selectToPics === frontEnd) {
            await this.shareicsinit();
        }

        if (this_settingdata["cal-qq-email"] && this_settingdata["cal-qq-code"] && this_settingdata["cal-qq-enable"]) {
            this.QQCalDAVClient = new CalDAVClient(this_settingdata["cal-qq-email"], this_settingdata["cal-qq-code"]);
            await this.QQCalDAVClient.init();
            const qqCalendars_url = this_settingdata["cal-qq-calendar-url"];
            this.qqFullCalendarEvents = await this.QQCalDAVClient.getEvents(qqCalendars_url);
            refreshKanban();
            console.log("QQevent", this.qqFullCalendarEvents);
        }
        await init_viewValue({ viewId: this.calConfig.get("viewId"), viewName: this.calConfig.get("viewName") });
        // this.plugin.eventBus.on("click-blockicon", quickadd_event_more);//无法实现
        this.av_ids = await this.getAVreferenceid_pro();
        await update_av_ids();//更新日历文件中的av_ids
        let isCommandExecuting = false;
        this.plugin.addCommand({
            langKey: "ST_calendar_day",
            langText: "打开日记",
            hotkey: "",
            globalCallback: async () => {
                if (isCommandExecuting) {
                    return;
                }
                isCommandExecuting = true;
                // console.log("添加日程waiwai");
                try {
                    // await globalOpen();//失败
                    globalOpen2();
                } finally {
                    setTimeout(() => {
                        isCommandExecuting = false;
                    }, 3000);
                }
            },
        })
        this.plugin.addCommand({
            langKey: "ST_calendar_quick",
            langText: "创建日程（应用内弹窗）",
            hotkey: "",
            callback: async () => {
                handleAddButtonClick();
            },
        })
        this.plugin.addCommand({
            langKey: "ST_calendar_quick_pro",
            langText: "创建日程（光标所在块）",
            hotkey: "",
            editorCallback: async (pro) => {
                let cursorElementId = getCursorElement()?.closest('[data-type]')?.getAttribute('data-node-id');
                let cursorElement = getCursorElement();
                if (cursorElement?.closest('.li')) {
                    cursorElementId = cursorElement.closest('.li').getAttribute('data-node-id');
                    console.log("c", cursorElementId);
                }
                console.log("cursorElement", cursorElementId);
                const blockId = cursorElementId
                if(!blockId) {
                    showMessage("请先选中一个块", 3000, "error");
                    return;
                }
                // console.log("pro", blockId);
                // console.log("创建日程（光标所在块）", blockId);
                handleAddButtonClick('', { isdirect: true, directid: blockId });
            },
        })
        //注册斜杠
        // this.plugin.protyleSlash = [{
        //     filter: ["kb", "看板"],
        //     html: "插入看板",
        //     id: "ST_calendar_slash_kanban",
        //     callback: async (protyle) => {
        //         console.log("添加日程", protyle);
        //         const Hdata = await insertHtml();
        //         // const ca = await run("", 'dayGridMonth')
        //         protyle.insert(`${Hdata.html}`, true, true);
        //         const MTHIS = await THIS(Hdata.blockIdData.id);
        //         console.log("MTHIS", MTHIS);
        //         await run("2", 'dayGridMonth', '', 'prev,next today','multiMonthYear,dayGridMonth,timeGridWeek,timeGridThreeDays,timeGridDay,weekkanban,kanban,yearkanban','title',MTHIS.shadowRoot) 
        //     }
        // }, {
        //     filter: ["rl", "日历"],
        //     html: "插入日历",
        //     id: "ST_calendar_slash_calendar",
        //     callback: async (protyle) => {
        //         console.log("添加日程", protyle);
        //         // protyle.insert()
        //     }
        // }]
    }

    private addMenu(rect?: DOMRect) {
        const menu = new Menu("topBarCAL", () => {

        });
        menu.addItem({
            icon: "iconSTcal",
            label: "日历视图",
            click: async () => {
                if (front == "browser-mobile" || front == "mobile") {
                    await this.openRiChengViewDialog(true, "", settingdata["cal-default-view"]);
                } else {
                    await this.openRiChengView();
                }
            }
        });
        menu.addItem({
            icon: "iconSTcalKanban",
            label: "看板视图",
            click: async () => {
                if (front == "browser-mobile" || front == "mobile") {
                    await this.openRiChengViewDialog(true, "", settingdata["kanban-default-view"]);
                } else {
                    await this.openRiChengView("kanban");
                }
            }
        });
        if (front == "browser-mobile" || front == "mobile") {
            menu.fullscreen();
        } else {
            menu.open({
                x: rect.right,
                y: rect.bottom,
                isLeft: true,
            });
        }
    }

    private async shareicsinit() {
        if (settingdata["cal-ics-enable-subscribe"]) {
            this.icsSubscription = new ICSSubscription([settingdata["cal-ics-subscribe-url"]]);
            await this.icsSubscription.init();
            console.log("ST_ics状态:", this.icsSubscription.getEvents());
        }
        if (settingdata["cal-share"] === "alist") {
            this.alistPlugin = new ics_alist();
            this.alistPlugin.init();
        }
        if (this_settingdata["cal-share"] === "s3") {
            this.s3Client = new ics_s3({});
            this.s3Client.load_date_from_siyuan();
            this.s3Client.init();
            console.log("ST_s3状态:", await this.s3Client.testConnection());
        }
        if (this_settingdata["cal-share"] === "s3-diy") {
            const bucket = this_settingdata["cal-s3-bucket"];
            const accessKeyId = this_settingdata["cal-s3-accessKeyId"];
            const secretAccessKey = this_settingdata["cal-s3-secretAccessKey"];
            this.s3Client = new ics_s3({ bucket: bucket, accessKeyId: accessKeyId, secretAccessKey: secretAccessKey });
            this.s3Client.load_little_date_from_siyuan();
            this.s3Client.init();
            console.log("ST_s3状态:", await this.s3Client.testConnection());
        }
        if (this_settingdata["cal-share"] === "webdav") {
            const serverUrl = this_settingdata["cal-webdav-url"];
            const username = this_settingdata["cal-webdav-username"];
            const password = this_settingdata["cal-webdav-password"];
            const remotePath = this_settingdata["cal-webdav-path"];

            this.webdavClient = new WebDAVSync({
                serverUrl,
                username,
                password,
                remotePath
            });
            await this.webdavClient.init();
            console.log("WebDAV状态:", await this.webdavClient.testConnection());
        }
    }

    private avButton() {
        setTimeout(async () => {
            const targetSpans = Array.from(document.querySelectorAll('span[data-type="av-add-more"]'))
                .filter(span => span.closest('[name="日程"]'));
            // steveTools.outlog(targetSpans, "targetSpans");

            targetSpans.forEach(targetSpan => {
                // 检查目标元素的右边是否已经存在按钮
                if (!targetSpan.nextSibling || !(targetSpan.nextSibling instanceof HTMLElement) || !targetSpan.nextSibling.classList.contains('st-plugin-button')) {
                    // 创建一个新的按钮元素
                    const button = document.createElement('button');
                    button.innerText = '日程视图';
                    button.className = 'block__icon ariaLabel st-plugin-button'; // 确保样式统一，并添加一个标识类

                    // 添加按钮点击事件
                    button.addEventListener('click', async () => {
                        // console.log('按钮被点击了');
                        // Find the closest element with the specified classes
                        let dataId = '';
                        const avBlocks = document.querySelectorAll('div.item.item--focus[data-id]');
                        if (avBlocks.length > 0) {
                            // Get the closest AV block relative to the button
                            let closestBlock = avBlocks[0];
                            let minDistance = Infinity;

                            avBlocks.forEach(block => {
                                const rect = block.getBoundingClientRect();
                                const distance = Math.abs(rect.top - button.getBoundingClientRect().top);
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    closestBlock = block;
                                }
                            });

                            dataId = closestBlock.getAttribute('data-id');
                            // console.log('data-id:', dataId);
                            steveTools.outlog('Selected AV block ID:', dataId);
                        }

                        if (front == "browser-mobile" || front == "mobile") {
                            await this.openRiChengViewDialog(true, dataId);
                        } else {
                            await this.openRiChengViewDialog(false, dataId);
                        }
                    });
                    // 将按钮插入到目标 <span> 元素的右边
                    targetSpan.parentNode.insertBefore(button, targetSpan.nextSibling);
                }
            });
        }, 500); // 延迟 500 毫秒
    }

    async openRiChengViewDialog(isMobile: boolean = false, viewID = "", initialView = "dayGridMonth") {

        const id = new Date().getTime().toString();
        let calendar: any;
        new Dialog({
            title: null,
            content: `<div><div id='calendar-${id}' class="mb-3"></div></div>`,
            width: isMobile ? "100%" : '70%',
            height: isMobile ? "90%" : '86.66%',
            disableClose: false,
            hideCloseIcon: true,
            resizeCallback: () => {
                calendar.updateSize();
            },
        });

        setTimeout(async () => {
            if (viewID) {
                calendar = await run(id, initialView, viewID, 'prev,next today');
            } else {
                calendar = await run(id, initialView);
            }
        }, 100);
    }

    async openRiChengView(initialView = "dayGridMonth") {

        // steveTools.outlog(viewValue);
        //时间戳
        // const id = new Date().getTime().toString();
        // let calendar: Calendar;
        if (initialView == "dayGridMonth") {
            const tab = await openTab({
                app: window.siyuan.ws.app,
                custom: {
                    icon: "iconSTcal",
                    title: `日程视图`,
                    id: this.plugin.name + 'calendar',
                    data: {
                        id: null
                    },
                },
                // position: "right",
                keepCursor: false
            });
        } else {
            const tab = await openTab({
                app: window.siyuan.ws.app,
                custom: {
                    icon: "iconSTcalKanban",
                    title: `看板视图`,
                    id: this.plugin.name + 'kanban',
                    data: {
                        id: null
                    },
                },
                // position: "right",
                keepCursor: false
            });
        }

        //     tab.panelElement.innerHTML = `
        //   <div  id='calendarfu-${id}' ><div id='calendar-${id}' ></div></div>`;
        //     calendar = await run(id);
        //     const calendarDiv = document.getElementById(`calendar-${id}`);
        //     if (calendarDiv) {
        //         const resizeObserver = new ResizeObserver(entries => {
        //             for (const entry of entries) {
        //                 const { width, height } = entry.contentRect;
        //                 // steveTools.outlog('Calendar container resized:', width, height);
        //                 if (width == 0 || height == 0) {
        //                     // resizeObserver.disconnect();
        //                     steveTools.outlog('ResizeObserver disconnected');
        //                 }
        //                 // 如果日历组件有 resize 方法，在这里调用
        //                 calendar.updateSize();
        //             }
        //         });
        //         //如果已存在resizeObserver则先断开
        //         resizeObserver.disconnect();
        //         resizeObserver.observe(calendarDiv);
        //     }

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


    private convertEventFormat(eventData: any[]): EventAttributes[] {
        const events: EventAttributes[] = [];

        eventData.forEach((event: any) => {
            // 检查事件是否为周期性事件
            if (event.recurrenceRule) {
                // 处理周期性事件
                events.push({
                    start: event.start,
                    title: event.title,
                    description: event.description,
                    recurrenceRule: event.recurrenceRule,
                    duration: event.duration,
                    // 添加提醒配置
                    alarms: [{
                        action: 'display',
                        summary: event.title,
                        description: event.description,
                        trigger: {
                            before: true,
                            minutes: 15,
                        }
                    }],
                });
            } else {
                // 处理常规事件
                events.push({
                    start: event.start,
                    end: event.end,
                    title: event.title,
                    description: event.description,
                    status: event.status,
                    // 根据状态决定是否添加提醒配置
                    alarms: event.status === 'CONFIRMED' ? [] : [{
                        action: 'display',
                        summary: event.title,
                        description: event.description,
                        trigger: {
                            before: true,
                            minutes: 15,
                        }
                    }],
                });
            }
        });

        // console.log("events", events);
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
            const { error, value: icsContent } = createEvents(convertedEvents, {
                method: 'PUBLISH',
                calName: 'ST思源日程',
            });
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
            // console.log("EEEEEEEEEEEEEEEEEView data:", viewValue);
            const result = transformEvents(viewValue);
            await this.addEventToGlobal(result);

            // 处理周期事件
            const avids_zq = await this.getAVreferenceid("周期");
            if (avids_zq && Array.isArray(avids_zq) && avids_zq.length > 0) {
                const viewIDs_zq = await myF.getViewId(avids_zq);
                const viewValue_zq = await myF.getViewValue(viewIDs_zq, true);
                steveTools.outlog("EEEEEEEEEEEEEEEEEView data:", viewValue_zq);
                const result_zq = transformEvents(viewValue_zq, true);
                //TODO:周期事件的周期处理改为数据库单选
                await this.addEventToGlobal(result_zq);
            }
            await this.uploadAllEventsToFile(eventsPath);
            await this.generateICSFromEventsFile(eventsPath, calendarpath);

            const selectToPics = this_settingdata["SelectTOPics"];
            if (!selectToPics || selectToPics === frontEnd) {
                if (settingdata["cal-share"] === "alist") {
                    await this.alistPlugin.upload_ics();
                    console.log("alist_ics");
                }
                if (settingdata["cal-share"] === "s3") {
                    const ics = await api.getFileBlob(calendarpath)
                    const file = new File([ics], "calendar.ics", { type: "text/calendar" });
                    await this.s3Client.uploadFile(calendarpath2, file);
                }
                if (settingdata["cal-share"] === "s3-diy") {
                    const ics = await api.getFileBlob(calendarpath)
                    const file = new File([ics], "calendar.ics", { type: "text/calendar" });
                    await this.s3Client.uploadFile(calendarpath2, file);
                }
                if (settingdata["cal-share"] === "webdav") {
                    const ics = await api.getFileBlob(calendarpath)
                    const file = new File([ics], "calendar.ics", { type: "text/calendar" });
                    await this.webdavClient.uploadFile(settingdata["cal-url"] || "1.ics", file);//特殊处理，不自动建文件夹防止权限报错
                }
            }
        } catch (error) {
            console.error('生成日历文件时发生错误:', error);
            throw error;
        }

    }


    // 添加新事件到全局变量
    async addEventToGlobal(newEvents: EventAttributes | EventAttributes[]) {
        try {
            if (Array.isArray(newEvents)) {
                allEvents.push(...newEvents);
            } else {
                allEvents.push(newEvents);
            }
            steveTools.outlog('新事件已添加到全局变量');
            // console.log("allEvents", allEvents);
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
        api.refresh();
    }

    public getEventsFromQQCalDAV() {
        return this.qqFullCalendarEvents;
    }

    public async updateEventsFromQQCalDAV() {
        this.qqFullCalendarEvents = await this.QQCalDAVClient.getEvents(this_settingdata["cal-qq-calendar-url"]);
        console.log("QQevent", this.qqFullCalendarEvents);
        return this.qqFullCalendarEvents;
    }
    /**
     * 将思源日程导出到QQ日历
     */
    async exportToQQCalendar() {
        try {
            // 检查是否配置了QQ日历
            if (!this.QQCalDAVClient || !this_settingdata["cal-qq-calendar-url"]) {
                showMessage('请先在设置中配置QQ日历', -1, 'error');
                return;
            }

            showMessage('开始同步到QQ日历...', 3000, 'info');

            // 获取QQ日历中的现有事件
            let existingEvents = [];
            try {
                existingEvents = await this.QQCalDAVClient.getEvents(this_settingdata["cal-qq-calendar-url"]);
                console.log("QQ日历现有事件数:", existingEvents.length);
            } catch (error) {
                console.error('获取QQ日历现有事件失败:', error);
                showMessage('获取QQ日历现有事件失败，将尝试直接添加', 3000);
            }

            // 创建现有事件的标识映射，用于去重
            const existingEventMap = new Map();
            existingEvents.forEach(event => {
                // 使用标题+开始时间作为事件的唯一标识
                const eventKey = `${event.title}-${event.start?.toISOString() || ''}`;
                existingEventMap.set(eventKey, event);

                // 记录事件来源为QQ日历
                if (event.extendedProps?.source === 'qqcalendar') {
                    event.extendedProps.fromQQ = true;
                }
            });

            // 获取思源的日程事件数据
            const avIds = await this.getAVreferenceid();
            const viewIDs = await myF.getViewId(avIds);
            const viewValue = await myF.getViewValue(viewIDs);

            // 转换为QQ日历可接受的格式，同时过滤掉已存在的事件
            const events = viewValue.flatMap(eventGroup => {
                if (!eventGroup.data) return [];

                return eventGroup.data.map(event => {
                    // 跳过已完成的事件
                    if (event?.状态?.content === "完成") return null;

                    // 跳过重复规则不为空的周期事件
                    if (event?.重复规则?.content) {
                        console.log(`跳过周期事件: ${event?.事件?.content || '未命名事件'}`);
                        return null;
                    }

                    const startTime = new Date(event?.开始时间?.start);
                    const endTime = new Date(event?.开始时间?.end);

                    // 检查日期是否有效
                    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
                        return null;
                    }

                    // 创建事件唯一标识
                    const eventKey = `${event?.事件?.content || '未命名事件'}-${startTime.toISOString()}`;

                    // 检查事件是否已存在于QQ日历中
                    if (existingEventMap.has(eventKey)) {
                        const existingEvent = existingEventMap.get(eventKey);

                        // 如果是来自QQ日历的事件，跳过
                        if (existingEvent.extendedProps?.fromQQ) {
                            console.log(`跳过QQ日历原有事件: ${eventKey}`);
                            return null;
                        }

                        console.log(`跳过已存在的事件: ${eventKey}`);
                        return null;
                    }

                    return {
                        title: event?.事件?.content || '未命名事件',
                        description: event?.描述?.content || '',
                        start: startTime,
                        end: endTime,
                        isAllDay: event?.全天事件?.content === "是", // 根据属性判断是否为全天事件
                        extendedProps: {
                            source: 'siyuan', // 标记来源为思源
                        }
                    };
                }).filter(Boolean); // 过滤掉无效事件
            });

            // 同步到QQ日历
            if (events.length > 0) {
                await this.QQCalDAVClient.syncEvents(
                    this_settingdata["cal-qq-calendar-url"],
                    events
                );
                showMessage(`成功将${events.length}个事件同步到QQ日历`, 3000, "info");
            } else {
                showMessage('没有需要同步的新事件', 3000, 'info');
            }
        } catch (error) {
            console.error('导出到QQ日历失败:', error);
            showMessage('导出到QQ日历失败，请查看控制台错误', -1, 'error');
        }
    }

    /**
     * 清空QQ日历中的事件
     * @param onlySiyuanEvents 是否只删除来自思源的事件
     */
    async clearQQCalendar(onlySiyuanEvents: boolean = true) {
        try {
            // 检查是否配置了QQ日历
            if (!this.QQCalDAVClient || !this_settingdata["cal-qq-calendar-url"]) {
                showMessage('请先在设置中配置QQ日历', -1, 'error');
                return;
            }

            // 调用CalDAVClient的清空方法
            await this.QQCalDAVClient.clearCalendar(
                this_settingdata["cal-qq-calendar-url"],
                {
                    onlyFromSource: onlySiyuanEvents ? 'siyuan' : undefined
                }
            );

            // 刷新日历显示
            refreshKanban();

        } catch (error) {
            console.error('清空QQ日历失败:', error);
            showMessage('清空QQ日历失败，请查看控制台错误', -1, 'error');
        }
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


// function convertTimestampToArray(timestamp: number): [number, number, number, number, number] {
//     const date = new Date(timestamp);
//     const offset = 8 * 60; // 东八区的偏移量，单位为分钟
//     const localDate = new Date(date.getTime() + offset * 60 * 1000);
//     return [
//         localDate.getUTCFullYear(),
//         localDate.getUTCMonth() + 1, // 月份从0开始，所以需要加1
//         localDate.getUTCDate(),
//         localDate.getUTCHours(),
//         localDate.getUTCMinutes()
//     ];
// }

// 转换思源数据库中的事件数据为 ICS 格式

function transformEvents(inputEvents, isZQ: boolean = false) {
    // console.log("inputEvents", inputEvents);
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

    const oldM = settingdata["cal-ics-filter-old"] || 1;
    const newM = settingdata["cal-ics-filter-new"] || 1;
    // 获取当前时间前后6个月的时间范围
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - oldM, now.getDate());
    const sixMonthsLater = new Date(now.getFullYear(), now.getMonth() + newM, now.getDate());

    // 用于检查事件是否在时间范围内
    function isEventInTimeRange(eventTime) {
        const eventDate = new Date(eventTime);
        return eventDate >= sixMonthsAgo && eventDate <= sixMonthsLater;
    }

    // 用于存储已处理过的事件的唯一标识
    const processedEvents = new Set();
    const transformedEvents = [];

    // 遍历所有输入的事件数组
    inputEvents.forEach(eventGroup => {
        if (!eventGroup.data) return;

        eventGroup.data.forEach(event => {
            // 创建事件的唯一标识
            const eventKey = `${event?.事件?.id}`;

            // 检查事件是否已经处理过
            if (processedEvents.has(eventKey)) {
                return; // 跳过重复的事件
            }

            // 对于非周期性事件，检查时间范围
            if (!isZQ && !isEventInTimeRange(event?.开始时间?.start)) {
                return; // 跳过不在时间范围内的事件
            }

            // 记录已处理的事件
            processedEvents.add(eventKey);

            // Base event object with common properties
            const baseEvent = {
                start: timestampToArray(event?.开始时间?.start),
                title: event?.事件?.content,
                description: event?.描述?.content,
            };

            // Add properties based on event type
            if (isZQ) {
                try {
                    // 尝试解析重复规则
                    const rruleString = event.重复规则.content;

                    // 如果不是以"RRULE:"开头，添加前缀
                    const formattedRrule = rruleString.startsWith("RRULE:") ?
                        rruleString : `RRULE:${rruleString}`;

                    // 尝试用 rrule.js 解析，验证格式是否正确
                    const rule = RRule.fromString(formattedRrule);

                    // 如果解析成功，将正确格式的规则添加到事件中
                    transformedEvents.push({
                        ...baseEvent,
                        recurrenceRule: formattedRrule.replace("RRULE:", ""), // 去掉前缀
                        duration: { hours: event.持续时间.content || 1 }
                    });
                } catch (error) {
                    console.error('解析重复规则出错:', event.重复规则.content, error);
                    showMessage('周期事件-解析重复规则出错,请重试' + event.重复规则.content, -1, 'error');
                }
            } else {
                transformedEvents.push({
                    ...baseEvent,
                    end: timestampToArray(event.开始时间.end),
                    status: event.状态.content === "完成" ? "CONFIRMED" : "TENTATIVE"
                });
            }
        });
    });

    return transformedEvents;
}