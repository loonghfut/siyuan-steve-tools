import type steveTools from "@/index";
import { EventAttributes } from 'ics';
import * as api from "@/api/api"
import { showMessage, openTab, Dialog, getFrontend, Menu } from "siyuan";
import * as ic from "@/icon"
import "./ui/styles/calendar-global.scss";
import "./ui/styles/calendar-events.scss";
declare const siyuan: any;
import { init_viewValue, run, update_av_ids, applyCalendarSettingsToInstances } from "./ui/calendar-view";
import * as myF from "./data/calendar-data";
import { CALENDAR_EVENTS_JSON_PATH, calendarPaths, configureCalendarPaths } from './config/calendar-paths';
import { activeCalendars, scheduleCalendarRefresh, unregisterCalendarInstance } from './core/calendar-runtime';
import { configureCalendarContext } from './core/calendar-context';
import { registerCalendarCellWriteLifecycle } from './core/calendar-cell-write-lifecycle';
import { registerTransactionListener } from './listeners/transactionListener';
import { LIFELOG_CHANGED_EVENT } from '../lifelog/contracts';
import { LifelogView } from './integrations/lifelog-event-source';
import { icsFileManager, transformEvents } from './integrations/ics/IcsFileManager';
import { createScheduleInConfiguredDatabase } from './features/schedule-creation';
import { openScheduleEditor } from './features/schedule-editor';
import { addQuickAddButton, getCursorContainer } from './features/quick-add';
import { M_caldata } from "./config/calendar-view-config";
import { ics_s3 } from "./integrations/share/s3";
import { WebDAVSync } from "./integrations/share/webdav";
import { ICSSubscription } from "./integrations/share/ics_discribe";
import { Calendar } from "@fullcalendar/core";
import { ICSImporter } from "./integrations/ics/ics_siyuan";
import { Dida365Service } from "./integrations/dida/features/dida-service";
// import { AVManager } from "@/api/db_pro"; // 未使用
import { IAVOperator } from "@/api/db_interface";
import { extractDataAvId } from "@/api/api3";
import { applyTopBarButton } from "@/libs/topbar";



let allEvents: EventAttributes[] = [];
export let DidaService: Dida365Service | null = null;
let this_settingdata: any = {};
let islisten = true;
let front: "desktop" | "desktop-window" | "mobile" | "browser-desktop" | "browser-mobile";
const calendarinstance: Map<string, Calendar> = new Map();
export class M_calendar {
    private plugin: steveTools;
    private loadedProtyleHandler?: () => void;
    private switchProtyleInitHandler?: () => void;
    private switchProtyleLayoutHandler?: (e: any) => void;
    private wsMessageHandler?: (e: { data: string }) => Promise<void>;
    private unregisterTransactionListener?: () => void;
    private unregisterCellWriteLifecycle?: () => void;
    /**
     * lifelog 增量更新处理器：lifelog 模块写完属性后广播 LIFELOG_CHANGED_EVENT，
     * 此处 invalidate 对应缓存并做一次 debounced refetch（只补差受影响 block，
     * 而非全量重取整月）。详见 LifelogView 的缓存机制。
     */
    private lifelogChangedHandler?: (e: any) => void;
    private lifelogRefreshTimer?: ReturnType<typeof setTimeout>;
    /** ICS 导入器实例（缓存了设置，需要随设置变化更新） */
    private icsImporter?: ICSImporter;
    /** 当前生效的 ICS 订阅地址，用于判断订阅是否需要重新拉取 */
    private icsSubscribeUrl = "";
    /** 分享（S3/WebDAV）相关配置的快照，用于判断分享客户端是否需要重建 */
    private shareConfigSnapshot = "";
    /** 顶栏按钮：「立刻生成ics文件」 */
    private handUpdateTopBar?: HTMLElement;
    /** 顶栏按钮：「日程视图」 */
    private showViewTopBar?: HTMLElement;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    private isUpdating: boolean = false;
    private avIdCache: Map<string, { ts: number; value: string[] }> = new Map();
    // 日程 AV 的发现结果只会在用户新建、删除或重命名对应块时变化，
    // 不应跟随每次日历 refetch 重新执行 blocks SQL。
    private avIdCacheTTL = 10 * 1000;
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

    /** All AV IDs that feed calendar data, including recurring-event databases. */
    public async getManagedCalendarAvIds(): Promise<string[]> {
        const [normal, recurring] = await Promise.all([
            this.getAVreferenceid(),
            this.getAVreferenceid('周期'),
        ]);
        return Array.from(new Set([...(normal || []), ...(recurring || [])]));
    }
    // private isSettingAttrs: boolean = false;  // 暂未使用，后续如需并发控制可启用
    public av_ids: any = [];
    public calConfig: M_caldata;
    public s3Client: ics_s3;
    public webdavClient: WebDAVSync;
    public icsSubscription?: ICSSubscription;
    public calendarAV: IAVOperator;

    async init(settingdata: { [x: string]: any; }) {
        configureCalendarContext(settingdata, this);
        this.unregisterCellWriteLifecycle?.();
        this.unregisterCellWriteLifecycle = registerCalendarCellWriteLifecycle();
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
                    unregisterCalendarInstance(calendar);
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
        configureCalendarPaths(settingdata["cal-url"]);
        this.plugin.addIcons(`
    <symbol id="iconSTcal" viewBox="0 0 500 500">
       ${ic.steveTools_cal}
    </symbol>
        `);
        this.checkAndCreateEventsFile(CALENDAR_EVENTS_JSON_PATH);
        this.loadedProtyleHandler = this.avButton.bind(this);
        this.switchProtyleInitHandler = this.avButton.bind(this);
        this.plugin.eventBus.on("loaded-protyle-dynamic", this.loadedProtyleHandler);
        // this.plugin.eventBus.on("loaded-protyle-static", this.avButton.bind(this));
        this.plugin.eventBus.on("switch-protyle", this.switchProtyleInitHandler);

        // // steveTools.outlog(this_settingdata["cal-hand-update"]);
        // 顶栏按钮（随设置显隐，热更新时复用同一条目）
        this.applyTopBarButtons();
        if (this_settingdata["cal-ics-subscribe-import"] == true) {
            this.icsImporter = new ICSImporter(this.plugin);
        }
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
            init: async function () {
                const dock = this;
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
            this.applyAutoUpdateListener();
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
        this.unregisterTransactionListener = registerTransactionListener(this.plugin, this);

        // lifelog 增量更新接入：lifelog 模块写完属性后会广播此事件，ids 为变更 blockId 列表。
        // 此处只需：1) invalidate 缓存（让下次 getLifelogEvents 重取这些 block）；
        //          2) debounced refetch 当前可见的日历实例（仅显示 lifelog 的）。
        // 不走 transactionListener 的全量刷新链路——那个已被
        // isLifelogSelfUpdateAttrs 过滤掉。
        this.lifelogChangedHandler = (e) => {
            const ids: string[] | undefined = e?.ids;
            if (ids && ids.length > 0) {
                LifelogView.invalidate(ids);
            } else {
                // 无具体 id（理论上不会发生），保守全量失效
                LifelogView.invalidateAll();
            }
            // debounce：避免短时间内多次写入触发多次 refetch
            if (this.lifelogRefreshTimer) {
                clearTimeout(this.lifelogRefreshTimer);
            }
            this.lifelogRefreshTimer = setTimeout(() => {
                this.lifelogRefreshTimer = undefined;
                try {
                    // 直接 refetch 当前日历实例：getLifelogEvents 内部会因缓存命中跳过
                    // 未变更的 block，只重取受影响的少数几条，避免全月 N 次 getBlockAttrs。
                    for (const cal of activeCalendars) {
                        if (cal && cal.el && document.body.contains(cal.el)) {
                            cal.refetchEvents();
                        }
                    }
                } catch (err) {
                    console.warn('lifelog 增量 refetch 失败:', err);
                }
            }, 300);
        };
        // eventBus.on/off 的签名限定为 keyof IEventBusMap（思源内置事件），
        // 自定义事件名需断言。这是思源插件常见做法，eventBus 内部按字符串匹配。
        (this.plugin.eventBus as any).on(LIFELOG_CHANGED_EVENT, this.lifelogChangedHandler);
    }

    /**
     * 设置热更新（跨端改动设置后由插件入口调用）。
     *
     * 只更新缓存的配置并重新应用受影响的行为：
     * 不重复注册事件监听、不重复创建 dock/topbar。
     */
    updateSettings(settingdata: any) {
        const shareSnapshot = M_calendar.getShareConfigSnapshot(settingdata);
        const shareChanged = shareSnapshot !== this.shareConfigSnapshot;
        this_settingdata = settingdata;
        // 让日历内部（视图、数据、ics 集成等）读到最新配置
        configureCalendarContext(settingdata, this);
        // ics 文件名（订阅地址）
        configureCalendarPaths(settingdata["cal-url"]);
        // ICS 导入器缓存了配置
        this.icsImporter?.updateSettings?.(settingdata);
        // 顶栏按钮显隐
        this.applyTopBarButtons();
        // 自动更新监听开关
        this.applyAutoUpdateListener();
        // 已有日历实例应用新的时间轴配置并重新取数
        applyCalendarSettingsToInstances();
        scheduleCalendarRefresh();
        // ICS 订阅地址变化时重新拉取（地址未变则跳过）
        void this.refreshIcsSubscription();
        // 分享配置变化时重建本端已存在的分享客户端
        if (shareChanged) {
            void this.refreshShareClients();
        }
        this.shareConfigSnapshot = shareSnapshot;
    }

    /**
     * 根据设置应用顶栏按钮的显隐。
     * 顶栏条目用固定 id 注册，重复调用只会更新同一条目，不会新增。
     */
    private applyTopBarButtons() {
        this.handUpdateTopBar = applyTopBarButton(this.plugin, this.handUpdateTopBar, "st-cal-hand-update", {
            icon: "iconSTcal",
            title: "立刻生成ics文件",
            position: "right",
            callback: async () => {
                await this.getEventsFromSiYuanDatabase()
                showMessage("日历文件生成结束", 3000, "info");
            }
        }, this_settingdata["cal-hand-update"] == true);
        this.showViewTopBar = applyTopBarButton(this.plugin, this.showViewTopBar, "st-cal-show-view", {
            icon: "iconCalendar",
            title: "日程视图",
            position: "left",
            callback: async () => {
                let rect = this.showViewTopBar!.getBoundingClientRect();
                this.addMenu(rect);
            }
        }, this_settingdata["cal-show-view"] == true);
    }

    /**
     * 根据设置开启/关闭「自动更新日历文件」的 WebSocket 监听。
     * 幂等：已开启时不会重复注册，已关闭时会移除监听。
     */
    private applyAutoUpdateListener() {
        const enabled = this_settingdata["cal-auto-update"] == true;
        if (enabled && !this.wsMessageHandler) {
            this.wsMessageHandler = this.createAutoUpdateHandler();
            siyuan.ws.ws.addEventListener('message', this.wsMessageHandler);
        } else if (!enabled && this.wsMessageHandler) {
            siyuan.ws.ws.removeEventListener('message', this.wsMessageHandler);
            this.wsMessageHandler = undefined;
        }
    }

    /**
     * 创建「自动更新日历文件」的 WebSocket 监听器。
     */
    private createAutoUpdateHandler() {
        return async (e: { data: string; }) => {
            if (!islisten) {
                return;
            }
            // if (1) { return; }
            const msg = JSON.parse(e.data);
            if (msg.cmd === "transactions") {
                const operations = (msg.data || []).flatMap((transaction: any) => transaction?.doOperations || []);
                const cellWrites = operations.filter((op: any) =>
                    op?.action === 'updateAttrViewCell' && op?.avID
                );
                if (cellWrites.length > 0) {
                    const managedAvIds = new Set(await this.getManagedCalendarAvIds());
                    const hasCalendarWrite = cellWrites.some((op: any) => managedAvIds.has(op.avID));
                    if (hasCalendarWrite && !this.isUpdating) {
                        this.isUpdating = true;
                        setTimeout(async () => {
                            try {
                                await this.getEventsFromSiYuanDatabase();
                                console.debug("更新日历文件<2>");
                            } finally {
                                this.isUpdating = false;
                            }
                        }, 10000);
                    }
                }
            }
        };
    }

    async onLayoutReady() {
        this.switchProtyleLayoutHandler = (e) => {
            addQuickAddButton(e);
        };
        this.plugin.eventBus.on('switch-protyle', this.switchProtyleLayoutHandler);

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
        if (!selectToPics || selectToPics === front) {
            await this.shareicsinit();
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
                    openScheduleEditor();
                } finally {
                    setTimeout(() => {
                        isCommandExecuting = false;
                    }, 3000);
                }
            },
        })
        this.plugin.addCommand({
            langKey: "ST_calendar_reload",
            langText: "刷新日历",
            hotkey: "",
            callback: async () => {
                // 刷新日历的逻辑
                scheduleCalendarRefresh();
            }
        })
        this.plugin.addCommand({
            langKey: "ST_calendar_quick",
            langText: "创建日程（应用内弹窗）",
            hotkey: "",
            callback: async () => {
                createScheduleInConfiguredDatabase();
            },
        })
        this.plugin.addCommand({
            langKey: "ST_calendar_quick_pro",
            langText: "创建日程（光标所在块）",
            hotkey: "",
            editorCallback: async () => {
                const cursorElement = getCursorContainer();
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
                createScheduleInConfiguredDatabase('', { isdirect: true, directid: blockId });
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
                    await this.openRiChengViewDialog(true, "", this_settingdata["cal-default-view"]);
                } else {
                    await this.openRiChengView();
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
        await this.refreshIcsSubscription();
        if (this_settingdata["cal-share"] === "s3" || this_settingdata["cal-share"] === "s3-diy") {
            await this.createS3Client();
        }
        if (this_settingdata["cal-share"] === "webdav") {
            await this.createWebdavClient();
        }
        this.shareConfigSnapshot = M_calendar.getShareConfigSnapshot(this_settingdata);
    }

    /**
     * 拉取 ICS 订阅内容。
     * 订阅地址变化时重建订阅对象并重新拉取，地址未变则跳过（避免重复请求）。
     */
    private async refreshIcsSubscription() {
        if (!this_settingdata["cal-ics-enable-subscribe"]) {
            this.icsSubscription = undefined;
            this.icsSubscribeUrl = "";
            return;
        }
        const url = String(this_settingdata["cal-ics-subscribe-url"] || "");
        if (this.icsSubscription && this.icsSubscribeUrl === url) {
            return;
        }
        this.icsSubscribeUrl = url;
        this.icsSubscription = new ICSSubscription([url]);
        await this.icsSubscription.init();
        console.debug("ST_ics状态:", this.icsSubscription.getEvents());
    }

    /**
     * 分享方式变化时按**目标方式**准备客户端。
     *
     * 目标方式此前从未用过时客户端并不存在；若只在"已存在时重建"，
     * 上传分支会拿到 undefined 抛 TypeError，且错误被吞掉后用户看不到任何提示。
     */
    private async refreshShareClients() {
        const share = this_settingdata["cal-share"];
        if (share === "s3" || share === "s3-diy") {
            // 切走 WebDAV 时不再保留旧客户端
            this.webdavClient = undefined;
            await this.createS3Client();
            return;
        }
        if (share === "webdav") {
            this.s3Client = undefined;
            await this.createWebdavClient();
            return;
        }
        // 关闭分享：两种客户端都不再使用
        this.s3Client = undefined;
        this.webdavClient = undefined;
    }

    /**
     * 创建 S3 分享客户端（按设置区分内置与自定义桶）。
     */
    private async createS3Client() {
        if (this_settingdata["cal-share"] === "s3") {
            this.s3Client = new ics_s3({});
            this.s3Client.load_date_from_siyuan();
            this.s3Client.init();
            console.debug("ST_s3状态:", await this.s3Client.testConnection());
            return;
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
    }

    /**
     * 创建 WebDAV 分享客户端。
     */
    private async createWebdavClient() {
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

    /**
     * 分享相关配置的快照，用于判断分享客户端是否需要重建。
     */
    private static getShareConfigSnapshot(settings: any): string {
        return JSON.stringify([
            settings?.["cal-share"],
            settings?.["cal-s3-bucket"],
            settings?.["cal-s3-accessKeyId"],
            settings?.["cal-s3-secretAccessKey"],
            settings?.["cal-webdav-url"],
            settings?.["cal-webdav-username"],
            settings?.["cal-webdav-password"],
            settings?.["cal-webdav-path"],
        ]);
    }

    public avButton() {
        setTimeout(async () => {
            // 思源 3.8 把「新增行」按钮从 span 换成了 button（app/src/protyle/render/av/headerEditing.ts），
            // 这里不限定元素名，避免升级后匹配不到节点导致按钮注入静默失效。
            const targetSpans = Array.from(document.querySelectorAll('[data-type="av-add-more"]'))
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

    async openRiChengView() {
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
        if (this.loadedProtyleHandler) {
            try {
                this.plugin.eventBus.off("loaded-protyle-dynamic", this.loadedProtyleHandler);
            } catch (error) {
                console.warn("移除 loaded-protyle-dynamic 监听失败", error);
            }
            this.loadedProtyleHandler = undefined;
        }
        if (this.switchProtyleInitHandler) {
            try {
                this.plugin.eventBus.off("switch-protyle", this.switchProtyleInitHandler);
            } catch (error) {
                console.warn("移除日历初始化 switch-protyle 监听失败", error);
            }
            this.switchProtyleInitHandler = undefined;
        }
        if (this.switchProtyleLayoutHandler) {
            try {
                this.plugin.eventBus.off('switch-protyle', this.switchProtyleLayoutHandler);
            } catch (error) {
                console.warn("移除日历布局 switch-protyle 监听失败", error);
            }
            this.switchProtyleLayoutHandler = undefined;
        }
        if (this.wsMessageHandler) {
            try {
                siyuan.ws.ws.removeEventListener('message', this.wsMessageHandler);
            } catch (error) {
                console.warn("移除日历 WebSocket 监听失败", error);
            }
            this.wsMessageHandler = undefined;
        }
        if (this.unregisterTransactionListener) {
            try {
                this.unregisterTransactionListener();
            } catch (error) {
                console.warn("卸载日历事务监听失败", error);
            }
            this.unregisterTransactionListener = undefined;
        }
        if (this.unregisterCellWriteLifecycle) {
            this.unregisterCellWriteLifecycle();
            this.unregisterCellWriteLifecycle = undefined;
        }
        if (this.lifelogChangedHandler) {
            try {
                (this.plugin.eventBus as any).off(LIFELOG_CHANGED_EVENT, this.lifelogChangedHandler);
            } catch (error) {
                console.warn("移除 lifelog 变更监听失败", error);
            }
            this.lifelogChangedHandler = undefined;
        }
        if (this.lifelogRefreshTimer) {
            clearTimeout(this.lifelogRefreshTimer);
            this.lifelogRefreshTimer = undefined;
        }
        try {
            DidaService?.destroy?.();
        } catch (error) {
            console.warn("销毁滴答服务失败", error);
        }
        DidaService = null;
    }

    getCalUrl() {
        // // steveTools.outlog(this_settingdata["cal-enable"]);
        if (this_settingdata["cal-enable"] == true) {
            const currentHost = "（思源伺服地址）";
            showMessage("日历订阅链接：" + currentHost + "/" + calendarPaths.icsPublicPath, 0, "info");
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
        const cached = this.avIdCache.get(forwhat);
        const now = Date.now();
        if (cached && (now - cached.ts) < this.avIdCacheTTL) {
            return cached.value;
        }
        const sqlStr = `SELECT markdown
        FROM blocks
        WHERE name = '${forwhat}'
        AND markdown LIKE '%NodeAttributeView%data-av-id%' LIMIT 9999999;`
            ;
        const res = await api.sql(sqlStr);
        // steveTools.outlog(res);
        const avIds = res.map(item => extractDataAvId(item.markdown)).filter(id => id !== null);
        this.avIdCache.set(forwhat, { ts: now, value: avIds });
        // steveTools.outlog(avIds); // 输出: ['20241213113357-m9b143e', ...]
        return avIds;

    }
    async getAVreferenceid_pro(forwhat: string = '日程') {
        const sqlStr = `SELECT markdown, content
        FROM blocks
        WHERE name = '${forwhat}'
        AND markdown LIKE '%NodeAttributeView%data-av-id%' LIMIT 9999999;`;

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
            await this.uploadAllEventsToFile(CALENDAR_EVENTS_JSON_PATH);
            await icsFileManager.generateFromEventsJson(CALENDAR_EVENTS_JSON_PATH, calendarPaths.icsDataPath);

            const selectToPics = this_settingdata["SelectTOPics"];
            if (!selectToPics || selectToPics === front) {
                if (this_settingdata["cal-share"] === "s3" || this_settingdata["cal-share"] === "s3-diy") {
                    if (!this.s3Client) {
                        // 客户端缺失（例如分享方式刚被切换）时按当前设置补建，避免 undefined 调用
                        await this.createS3Client();
                    }
                    if (this.s3Client) {
                        const ics = await api.getFileBlob(calendarPaths.icsDataPath)
                        const file = new File([ics], "calendar.ics", { type: "text/calendar" });
                        await this.s3Client.uploadFile(calendarPaths.icsPublicPath, file);
                    } else {
                        showMessage("S3 分享客户端未就绪，请检查分享设置", 3000, "error");
                    }
                }
                if (this_settingdata["cal-share"] === "webdav") {
                    if (!this.webdavClient) {
                        await this.createWebdavClient();
                    }
                    if (this.webdavClient) {
                        const ics = await api.getFileBlob(calendarPaths.icsDataPath)
                        const file = new File([ics], "calendar.ics", { type: "text/calendar" });
                        await this.webdavClient.uploadFile(this_settingdata["cal-url"] || "1.ics", file);//特殊处理，不自动建文件夹防止权限报错
                    } else {
                        showMessage("WebDAV 分享客户端未就绪，请检查分享设置", 3000, "error");
                    }
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


