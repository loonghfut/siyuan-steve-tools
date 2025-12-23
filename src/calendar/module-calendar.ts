import steveTools, { frontEnd, settingdata } from "@/index";
import { EventAttributes } from 'ics';
import * as api from "@/api/api"
import { showMessage, openTab, Dialog, getFrontend, Menu } from "siyuan";
import * as ic from "@/icon"
import "./event_style.scss";
declare const siyuan: any;
import { init_viewValue, run, update_av_ids } from "./calendar";
export let calendarpath = 'data/public/stevetools/calendar.ics';
let calendarpath2 = 'public/stevetools/calendar.ics';//订阅地址
export const eventsPath = 'data/public/stevetools/events.json';
export let linkToCalendar = '';
import * as myF from "./myF";
import { handleAddButtonClick_Independent, refreshKanban } from "./kanban";
import { registerTransactionListener } from './listeners/transactionListener';
import { icsFileManager, transformEvents } from './ics/IcsFileManager';
import { globalOpen2 } from "./myK";
import { addquikaddButton, getCursorElement } from "./quickadd";
import { M_caldata } from "./M_caldata";
import { ics_alist } from "./share/alist";
import { ics_s3 } from "./share/s3";
import { CalDAVClient } from "./share/qqcaldav";
import { WebDAVSync } from "./share/webdav";
import { ICSSubscription } from "./share/ics_discribe";
import { Calendar } from "@fullcalendar/core";
// import { insertHtml, THIS } from "./insertHtml"; // 未使用，保留注释以供未来参考
import { ICSImporter } from "./ics/ics_siyuan";
import { Dida365Service } from "./dida/dida_serv";
// import { AVManager } from "@/api/db_pro"; // 未使用
import { IAVOperator } from "@/api/db_interface";
import { extractDataAvId } from "@/api/api3";



// import { openNewWindowById } from "./myK";
let allEvents: EventAttributes[] = [];
export let DidaService: Dida365Service | null = null;
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
    /**
     * 对外提供的安全调度更新方法，带去抖。\n
     * 如果当前已有更新计时器在等待，则忽略新的调度请求。\n
     * @param delay 延迟毫秒，默认 2000
     */
    public scheduleCalendarUpdate(delay: number = 2000) {
        if (this.isUpdating) return;
        this.isUpdating = true;
        setTimeout(async () => {
            try {
                await this.getEventsFromSiYuanDatabase();
                console.debug("更新日历文件<schedule>");
            } finally {
                this.isUpdating = false;
            }
        }, delay);
    }

    /** 是否开启同步完成后自动更新 */
    public isAutoSyncingUpdateEnabled(): boolean {
        return this_settingdata["cal-auto-syncing-update"] === true;
    }

    /** 是否仍在监听（给监听器访问） */
    public isListening(): boolean { return islisten; }
    // private isSettingAttrs: boolean = false;  // 暂未使用，后续如需并发控制可启用
    public av_ids: any = [];
    public calConfig: M_caldata;
    public alistPlugin: ics_alist;
    public s3Client: ics_s3;
    public QQCalDAVClient: CalDAVClient;
    public webdavClient: WebDAVSync;
    public qqFullCalendarEvents;
    public icsSubscription: ICSSubscription;
    public calendarAV: IAVOperator;

    async init(settingdata: { [x: string]: any; }) {
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
                console.debug("销毁日历选项卡", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.destroy();
                    calendarinstance.delete(this.data.id);
                    console.debug("销毁日历实例", this.data.id);
                }
            },
            resize() {
                console.debug("resize", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.updateSize();
                }
            },
        })
        this.plugin.addTab({
            type: "quadrants",
            async init() {
                const id = new Date().getTime().toString();
                let calendar: Calendar
                this.element.innerHTML = `
                <div  id='calendarfu-${id}' ><div id='calendar-${id}' ></div></div>`;
                calendar = await run(id, settingdata["quadrant-default-view"] || 'priorityQuadrant');
                this.data.id = id;
                calendarinstance.set(id, calendar);
            },
            async destroy() {
                console.debug("销毁日历选项卡", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.destroy();
                    calendarinstance.delete(this.data.id);
                    console.debug("销毁日历实例", this.data.id);
                }
            },
            resize() {
                console.debug("resize", this.data.id);
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
                console.debug("销毁日历选项卡", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.destroy();
                    calendarinstance.delete(this.data.id);
                    console.debug("销毁日历实例", this.data.id);
                }
            },
            resize() {
                console.debug("resize", this.data.id);
                const calendar = calendarinstance.get(this.data.id);
                if (calendar) {
                    calendar.updateSize();
                }
            },
        })
        front = getFrontend();
        this.calConfig = new M_caldata(this.plugin.name);
        await this.calConfig.load();
        // console.debug(this.calConfig.getAll());
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

        // // steveTools.outlog(this_settingdata["cal-hand-update"]);
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
            new ICSImporter(this.plugin);
        }
        if (this_settingdata["cal-show-view"] == true) {
            const topBarElement = this.plugin.addTopBar({
                icon: "iconCalendar",
                title: "日程看板视图",
                position: "left",
                callback: async () => {
                    let rect = topBarElement.getBoundingClientRect();
                    this.addMenu(rect);
                }
            });
        }
        let D_calendar: any;
        this.plugin.addDock({
            config: {
                position: "RightTop",
                size: { width: 250, height: 0 },
                icon: "iconSTcalKanban",
                title: "当月看板",
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
                    D_calendar = await run(id, 'kanban', '', 'title', 'viewFilter,refreshButton', 'prev,next');
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
                    D_calendar_day = await run(id, 'timeGridDay', '', 'title', 'viewFilter,refreshButton,planButton', '');
                }, 100);
            },
        });


        if (this_settingdata["cal-auto-update"] == true) {
            // // steveTools.outlog("自动更新日历文件");
            //监听
            siyuan.ws.ws.addEventListener('message', async (e: { data: string; }) => {
                if (!islisten) {
                    return;
                }
                // if (1) { return; }
                const msg = JSON.parse(e.data);
                if (msg.cmd === "transactions") {
                    // steveTools.outlog(msg);
                    if (msg.data[0].doOperations[0].action === "updateAttrViewCell") {//BUG:同时添加会崩溃，无法稳定复现
                        // // steveTools.outlog("更新了一个属性视图");
                        const avids = await this.getAVreferenceid();
                        //加上周期
                        const avids_zq = await this.getAVreferenceid('周期');
                        // steveTools.outlog(avids);
                        if (avids.includes(msg.data[0].doOperations[0].avID) || avids_zq.includes(msg.data[0].doOperations[0].avID)) {
                            // steveTools.outlog("更新了日程信息");
                            //延时执行
                            if (!this.isUpdating) {
                                this.isUpdating = true;
                                setTimeout(async () => {
                                    await this.getEventsFromSiYuanDatabase();
                                    console.debug("更新日历文件<2>");
                                    this.isUpdating = false;
                                }, 10000);
                            }
                        } else {
                            // // steveTools.outlog("avID 不在 avids 数组中");
                        }
                        // steveTools.outlog("更新了日程信息");
                        //延时执行
                        if (!this.isUpdating) {
                            this.isUpdating = true;
                            setTimeout(async () => {
                                await this.getEventsFromSiYuanDatabase();
                                console.debug("更新日历文件<2>");
                                this.isUpdating = false;
                            }, 10000);
                        }
                    }
                    // // steveTools.outlog(msg);
                }
            });
            //// 暂时不用
            // 每15分钟调用一次await this.getEventsFromSiYuanDatabase()
            // setInterval(async () => {
            //     await this.getEventsFromSiYuanDatabase()
            //     // steveTools.outlog("自动更新日历文件<1>");
            // }, 900000);
        }
    // cal-auto-syncing-update 逻辑已迁移至 listeners/transactionListener.ts，通过 eventBus 'ws-main' 统一处理
        //解决 https://github.com/loonghfut/siyuan-steve-tools/issues/3
        //实现看板实时更新
        //2025-2-9更新为插件api方式监听（抽离至 listeners/transactionListener.ts）
        registerTransactionListener(this.plugin, this);
    }

    async onLayoutReady() {
        this.plugin.eventBus.on('switch-protyle', (e) => {
            addquikaddButton(e);
        });

        //悬浮显示
        if (this_settingdata["cal-show-float-view"]) {
            run("1");
        }
        //
        //dida
        if (this_settingdata["cal-dida-enable"] && this_settingdata["cal-dida-token"]) {
            DidaService = new Dida365Service(this_settingdata["cal-dida-token"], this.plugin);
        }
        //dida
        // const avManager = new AVManager();
        // // console.debug("avManager", avManager);
        // // console.debug("avidMMMM", settingdata["cal-db-id"]);
        // this.calendarAV = avManager.createOperator(settingdata["cal-db-id"]);
        // // console.debug("avidMMMM22", settingdata["cal-av-id"]);
        //配置实现只在某一端上传ics
        const selectToPics = this_settingdata["SelectTOPics"];
        if (!selectToPics || selectToPics === frontEnd) {
            await this.shareicsinit();
        }

        if (this_settingdata["cal-qq-email"] && this_settingdata["cal-qq-code"] && this_settingdata["cal-qq-enable"]) {
            this.QQCalDAVClient = new CalDAVClient(this_settingdata["cal-qq-email"], this_settingdata["cal-qq-code"]);
            await this.QQCalDAVClient.init();
            const qqCalendars_url = this_settingdata["cal-qq-calendar-url"];
            // 确保首次进入面板即拉取并写入 QQ 事件缓存
            await this.QQCalDAVClient.updateEventsFromQQCalDAV(qqCalendars_url);
            this.qqFullCalendarEvents = this.QQCalDAVClient.getEventsFromQQCalDAV();
            refreshKanban();
            console.debug("QQevent", this.qqFullCalendarEvents);
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
                // console.debug("添加日程waiwai");
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
            langKey: "ST_calendar_reload",
            langText: "刷新日历看板",
            hotkey: "",
            callback: async () => {
                // 刷新日历的逻辑
                refreshKanban();
            }
        })
        this.plugin.addCommand({
            langKey: "ST_calendar_quick",
            langText: "创建日程（应用内弹窗）",
            hotkey: "",
            callback: async () => {
                handleAddButtonClick_Independent();
            },
        })
        this.plugin.addCommand({
            langKey: "ST_calendar_quick_pro",
            langText: "创建日程（光标所在块）",
            hotkey: "",
            editorCallback: async () => {
                const cursorElement = getCursorElement();
                console.debug("🚧🚧🚧elemet:", cursorElement);

                // 1) 优先在常规块元素上查找（含 data-type 的块容器）
                let cursorElementId = cursorElement?.closest('[data-type][data-node-id]')?.getAttribute('data-node-id') ?? null;

                // 2) 列表项特殊处理，最高优先获取 .li 的 data-node-id
                if ( cursorElement?.closest('.li')) {
                    cursorElementId = cursorElement.closest('.li')!.getAttribute('data-node-id');
                    console.debug("c🚧🚧🚧(li)", cursorElementId);
                }

                // 3) 兼容文档标题区域，例如：<div class="protyle-title ..." data-node-id="..."> ... </div>
                if (!cursorElementId) {
                    const titleEl = cursorElement?.closest('.protyle-title');
                    if (titleEl) {
                        cursorElementId = titleEl.getAttribute('data-node-id');
                        console.debug("c🚧🚧🚧(title)", cursorElementId);
                    }
                }

                // 4) 兜底：向上寻找最近的含 data-node-id 的祖先
                if (!cursorElementId) {
                    const nodeEl = cursorElement?.closest('[data-node-id]');
                    if (nodeEl) {
                        cursorElementId = nodeEl.getAttribute('data-node-id');
                        console.debug("c🚧🚧🚧(any [data-node-id])", cursorElementId);
                    }
                }

                console.debug("cursorElementId", cursorElementId);
                const blockId = cursorElementId;
                console.debug("🚧🚧🚧blockId", blockId);
                if (!blockId) {
                    showMessage("请先选中一个块", 3000, "error");
                    return;
                }
                
                // console.debug("pro", blockId);
                // console.debug("创建日程（光标所在块）", blockId);
                handleAddButtonClick_Independent('', { isdirect: true, directid: blockId });
            },
        })
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
        menu.addItem({
            icon: "iconSTcalKanban",
            label: "四象限",
            click: async () => {
                if (front == "browser-mobile" || front == "mobile") {
                    await this.openRiChengViewDialog(true, "", settingdata["quadrant-default-view"] || "priorityQuadrant");
                } else {
                    await this.openRiChengView(settingdata["quadrant-default-view"] || "priorityQuadrant");
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
            console.debug("ST_ics状态:", this.icsSubscription.getEvents());
        }
        if (settingdata["cal-share"] === "alist") {
            this.alistPlugin = new ics_alist();
            this.alistPlugin.init();
        }
        if (this_settingdata["cal-share"] === "s3") {
            this.s3Client = new ics_s3({});
            this.s3Client.load_date_from_siyuan();
            this.s3Client.init();
            console.debug("ST_s3状态:", await this.s3Client.testConnection());
        }
        if (this_settingdata["cal-share"] === "s3-diy") {
            const bucket = this_settingdata["cal-s3-bucket"];
            const accessKeyId = this_settingdata["cal-s3-accessKeyId"];
            const secretAccessKey = this_settingdata["cal-s3-secretAccessKey"];
            this.s3Client = new ics_s3({ bucket: bucket, accessKeyId: accessKeyId, secretAccessKey: secretAccessKey });
            this.s3Client.load_little_date_from_siyuan();
            this.s3Client.init();
            console.debug("ST_s3状态:", await this.s3Client.testConnection());
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
            console.debug("WebDAV状态:", await this.webdavClient.testConnection());
        }
    }

    public avButton() {
        setTimeout(async () => {
            const targetSpans = Array.from(document.querySelectorAll('span[data-type="av-add-more"]'))
                .filter(span => span.closest('[name="日程"]'));
            // // steveTools.outlog(targetSpans, "targetSpans");

            targetSpans.forEach(targetSpan => {
                // 检查目标元素的右边是否已经存在按钮
                if (!targetSpan.nextSibling || !(targetSpan.nextSibling instanceof HTMLElement) || !targetSpan.nextSibling.classList.contains('st-plugin-button')) {
                    // 创建一个新的按钮元素
                    const button = document.createElement('button');
                    button.innerHTML = '<svg><use xlink:href="#iconCalendar"></use></svg>';
                    button.className = 'block__icon ariaLabel st-plugin-button'; // 确保样式统一，并添加一个标识类

                    // 添加按钮点击事件
                    button.addEventListener('click', async () => {
                        // console.debug('按钮被点击了');
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
                            // console.debug('data-id:', dataId);
                            // steveTools.outlog('Selected AV block ID:', dataId);
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
        // 统一根据 initialView 决定打开哪个选项卡（calendar / quadrants / kanban）
        const view = initialView || settingdata["cal-default-view"] || "dayGridMonth";

    // 日历视图无需专门判断，落入默认分支即可
        const kanbanViews = ["kanban", "weekkanban", "yearkanban"];
        const quadrantViews = ["priorityQuadrant", "weekpriorityQuadrant", "yearpriorityQuadrant"];

        if (quadrantViews.includes(view)) {
            await openTab({
                app: window.siyuan.ws.app,
                custom: {
                    icon: "iconSTcal",
                    title: `四象限`,
                    id: this.plugin.name + 'quadrants',
                    data: { id: null },
                },
                keepCursor: false
            });
            return;
        }

        if (kanbanViews.includes(view)) {
            await openTab({
                app: window.siyuan.ws.app,
                custom: {
                    icon: "iconSTcalKanban",
                    title: `看板视图`,
                    id: this.plugin.name + 'kanban',
                    data: { id: null },
                },
                keepCursor: false
            });
            return;
        }

        // 其余一律视为日历视图
        await openTab({
            app: window.siyuan.ws.app,
            custom: {
                icon: "iconSTcal",
                title: `日程视图`,
                id: this.plugin.name + 'calendar',
                data: { id: null },
            },
            keepCursor: false
        });
    }


    onunload() {
        // steveTools.outlog("M_calendar unloaded");
    }

    getCalUrl() {
        // // steveTools.outlog(this_settingdata["cal-enable"]);
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
            // steveTools.outlog('事件数据已保存到' + filePath);
        } catch (error) {
            console.error('保存事件数据时出错：', error);
        }
    }
    // 检查并创建events.json文件
    async checkAndCreateEventsFile(filePath: string) {
        try {
            const response = await api.getFile(filePath);
            // // steveTools.outlog(response);
            if (response.code === 404) {//TODO待改进判断
                // 如果文件不存在，创建一个空的events.json文件
                //删除其他.ics文件
                const emptyEvents: EventAttributes[] = [];
                const eventsJson = JSON.stringify(emptyEvents);
                const fileBlob = new Blob([eventsJson], { type: 'application/json' });
                await api.putFile(filePath, false, fileBlob);
                // steveTools.outlog('已创建空的 ' + filePath);
            } else {
                // steveTools.outlog(filePath + ' 文件已存在');
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
        // steveTools.outlog(res);
        const avIds = res.map(item => extractDataAvId(item.markdown)).filter(id => id !== null);
        // steveTools.outlog(avIds); // 输出: ['20241213113357-m9b143e', ...]
        return avIds;

    }
    async getAVreferenceid_pro(forwhat: string = '日程') {
        const sqlStr = `SELECT markdown, content
        FROM blocks
        WHERE name = '${forwhat}'
        AND markdown LIKE '%NodeAttributeView%data-av-id%';`;

        const res = await api.sql(sqlStr);
        // // steveTools.outlog("RES:::::::::",res);
        // steveTools.outlog(res);

        const avIds = res.map(item => ({
            id: extractDataAvId(item.markdown),
            name: item.content?.split(' ')[0] || 'N/A'
        })).filter(item => item.id !== null);

        console.debug("avIds", avIds); // 输出: [{id: '20241213113357-m9b143e', name: '...'}, ...]

        return avIds;
    }

    async getEventsFromSiYuanDatabase() {
        try {
            // steveTools.outlog('开始生成ics文件');

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
            // console.debug("EEEEEEEEEEEEEEEEEView data:", viewValue);
            const result = transformEvents(viewValue);
            await this.addEventToGlobal(result);

            // 处理周期事件
            const avids_zq = await this.getAVreferenceid("周期");
            if (avids_zq && Array.isArray(avids_zq) && avids_zq.length > 0) {
                const viewIDs_zq = await myF.getViewId(avids_zq);
                const viewValue_zq = await myF.getViewValue(viewIDs_zq, true);
                // steveTools.outlog("EEEEEEEEEEEEEEEEEView data:", viewValue_zq);
                const result_zq = transformEvents(viewValue_zq, true);
                //TODO:周期事件的周期处理改为数据库单选
                await this.addEventToGlobal(result_zq);
            }
            await this.uploadAllEventsToFile(eventsPath);
            await icsFileManager.generateFromEventsJson(eventsPath, calendarpath);

            const selectToPics = this_settingdata["SelectTOPics"];
            if (!selectToPics || selectToPics === frontEnd) {
                if (settingdata["cal-share"] === "alist") {
                    await this.alistPlugin.upload_ics();
                    console.debug("alist_ics");
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
            // steveTools.outlog('新事件已添加到全局变量');
            // console.debug("allEvents", allEvents);
        } catch (error) {
            console.error('添加事件到全局变量时出错：', error);
        }
        // steveTools.outlog("Aevent::::::::::::::::::::", allEvents);
    }

    // 上传全局事件数据到JSON文件
    async uploadAllEventsToFile(jsonFilePath: string) {
        try {
            // 将全局事件数组保存回JSON文件
            const updatedEventsJson = JSON.stringify(allEvents);
            // steveTools.outlog("updatedEventsJson", allEvents);
            const fileBlob = new Blob([updatedEventsJson], { type: 'application/json' });
            await api.putFile(jsonFilePath, false, fileBlob);
            // steveTools.outlog('所有事件已保存到' + jsonFilePath);
        } catch (error) {
            console.error('上传事件到文件时出错：', error);
        }
    }
}


