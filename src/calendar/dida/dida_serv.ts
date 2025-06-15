import { showMessage } from "siyuan";
import { Dida365ApiClient } from "./dida_api";
import { Task } from "./dida_interface";

export class Dida365Service {
    private apiClient: Dida365ApiClient;

    constructor(token: string) {
        this.apiClient = new Dida365ApiClient(token);
        if(!token || token.trim() === "") {
            showMessage("Dida365 fallback: Token is empty or invalid.",-1, "error");
            return;
        }

        // 初始化时可以进行一些验证或设置
        this.isTokenValid();
        console.log("Dida365Service initialized");
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
     * 获取底层的 Dida365ApiClient 实例，以便直接调用其方法。
     * @returns Dida365ApiClient 实例。
     */
    public getApiClient(): Dida365ApiClient {
        return this.apiClient;
    }

}