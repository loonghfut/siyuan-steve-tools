import { showMessage } from "siyuan";
import { Dida365ApiClient } from "./dida_api";
import { Project, Task } from "./dida_interface";
import steveTools, { settingdata } from "@/index";
import { getViewId, getViewValue } from "../myF";
import { addBlockToDatabase_pro, appendBlock, createDailyNote, generateSiyuanID, getAttributeViewBoundBlockIDsByItemIDs, getAttributeViewItemIDsByBoundIDs, setBlockAttrs, showStatusMessage, updateAttrViewCell_pro, updatemainkey } from "@/api/api";
import { formatDateToISO, formatLocalDate } from "./siyuan_api";
import { createDidaDock, DidaLinkInterceptor } from "@/api/dockdida_pro";
import * as ic from "@/icon"
import { extractNewAvId } from "@/api/api3";
import { interceptFetch, type InterceptorHandle, beginTaggedRequests, endTaggedRequests } from "@/api/network-interceptor";
export class Dida365Service {
    private apiClient: Dida365ApiClient;
    private plugin: steveTools;
    private avId: string | null = null; // 用于存储滴答清单同步的数据库ID
    private todoListId: string | null = null; // 用于存储未完成任务列表ID
    // private doneListId: string | null = null; // 用于存储已完成任务列表ID cal-dida-finished-list
    private taskCache: Map<string, Task> = new Map(); // 新增：用于缓存滴答任务
    private isSyncing = false; // 新增同步锁
    private creatingDidaIds: Set<string> = new Set();
    private syncDebounceTimer: NodeJS.Timeout | null = null; // 防抖计时器
    private netInterceptorHandle: InterceptorHandle | null = null; // 独立拦截句柄
    private lastModifiedTime: Map<string, number> = new Map(); // 记录每个任务的最后修改时间戳(didaID -> timestamp)
    private taskSyncLocks: Map<string, boolean> = new Map(); // 任务级别的同步锁(didaID -> isLocked)
    private lastSyncDirection: Map<string, 'siyuan-to-dida' | 'dida-to-siyuan'> = new Map(); // 记录最后同步方向
    private pendingDidaUpdates: Map<string, number> = new Map(); // 记录本地已发起但可能尚未在滴答生效的任务(didaID -> until)
    private autoSyncInterval?: number;
    private initialSyncTimer?: number;
    private wsMainHandler?: (e: any) => void;
    private getDidaUpdateCooldownMs(): number {
        const raw = (settingdata as any)["cal-dida-sync-cooldown"];
        const seconds = Number.isFinite(Number(raw)) ? Number(raw) : 30;
        // 最低 5 秒，避免 0 导致无保护
        return Math.max(5, seconds) * 1000;
    }

    constructor(token: string, plugin: steveTools) {
        this.plugin = plugin;
        this.apiClient = new Dida365ApiClient(token);
        this.todoListId = settingdata["cal-dida-unfinished-list"] || null;
        // this.doneListId = settingdata["cal-dida-finished-list"] || null;
        if (!token || token.trim() === "") {
            showMessage("Dida365 fallback: Token is empty or invalid.", -1, "error");
            return;
        }
        // 初始化时可以进行一些验证或设置
        this.isTokenValid();
        console.debug("Dida365Service initialized", this.todoListId);
        this.init();

        this.plugin.addIcons(`
            <symbol id="iconSTdida" viewBox="0 0 48 48">
                ${ic.steveTools_dida}
            </symbol>
            `)
        // 将实例导出到 window 对象
        if (typeof window !== 'undefined' && !(window as any).Dida365Service) {
            (window as any).Dida365Service = this;
        }
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
        this.setupSiyuanUpdateListener(); // 2025/7/5新增：设置思源更新监听器
        this.setupNetworkInterceptor();    // 监听前端发起到 /api/av/* 的请求
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
        this.plugin.addDock(dockConfig);
    }

    /**
     * 防抖同步方法：等待指定时间，如果期间有新的调用则重新计时
     * 优化：添加冷却期检查，避免刚修改后立即反向同步覆盖
     */
    private debouncedSyncTasksToSiyuan(delay = 10000): void {
        // 清除之前的计时器
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            console.debug("取消之前的同步计时器，重新开始等待");
        }

        // 设置新的计时器
        this.syncDebounceTimer = setTimeout(async () => {
            try {
                let isUpdate = false;
                console.debug("防抖等待完成，开始执行同步任务到思源");
                
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
                
                isUpdate = await this.syncTasksToSiyuan();
                this.syncDebounceTimer = null; // 清空计时器引用
                if (isUpdate && delay === 10000) {
                    showMessage("滴答任务同步不一致", 2000, "info", "dida-sync");
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

    async syncTasksToSiyuan(): Promise<boolean> {
    this.isSyncing = true; // 开始同步，锁定，WS 监听将跳过
        showStatusMessage("正在同步滴答清单任务，请稍候...", 10000, "dida-sync");
        try {
            // 获取滴答清单的所有任务
            let didaTasks: Task[] = [];
            let isOnline = true;

            try {
                didaTasks = await this.getAllTasks();
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
                    
                    const taskData = this.buildTaskData(didaTask, existingTask);

                    // 比较任务数据，仅在有变化时更新
                    if (this.isTaskChanged(taskData, existingTask)) {
                        await this.updateSiyuanTask(existingTask, taskData);
                        // 更新时间戳和方向
                        this.lastModifiedTime.set(didaTask.id, Date.now());
                        this.lastSyncDirection.set(didaTask.id, 'dida-to-siyuan');
                        updateCount++;
                    }
                } else {
                    // 创建新任务
                    const taskData = this.buildTaskData(didaTask, existingTask);
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
                    if (!didaTaskIds.has(didaId) && existingTask.状态?.content !== "归档") {
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
    private isTaskChanged(newTaskData: any, oldSiyuanTask: any): boolean {
        // 比较事件标题（忽略链接，只比较原始标题）
        const newEventTitle = this.removeLinksFromTitle(newTaskData.事件.content);
        const oldEventTitle = oldSiyuanTask.事件?.content ? this.removeLinksFromTitle(oldSiyuanTask.事件.content) : '';
        if (newEventTitle !== oldEventTitle) {
            console.debug("事件标题变化", newEventTitle, oldEventTitle);
            return true;
        }
        // 比较优先级
        // console.debug("比较事件", newTaskData, oldSiyuanTask);
        if (newTaskData.优先级.content !== oldSiyuanTask.优先级?.content) {
            console.debug("优先级变化", newTaskData.优先级.content, oldSiyuanTask.优先级?.content);
            return true;
        }
        // 比较状态
        if (newTaskData.状态.content !== oldSiyuanTask.状态?.content) {
            console.debug("状态变化", newTaskData.状态.content, oldSiyuanTask.状态?.content);
            return true;
        }
        // 比较标签
        const newTags = newTaskData.标签.content || [];
        const oldTags = oldSiyuanTask.标签?.content || [];
        // 将标签转换为字符串数组以便比较
        const newTagContents = newTags.map((tag: any) => tag.content).sort();
        const oldTagContents = oldTags.map((tag: any) => tag).sort();
        // console.debug("比较标签", newTagContents, oldTagContents);
        if (newTagContents.join(",") !== oldTagContents.join(",")) {
            console.debug("标签变化", newTagContents, oldTagContents);
            return true;
        }
        // 比较描述
        if ((newTaskData.描述.content || "") !== (oldSiyuanTask.描述?.content || "")) {
            console.debug("描述变化", newTaskData.描述.content, oldSiyuanTask.描述?.content);
            return true;
        }
        // 比较时间
        const newTime = newTaskData.开始时间;
        const oldTime = oldSiyuanTask.开始时间;

        // 将 undefined 和 null 统一视为 null，以便正确比较“未设置”状态
        const newStart = newTime?.start || null;
        const newEnd = newTime?.end || null;
        const oldStart = oldTime?.start || null;
        const oldEnd = oldTime?.end || null;

        if (newStart !== oldStart || newEnd !== oldEnd) {
            console.debug("时间变化", { start: newStart, end: newEnd }, { start: oldStart, end: oldEnd });
            return true;
        }

        // 比较链接字段
        const newLink = newTaskData.链接?.content || "";
        const oldLink = oldSiyuanTask.链接?.content || "";
        if (newLink !== oldLink) {
            console.debug("链接变化", newLink, oldLink);
            return true;
        }

        return false;
    }

    /**
     * 从标题中移除所有链接（D 链接和 S 链接），只保留原始标题
     */
    private removeLinksFromTitle(title: string): string {
        // 移除 [D](https://dida365.com/webapp/#p/{projectid}/tasks/xxx) 和 [S](siyuan://blocks/xxx) 链接
        return title.replace(/\s*\[D\]\(https:\/\/dida365\.com\/webapp\/#p\/[^\/]+\/tasks\/[^)]+\)/g, '')
            .replace(/\s*\[S\]\(siyuan:\/\/blocks\/[^)]+\)/g, '')
            .trim();
    }

    /**
     * 解析设置中的默认提醒，支持：
     * - 字符串：以换行或逗号分隔；
     * - 数组：直接使用；
     * - 自动补全缺失的前缀（若仅提供 -PT5M 等会补上 TRIGGER:）。
     */
    private parseDidaReminders(input: unknown): string[] {
        if (!input) return [];
        let parts: string[] = [];
        if (Array.isArray(input)) {
            parts = input as string[];
        } else if (typeof input === 'string') {
            parts = input
                .split(/\r?\n|,/) // 按行或逗号
                .map(s => s.trim())
                .filter(Boolean);
        } else {
            return [];
        }
        // 规范化并去重
        const norm = (s: string) => s.startsWith('TRIGGER:') ? s : (s.startsWith('-PT') ? `TRIGGER:${s}` : s);
        const valid = parts
            .map(norm)
            .filter(s => /^TRIGGER:\s*-?P(T\d+[HMS]|T?\d+[HMS].*)?/i.test(s) || /^TRIGGER:-?PT\d+[HMS](;.*)?$/i.test(s) || s.startsWith('TRIGGER:')); // 宽松校验，保留 TRIGGER 开头
        // 去重保持顺序
        const seen = new Set<string>();
        const result: string[] = [];
        for (const r of valid) { if (!seen.has(r)) { seen.add(r); result.push(r); } }
        return result;
    }

    /**
     * 构建任务数据
     */
    private buildTaskData(didaTask: Task, existingTask?: any) {
        // 转换优先级
        const getPriority = (priority: number) => {
            switch (priority) {
                case 0: return "无";
                case 1: return "低";
                case 3: return "中";
                case 5: return "高";
                default: return "无";
            }
        };

        // 转换状态
        const getStatus = (task: Task) => {
            // 如果标签中包含“完成”，则状态为“完成”
            if (task.tags?.includes("完成")) {
                return "完成";
            } else if (task.tags?.includes("进行中")) {
                return "进行中";
            } else if (task.tags?.includes('归档')) {
                return "归档";
            } else {
                return "未完成"
            }
        };
        // 提取标签，排除状态标签
        const getTags = (task: Task) => {
            const statusTags = ["完成", "进行中", "未完成", "归档"];
            if (!task.tags) {
                return [];
            }
            return task.tags.filter(tag => !statusTags.includes(tag));
        };

        // 构建带超链接的标题
        const buildTitleWithLinks = (title: string, didaId: string, projectId: string) => {
            // 移除所有现有链接，获取原始标题
            const originalTitle = this.removeLinksFromTitle(title);

            // 检查标题是否包含 S 链接，如果有则说明是从思源创建的任务
            if (title.includes('[S](siyuan://blocks/')) {
                // 如果有 S 链接，替换为 D 链接（思源端只能有 D 链接）
                return `${originalTitle} [D](https://dida365.com/webapp/#p/${projectId}/tasks/${didaId})`;
            }

            // 否则添加 D 链接（思源端链接到滴答清单）
            return `${originalTitle} [D](https://dida365.com/webapp/#p/${projectId}/tasks/${didaId})`;
        };


        // 转换时间
        const getTimeRange = (dueDate?: string, startDate?: string) => {
            let start: number | undefined;
            let end: number | undefined;

            if (startDate) {
                start = new Date(startDate).getTime();
            }
            if (dueDate) {
                end = new Date(dueDate).getTime();
            }

            return { start, end, hasEndDate: !!end };
        };

        const timeRange = getTimeRange(didaTask.dueDate, didaTask.startDate);

        // 构建带超链接的标题
        const originalTitle = didaTask.title || "";
        const titleWithLinks = buildTitleWithLinks(originalTitle, didaTask.id || "", didaTask.projectId || "");

        return {
            didaID: {
                content: didaTask.id || "",
                keyID: existingTask?.didaID?.keyID
            },
            事件: {
                content: titleWithLinks,
                keyID: existingTask?.事件?.keyID
            },
            开始时间: timeRange.start || timeRange.end ? {
                start: timeRange.start,
                end: timeRange.end,
                hasEndDate: timeRange.hasEndDate,
                keyID: existingTask?.开始时间?.keyID
            } : undefined,
            优先级: {
                content: getPriority(didaTask.priority || 0),
                keyID: existingTask?.优先级?.keyID
            },
            链接: {
                content: didaTask.id ? `https://dida365.com/webapp/#p/${didaTask.projectId}/tasks/${didaTask.id}` : "",
                keyID: existingTask?.链接?.keyID
            },
            状态: {
                content: getStatus(didaTask),
                keyID: existingTask?.状态?.keyID
            },
            标签: {
                content: getTags(didaTask).map(tag => ({ content: tag })),
                keyID: existingTask?.标签?.keyID
            },
            描述: {
                content: didaTask.content || "",
                keyID: existingTask?.描述?.keyID
            }
        };
    }
    /**
     * 创建思源笔记任务
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
            const statusCustomAttr = taskData.状态?.content === "完成" ? "done" : "todo";
            // 提取D链接
            // const titleWithoutLinks = this.removeLinksFromTitle(taskData.事件?.content || "新建任务");
            // const dLinkMatch = (taskData.事件?.content || "").match(/\[D\]\(https:\/\/dida365\.com\/webapp\/#q\/all\/tasks\/[^)]+\)/);
            // const dLink = dLinkMatch ? dLinkMatch[0] : "";

            await appendBlock(
                "markdown",
                `{{{row
${"#### " + taskData.事件?.content}

{: id="${await generateSiyuanID() as string}"}
${taskData.描述?.content || "描述：暂无"}

{: id="${await generateSiyuanID() as string}"}
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
                        const originalTitle = this.removeLinksFromTitle(cachedTask.title || "");
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
            const statusCustomAttr = newTaskData.状态?.content === "完成" ? "done" : "todo";
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
                        const originalTitle = this.removeLinksFromTitle(newTaskData.事件?.content || "");
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
                const newEventTitle = this.removeLinksFromTitle(taskData.事件.content);
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

            if (timeKeyID && (newStart !== oldStart || newEnd !== oldEnd)) {
                const startTime = newTime?.start ? formatLocalDate(newTime.start) : undefined;
                const endTime = newTime?.end && newTime?.hasEndDate ? formatLocalDate(newTime.end) : undefined;
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
    /**
         * 设置思源数据库更新的监听器，以实现从思源到滴答清单的同步。
     */
    private setupSiyuanUpdateListener(): void {
        if (this.wsMainHandler) {
            this.plugin.eventBus.off("ws-main", this.wsMainHandler);
        }
        this.wsMainHandler = (e) => {
            if (!this.isSyncing) {
                this.handleSiyuanUpdate_dalay(e);
            }
        };
        this.plugin.eventBus.on("ws-main", this.wsMainHandler);
    }

    /**
     * 监听前端发送的 /api/av/* 请求，补充 WebSocket 事务监听，做到“本地立即响应 + 服务器广播兜底”。
     * - 成功响应后，只针对我们关心的接口触发本地强制处理：setAttributeViewBlockAttr / batchSetAttributeViewBlockAttrs / addAttributeViewBlocks
     */
    private setupNetworkInterceptor(): void {
    if (this.netInterceptorHandle) return; // 避免重复安装

    this.netInterceptorHandle = interceptFetch({
            filter: (url, method) => method === 'POST' && url.includes('/api/av/'),
            onResponse: async (ctx) => {
                try {
                    // 若本次请求带有 dida 标签（由本模块打标），则跳过，避免自身触发
                    const h = (ctx.headers || {}) as Record<string, string>;
                    const tag = h['x-st-tag-dida'];
                    const tags = h['x-st-tags'];
                    if (tag === '1' || (typeof tags === 'string' && tags.split(',').includes('dida'))) {
                        return;
                    }
                    // 插件自身正在同步时，忽略这些回调，避免双触发
                    if (this.isSyncing) return;
                    if (!ctx.resOk || ctx.resStatus !== 200) return;
                    const url = ctx.url;
                    const body = (ctx.reqBody || {}) as any;

                    // 仅关注我们关心的几个接口
                    // 1) 单元格更新：/api/av/setAttributeViewBlockAttr
                    if (url.includes('/api/av/setAttributeViewBlockAttr') && body?.avID && body?.itemID) {
                        const avID: string = body.avID;
                        const itemID: string = body.itemID;
                        if (this.avId && avID === this.avId) {
                            const map = await getAttributeViewBoundBlockIDsByItemIDs(avID, [itemID]);
                            const blockId = map[itemID];
                            if (blockId) {
                                // 直接强制触发一次本地处理，减少等待 WS 通知的延迟
                                this.handleSiyuanUpdate('force', blockId, itemID);
                            }
                        }
                        return;
                    }

                    // 2) 批量单元格更新：/api/av/batchSetAttributeViewBlockAttrs
                    if (url.includes('/api/av/batchSetAttributeViewBlockAttrs') && body?.avID && Array.isArray(body?.values)) {
                        const avID: string = body.avID;
                        const values: Array<{ itemID: string } & Record<string, any>> = body.values;
                        if (this.avId && avID === this.avId && values.length > 0) {
                            const itemIDs = Array.from(new Set(values.map(v => v.itemID).filter(Boolean)));
                            if (itemIDs.length > 0) {
                                const map = await getAttributeViewBoundBlockIDsByItemIDs(avID, itemIDs);
                                // 只触发一次或按需多次，这里选择对每个 itemID 触发一次，保证精准
                                for (const itemID of itemIDs) {
                                    const blockId = map[itemID];
                                    if (blockId) {
                                        this.handleSiyuanUpdate('force', blockId, itemID);
                                    }
                                }
                            }
                        }
                        return;
                    }

                    // 3) 添加块到数据库：/api/av/addAttributeViewBlocks
                    if (url.includes('/api/av/addAttributeViewBlocks') && body?.avID && Array.isArray(body?.srcs)) {
                        const avID: string = body.avID;
                        const srcs: Array<{ id: string; itemID: string; isDetached?: boolean } & Record<string, any>> = body.srcs;
                        if (this.avId && avID === this.avId && srcs.length > 0) {
                            for (const s of srcs) {
                                if (s.itemID && s.id && !s.isDetached) {
                                    this.handleSiyuanUpdate('force', s.id, s.itemID);
                                }
                            }
                        }
                        return;
                    }
                } catch (err) {
                    console.warn('网络请求拦截处理失败:', err);
                }
            },
        });
    }

    //（留空占位，无辅助方法）

    private async handleSiyuanUpdate_dalay(e) {
        setTimeout(() => {
            this.handleSiyuanUpdate(e);
        }, 2000); // 延迟2秒
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
        if (this.wsMainHandler) {
            try {
                this.plugin.eventBus.off("ws-main", this.wsMainHandler);
            } catch (error) {
                console.warn("移除滴答 ws-main 监听失败", error);
            }
            this.wsMainHandler = undefined;
        }
        if (this.netInterceptorHandle) {
            try {
                this.netInterceptorHandle.stop();
            } catch (error) {
                console.warn("停止滴答网络拦截失败", error);
            }
            this.netInterceptorHandle = null;
        }
        try {
            this.linkInterceptor?.destroy?.();
        } catch (error) {
            console.warn("销毁滴答链接拦截器失败", error);
        }
        this.taskCache.clear();
        this.creatingDidaIds.clear();
        this.lastModifiedTime.clear();
        this.taskSyncLocks.clear();
        this.lastSyncDirection.clear();
        this.pendingDidaUpdates.clear();
    }

    /**
     * 处理来自思源 WebSocket 的消息，判断是否需要更新滴答任务。
     * 增加强制刷新逻辑
     */
    handleSiyuanUpdate = async (e: any, blockId = '', itemID = '') => {
        let isDetached: boolean;
        if (e == 'force' && blockId && itemID) {
            console.debug("fore滴答更新");
        } else {
            const msg = e.detail;
            if (msg.cmd !== "transactions") return;
            const operation = msg.data?.[0]?.doOperations?.[0];
            if (!operation || (operation.action !== "updateAttrViewCell" && operation.action !== "updateAttrs" && operation.action !== "insertAttrViewBlock")) {
                return;
            }
            // 检查是否是我们正在监听的数据库
            console.debug("处理思源更新DDD🚧🚧", operation);
            // Calculate the newly added avID by comparing old and new custom-avs


            const avID = operation.avID || extractNewAvId(operation?.data?.old?.['custom-avs'], operation?.data?.new?.['custom-avs']);
            console.debug("获取到的🚧🚧 avID:", avID);
            if (avID !== this.avId) {
                return;
            }

            if (operation.action === "insertAttrViewBlock") {//TODO: 暂不支持批量添加情况
                blockId = operation.srcs[0].id;
                isDetached = operation.srcs[0].isDetached;
                itemID = operation.srcs[0].itemID;
            } else {
                if (operation.rowID) {
                    itemID = operation.rowID;
                    blockId = await getAttributeViewBoundBlockIDsByItemIDs(avID, [operation.rowID]).then(data => data[operation.rowID]);
                } else if (operation.id) {
                    blockId = operation.id;
                    itemID = await getAttributeViewItemIDsByBoundIDs(avID, [operation.id]).then(data => data[operation.id]);
                }
                console.debug("🚧🚧: blockId", blockId);
                console.debug("🚧🚧: itemID", itemID);
            }
        }
        // return;
        if (isDetached) return;//游离块不支持添加到滴答,后续操作需要绑定块ID
        if (!blockId) return;
        try {
            // 1. 获取这一行（块）的完整数据，最重要的是拿到 didaID
            console.debug(`处理思源更新：块ID ${blockId}`);
            const viewData = await this.getAvViewData("处理思源更新");
            const allTasks = viewData.flatMap(view => view.data || []);
            const siyuanTask = allTasks.find((task: any) => task.事件?.itemID === itemID);

            if (!siyuanTask) {
                return;
            }

            // 检查是否存在 didaID。如果存在，则为更新操作；否则为创建操作。
            if (siyuanTask.didaID?.content) {
                // --- 更新现有任务的逻辑 ---
                const didaTaskId = siyuanTask.didaID.content;
                const cachedTask = this.taskCache.get(didaTaskId);
                if (!cachedTask) {
                    console.warn(`任务 ${didaTaskId} 不在缓存中，无法反向同步。`);
                    //执行缓存
                    await this.getAllTasks();
                    showMessage("请重试，无法获取到滴答事件，重试无效说明事件已经归档");
                    return;
                }
                const currentProjectId = cachedTask.projectId;
                const updatePayload: Partial<Task> = {};

                // 转换思源数据到滴答格式
                // 默认值
                updatePayload.status = 0;
                if (siyuanTask.事件?.content) {
                    // 移除标题中的 D 链接，并添加 S 链接指向思源
                    const originalTitle = this.removeLinksFromTitle(siyuanTask.事件.content);
                    updatePayload.title = `${originalTitle} [S](siyuan://blocks/${blockId})`;
                }
                if (siyuanTask.描述?.content) updatePayload.content = siyuanTask.描述.content;
                if (siyuanTask.优先级?.content) {
                    const priorityMap: { [key: string]: 0 | 1 | 3 | 5 } = { "无": 0, "低": 1, "中": 3, "高": 5 };
                    updatePayload.priority = priorityMap[siyuanTask.优先级.content];
                }
                // 时间与提醒：当时间发生变化时，附带默认提醒
                const newStartISO = siyuanTask.开始时间?.start ? formatDateToISO(siyuanTask.开始时间.start) : undefined;
                const newDueISO = siyuanTask.开始时间?.end ? formatDateToISO(siyuanTask.开始时间.end) : undefined; // TODO：滴答 API 无法设置时间段，仅记录结束为 dueDate
                const oldStartISO = cachedTask.startDate;
                const oldDueISO = cachedTask.dueDate;
                const timeChanged = newStartISO !== oldStartISO || newDueISO !== oldDueISO;

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

                // 若时间变更且现在存在时间，则注入默认提醒（不去清空已有提醒，避免覆盖用户自定义）
                if (timeChanged && (newStartISO || newDueISO)) {
                    try {
                        const defaults = this.parseDidaReminders((settingdata as any)["cal-dida-default-reminders"]);
                        if (defaults.length) {
                            updatePayload.reminders = defaults;
                        }
                    } catch {
                        // 忽略解析失败，保持原样
                    }
                }

                // 处理状态和标签
                const newStatus = siyuanTask.状态?.content;
                // console.debug("标签：：：", siyuanTask.标签?.content);
                const tagsFromSiyuan = (siyuanTask.标签?.content || []).map((item: any) => item);
                // console.debug("标签：：：", tagsFromSiyuan);
                const statusTags = [];
                if (newStatus === '完成') {
                    statusTags.push('完成');
                } else if (newStatus === '进行中') {
                    statusTags.push('进行中');
                } else if (newStatus === '归档') {
                    statusTags.push('归档');
                }
                // 如果没有状态标签，则默认为未完成 
                else {
                    statusTags.push('未完成');
                }
                updatePayload.tags = [...tagsFromSiyuan, ...statusTags];
                console.debug("❤️❤️❤️❤️更新的任务内容：", updatePayload);
                if (Object.keys(updatePayload).length > 0) {
                    // 加锁，防止并发修改
                    this.taskSyncLocks.set(didaTaskId, true);
                    try {
                        // 标记本地更新，进入冷却期
                        this.markPendingDidaUpdate(didaTaskId);
                        await this.apiClient.updateTask(didaTaskId, {
                            ...updatePayload,
                            id: didaTaskId,
                            projectId: updatePayload.projectId || currentProjectId
                        });
                        
                        // 立即更新本地缓存，避免使用过时数据
                        if (cachedTask) {
                            Object.assign(cachedTask, updatePayload);
                            if (updatePayload.projectId) cachedTask.projectId = updatePayload.projectId;
                        }
                        
                        // 更新时间戳和同步方向
                        this.lastModifiedTime.set(didaTaskId, Date.now());
                        this.lastSyncDirection.set(didaTaskId, 'siyuan-to-dida');
                        
                        console.debug(`思源任务 [${blockId}] 的变更已同步到滴答任务 [${didaTaskId}]`);
                        showStatusMessage("滴答任务已更新", 2000);
                    } finally {
                        // 延迟解锁，给一点缓冲时间
                        setTimeout(() => {
                            this.taskSyncLocks.set(didaTaskId, false);
                        }, 1000);
                    }
                }

            } else {
                // --- 新增任务的逻辑 ---
                if (this.creatingDidaIds.has(blockId)) {
                    console.warn(`任务 [${blockId}] 正在创建中，跳过重复处理。`);
                    return; // 正在处理，防止重复
                }
                this.creatingDidaIds.add(blockId);
                try {
                    // 再次获取最新的 viewData，确保 didaID 还未写入
                    const latestViewData = await getViewValue([{ rootid: this.avId, viewId: '', name: '' }]);
                    const latestTask = latestViewData.flatMap(view => view.data || []).find((task: any) => task.事件?.id === blockId);
                    if (latestTask?.didaID?.content) {
                        // 已经有 didaID，说明刚刚写入成功，直接返回
                        console.debug(`任务 [${blockId}] 已经有 didaID，跳过创建。`);
                        return;
                    }
                    const taskTitle = siyuanTask.事件?.content || "新建任务";
                    console.debug(`检测到新的思源任务 [${taskTitle}]，正在创建滴答任务...`);

                    // 确定目标清单，如果状态未定，则默认为未完成清单
                    // 2025/7/5 修改：根据状态标签来确定目标清单，不再设置多个清单了
                    let targetProjectId = this.todoListId;
                    // 如果连默认的未完成清单ID都没有设置，则无法继续
                    if (!targetProjectId) {
                        showMessage("无法创建任务：未设置默认的未完成清单ID。", -1, "error");
                        return;
                    }

                    const createTaskPayload: Omit<Task, 'id' | 'status' | 'completedTime'> & { projectId: string } = {
                        projectId: targetProjectId,
                        title: `${this.removeLinksFromTitle(siyuanTask.事件.content)} [S](siyuan://blocks/${blockId})`,
                        content: siyuanTask.描述?.content || undefined,
                        priority: siyuanTask.优先级?.content ? { "无": 0, "低": 1, "中": 3, "高": 5 }[siyuanTask.优先级.content] : 0,
                        startDate: siyuanTask.开始时间?.start ? formatDateToISO(siyuanTask.开始时间.start) : undefined,
                        dueDate: siyuanTask.开始时间?.end ? formatDateToISO(siyuanTask.开始时间.end) : undefined,
                        // 默认提醒：从设置读取并注入
                        reminders: (() => {
                            try {
                                const raw = (settingdata as any)["cal-dida-default-reminders"];
                                const arr = this.parseDidaReminders(raw);
                                return arr.length ? arr : undefined;
                            } catch {
                                return undefined;
                            }
                        })(),
                        // 标签处理优化：合并标签和状态标签
                        tags: [
                            ...(siyuanTask.标签?.content || []).map((item: any) => item),
                            (() => {
                                const status = siyuanTask.状态?.content;
                                if (status === '完成') return '完成';
                                if (status === '进行中') return '进行中';
                                if (status === '归档') return '归档';
                                return '未完成';
                            })()
                        ],
                    };

                    const newDidaTask = await this.apiClient.createTask(createTaskPayload);

                    if (newDidaTask && newDidaTask.id) {
                        // 立即更新缓存和时间戳
                        this.taskCache.set(newDidaTask.id, newDidaTask);
                        this.lastModifiedTime.set(newDidaTask.id, Date.now());
                        this.lastSyncDirection.set(newDidaTask.id, 'siyuan-to-dida');
                        this.markPendingDidaUpdate(newDidaTask.id);
                        
                        // 将新生成的 didaID 和链接字段写回思源数据库
                        const didaIdKeyID = await this.getKeyIDfromViewValue(viewData, 'didaID');
                        const linkKeyID = await this.getKeyIDfromViewValue(viewData, '链接');

                        const updatePromises: Promise<any>[] = [];

                        // 回写 didaID
                        if (didaIdKeyID) {
                            updatePromises.push(updateAttrViewCell_pro(blockId, this.avId, didaIdKeyID, itemID, newDidaTask.id, "text"));
                        } else {
                            console.error("无法找到 'didaID' 字段的 KeyID，无法写回滴答任务ID。");
                        }

                        // 回写链接字段
                        if (linkKeyID) {
                            const didaLink = `https://dida365.com/webapp/#p/${targetProjectId}/tasks/${newDidaTask.id}`;
                            updatePromises.push(updateAttrViewCell_pro(blockId, this.avId, linkKeyID, itemID, didaLink, "url"));
                        } else {
                            console.error("无法找到 '链接' 字段的 KeyID，无法写回滴答任务链接。");
                        }

                        // 等待所有更新完成
                        if (updatePromises.length > 0) {
                            // 仅在回写 didaID/链接期间为请求打上 dida 标签，让拦截器识别并跳过
                            await this.withDidaTagged(async () => {
                                await Promise.all(updatePromises);
                            });
                            console.debug(`新思源任务 [${blockId}] 已同步到滴答，ID为 [${newDidaTask.id}]，链接已回写`);
                            showStatusMessage("新任务已同步到滴答清单", 2000);
                        } else {
                            showMessage("无法写回滴答任务信息，请检查数据库是否有名为 'didaID' 和 '链接' 的列", -1, "error");
                        }
                    }
                } finally {
                    setTimeout(() => {
                        this.creatingDidaIds.delete(blockId); // 处理完成，移除锁
                    }, 2000);
                }
            }
            // 优化：延长防抖时间，避免频繁触发反向同步
            this.debouncedSyncTasksToSiyuan(8000); // 防抖同步检测，延长至8秒
        } catch (error) {
            console.error("从思源同步到滴答失败:", error);
        }
    };

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

}