import { showMessage } from "siyuan";
import { Dida365ApiClient } from "./dida_api";
import { Project, Task } from "./dida_interface";
import steveTools from "@/index";

export class Dida365Service {
    private apiClient: Dida365ApiClient;
    private plugin: steveTools;

    constructor(token: string, plugin: steveTools) {
        this.plugin = plugin;
        this.apiClient = new Dida365ApiClient(token);
        if (!token || token.trim() === "") {
            showMessage("Dida365 fallback: Token is empty or invalid.", -1, "error");
            return;
        }
        // 初始化时可以进行一些验证或设置
        this.isTokenValid();
        console.log("Dida365Service initialized");
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
                const data = await this.getAllUndoneTasks();
                console.log("获取到的所有任务数据:", data);
            }
        });
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
    async getAllUndoneTasks(): Promise<Task[]> {
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
        const allUndoneTasks = await this.getAllUndoneTasks();
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