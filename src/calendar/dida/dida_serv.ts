import { showMessage } from "siyuan";
import { Dida365ApiClient } from "./dida_api";
import { Project, Task } from "./dida_interface";
import steveTools, { settingdata } from "@/index";
import { getViewId, getViewValue } from "../myF";
import { addBlockToDatabase_pro, appendBlock, createDailyNote, generateSiyuanID, setBlockAttrs, updateAttrViewCell_pro, updatemainkey } from "@/api";
import { formatLocalDate } from "./siyuan_api";

export class Dida365Service {
    private apiClient: Dida365ApiClient;
    private plugin: steveTools;
    private avId: string | null = null; // 用于存储滴答清单同步的数据库ID
    private todoListId: string | null = null; // 用于存储未完成任务列表ID
    private doneListId: string | null = null; // 用于存储已完成任务列表ID cal-dida-finished-list

    constructor(token: string, plugin: steveTools) {
        this.plugin = plugin;
        this.apiClient = new Dida365ApiClient(token);
        this.todoListId = settingdata["cal-dida-unfinished-list"] || null;
        this.doneListId = settingdata["cal-dida-finished-list"] || null;
        if (!token || token.trim() === "") {
            showMessage("Dida365 fallback: Token is empty or invalid.", -1, "error");
            return;
        }
        // 初始化时可以进行一些验证或设置
        this.isTokenValid();
        console.log("Dida365Service initialized",this.doneListId, this.todoListId);
        this.init();
    }

    /**
     * 初始化 Dida365Service，进行必要的设置或验证。
     */
    private async init() {
        this.plugin.addTopBar({
            icon: "iconArrowDown",
            title: "导入dida", // 标题可以考虑根据模式动态变化或在设置中说明
            position: "right",
            callback: async () => {
                const data = await this.getAllTasks();
                console.log("获取到的所有任务数据:", data);
                await this.syncTasksToSiyuan();
            }
        });
        await this.init_av();
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
                const taskData = this.buildTaskData(didaTask, existingTask);

                if (existingTask) {
                    // 比较任务数据，仅在有变化时更新
                    if (this.isTaskChanged(taskData, existingTask)) {
                        await this.updateSiyuanTask(existingTask, taskData);
                        updateCount++;
                    }
                } else {
                    // 创建新任务
                    await this.createSiyuanTask(taskData);
                    syncCount++;
                }
            }

            showMessage(`同步完成：新建 ${syncCount} 个任务，更新 ${updateCount} 个任务`, 3000);

        } catch (error) {
            console.error("同步滴答清单任务失败:", error);
            showMessage("同步失败：" + (error instanceof Error ? error.message : String(error)), -1, "error");
        }
    }

    /**
     * 比较新旧任务数据是否有变化
     */
    private isTaskChanged(newTaskData: any, oldSiyuanTask: any): boolean {
        // 比较事件标题
        if (newTaskData.事件.content !== oldSiyuanTask.事件?.content) {
            console.log("事件标题变化", newTaskData.事件.content, oldSiyuanTask.事件?.content);
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
            console.log("时间变化", {start: newStart, end: newEnd}, {start: oldStart, end: oldEnd});
            return true;
        }
        
        return false;
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
        const getStatus = (projectId: string) => {
            return projectId === this.doneListId ? "done" : "todo";
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

        return {
            didaID: {
                content: didaTask.id || "",
                keyID: existingTask?.didaID?.keyID
            },
            事件: {
                content: didaTask.title || "",
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
            状态: {
                content: getStatus(didaTask.projectId),
                keyID: existingTask?.状态?.keyID
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
            const statusCustomAttr = taskData.状态?.content === "done" ? "done" : "todo";
            await appendBlock(
                "markdown",
                `{{{row
${taskData.事件?.content || "新建任务"}

{: id="${await generateSiyuanID() as string}"}

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
            await this.updateTaskFields(blockId, newTaskData, viewValue);

            // 更新块的自定义属性（状态）
            const statusCustomAttr = newTaskData.状态?.content === "done" ? "done" : "todo";
            await setBlockAttrs(blockId, {
                "custom-st-event": statusCustomAttr
            });

            console.log("成功更新任务:", newTaskData.事件?.content);

        } catch (error) {
            console.error("更新思源任务失败:", error);
            throw error;
        }
    }

    /**
     * 更新任务字段的通用方法
     */
    private async updateTaskFields(blockId: string, taskData: any, viewValue: any): Promise<void> {
        try {
            // 获取各字段的 keyID
            const didaIdKeyID = await this.getKeyIDfromViewValue(viewValue, 'didaID', this.avId);
            const eventKeyID = await this.getKeyIDfromViewValue(viewValue, '事件', this.avId);
            const timeKeyID = await this.getKeyIDfromViewValue(viewValue, '开始时间', this.avId);
            const priorityKeyID = await this.getKeyIDfromViewValue(viewValue, '优先级', this.avId);
            const statusKeyID = await this.getKeyIDfromViewValue(viewValue, '状态', this.avId);
            const descKeyID = await this.getKeyIDfromViewValue(viewValue, '描述', this.avId);

            // 更新 didaID (通常只在创建时写入)
            if (didaIdKeyID && taskData.didaID?.content) {
                await updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    didaIdKeyID,
                    taskData.didaID.content,
                    "text"
                );
            }

            // 更新事件标题
            if (eventKeyID && taskData.事件?.content) {
                await updatemainkey({
                    avID: this.avId,
                    blockID: blockId,
                    keyID: eventKeyID,
                    content: taskData.事件.content,
                });
            }

            // 更新开始时间
            if (timeKeyID && taskData.开始时间) {
                const startTime = formatLocalDate(taskData.开始时间.start);
                const endTime = taskData.开始时间.end && taskData.开始时间.hasEndDate ? formatLocalDate(taskData.开始时间.end) : undefined;

                if (startTime) {
                    await updateAttrViewCell_pro(
                        blockId,
                        this.avId,
                        timeKeyID,
                        startTime,
                        "date",
                        endTime
                    );
                }
            }

            // 更新优先级
            if (priorityKeyID && taskData.优先级?.content) {
                const priorityData = [{ content: taskData.优先级.content }];
                await updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    priorityKeyID,
                    priorityData,
                    "select"
                );
            }

            // 更新状态
            if (statusKeyID && taskData.状态?.content) {
                const statusData = [{ content: taskData.状态.content }];
                await updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    statusKeyID,
                    statusData,
                    "select"
                );
            }

            // 更新描述
            if (descKeyID && taskData.描述?.content) {
                await updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    descKeyID,
                    taskData.描述.content,
                    "text"
                );
            }

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
        const projects = await this.apiClient.getUserProjects();

        if (!projects) {
            return [];
        }

        for (const project of projects) {
            if (project.id) {
                try {
                    const projectData = await this.apiClient.getProjectWithData(project.id);
                    if (projectData && projectData.tasks && projectData.tasks.length > 0) {
                        allTasks.push(...projectData.tasks);
                    }
                } catch (error) {
                    console.warn(`获取项目 "${project.name}" (ID: ${project.id}) 的任务失败:`, error instanceof Error ? error.message : String(error));
                    // 根据需要，可以选择是继续执行还是抛出错误
                }
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