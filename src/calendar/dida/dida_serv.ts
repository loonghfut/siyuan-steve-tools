import { showMessage } from "siyuan";
import { Dida365ApiClient } from "./dida_api";
import { Project, Task } from "./dida_interface";
import steveTools, { settingdata } from "@/index";
import { getViewId, getViewValue } from "../myF";
import { addBlockToDatabase_pro, appendBlock, createDailyNote, generateSiyuanID, setBlockAttrs, showStatusMessage, updateAttrViewCell_pro, updatemainkey } from "@/api/api";
import { formatDateToISO, formatLocalDate } from "./siyuan_api";

export class Dida365Service {
    private apiClient: Dida365ApiClient;
    private plugin: steveTools;
    private avId: string | null = null; // 用于存储滴答清单同步的数据库ID
    private todoListId: string | null = null; // 用于存储未完成任务列表ID
    // private doneListId: string | null = null; // 用于存储已完成任务列表ID cal-dida-finished-list
    private taskCache: Map<string, Task> = new Map(); // 新增：用于缓存滴答任务
    private isSyncing = false; // 新增同步锁
    private creatingDidaIds: Set<string> = new Set();

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
        console.log("Dida365Service initialized", this.todoListId);
        this.init();
    }

    /**
     * 初始化 Dida365Service，进行必要的设置或验证。
     */
    private async init() {
        if (settingdata["cal-dida-sync-mode"] === "all" || settingdata["cal-dida-sync-mode"] === "manual") {
            this.plugin.addTopBar({
                icon: "iconMp",
                title: "导入滴答清单数据", // 标题可以考虑根据模式动态变化或在设置中说明
                position: "right",
                callback: async () => {
                    // const data = await this.getAllTasks();
                    // console.log("获取到的所有任务数据:", data);
                    await this.syncTasksToSiyuan();
                }
            });
        };
        if (settingdata["cal-dida-sync-mode"] === "auto" || settingdata["cal-dida-sync-mode"] === "all") {
            // 自动同步模式，设置定时器
            setTimeout(async () => {
                if (!this.isSyncing) { // 首次延迟10秒后同步一次
                    await this.syncTasksToSiyuan();
                }
            }, 10000);
            setInterval(async () => {
                if (!this.isSyncing) { // 仅在未同步时执行
                    await this.syncTasksToSiyuan();
                }
            }, settingdata["cal-dida-sync-interval"] * 60 * 1000); // 转换为毫秒
        };
        await this.init_av();
        await this.getAllTasks(); // 初始化时加载滴答任务缓存
        this.setupSiyuanUpdateListener(); // 2025/7/5新增：设置思源更新监听器
    }
    private async init_av() {
        this.avId = settingdata["cal-dida-db-id"]
        if (!this.avId || this.avId.trim() === "") {
            showMessage("Dida365Service: avId is not set or is empty.");
            return;
        }
        const data = await getViewId([this.avId]);
        console.log("获取到的 avId 数据:", data);
        const viewValue = await getViewValue(data);
        console.log("获取到的 avId 对应的值:", viewValue);

    }


    async syncTasksToSiyuan(): Promise<void> {
        this.isSyncing = true; // 开始同步，锁定
        showStatusMessage("正在同步滴答清单任务，请稍候...", 10000, "dida-sync");
        try {
            // 获取滴答清单的所有任务
            const didaTasks = await this.getAllTasks();

            // 获取思源数据库的现有数据
            if (!this.avId) {
                showMessage("数据库ID未设置，无法同步", -1, "error");
                return;
            }

            const data = await getViewId([this.avId]);
            const viewValue = await getViewValue(data);

            if (!viewValue || !Array.isArray(viewValue) || viewValue.length === 0) {
                showMessage("无法获取数据库视图数据", -1, "error");
                return;
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

            // 处理每个滴答清单任务
            for (const didaTask of didaTasks) {
                if (!didaTask.id) continue;

                const existingTask = existingTasksMap.get(didaTask.id);

                if (existingTask) {
                    // 更新现有任务
                    const taskData = this.buildTaskData(didaTask, existingTask);

                    // 比较任务数据，仅在有变化时更新
                    if (this.isTaskChanged(taskData, existingTask)) {
                        await this.updateSiyuanTask(existingTask, taskData);
                        updateCount++;
                    }
                } else {
                    // 创建新任务
                    const taskData = this.buildTaskData(didaTask, existingTask);
                    await this.createSiyuanTask(taskData);
                    syncCount++;
                }
            }

            showStatusMessage(`同步完成：新建 ${syncCount} 个任务，更新 ${updateCount} 个任务`, 3000, "dida-sync");

        } catch (error) {
            console.error("同步滴答清单任务失败:", error);
            showMessage("同步失败：" + (error instanceof Error ? error.message : String(error)), -1, "error", "dida-sync");
        } finally {
            this.isSyncing = false; // 同步结束，解锁
            // showMessage("滴答清单任务同步已完成", 2000, "info", "dida-sync");
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
            console.log("事件标题变化", newEventTitle, oldEventTitle);
            return true;
        }
        // 比较优先级
        // console.log("比较事件", newTaskData, oldSiyuanTask);
        if (newTaskData.优先级.content !== oldSiyuanTask.优先级?.content) {
            console.log("优先级变化", newTaskData.优先级.content, oldSiyuanTask.优先级?.content);
            return true;
        }
        // 比较状态
        if (newTaskData.状态.content !== oldSiyuanTask.状态?.content) {
            console.log("状态变化", newTaskData.状态.content, oldSiyuanTask.状态?.content);
            return true;
        }
        // 比较标签
        const newTags = newTaskData.标签.content || [];
        const oldTags = oldSiyuanTask.标签?.content || [];
        // 将标签转换为字符串数组以便比较
        const newTagContents = newTags.map((tag: any) => tag.content).sort();
        const oldTagContents = oldTags.map((tag: any) => tag).sort();
        console.log("比较标签", newTagContents, oldTagContents);
        if (newTagContents.join(",") !== oldTagContents.join(",")) {
            console.log("标签变化", newTagContents, oldTagContents);
            return true;
        }
        // 比较描述
        if ((newTaskData.描述.content || "") !== (oldSiyuanTask.描述?.content || "")) {
            console.log("描述变化", newTaskData.描述.content, oldSiyuanTask.描述?.content);
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
            console.log("时间变化", { start: newStart, end: newEnd }, { start: oldStart, end: oldEnd });
            return true;
        }

        return false;
    }

    /**
     * 从标题中移除所有链接（D 链接和 S 链接），只保留原始标题
     */
    private removeLinksFromTitle(title: string): string {
        // 移除 [D](https://dida365.com/webapp/#q/all/tasks/xxx) 和 [S](siyuan://blocks/xxx) 链接
        return title.replace(/\s*\[D\]\(https:\/\/dida365\.com\/webapp\/#q\/all\/tasks\/[^)]+\)/g, '')
            .replace(/\s*\[S\]\(siyuan:\/\/blocks\/[^)]+\)/g, '')
            .trim();
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
            } else {
                return "未完成"
            }
        };
        // 提取标签，排除状态标签
        const getTags = (task: Task) => {
            const statusTags = ["完成", "进行中", "未完成"];
            if (!task.tags) {
                return [];
            }
            return task.tags.filter(tag => !statusTags.includes(tag));
        };

        // 构建带超链接的标题
        const buildTitleWithLinks = (title: string, didaId: string) => {
            // 移除所有现有链接，获取原始标题
            const originalTitle = this.removeLinksFromTitle(title);

            // 检查标题是否包含 S 链接，如果有则说明是从思源创建的任务
            if (title.includes('[S](siyuan://blocks/')) {
                // 如果有 S 链接，替换为 D 链接（思源端只能有 D 链接）
                return `${originalTitle} [D](https://dida365.com/webapp/#q/all/tasks/${didaId})`;
            }

            // 否则添加 D 链接（思源端链接到滴答清单）
            return `${originalTitle} [D](https://dida365.com/webapp/#q/all/tasks/${didaId})`;
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
        const titleWithLinks = buildTitleWithLinks(originalTitle, didaTask.id || "");

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
                content: didaTask.id ? `https://dida365.com/webapp/#q/all/tasks/${didaTask.id}` : "",
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
            await addBlockToDatabase_pro(blockId, this.avId);

            // 获取 viewValue 用于获取 keyID
            const data = await getViewId([this.avId]);
            const viewValue = await getViewValue(data);

            // 更新各个字段
            await this.updateTaskFields(blockId, taskData, viewValue);

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
                        await this.apiClient.updateTask(didaTaskId, {
                            id: didaTaskId,
                            projectId: cachedTask.projectId,
                            title: titleWithSLink
                        });

                        // 更新缓存中的任务标题
                        cachedTask.title = titleWithSLink;

                        console.log(`滴答任务 [${didaTaskId}] 已更新 S 链接`);
                    }
                } catch (error) {
                    console.warn("更新滴答任务 S 链接失败:", error);
                }
            }

            console.log("成功创建新任务:", taskData.事件?.content);

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

            // 获取 viewValue 用于获取 keyID
            const data = await getViewId([this.avId]);
            const viewValue = await getViewValue(data);

            // 更新各个字段
            await this.updateTaskFields(blockId, newTaskData, viewValue, existingTask);

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
                            await this.apiClient.updateTask(didaTaskId, {
                                id: didaTaskId,
                                projectId: cachedTask.projectId,
                                title: titleWithSLink
                            });

                            // 更新缓存中的任务标题
                            cachedTask.title = titleWithSLink;

                            console.log(`滴答任务 [${didaTaskId}] 已更新 S 链接`);
                        }
                    }
                } catch (error) {
                    console.warn("更新滴答任务 S 链接失败:", error);
                }
            }

            console.log("成功更新任务:", newTaskData.事件?.content);

        } catch (error) {
            console.error("更新思源任务失败:", error);
            throw error;
        }
    }

    /**
     * 更新任务字段的通用方法
     */
    private async updateTaskFields(blockId: string, taskData: any, viewValue: any, existingTask?: any): Promise<void> {
        try {
            // 获取各字段的 keyID
            const didaIdKeyID = await this.getKeyIDfromViewValue(viewValue, 'didaID', this.avId);
            const eventKeyID = await this.getKeyIDfromViewValue(viewValue, '事件', this.avId);
            const timeKeyID = await this.getKeyIDfromViewValue(viewValue, '开始时间', this.avId);
            const priorityKeyID = await this.getKeyIDfromViewValue(viewValue, '优先级', this.avId);
            const urlKeyID = await this.getKeyIDfromViewValue(viewValue, '链接', this.avId);
            const statusKeyID = await this.getKeyIDfromViewValue(viewValue, '状态', this.avId);
            const tagKeyID = await this.getKeyIDfromViewValue(viewValue, '标签', this.avId);
            const descKeyID = await this.getKeyIDfromViewValue(viewValue, '描述', this.avId);

            // 批量更新：收集所有需要更新的字段
            const updatePromises: Promise<any>[] = [];

            // 更新 didaID (通常只在创建时写入)
            if (didaIdKeyID && taskData.didaID?.content && !existingTask?.didaID?.content) {
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    didaIdKeyID,
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
                    statusData,
                    "select"
                ));
            }

            // 更新标签
            const newTags = (taskData.标签?.content || []).map((t: any) => t.content).sort().join(',');
            const oldTags = (existingTask?.标签?.content || []).sort().join(',');
            if (tagKeyID && taskData.标签?.content && newTags !== oldTags) {
                console.log("更新标签：", taskData.标签.content);
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    tagKeyID,
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
                    taskData.描述.content,
                    "text"
                ));
            }
            console.log("更新链接BBBBBBBBBBBBB：", taskData.链接.content, urlKeyID);
            if (urlKeyID && taskData.链接?.content) {
                // 更新链接
                console.log("更新链接!!!!!!!!!!!!!!!!!!!：", taskData.链接.content);
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    urlKeyID,
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
    private async getKeyIDfromViewValue(viewValue: any, fieldName: string, dbId: string): Promise<string | null> {
        try {
            if (!viewValue || !Array.isArray(viewValue) || viewValue.length === 0) {
                return null;
            }

            const viewData = viewValue[0];
            if (!viewData.data || !Array.isArray(viewData.data) || viewData.data.length === 0) {
                return null;
            }
            console.log("获取字段 keyID：", fieldName, viewData.data);
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
        // 这里需要根据您的日记创建逻辑来实现
        // 暂时使用简单的创建方式
        return (await createDailyNote(window.siyuan.ws.app.appId, parentId)).id;
    }
    /**
         * 设置思源数据库更新的监听器，以实现从思源到滴答清单的同步。
     */
    private setupSiyuanUpdateListener(): void {
        this.plugin.eventBus.on("ws-main", (e) => {
            if (!this.isSyncing) {
                this.handleSiyuanUpdate_dalay(e);
            }
        });
    }

    private async handleSiyuanUpdate_dalay(e) {
        setTimeout(() => {
            this.handleSiyuanUpdate(e);
        }, 3000); // 延迟3秒
    }

    /**
     * 处理来自思源 WebSocket 的消息，判断是否需要更新滴答任务。
     */
    private handleSiyuanUpdate = async (e: any) => {
        const msg = e.detail;
        if (msg.cmd !== "transactions") return;
        const operation = msg.data?.[0]?.doOperations?.[0];
        if (!operation || (operation.action !== "updateAttrViewCell" && operation.action !== "updateAttrs")) {
            return;
        }

        // 检查是否是我们正在监听的数据库
        if (operation.avID !== this.avId) {
            return;
        }

        const blockId = operation.rowID;
        if (!blockId) return;

        try {
            // 1. 获取这一行（块）的完整数据，最重要的是拿到 didaID
            console.log(`处理思源更新：块ID ${blockId}`);
            const viewData = await getViewValue([{ rootid: this.avId, viewId: '', name: '' }]);
            const allTasks = viewData.flatMap(view => view.data || []);
            const siyuanTask = allTasks.find((task: any) => task.事件?.id === blockId);

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
                    showMessage("请重试");
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
                if (siyuanTask.开始时间) {
                    updatePayload.startDate = siyuanTask.开始时间.start ? formatDateToISO(siyuanTask.开始时间.start) : undefined;
                    updatePayload.dueDate = siyuanTask.开始时间.end ? formatDateToISO(siyuanTask.开始时间.end) : undefined; //TODO：滴答api无法设置时间段
                    updatePayload.isAllDay = false;
                    updatePayload.timeZone = "Asia/Shanghai";
                } else {
                    updatePayload.startDate = undefined;
                    updatePayload.dueDate = undefined;
                    updatePayload.timeZone = "Asia/Shanghai";
                }

                // 处理状态和标签
                const newStatus = siyuanTask.状态?.content;
                // console.log("标签：：：", siyuanTask.标签?.content);
                const tagsFromSiyuan = (siyuanTask.标签?.content || []).map((item: any) => item);
                // console.log("标签：：：", tagsFromSiyuan);
                const statusTags = [];
                if (newStatus === '完成') {
                    statusTags.push('完成');
                } else if (newStatus === '进行中') {
                    statusTags.push('进行中');
                } else {
                    statusTags.push('未完成');
                }
                updatePayload.tags = [...tagsFromSiyuan, ...statusTags];

                if (Object.keys(updatePayload).length > 0) {
                    await this.apiClient.updateTask(didaTaskId, {
                        ...updatePayload,
                        id: didaTaskId,
                        projectId: updatePayload.projectId || currentProjectId
                    });
                    if (updatePayload.projectId) cachedTask.projectId = updatePayload.projectId;
                    console.log(`思源任务 [${blockId}] 的变更已同步到滴答任务 [${didaTaskId}]`);
                    showStatusMessage("滴答任务已更新", 2000);
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
                        console.log(`任务 [${blockId}] 已经有 didaID，跳过创建。`);
                        return;
                    }
                    const taskTitle = siyuanTask.事件?.content || "新建任务";
                    console.log(`检测到新的思源任务 [${taskTitle}]，正在创建滴答任务...`);

                    // 确定目标清单，如果状态未定，则默认为未完成清单
                    // 2025/7/5 修改：根据状态标签来确定目标清单，不再设置多个清单了
                    let targetProjectId = this.todoListId
                    // if (!targetProjectId) {
                    //     console.warn("无法根据状态确定目标清单，将默认使用未完成清单。");
                    //     targetProjectId = this.todoListId;
                    // }

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
                        tags: siyuanTask.状态?.content ? [siyuanTask.状态.content] : [],
                    };

                    const newDidaTask = await this.apiClient.createTask(createTaskPayload);

                    if (newDidaTask && newDidaTask.id) {
                        // 将新生成的 didaID 写回思源数据库
                        const didaIdKeyID = await this.getKeyIDfromViewValue(viewData, 'didaID', this.avId);
                        if (didaIdKeyID) {
                            await updateAttrViewCell_pro(blockId, this.avId, didaIdKeyID, newDidaTask.id, "text");
                            // 更新缓存
                            this.taskCache.set(newDidaTask.id, newDidaTask);
                            console.log(`新思源任务 [${blockId}] 已同步到滴答，ID为 [${newDidaTask.id}]`);
                            showStatusMessage("新任务已同步到滴答清单", 2000);
                        } else {
                            console.error("无法找到 'didaID' 字段的 KeyID，无法写回滴答任务ID。");
                            showMessage("无法写回滴答任务ID，请检查数据库是否有名为 'didaID' 的列", -1, "error");
                        }
                    }
                } finally {
                    setTimeout(() => {
                        this.creatingDidaIds.delete(blockId); // 处理完成，移除锁
                    }, 2000);
                }
            }


        } catch (error) {
            console.error("从思源同步到滴答失败:", error);
        }
    };
    /**
     * 检测 Dida365 API Token 是否有效。
     * @returns Promise<boolean> 如果 Token 有效，返回 true；否则返回 false。
     */
    async isTokenValid(): Promise<boolean> {
        try {
            const projects = await this.apiClient.getUserProjects();
            console.log("Dida365 API Token 验证成功，获取到的项目数量:", projects ? projects.length : 0);
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
                            this.taskCache.set(task.id, task);
                        }
                    });
                }
            } catch (error) {
                console.warn(`获取项目 (ID: ${projectId}) 的任务失败:`, error instanceof Error ? error.message : String(error));
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