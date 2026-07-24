import type {
    Task,
    TaskCompletedQuery,
    TaskFilterQuery,
    TaskMoveOperation,
    TaskMoveResult,
} from "../dida_interface";
import { DidaHttpClient } from "./http-client";

export class DidaTaskApi {
    private readonly updateCache = new Map<string, { requestBody: string; response: Task }>();

    constructor(private readonly http: DidaHttpClient) {}

    getTask(projectId: string, taskId: string): Promise<Task> {
        return this.http.request(`/project/${projectId}/task/${taskId}`);
    }

    createTask(taskData: Omit<Task, "id" | "status" | "completedTime" | "etag"> & { projectId: string }): Promise<Task> {
        return this.http.request("/task", { method: "POST", body: JSON.stringify(taskData) });
    }

    async updateTask(taskId: string, taskData: Partial<Task> & { id: string; projectId: string }): Promise<Task> {
        const requestBody = JSON.stringify(taskData);
        const cached = this.updateCache.get(taskId);
        if (cached?.requestBody === requestBody) return cached.response;

        const response = await this.http.request<Task>(`/task/${taskId}`, {
            method: "POST",
            body: requestBody,
        });
        this.updateCache.set(taskId, { requestBody, response });
        return response;
    }

    async completeTask(projectId: string, taskId: string): Promise<void> {
        await this.http.request(`/project/${projectId}/task/${taskId}/complete`, { method: "POST" });
    }

    async deleteTask(projectId: string, taskId: string): Promise<void> {
        await this.http.request(`/project/${projectId}/task/${taskId}`, { method: "DELETE" });
    }

    moveTasks(operations: TaskMoveOperation[]): Promise<TaskMoveResult[]> {
        return this.http.request("/task/move", { method: "POST", body: JSON.stringify(operations) });
    }

    moveTask(operation: TaskMoveOperation): Promise<TaskMoveResult[]> {
        return this.moveTasks([operation]);
    }

    listCompletedTasks(query: TaskCompletedQuery = {}): Promise<Task[]> {
        return this.http.request("/task/completed", { method: "POST", body: JSON.stringify(query) });
    }

    filterTasks(query: TaskFilterQuery = {}): Promise<Task[]> {
        return this.http.request("/task/filter", { method: "POST", body: JSON.stringify(query) });
    }
}
