import { showMessage } from "siyuan";
import type steveTools from "@/index";
import { Dida365ApiClient } from "../api/dida-api-client";
import type {
    Project,
    Task,
    TaskCompletedQuery,
    TaskFilterQuery,
    TaskMoveOperation,
    TaskMoveResult,
} from "../dida_interface";
import { DidaSyncCoordinator } from "../sync/sync-feature";
import { DidaFocusFeature } from "./focus/focus-feature";
import { DidaHabitFeature } from "./habits/habit-feature";
import { DidaTaskSyncFeature } from "./tasks/task-sync-feature";

export class Dida365Service {
    private readonly apiClient: Dida365ApiClient;
    private readonly coordinator = new DidaSyncCoordinator();
    private readonly taskFeature: DidaTaskSyncFeature;
    private readonly focusFeature: DidaFocusFeature;
    private readonly habitFeature: DidaHabitFeature;

    constructor(token: string, plugin: steveTools) {
        this.apiClient = new Dida365ApiClient(token);
        this.taskFeature = new DidaTaskSyncFeature(this.apiClient, plugin);
        this.focusFeature = new DidaFocusFeature(this.apiClient.focus);
        this.habitFeature = new DidaHabitFeature(this.apiClient.habits);
        this.coordinator.register(this.taskFeature);
        this.coordinator.register(this.focusFeature);
        this.coordinator.register(this.habitFeature);

        if (!token?.trim()) {
            showMessage("Dida365 fallback: Token is empty or invalid.", -1, "error");
            return;
        }

        if (typeof window !== "undefined") (window as any).Dida365Service = this;
        void this.start();
    }

    private async start(): Promise<void> {
        await this.isTokenValid();
        await this.coordinator.start();
    }

    destroy(): void {
        if (typeof window !== "undefined" && (window as any).Dida365Service === this) {
            delete (window as any).Dida365Service;
        }
        void this.coordinator.destroy();
    }

    handleSiyuanUpdate = async (event: any, blockId = "", itemID = ""): Promise<void> => {
        await this.taskFeature.handleSiyuanUpdate(event, blockId, itemID);
    };

    syncTasksToSiyuan(): Promise<boolean> {
        return this.taskFeature.syncTasksToSiyuan();
    }

    isTokenValid(): Promise<boolean> {
        return this.taskFeature.isTokenValid();
    }

    getAllTasks(): Promise<Task[]> {
        return this.taskFeature.getAllTasks();
    }

    findTasksByTitle(titleQuery: string, caseSensitive = false): Promise<Task[]> {
        return this.taskFeature.findTasksByTitle(titleQuery, caseSensitive);
    }

    getTasksByProject(projectId: string): Promise<Task[]> {
        return this.taskFeature.getTasksByProject(projectId);
    }

    getAllProjects(): Promise<Project[]> {
        return this.taskFeature.getAllProjects();
    }

    getApiClient(): Dida365ApiClient {
        return this.apiClient;
    }

    getFocusFeature(): DidaFocusFeature {
        return this.focusFeature;
    }

    getHabitFeature(): DidaHabitFeature {
        return this.habitFeature;
    }

    getTask(projectId: string, taskId: string): Promise<Task> {
        return this.taskFeature.getTask(projectId, taskId);
    }

    completeTask(projectId: string, taskId: string): Promise<void> {
        return this.taskFeature.completeTask(projectId, taskId);
    }

    moveTasks(operations: TaskMoveOperation[]): Promise<TaskMoveResult[]> {
        return this.taskFeature.moveTasks(operations);
    }

    moveTask(operation: TaskMoveOperation): Promise<TaskMoveResult[]> {
        return this.taskFeature.moveTask(operation);
    }

    listCompletedTasks(query: TaskCompletedQuery = {}): Promise<Task[]> {
        return this.taskFeature.listCompletedTasks(query);
    }

    filterTasks(query: TaskFilterQuery = {}): Promise<Task[]> {
        return this.taskFeature.filterTasks(query);
    }
}
