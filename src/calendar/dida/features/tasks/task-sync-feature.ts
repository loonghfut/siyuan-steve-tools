import { showMessage } from "siyuan";
import { Dida365ApiClient } from "@/calendar/dida/api/dida-api-client";
import { Project, Task, TaskCompletedQuery, TaskFilterQuery, TaskMoveOperation, TaskMoveResult } from "@/calendar/dida/dida_interface";
import steveTools, { settingdata } from "@/index";
import { getViewId, getViewValue } from "@/calendar/myF";
import { addBlockToDatabase_pro, appendBlock, createDailyNote, generateSiyuanID, setBlockAttrs, showStatusMessage, updateAttrViewCell_pro, updatemainkey } from "@/api/api";
import { formatDateForDida, formatDateToISO, formatLocalDate } from "@/calendar/dida/siyuan_api";
import { createDidaDock, DidaLinkInterceptor } from "@/api/dockdida_pro";
import * as ic from "@/icon"
import { beginTaggedRequests, endTaggedRequests } from "@/api/network-interceptor";
import type { DidaSyncFeature } from "@/calendar/dida/sync/sync-feature";
import { TaskSyncStore } from "@/calendar/dida/storage/task-sync-store";
import {
    getDidaStatusAttr,
    hasSiyuanTaskChanged,
    mapDidaTaskToSiyuan,
    parseDidaReminders,
    removeDidaLinks,
} from "@/calendar/dida/mappers/task-mapper";
import {
    buildDidaImportTemplateData,
    getDefaultDidaImportTemplate,
    renderDidaTemplate,
} from "@/calendar/dida/mappers/task-template-mapper";
import { SiyuanTaskChangeSource } from "@/calendar/dida/sync/siyuan-task-change-source";
export class DidaTaskSyncFeature implements DidaSyncFeature {
    readonly id = "tasks";
    private apiClient: Dida365ApiClient;
    private plugin: steveTools;
    private avId: string | null = null; // 用于存储滴答清单同步的数据库ID
    private todoListId: string | null = null; // 用于存储未完成任务列表ID
    // private doneListId: string | null = null; // 用于存储已完成任务列表ID cal-dida-finished-list
    private readonly store = new TaskSyncStore();
    private get taskCache() { return this.store.tasks; }
    private isSyncing = false; // 新增同步锁
    private get creatingDidaIds() { return this.store.creatingDidaIds; }
    private get pendingSiyuanCreates() { return this.store.pendingSiyuanCreates; }
    private syncDebounceTimer: NodeJS.Timeout | null = null; // 防抖计时器
    private readonly changeSource: SiyuanTaskChangeSource;
    private get lastModifiedTime() { return this.store.lastModifiedTime; }
    private get taskSyncLocks() { return this.store.taskSyncLocks; }
    private get lastSyncDirection() { return this.store.lastSyncDirection; }
    private get pendingDidaUpdates() { return this.store.pendingDidaUpdates; }
    private get pendingSiyuanConfirmTargets() { return this.store.pendingSiyuanConfirmTargets; }
    private pendingSiyuanConfirmTimer: NodeJS.Timeout | null = null; // 确认检查定时器
    private get pendingSiyuanTargets() { return this.store.pendingSiyuanTargets; }
    private pendingSiyuanSyncTimer: NodeJS.Timeout | null = null; // 思源待同步队列刷新计时器
    private autoSyncInterval?: number;
    private initialSyncTimer?: number;
    private getCompletedTaskRetentionDays(): number {
        const raw = (settingdata as any)["cal-dida-completed-days"];
        if (raw === null || raw === undefined || raw === "") {
            return 15;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            return 15;
        }
        return Math.max(0, Math.floor(parsed));
    }

    private getCompletedTaskQuery(): TaskCompletedQuery {
        const days = this.getCompletedTaskRetentionDays();
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        const query: TaskCompletedQuery = {};

        if (this.todoListId) {
            query.projectIds = [this.todoListId];
        }

        query.startDate = formatDateToISO(start);
        query.endDate = formatDateToISO(end);
        return query;
    }

    private getDidaUpdateCooldownMs(): number {
        const raw = (settingdata as any)["cal-dida-sync-cooldown"];
        const seconds = Number.isFinite(Number(raw)) ? Number(raw) : 30;
        // 最低 5 秒，避免 0 导致无保护
        return Math.max(5, seconds) * 1000;
    }

    constructor(apiClient: Dida365ApiClient, plugin: steveTools) {
        this.plugin = plugin;
        this.apiClient = apiClient;
        this.todoListId = settingdata["cal-dida-unfinished-list"] || null;
        this.changeSource = new SiyuanTaskChangeSource({
            plugin,
            getAvId: () => this.avId,
            isSyncing: () => this.isSyncing,
            onForceTarget: async (blockId, itemID) => {
                this.enqueueSiyuanConfirmTarget({ blockId, itemID }, 8000);
                await this.processSiyuanUpdateTarget(blockId, itemID);
            },
            onQueuedTarget: (blockId, itemID, isDetached) => {
                this.enqueueSiyuanConfirmTarget({ blockId, itemID }, 8000);
                this.enqueueSiyuanSyncTarget(blockId, itemID, isDetached);
            },
        });
        console.debug("Dida365Service initialized", this.todoListId);
        this.plugin.addIcons(`
            <symbol id="iconSTdida" viewBox="0 0 48 48">
                ${ic.steveTools_dida}
            </symbol>
            `)
    }

    async start(): Promise<void> {
        await this.init();
    }

    /**
     * 初始化 Dida365Service，进行必要的设置或验证。
     */
    private async init() {
        if (settingdata["cal-dida-sync-mode"] === "all" || settingdata["cal-dida-sync-mode"] === "manual") {
            this.plugin.addTopBar({
                icon: "iconSTdida",
                title: "导入滴答清单数据", // 标题可以考虑根据模式动态变化或在设置中说明
                position: "right",
                callback: async () => {
                    // const data = await this.getAllTasks();
                    // console.debug("获取到的所有任务数据:", data);
                    await this.syncTasksToSiyuan();
                }
            });
        };
        this.createDock();
        if (settingdata["cal-dida-sync-mode"] === "auto" || settingdata["cal-dida-sync-mode"] === "all") {
            // 自动同步模式，设置定时器
            this.initialSyncTimer = window.setTimeout(async () => {
                if (!this.isSyncing) { // 首次延迟10秒后同步一次
                    await this.syncTasksToSiyuan();
                }
            }, 10000);
            this.autoSyncInterval = window.setInterval(async () => {
                if (!this.isSyncing) { // 仅在未同步时执行
                    await this.syncTasksToSiyuan();
                }
            }, settingdata["cal-dida-sync-interval"] * 60 * 1000); // 转换为毫秒
        };
        await this.init_av();
        await this.getAllTasks(); // 初始化时加载滴答任务缓存
        this.changeSource.start();
    }
    /**
     * 获取数据库视图数据的封装方法
     * @param logMessage 可选的日志消息前缀
     * @returns Promise<any> 返回视图数据
     */
    private async getAvViewData(logMessage?: string): Promise<any> {
        if (!this.avId || this.avId.trim() === "") {
            throw new Error("avId 未设置或为空");
        }

        const data = await getViewId([this.avId]);
        if (logMessage) {
            console.debug(`${logMessage} - 获取到的 avId 数据:`, data);
        }

        const viewValue = await getViewValue(data, false, "dida");
        if (logMessage) {
            console.debug(`${logMessage} - 获取到的 avId 对应的值:`, viewValue);
        }

        return viewValue;
    }

    private async init_av() {
        this.avId = settingdata["cal-dida-db-id"]
        if (!this.avId || this.avId.trim() === "") {
            showMessage("Dida365Service: avId is not set or is empty.");
            return;
        }

        try {
            await this.getAvViewData("初始化数据库视图");
        } catch (error) {
            console.error("初始化数据库视图失败:", error);
            showMessage("初始化数据库视图失败: " + (error instanceof Error ? error.message : String(error)));
        }
    }
    private linkInterceptor: DidaLinkInterceptor;
    private createDock() {
        this.linkInterceptor = new DidaLinkInterceptor(showMessage);
        const dockConfig = createDidaDock({
            title: "滴答清单",
            icon: "iconSTdida",
            type: "dida-dock",
            position: "RightTop",
            size: { width: 350, height: 0 },
            showMessage,
            onDockCreated: (dock) => {
                // 设置链接拦截器
                this.linkInterceptor.setDock(dock);
                console.debug("滴答清单dock创建成功", dock);
            },
            iframeId: "dida-dock",
            containerClass: "dida-dock-container"
        });
        this.linkInterceptor.setDock_more(dockConfig);
        // 添加dock到插件
        this.plugin.addDock(dockConfig as any);
    }

    /**
     * 防抖同步方法：等待指定时间，如果期间有新的调用则重新计时
     * 优化：添加冷却期检查，避免刚修改后立即反向同步覆盖
     */
    private debouncedSyncTasksToSiyuan(delay = 10000, confirmTarget?: { blockId: string; itemID: string }): void {
        if (confirmTarget) {
            this.enqueueSiyuanConfirmTarget(confirmTarget, delay);
            console.debug("已加入思源->滴答确认检查队列", confirmTarget, "delay=", delay);
            return;
        }

        // 清除之前的计时器
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            console.debug("取消之前的同步计时器，重新开始等待");
        }

        // 设置新的计时器
        this.syncDebounceTimer = setTimeout(async () => {
            try {
                let isUpdate = false;
                if (confirmTarget) {
                    console.debug("防抖等待完成，开始执行思源优先的确认同步", confirmTarget);
                } else {
                    console.debug("防抖等待完成，开始执行同步任务到思源");
                }
                
                // 若存在本地更新未确认的任务，稍后再同步，避免覆盖
                if (this.hasPendingDidaUpdates()) {
                    console.debug("检测到本地待同步任务，延迟5秒后重试");
                    this.debouncedSyncTasksToSiyuan(5000);
                    return;
                }

                // 检查是否有任务正在被锁定（正在同步中）
                const hasLockedTasks = Array.from(this.taskSyncLocks.values()).some(locked => locked);
                if (hasLockedTasks) {
                    console.debug("检测到有任务正在同步中，延迟5秒后重试");
                    this.debouncedSyncTasksToSiyuan(5000);
                    return;
                }
                
                if (confirmTarget) {
                    isUpdate = await this.confirmSiyuanTaskToDida(confirmTarget.blockId, confirmTarget.itemID);
                } else {
                    isUpdate = await this.syncTasksToSiyuan();
                }
                this.syncDebounceTimer = null; // 清空计时器引用
                if (isUpdate && delay === 10000) {
                    showMessage(confirmTarget ? "思源数据已确认同步到滴答" : "滴答任务同步不一致", 2000, "info", "dida-sync");
                }else if (isUpdate && delay === 3000) {
                    showMessage("滴答同步完成", 2000, "info", "dida-sync");
                }
            } catch (error) {
                console.error("防抖同步执行失败:", error);
                this.syncDebounceTimer = null; // 清空计时器引用
            }
        }, delay);

        console.debug(`设置防抖同步计时器，将在${delay / 1000}秒后执行（如无新的调用）`);
    }

    /**
     * 清理过期的本地待同步标记
     */
    private cleanupPendingDidaUpdates(now = Date.now()): void {
        for (const [id, until] of this.pendingDidaUpdates.entries()) {
            if (until <= now) {
                this.pendingDidaUpdates.delete(id);
            }
        }
    }

    /**
     * 标记某个任务为“本地已更新，等待滴答确认”
     */
    private markPendingDidaUpdate(didaId: string, cooldownMs?: number): void {
        if (!didaId) return;
        const ttl = cooldownMs ?? this.getDidaUpdateCooldownMs();
        this.pendingDidaUpdates.set(didaId, Date.now() + ttl);
    }

    /**
     * 判断任务是否仍处于本地更新冷却期
     */
    private isPendingDidaUpdate(didaId: string): boolean {
        const until = this.pendingDidaUpdates.get(didaId);
        if (!until) return false;
        if (Date.now() > until) {
            this.pendingDidaUpdates.delete(didaId);
            return false;
        }
        return true;
    }

    /**
     * 判断是否仍有本地待同步任务
     */
    private hasPendingDidaUpdates(): boolean {
        this.cleanupPendingDidaUpdates();
        return this.pendingDidaUpdates.size > 0;
    }

    /**
     * 将单条确认检查加入队列，避免连续同步时前一个检查被后一个覆盖。
     */
    private enqueueSiyuanConfirmTarget(confirmTarget: { blockId: string; itemID: string }, delay: number): void {
        const key = `${confirmTarget.blockId}::${confirmTarget.itemID}`;
        const dueAt = Date.now() + delay;
        const previous = this.pendingSiyuanConfirmTargets.get(key);
        this.pendingSiyuanConfirmTargets.set(key, {
            blockId: confirmTarget.blockId,
            itemID: confirmTarget.itemID,
            dueAt: previous ? Math.min(previous.dueAt, dueAt) : dueAt,
            attempts: previous ? previous.attempts : 0,
        });
        this.schedulePendingSiyuanConfirmFlush();
    }

    /**
     * 安排下一次确认检查刷新。
     */
    private schedulePendingSiyuanConfirmFlush(): void {
        if (this.pendingSiyuanConfirmTimer) {
            clearTimeout(this.pendingSiyuanConfirmTimer);
            this.pendingSiyuanConfirmTimer = null;
        }

        if (this.pendingSiyuanConfirmTargets.size === 0) {
            return;
        }

        const nextDueAt = Math.min(...Array.from(this.pendingSiyuanConfirmTargets.values()).map(target => target.dueAt));
        const waitMs = Math.max(0, nextDueAt - Date.now());
        this.pendingSiyuanConfirmTimer = setTimeout(() => {
            void this.flushPendingSiyuanConfirmTargets();
        }, waitMs);
    }

    /**
     * 刷新待执行的确认检查。
     */
    private async flushPendingSiyuanConfirmTargets(): Promise<void> {
        if (this.pendingSiyuanConfirmTimer) {
            clearTimeout(this.pendingSiyuanConfirmTimer);
            this.pendingSiyuanConfirmTimer = null;
        }

        if (this.pendingSiyuanConfirmTargets.size === 0) {
            return;
        }

        const now = Date.now();
        const dueTargets = Array.from(this.pendingSiyuanConfirmTargets.values()).filter(target => target.dueAt <= now);
        if (dueTargets.length === 0) {
            this.schedulePendingSiyuanConfirmFlush();
            return;
        }

        if (this.hasPendingDidaUpdates() || Array.from(this.taskSyncLocks.values()).some(locked => locked)) {
            this.pendingSiyuanConfirmTimer = setTimeout(() => {
                void this.flushPendingSiyuanConfirmTargets();
            }, 1500);
            return;
        }

        for (const target of dueTargets) {
            this.pendingSiyuanConfirmTargets.delete(`${target.blockId}::${target.itemID}`);
            try {
                const confirmed = await this.confirmSiyuanTaskToDida(target.blockId, target.itemID);
                if (!confirmed && target.attempts < 5) {
                    this.pendingSiyuanConfirmTargets.set(`${target.blockId}::${target.itemID}`, {
                        ...target,
                        attempts: target.attempts + 1,
                        dueAt: Date.now() + 2000,
                    });
                }
            } catch (error) {
                console.warn("执行思源->滴答确认检查失败", error);
                if (target.attempts < 5) {
                    this.pendingSiyuanConfirmTargets.set(`${target.blockId}::${target.itemID}`, {
                        ...target,
                        attempts: target.attempts + 1,
                        dueAt: Date.now() + 2000,
                    });
                }
            }
        }

        this.schedulePendingSiyuanConfirmFlush();
    }

    /**
     * 标记某个思源任务正处于“创建滴答任务并等待回写”的窗口期。
     */
    private markPendingSiyuanCreate(blockId: string, cooldownMs = 10000): void {
        if (!blockId) return;
        this.pendingSiyuanCreates.set(blockId, Date.now() + Math.max(1000, cooldownMs));
    }

    /**
     * 判断某个思源任务是否仍处于“创建中”窗口期。
     */
    private isPendingSiyuanCreate(blockId: string): boolean {
        const until = this.pendingSiyuanCreates.get(blockId);
        if (!until) return false;
        if (Date.now() > until) {
            this.pendingSiyuanCreates.delete(blockId);
            return false;
        }
        return true;
    }

    /**
     * 将思源变更目标加入待同步队列，并在短暂静默后统一刷快照。
     */
    private enqueueSiyuanSyncTarget(blockId: string, itemID: string, isDetached = false): void {
        if (!blockId || !itemID || isDetached) return;
        const key = `${blockId}::${itemID}`;
        const previous = this.pendingSiyuanTargets.get(key);
        this.pendingSiyuanTargets.set(key, {
            blockId,
            itemID,
            isDetached,
            attempts: previous ? previous.attempts : 0,
        });

        if (this.pendingSiyuanSyncTimer) {
            clearTimeout(this.pendingSiyuanSyncTimer);
        }
        this.pendingSiyuanSyncTimer = setTimeout(() => {
            void this.flushPendingSiyuanSyncTargets();
        }, 1200);
    }

    /**
     * 刷新待同步队列：统一读取一次思源快照，逐个同步队列中的任务。
     */
    private async flushPendingSiyuanSyncTargets(): Promise<void> {
        if (this.pendingSiyuanSyncTimer) {
            clearTimeout(this.pendingSiyuanSyncTimer);
            this.pendingSiyuanSyncTimer = null;
        }

        if (this.pendingSiyuanTargets.size === 0) {
            return;
        }

        if (this.isSyncing) {
            this.pendingSiyuanSyncTimer = setTimeout(() => {
                void this.flushPendingSiyuanSyncTargets();
            }, 1500);
            return;
        }

        const queue = Array.from(this.pendingSiyuanTargets.values());
        this.pendingSiyuanTargets.clear();

        if (!this.avId) {
            return;
        }

        try {
            const viewData = await this.getAvViewData("刷新待同步思源队列");
            const allTasks = viewData.flatMap(view => view.data || []);
            const nextRound: typeof queue = [];

            for (const target of queue) {
                if (target.isDetached || !target.blockId || !target.itemID) {
                    continue;
                }

                const siyuanTask = allTasks.find((task: any) => task.事件?.itemID === target.itemID);
                if (!siyuanTask) {
                    if (target.attempts < 5) {
                        nextRound.push({ ...target, attempts: target.attempts + 1 });
                    }
                    continue;
                }

                console.debug("[滴答同步] 刷新待同步队列中的任务", {
                    blockId: target.blockId,
                    itemID: target.itemID,
                    attempts: target.attempts,
                });

                const synced = await this.syncSingleSiyuanTaskToDida(siyuanTask, target.blockId, target.itemID, viewData);
                if (synced) {
                    this.debouncedSyncTasksToSiyuan(8000, { blockId: target.blockId, itemID: target.itemID });
                }
            }

            if (nextRound.length > 0) {
                for (const target of nextRound) {
                    const key = `${target.blockId}::${target.itemID}`;
                    this.pendingSiyuanTargets.set(key, target);
                }
                this.pendingSiyuanSyncTimer = setTimeout(() => {
                    void this.flushPendingSiyuanSyncTargets();
                }, 1500);
            }
        } catch (error) {
            console.warn("刷新待同步思源队列失败，稍后重试", error);
            for (const target of queue) {
                const key = `${target.blockId}::${target.itemID}`;
                this.pendingSiyuanTargets.set(key, { ...target, attempts: target.attempts + 1 });
            }
            this.pendingSiyuanSyncTimer = setTimeout(() => {
                void this.flushPendingSiyuanSyncTargets();
            }, 2000);
        }
    }

    /**
     * 根据当前思源快照，确认并同步单条任务到滴答。
     * 用于延迟确认阶段：以思源为准，避免被滴答侧旧数据反写覆盖。
     */
    private async confirmSiyuanTaskToDida(blockId: string, itemID: string): Promise<boolean> {
        if (!this.avId) {
            showMessage("数据库ID未设置，无法进行确认同步", -1, "error");
            return false;
        }

        const viewData = await this.getAvViewData("确认思源任务同步到滴答");
        if (!viewData || !Array.isArray(viewData) || viewData.length === 0) {
            showMessage("无法获取数据库视图数据", -1, "error");
            return false;
        }

        const allTasks = viewData.flatMap(view => view.data || []);
        const siyuanTask = allTasks.find((task: any) => task.事件?.itemID === itemID);
        if (!siyuanTask) {
            console.debug("[滴答同步] 确认阶段未找到对应的思源任务", { blockId, itemID, totalTasks: allTasks.length });
            return false;
        }

        console.debug("[滴答同步] 进入思源优先的确认同步", {
            blockId,
            itemID,
            hasDidaID: !!siyuanTask.didaID?.content,
            title: siyuanTask.事件?.content,
            status: siyuanTask.状态?.content,
        });

        return this.syncSingleSiyuanTaskToDida(siyuanTask, blockId, itemID, viewData);
    }

    /**
     * 将单条思源任务按当前快照同步到滴答。
     * 该方法是思源->滴答的唯一写入口，普通实时同步和延迟确认同步都走这里。
     */
    private async syncSingleSiyuanTaskToDida(siyuanTask: any, blockId: string, itemID: string, viewData: any): Promise<boolean> {
        try {
            // 检查是否存在 didaID。如果存在，则为更新操作；否则为创建操作。
            if (siyuanTask.didaID?.content) {
                const didaTaskId = siyuanTask.didaID.content;
                const cachedTask = this.taskCache.get(didaTaskId);
                if (!cachedTask) {
                    console.warn(`任务 ${didaTaskId} 不在缓存中，无法反向同步。`);
                    await this.getAllTasks();
                    showMessage("请重试，无法获取到滴答事件，重试无效说明事件已经归档");
                    return false;
                }
                const currentProjectId = cachedTask.projectId;
                const updatePayload: Partial<Task> = {};

                // 转换思源数据到滴答格式
                updatePayload.status = siyuanTask.状态?.content === '完成' ? 2 : 0;
                if (siyuanTask.事件?.content) {
                    const originalTitle = removeDidaLinks(siyuanTask.事件.content);
                    updatePayload.title = `${originalTitle} [S](siyuan://blocks/${blockId})`;
                }
                if (siyuanTask.描述?.content) updatePayload.content = siyuanTask.描述.content;
                if (siyuanTask.优先级?.content) {
                    const priorityMap: { [key: string]: 0 | 1 | 3 | 5 } = { "无": 0, "低": 1, "中": 3, "高": 5 };
                    updatePayload.priority = priorityMap[siyuanTask.优先级.content];
                }

                const newStartISO = siyuanTask.开始时间?.start ? formatDateToISO(siyuanTask.开始时间.start) : undefined;
                const newDueISO = siyuanTask.开始时间?.end ? formatDateToISO(siyuanTask.开始时间.end) : undefined;
                const oldStartISO = cachedTask.startDate;
                const oldDueISO = cachedTask.dueDate;
                const timeChanged = newStartISO !== oldStartISO || newDueISO !== oldDueISO;

                console.debug("[滴答同步] 计算滴答更新 payload（时间）", {
                    blockId,
                    didaTaskId,
                    newStartISO,
                    newDueISO,
                    oldStartISO,
                    oldDueISO,
                    timeChanged,
                });

                if (siyuanTask.开始时间) {
                    updatePayload.startDate = newStartISO;
                    updatePayload.dueDate = newDueISO;
                    updatePayload.isAllDay = false;
                    updatePayload.timeZone = "Asia/Shanghai";
                } else {
                    updatePayload.startDate = undefined;
                    updatePayload.dueDate = undefined;
                    updatePayload.timeZone = "Asia/Shanghai";
                }

                if (timeChanged && (newStartISO || newDueISO)) {
                    try {
                        const defaults = parseDidaReminders((settingdata as any)["cal-dida-default-reminders"]);
                        if (defaults.length) {
                            updatePayload.reminders = defaults;
                        }
                    } catch {
                        // ignore
                    }
                }

                const newStatus = siyuanTask.状态?.content;
                const tagsFromSiyuan = (siyuanTask.标签?.content || [])
                    .map((item: any) => item)
                    .filter((tag: string) => !["完成", "进行中", "未完成", "归档"].includes(tag));
                const statusTags: string[] = [];
                if (newStatus === '进行中') {
                    statusTags.push('进行中');
                } else if (newStatus === '归档') {
                    statusTags.push('归档');
                }
                updatePayload.tags = [...tagsFromSiyuan, ...statusTags];

                console.debug("[滴答同步] 即将写回滴答任务", {
                    blockId,
                    didaTaskId,
                    projectId: currentProjectId,
                    payload: updatePayload,
                });
                if (Object.keys(updatePayload).length > 0) {
                    this.taskSyncLocks.set(didaTaskId, true);
                    try {
                        this.markPendingDidaUpdate(didaTaskId);
                        await this.apiClient.updateTask(didaTaskId, {
                            ...updatePayload,
                            id: didaTaskId,
                            projectId: updatePayload.projectId || currentProjectId
                        });

                        if (cachedTask) {
                            Object.assign(cachedTask, updatePayload);
                            if (updatePayload.projectId) cachedTask.projectId = updatePayload.projectId;
                        }

                        this.lastModifiedTime.set(didaTaskId, Date.now());
                        this.lastSyncDirection.set(didaTaskId, 'siyuan-to-dida');

                        console.debug(`思源任务 [${blockId}] 的变更已同步到滴答任务 [${didaTaskId}]`);
                        showStatusMessage("滴答任务已更新", 2000);
                        return true;
                    } finally {
                        setTimeout(() => {
                            this.taskSyncLocks.set(didaTaskId, false);
                        }, 1000);
                    }
                }

                return false;
            }

            if (this.creatingDidaIds.has(blockId) || this.isPendingSiyuanCreate(blockId)) {
                console.warn(`任务 [${blockId}] 正在创建中，跳过重复处理。`);
                return false;
            }
            this.markPendingSiyuanCreate(blockId);
            this.creatingDidaIds.add(blockId);
            try {
                const latestViewData = await getViewValue([{ rootid: this.avId, viewId: '', name: '' }]);
                const latestTask = latestViewData.flatMap(view => view.data || []).find((task: any) => task.事件?.id === blockId);
                if (latestTask?.didaID?.content) {
                    console.debug(`任务 [${blockId}] 已经有 didaID，跳过创建。`);
                    return false;
                }
                const taskTitle = siyuanTask.事件?.content || "新建任务";
                console.debug(`检测到新的思源任务 [${taskTitle}]，正在创建滴答任务...`);

                let targetProjectId = this.todoListId;
                if (!targetProjectId) {
                    showMessage("无法创建任务：未设置默认的未完成清单ID。", -1, "error");
                    return false;
                }

                const createTaskPayload: Omit<Task, 'id' | 'status' | 'completedTime'> & { projectId: string } = {
                    projectId: targetProjectId,
                    title: `${removeDidaLinks(siyuanTask.事件.content)} [S](siyuan://blocks/${blockId})`,
                    content: siyuanTask.描述?.content || undefined,
                    priority: siyuanTask.优先级?.content ? { "无": 0, "低": 1, "中": 3, "高": 5 }[siyuanTask.优先级.content] : 0,
                    startDate: siyuanTask.开始时间?.start ? formatDateToISO(siyuanTask.开始时间.start) : undefined,
                    dueDate: siyuanTask.开始时间?.end ? formatDateToISO(siyuanTask.开始时间.end) : undefined,
                    reminders: (() => {
                        try {
                            const raw = (settingdata as any)["cal-dida-default-reminders"];
                            const arr = parseDidaReminders(raw);
                            return arr.length ? arr : undefined;
                        } catch {
                            return undefined;
                        }
                    })(),
                    tags: (() => {
                        const normalTags = (siyuanTask.标签?.content || [])
                            .map((item: any) => item)
                            .filter((tag: string) => !["完成", "进行中", "未完成", "归档"].includes(tag));
                        const status = siyuanTask.状态?.content;
                        const statusTag = status === '进行中' ? '进行中' : status === '归档' ? '归档' : null;
                        return statusTag ? [...normalTags, statusTag] : normalTags;
                    })(),
                };

                console.debug("[滴答同步] 即将创建滴答任务", {
                    blockId,
                    itemID,
                    targetProjectId,
                    payload: createTaskPayload,
                });

                const newDidaTask = await this.apiClient.createTask(createTaskPayload);

                if (newDidaTask && newDidaTask.id) {
                    if (siyuanTask.状态?.content === '完成') {
                        await this.apiClient.completeTask(newDidaTask.projectId, newDidaTask.id);
                        newDidaTask.status = 2;
                        newDidaTask.completedTime = formatDateForDida(Date.now());
                    }
                    this.taskCache.set(newDidaTask.id, newDidaTask);
                    this.lastModifiedTime.set(newDidaTask.id, Date.now());
                    this.lastSyncDirection.set(newDidaTask.id, 'siyuan-to-dida');
                    this.markPendingDidaUpdate(newDidaTask.id);

                    const didaIdKeyID = await this.getKeyIDfromViewValue(viewData, 'didaID');
                    const linkKeyID = await this.getKeyIDfromViewValue(viewData, '链接');

                    console.debug("[滴答同步] 准备回写思源字段", {
                        blockId,
                        itemID,
                        didaTaskId: newDidaTask.id,
                        didaIdKeyID,
                        linkKeyID,
                    });

                    const updatePromises: Promise<any>[] = [];

                    if (didaIdKeyID) {
                        updatePromises.push(updateAttrViewCell_pro(blockId, this.avId, didaIdKeyID, itemID, newDidaTask.id, "text"));
                    } else {
                        console.error("无法找到 'didaID' 字段的 KeyID，无法写回滴答任务ID。");
                    }

                    if (linkKeyID) {
                        const didaLink = `https://dida365.com/webapp/#p/${targetProjectId}/tasks/${newDidaTask.id}`;
                        updatePromises.push(updateAttrViewCell_pro(blockId, this.avId, linkKeyID, itemID, didaLink, "url"));
                    } else {
                        console.error("无法找到 '链接' 字段的 KeyID，无法写回滴答任务链接。");
                    }

                    if (updatePromises.length > 0) {
                        await this.withDidaTagged(async () => {
                            await Promise.all(updatePromises);
                        });
                        console.debug(`新思源任务 [${blockId}] 已同步到滴答，ID为 [${newDidaTask.id}]，链接已回写`);
                        showStatusMessage("新任务已同步到滴答清单", 2000);
                        return true;
                    }

                    showMessage("无法写回滴答任务信息，请检查数据库是否有名为 'didaID' 和 '链接' 的列", -1, "error");
                    return true;
                }

                return false;
            } finally {
                setTimeout(() => {
                    this.creatingDidaIds.delete(blockId);
                }, 2000);
            }
        } catch (error) {
            console.error("从思源同步到滴答失败:", error);
            return false;
        }
    }

    async syncTasksToSiyuan(): Promise<boolean> {
    this.isSyncing = true; // 开始同步，锁定，WS 监听将跳过
        showStatusMessage("正在同步滴答清单任务，请稍候...", 10000, "dida-sync");
        try {
            // 获取滴答清单的所有任务
            let didaTasks: Task[] = [];
            let isOnline = true;

            try {
                const activeTasks = await this.getAllTasks();
                const completedTasks = await this.listCompletedTasks(this.getCompletedTaskQuery());
                const previousCache = new Map(this.taskCache);
                for (const task of completedTasks) {
                    if (!task.id) continue;
                    if (this.isPendingDidaUpdate(task.id) && previousCache.has(task.id)) {
                        this.taskCache.set(task.id, previousCache.get(task.id)!);
                    } else {
                        this.taskCache.set(task.id, task);
                    }
                }
                const allTasks = [...activeTasks, ...completedTasks];
                const taskMap = new Map<string, Task>();
                for (const task of allTasks) {
                    if (task.id) {
                        taskMap.set(task.id, task);
                    }
                }
                didaTasks = Array.from(taskMap.values());
                // console.debug("❤️❤️❤️❤️❤️")
            } catch (error) {
                // console.debug("💩💩💩💩💩");
                console.error("获取滴答清单任务失败，可能网络断开:", error);
                isOnline = false;
                // 断网时使用缓存数据
                didaTasks = Array.from(this.taskCache.values());
                showMessage("网络连接异常，使用缓存数据进行同步（不会执行归档操作）", 5000, "error");
            }

            // 获取思源数据库的现有数据
            if (!this.avId) {
                showMessage("数据库ID未设置，无法同步", -1, "error");
                return false;
            }

            const viewValue = await this.getAvViewData("同步任务到思源");

            if (!viewValue || !Array.isArray(viewValue) || viewValue.length === 0) {
                showMessage("无法获取数据库视图数据", -1, "error");
                return false;
            }

            // 遍历所有 viewValue，合并所有任务数据
            const existingTasks = viewValue.flatMap(view => view.data || []);

            // 创建现有任务的映射表（基于 didaID）
            const existingTasksMap = new Map();
            existingTasks.forEach((task: any) => {
                if (task.didaID?.content) {
                    existingTasksMap.set(task.didaID.content, task);
                }
            });

            let syncCount = 0;
            let updateCount = 0;
            let archiveCount = 0;

            // 创建滴答清单任务ID的集合，用于后续检查归档
            const didaTaskIds = new Set(didaTasks.map(task => task.id).filter(Boolean));

            // 处理每个滴答清单任务
            for (const didaTask of didaTasks) {
                if (!didaTask.id) continue;

                // 若该任务刚由思源侧更新且尚未在滴答确认，跳过以避免覆盖
                if (this.isPendingDidaUpdate(didaTask.id)) {
                    console.debug(`任务 [${didaTask.id}] 处于本地更新冷却期，跳过本次同步`);
                    continue;
                }

                // 检查任务是否被锁定（正在同步中）
                if (this.taskSyncLocks.get(didaTask.id)) {
                    console.debug(`任务 [${didaTask.id}] 正在同步中，跳过本次更新`);
                    continue;
                }

                const existingTask = existingTasksMap.get(didaTask.id);

                if (existingTask) {
                    // 更新现有任务 - 添加时间戳检查
                    const lastModified = this.lastModifiedTime.get(didaTask.id);
                    const lastDirection = this.lastSyncDirection.get(didaTask.id);
                    const now = Date.now();
                    const cooldownMs = this.getDidaUpdateCooldownMs();
                    
                    // 如果最近冷却期内刚从思源同步到滴答，跳过反向同步以避免覆盖
                    if (lastModified && lastDirection === 'siyuan-to-dida' && (now - lastModified) < cooldownMs) {
                        console.debug(`任务 [${didaTask.id}] 刚从思源同步到滴答（${now - lastModified}ms前），跳过反向同步`);
                        continue;
                    }
                    
                    const taskData = mapDidaTaskToSiyuan(didaTask, existingTask);

                    // 比较任务数据，仅在有变化时更新
                    if (hasSiyuanTaskChanged(taskData, existingTask)) {
                        await this.updateSiyuanTask(existingTask, taskData);
                        // 更新时间戳和方向
                        this.lastModifiedTime.set(didaTask.id, Date.now());
                        this.lastSyncDirection.set(didaTask.id, 'dida-to-siyuan');
                        updateCount++;
                    }
                } else {
                    // 创建新任务
                    const taskData = mapDidaTaskToSiyuan(didaTask, existingTask);
                    await this.createSiyuanTask(taskData);
                    // 更新时间戳和方向
                    if (didaTask.id) {
                        this.lastModifiedTime.set(didaTask.id, Date.now());
                        this.lastSyncDirection.set(didaTask.id, 'dida-to-siyuan');
                    }
                    syncCount++;
                }
            }

            // 只有在网络正常时才执行归档操作
            if (isOnline) {
                // 检查思源中存在但滴答清单中不存在的任务，将其状态设置为"归档"
                const tasksToArchive = [];
                for (const [didaId, existingTask] of existingTasksMap) {
                    if (!didaTaskIds.has(didaId) && existingTask.状态?.content !== "归档" && existingTask.状态?.content !== "完成") {
                        tasksToArchive.push(existingTask);
                    }
                }

                if (tasksToArchive.length > 0) {
                    archiveCount = await this.archiveSiyuanTasksBatch(tasksToArchive);
                    console.debug(`批量归档了 ${archiveCount} 个任务`);
                }
            } else {
                console.debug("网络异常，跳过归档检查以避免误操作");
            }

            const statusMessage = isOnline
                ? (archiveCount > 0
                    ? `同步完成：新建 ${syncCount} 个任务，更新 ${updateCount} 个任务，归档 ${archiveCount} 个任务`
                    : `同步完成：新建 ${syncCount} 个任务，更新 ${updateCount} 个任务`)
                : `离线同步完成：新建 ${syncCount} 个任务，更新 ${updateCount} 个任务（未执行归档检查）`;

            if (syncCount > 0 || updateCount > 0 || archiveCount > 0) {
                showStatusMessage(statusMessage, 3000, "dida-sync");
                return true;
            } else {
                showStatusMessage(isOnline ? "没有需要同步的任务" : "没有需要同步的任务（离线模式）", -1, "dida-sync");
                return false;
            }
        } catch (error) {
            console.error("同步滴答清单任务失败:", error);
            showMessage("同步失败：" + (error instanceof Error ? error.message : String(error)), -1, "error", "dida-sync");
        } finally {
            this.isSyncing = false; // 同步结束，解锁
        }
    }

    /**
     * 比较新旧任务数据是否有变化
     */
    private async createSiyuanTask(taskData: any): Promise<void> {
        try {
            if (!this.avId) {
                console.error("数据库ID未设置");
                return;
            }

            // 创建一个新的块
            const blockId = await generateSiyuanID() as string;
            const itemID = await generateSiyuanID() as string;
            const titleBlockId = await generateSiyuanID() as string;
            const descriptionBlockId = await generateSiyuanID() as string;
            // 根据配置确定创建位置
            let targetId;
            if (settingdata["cal-create-for-date"]) {
                // 创建到日记中
                const today = new Date();
                targetId = await this.createDailynote(settingdata["cal-create-pos"], today);
            } else {
                // 创建到指定位置
                targetId = (await createDailyNote(window.siyuan.ws.app.appId, settingdata["cal-create-pos"])).id;
            }

            if (!targetId) {
                console.error("无法确定创建位置");
                return;
            }

            // 创建块内容
            const statusCustomAttr = getDidaStatusAttr(taskData.状态?.content);
            const template = String((settingdata as any)["cal-dida-import-template"] || '').trim() || getDefaultDidaImportTemplate();
            const templateData = buildDidaImportTemplateData(taskData, blockId, itemID, titleBlockId, descriptionBlockId);
            const renderedBody = renderDidaTemplate(template, templateData).trim() || renderDidaTemplate(getDefaultDidaImportTemplate(), templateData).trim();

            await appendBlock(
                "markdown",
                `{{{row
${renderedBody}
}}}
{: id="${blockId}" custom-st-event="${statusCustomAttr}"}`,
                targetId
            );

            // 添加到数据库
            await this.withDidaTagged(async () => {
                await addBlockToDatabase_pro(blockId, this.avId!, itemID);
            });

            // 获取 viewValue 用于获取 keyID
            const viewValue = await this.getAvViewData("创建思源任务");

            // 更新各个字段
            await this.withDidaTagged(async () => {
                await this.updateTaskFields(blockId, taskData, viewValue, itemID);
            });

            // 同步更新滴答清单任务，为其添加 S 链接
            if (taskData.didaID?.content) {
                try {
                    const didaTaskId = taskData.didaID.content;
                    const cachedTask = this.taskCache.get(didaTaskId);
                    if (cachedTask) {
                        // 获取原始标题（移除可能已存在的链接）
                        const originalTitle = removeDidaLinks(cachedTask.title || "");
                        const titleWithSLink = `${originalTitle} [S](siyuan://blocks/${blockId})`;

                        // 更新滴答清单任务，添加 S 链接
                        this.markPendingDidaUpdate(didaTaskId);
                        await this.apiClient.updateTask(didaTaskId, {
                            id: didaTaskId,
                            projectId: cachedTask.projectId,
                            title: titleWithSLink
                        });

                        // 更新缓存中的任务标题
                        cachedTask.title = titleWithSLink;

                        console.debug(`滴答任务 [${didaTaskId}] 已更新 S 链接`);
                    }
                } catch (error) {
                    console.warn("更新滴答任务 S 链接失败:", error);
                }
            }

            console.debug("成功创建新任务:", taskData.事件?.content);

        } catch (error) {
            console.error("创建思源任务失败:", error);
            throw error;
        }
    }

    /**
     * 更新思源笔记任务
     */
    private async updateSiyuanTask(existingTask: any, newTaskData: any): Promise<void> {
        try {
            if (!this.avId || !existingTask.事件?.id) {
                console.error("缺少必要的ID信息");
                return;
            }

            const blockId = existingTask.事件.id;
            const itemID = existingTask.事件.itemID;
            // 获取 viewValue 用于获取 keyID
            const viewValue = await this.getAvViewData("更新思源任务");

            // 更新各个字段
            await this.withDidaTagged(async () => {
                await this.updateTaskFields(blockId, newTaskData, viewValue, itemID, existingTask);
            });

            // 更新块的自定义属性（状态）
            const statusCustomAttr = getDidaStatusAttr(newTaskData.状态?.content);
            await setBlockAttrs(blockId, {
                "custom-st-event": statusCustomAttr
            });

            // 同步更新滴答清单任务，确保其有正确的 S 链接
            if (newTaskData.didaID?.content) {
                try {
                    const didaTaskId = newTaskData.didaID.content;
                    const cachedTask = this.taskCache.get(didaTaskId);
                    if (cachedTask) {
                        // 获取原始标题（移除可能已存在的链接）
                        const originalTitle = removeDidaLinks(newTaskData.事件?.content || "");
                        const titleWithSLink = `${originalTitle} [S](siyuan://blocks/${blockId})`;

                        // 检查滴答任务标题是否需要更新
                        if (cachedTask.title !== titleWithSLink) {
                            this.markPendingDidaUpdate(didaTaskId);
                            await this.apiClient.updateTask(didaTaskId, {
                                id: didaTaskId,
                                projectId: cachedTask.projectId,
                                title: titleWithSLink
                            });

                            // 更新缓存中的任务标题
                            cachedTask.title = titleWithSLink;

                            console.debug(`滴答任务 [${didaTaskId}] 已更新 S 链接`);
                        }
                    }
                } catch (error) {
                    console.warn("更新滴答任务 S 链接失败:", error);
                }
            }

            console.debug("成功更新任务:", newTaskData.事件?.content);

        } catch (error) {
            console.error("更新思源任务失败:", error);
            throw error;
        }
    }

    /**
     * 批量将思源任务设置为归档状态
     */
    private async archiveSiyuanTasksBatch(tasksToArchive: any[]): Promise<number> {
        if (tasksToArchive.length === 0) {
            return 0;
        }

        try {
            if (!this.avId) {
                console.error("数据库ID未设置，无法批量归档任务");
                return 0;
            }

            // 获取 viewValue 用于获取 keyID
            const viewValue = await this.getAvViewData("批量归档任务");

            // 获取状态字段的 keyID
            const statusKeyID = await this.getKeyIDfromViewValue(viewValue, '状态');

            if (!statusKeyID) {
                console.error("无法找到状态字段的 keyID，无法批量归档任务");
                return 0;
            }

            // 批量更新：收集所有需要更新的任务
            const updatePromises: Promise<any>[] = [];
            const blockAttrPromises: Promise<any>[] = [];
            let successCount = 0;

            for (const task of tasksToArchive) {
                if (!task.事件?.id) {
                    console.warn(`任务缺少事件ID，跳过归档: ${task.事件?.content}`);
                    continue;
                }

                const blockId = task.事件.id;
                const itemID = task.事件.itemID;
                // 更新状态为"归档"
                const statusData = [{ content: "归档" }];
                updatePromises.push(
                    updateAttrViewCell_pro(
                        blockId,
                        this.avId,
                        statusKeyID,
                        itemID,
                        statusData,
                        "select"
                    ).then(() => {
                        successCount++;
                        console.debug(`任务 [${task.事件?.content}] 已设置为归档状态`);
                    }).catch(error => {
                        console.error(`更新任务 [${task.事件?.content}] 状态失败:`, error);
                    })
                );

                // 更新块的自定义属性（状态）
                blockAttrPromises.push(
                    setBlockAttrs(blockId, {
                        "custom-st-event": "archived"
                    }).catch(error => {
                        console.error(`更新任务 [${task.事件?.content}] 自定义属性失败:`, error);
                    })
                );
            }

            // 等待所有数据库状态更新完成（加 dida 标签，监听可识别并跳过）
            await this.withDidaTagged(async () => {
                await Promise.all(updatePromises);
            });

            // 等待所有块属性更新完成
            await Promise.all(blockAttrPromises);

            console.debug(`批量归档完成：成功归档 ${successCount} 个任务`);
            return successCount;

        } catch (error) {
            console.error("批量归档思源任务失败:", error);
            return 0;
        }
    }

    /**
     * 更新任务字段的通用方法
     */
    private async updateTaskFields(blockId: string, taskData: any, viewValue: any, itemID: string, existingTask?: any): Promise<void> {
        try {
            console.debug("[滴答同步] 开始更新思源字段", {
                blockId,
                itemID,
                avId: this.avId,
                hasExistingTask: !!existingTask,
                title: taskData?.事件?.content,
                status: taskData?.状态?.content,
                priority: taskData?.优先级?.content,
                hasTime: !!taskData?.开始时间,
                start: taskData?.开始时间?.start,
                end: taskData?.开始时间?.end,
                tags: taskData?.标签?.content,
            });
            // 获取各字段的 keyID
            const didaIdKeyID = await this.getKeyIDfromViewValue(viewValue, 'didaID');
            const eventKeyID = await this.getKeyIDfromViewValue(viewValue, '事件');
            const timeKeyID = await this.getKeyIDfromViewValue(viewValue, '开始时间');
            const priorityKeyID = await this.getKeyIDfromViewValue(viewValue, '优先级');
            const urlKeyID = await this.getKeyIDfromViewValue(viewValue, '链接');
            const statusKeyID = await this.getKeyIDfromViewValue(viewValue, '状态');
            const tagKeyID = await this.getKeyIDfromViewValue(viewValue, '标签');
            const descKeyID = await this.getKeyIDfromViewValue(viewValue, '描述');

            // 批量更新：收集所有需要更新的字段
            const updatePromises: Promise<any>[] = [];

            // 更新 didaID (通常只在创建时写入)
            if (didaIdKeyID && taskData.didaID?.content && !existingTask?.didaID?.content) {
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    didaIdKeyID,
                    itemID,
                    taskData.didaID.content,
                    "text"
                ));
            }

            // 更新事件标题（需要单独处理，因为使用不同的API）
            if (eventKeyID && taskData.事件?.content) {
                // 移除事件标题中的D链接，只保留原始标题
                const newEventTitle = removeDidaLinks(taskData.事件.content);
                updatePromises.push(updatemainkey({
                    avID: this.avId,
                    blockID: blockId,
                    itemID: itemID,
                    keyID: eventKeyID,
                    content: newEventTitle, // 存储不含链接的标题
                }));
            }

            // 更新开始时间
            const newTime = taskData.开始时间;
            const oldTime = existingTask?.开始时间;
            const newStart = newTime?.start || null;
            const newEnd = newTime?.end || null;
            const oldStart = oldTime?.start || null;
            const oldEnd = oldTime?.end || null;

            console.debug("[滴答同步] 思源时间字段对比", {
                blockId,
                itemID,
                timeKeyID,
                newTime,
                oldTime,
                newStart,
                newEnd,
                oldStart,
                oldEnd,
            });

            if (timeKeyID && (newStart !== oldStart || newEnd !== oldEnd)) {
                const startTime = newTime?.start ? formatLocalDate(newTime.start) : undefined;
                const endTime = newTime?.end && newTime?.hasEndDate ? formatLocalDate(newTime.end) : undefined;
                console.debug("[滴答同步] 准备更新思源时间字段", {
                    blockId,
                    itemID,
                    startTime,
                    endTime,
                    hasEndDate: newTime?.hasEndDate,
                });
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    timeKeyID,
                    itemID,
                    startTime,
                    "date",
                    endTime
                ));
            }

            // 更新优先级
            if (priorityKeyID && taskData.优先级?.content && taskData.优先级.content !== existingTask?.优先级?.content) {
                const priorityData = [{ content: taskData.优先级.content }];
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    priorityKeyID,
                    itemID,
                    priorityData,
                    "select"
                ));
            }

            // 更新状态
            if (statusKeyID && taskData.状态?.content && taskData.状态.content !== existingTask?.状态?.content) {
                const statusData = [{ content: taskData.状态.content }];
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    statusKeyID,
                    itemID,
                    statusData,
                    "select"
                ));
            }

            // 更新标签
            const newTags = (taskData.标签?.content || []).map((t: any) => t.content).sort().join(',');
            const oldTags = (existingTask?.标签?.content || []).sort().join(',');
            if (tagKeyID && taskData.标签?.content && newTags !== oldTags) {
                console.debug("更新标签：", taskData.标签.content);
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    tagKeyID,
                    itemID,
                    taskData.标签.content,
                    "mSelect"
                ));
            }

            // 更新描述
            if (descKeyID && taskData.描述?.content && taskData.描述.content !== existingTask?.描述?.content) {
                console.debug("[滴答同步] 准备更新描述字段", {
                    blockId,
                    itemID,
                    descKeyID,
                    oldDesc: existingTask?.描述?.content,
                    newDesc: taskData.描述?.content,
                });
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    descKeyID,
                    itemID,
                    taskData.描述.content,
                    "text"
                ));
            }
            // console.debug("更新链接BBBBBBBBBBBBB：", taskData.链接.content, urlKeyID);
            if (urlKeyID && taskData.链接?.content) {
                // 更新链接
                // console.debug("更新链接!!!!!!!!!!!!!!!!!!!：", taskData.链接.content);
                console.debug("[滴答同步] 准备更新链接字段", {
                    blockId,
                    itemID,
                    urlKeyID,
                    url: taskData.链接?.content,
                });
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    urlKeyID,
                    itemID,
                    taskData.链接.content,
                    "url"
                ));
            }


            // 等待所有更新完成
            await Promise.all(updatePromises);

        } catch (error) {
            console.error("更新任务字段失败:", error);
            throw error;
        }
    }


    /**
     * 获取字段的 keyID（从 viewValue 中）
     */
    private async getKeyIDfromViewValue(viewValue: any, fieldName: string): Promise<string | null> {
        try {
            if (!viewValue || !Array.isArray(viewValue) || viewValue.length === 0) {
                return null;
            }

            const viewData = viewValue[0];
            if (!viewData.data || !Array.isArray(viewData.data) || viewData.data.length === 0) {
                return null;
            }
            // console.debug("获取字段 keyID：", fieldName, viewData.data);
            // 从第一条数据中获取字段的 keyID
            const firstRecord = viewData.data[0];
            if (firstRecord[fieldName] && firstRecord[fieldName].keyID) {
                return firstRecord[fieldName].keyID;
            }

            return null;
        } catch (error) {
            console.error(`获取字段 ${fieldName} 的 keyID 失败:`, error);
            return null;
        }
    }

    /**
     * 创建日记（如果需要）
     */
    private async createDailynote(parentId: string, date: Date): Promise<string> {
        // 标记参数已读取，避免 TS noUnusedLocals（后续若扩展日期逻辑可直接使用）
        void date;
        // 这里需要根据您的日记创建逻辑来实现
        // 暂时使用简单的创建方式
        return (await createDailyNote(window.siyuan.ws.app.appId, parentId)).id;
    }
    destroy() {
        if (this.initialSyncTimer) {
            window.clearTimeout(this.initialSyncTimer);
            this.initialSyncTimer = undefined;
        }
        if (this.autoSyncInterval) {
            window.clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = undefined;
        }
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }
        if (this.pendingSiyuanConfirmTimer) {
            clearTimeout(this.pendingSiyuanConfirmTimer);
            this.pendingSiyuanConfirmTimer = null;
        }
        if (this.pendingSiyuanSyncTimer) {
            clearTimeout(this.pendingSiyuanSyncTimer);
            this.pendingSiyuanSyncTimer = null;
        }
        this.changeSource.destroy();
        try {
            this.linkInterceptor?.destroy?.();
        } catch (error) {
            console.warn("销毁滴答链接拦截器失败", error);
        }
        this.store.clear();
    }

    handleSiyuanUpdate = (event: any, blockId = "", itemID = ""): Promise<void> =>
        this.changeSource.handleEvent(event, blockId, itemID);

    /**
     * 处理单个思源任务变更目标，避免事务里多个变更项被覆盖成“只同步首尾”。
     */
    private async processSiyuanUpdateTarget(blockId: string, itemID: string, isDetached = false): Promise<void> {
        if (blockId && itemID) {
            this.enqueueSiyuanConfirmTarget({ blockId, itemID }, 8000);
        }
        if (isDetached) return;//游离块不支持添加到滴答,后续操作需要绑定块ID
        if (!blockId) return;
        try {
            // 1. 获取这一行（块）的完整数据，最重要的是拿到 didaID
            console.debug(`处理思源更新：块ID ${blockId}`);
            const viewData = await this.getAvViewData("处理思源更新");
            const allTasks = viewData.flatMap(view => view.data || []);
            const siyuanTask = allTasks.find((task: any) => task.事件?.itemID === itemID);

            if (!siyuanTask) {
                console.debug("[滴答同步] 未找到对应的思源任务行，跳过", {
                    blockId,
                    itemID,
                    totalTasks: allTasks.length,
                });
                return;
            }

            console.debug("[滴答同步] 读取到思源任务快照", {
                blockId,
                itemID,
                hasDidaID: !!siyuanTask.didaID?.content,
                title: siyuanTask.事件?.content,
                status: siyuanTask.状态?.content,
                priority: siyuanTask.优先级?.content,
                hasTime: !!siyuanTask.开始时间,
                start: siyuanTask.开始时间?.start,
                end: siyuanTask.开始时间?.end,
                tags: siyuanTask.标签?.content,
            });

            await this.syncSingleSiyuanTaskToDida(siyuanTask, blockId, itemID, viewData);
            // 优化：延长防抖时间，避免频繁触发反向同步；确认阶段以思源快照为准
            this.debouncedSyncTasksToSiyuan(8000, { blockId, itemID }); // 防抖同步检测，延长至8秒
        } catch (error) {
            console.error("从思源同步到滴答失败:", error);
        }
    }

    /**
     * 在作用域内为所有发出的 fetch 请求打上 dida 标签，供本模块的网络监听识别并跳过。
     */
    private async withDidaTagged<T>(fn: () => Promise<T>): Promise<T> {
        beginTaggedRequests('dida');
        try {
            return await fn();
        } finally {
            endTaggedRequests('dida');
        }
    }
    /**
     * 检测 Dida365 API Token 是否有效。
     * @returns Promise<boolean> 如果 Token 有效，返回 true；否则返回 false。
     */
    async isTokenValid(): Promise<boolean> {
        try {
            const projects = await this.apiClient.getUserProjects();
            console.debug("Dida365 API Token 验证成功，获取到的项目数量:", projects ? projects.length : 0);
            return Array.isArray(projects) && projects.length > 0;
        } catch (error) {
            console.error("Dida365 API Token 验证失败:", error instanceof Error ? error.message : String(error));
            return false;
        }
    }
    /**
     * 获取所有项目中的所有未完成任务。
     * 注意：此方法会为每个项目单独调用一次API以获取其任务数据。
     * @returns Promise<Task[]> 一个包含所有未完成任务的数组。
     */
    async getAllTasks(): Promise<Task[]> {
        const allTasks: Task[] = [];
        // 合并两个设置项为一个数组，过滤空值
        // const projectIds = [settingdata["cal-dida-unfinished-list"], settingdata["cal-dida-finished-list"]].filter(Boolean);
        const projectIds = [this.todoListId];
        const previousCache = new Map(this.taskCache);
        this.taskCache.clear(); // 清空旧缓存

        if (projectIds.length === 0) {
            showMessage("未设置需要同步的滴答项目ID");
            return [];
        }

        for (const projectId of projectIds) {
            try {
                const projectData = await this.apiClient.getProjectWithData(projectId);
                if (projectData && projectData.tasks && projectData.tasks.length > 0) {
                    allTasks.push(...projectData.tasks);
                    projectData.tasks.forEach(task => {
                        if (task.id) {
                            // 若该任务仍处于本地更新冷却期，优先保留旧缓存，避免被旧数据覆盖
                            if (this.isPendingDidaUpdate(task.id) && previousCache.has(task.id)) {
                                this.taskCache.set(task.id, previousCache.get(task.id)!);
                            } else {
                                this.taskCache.set(task.id, task);
                            }
                        }
                    });
                }
            } catch (error) {
                console.warn(`获取项目 (ID: ${projectId}) 的任务失败:`, error instanceof Error ? error.message : String(error));
                throw new Error(`获取项目 (ID: ${projectId}) 的任务失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return allTasks;
    }
    /**
     * 在所有未完成任务中按标题搜索任务。
     * @param titleQuery 要搜索的标题关键词。
     * @param caseSensitive 是否区分大小写，默认为 false。
     * @returns Promise<Task[]> 匹配的任务数组。
     */
    async findTasksByTitle(titleQuery: string, caseSensitive: boolean = false): Promise<Task[]> {
        const allUndoneTasks = await this.getAllTasks();
        const query = caseSensitive ? titleQuery : titleQuery.toLowerCase();

        return allUndoneTasks.filter(task => {
            if (!task.title) return false;
            const taskTitle = caseSensitive ? task.title : task.title.toLowerCase();
            return taskTitle.includes(query);
        });
    }
    /**
     * 获取指定项目的所有任务。
     * @param projectId 项目ID。
     * @returns Promise<Task[]> 返回该项目下的所有任务。
     */
    async getTasksByProject(projectId: string): Promise<Task[]> {
        try {
            const projectData = await this.apiClient.getProjectWithData(projectId);
            return projectData ? projectData.tasks : [];
        } catch (error) {
            console.error(`获取项目 ${projectId} 的任务失败:`, error instanceof Error ? error.message : String(error));
            return [];
        }
    }
    /**
     * 获取所有项目。
     * @returns Promise<Project[]> 返回所有项目的数组。
     */
    async getAllProjects(): Promise<Project[]> {
        try {
            const projects = await this.apiClient.getUserProjects();
            return projects || [];
        } catch (error) {
            console.error("获取所有项目失败:", error instanceof Error ? error.message : String(error));
            return [];
        }
    }
    /**
     * 获取底层的 Dida365ApiClient 实例，以便直接调用其方法。
     * @returns Dida365ApiClient 实例。
     */
    public getApiClient(): Dida365ApiClient {
        return this.apiClient;
    }

    public async getTask(projectId: string, taskId: string): Promise<Task> {
        return this.apiClient.getTask(projectId, taskId);
    }

    public async completeTask(projectId: string, taskId: string): Promise<void> {
        return this.apiClient.completeTask(projectId, taskId);
    }

    public async moveTasks(operations: TaskMoveOperation[]): Promise<TaskMoveResult[]> {
        return this.apiClient.moveTasks(operations);
    }

    public async moveTask(operation: TaskMoveOperation): Promise<TaskMoveResult[]> {
        return this.apiClient.moveTask(operation);
    }

    public async listCompletedTasks(query: TaskCompletedQuery = {}): Promise<Task[]> {
        const finalQuery = Object.keys(query).length > 0 ? query : this.getCompletedTaskQuery();
        return this.apiClient.listCompletedTasks(finalQuery);
    }

    public async filterTasks(query: TaskFilterQuery = {}): Promise<Task[]> {
        return this.apiClient.filterTasks(query);
    }

}
