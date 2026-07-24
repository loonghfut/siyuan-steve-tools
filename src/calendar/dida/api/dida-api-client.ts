import type {
    Project,
    ProjectData,
    Task,
    TaskCompletedQuery,
    TaskFilterQuery,
    TaskMoveOperation,
    TaskMoveResult,
} from "../dida_interface";
import { DidaFocusApi } from "./focus-api";
import { DidaHabitApi } from "./habit-api";
import { DidaHttpClient, type DidaHttpClientOptions } from "./http-client";
import { DidaProjectApi } from "./project-api";
import { DidaTaskApi } from "./task-api";

export class Dida365ApiClient {
    readonly tasks: DidaTaskApi;
    readonly projects: DidaProjectApi;
    readonly focus: DidaFocusApi;
    readonly habits: DidaHabitApi;

    constructor(token: string, options: DidaHttpClientOptions = {}) {
        const http = new DidaHttpClient(token, options);
        this.tasks = new DidaTaskApi(http);
        this.projects = new DidaProjectApi(http);
        this.focus = new DidaFocusApi(http);
        this.habits = new DidaHabitApi(http);
    }

    getTask(projectId: string, taskId: string): Promise<Task> {
        return this.tasks.getTask(projectId, taskId);
    }

    createTask(taskData: Omit<Task, "id" | "status" | "completedTime" | "etag"> & { projectId: string }): Promise<Task> {
        return this.tasks.createTask(taskData);
    }

    updateTask(taskId: string, taskData: Partial<Task> & { id: string; projectId: string }): Promise<Task> {
        return this.tasks.updateTask(taskId, taskData);
    }

    completeTask(projectId: string, taskId: string): Promise<void> {
        return this.tasks.completeTask(projectId, taskId);
    }

    deleteTask(projectId: string, taskId: string): Promise<void> {
        return this.tasks.deleteTask(projectId, taskId);
    }

    moveTasks(operations: TaskMoveOperation[]): Promise<TaskMoveResult[]> {
        return this.tasks.moveTasks(operations);
    }

    moveTask(operation: TaskMoveOperation): Promise<TaskMoveResult[]> {
        return this.tasks.moveTask(operation);
    }

    listCompletedTasks(query: TaskCompletedQuery = {}): Promise<Task[]> {
        return this.tasks.listCompletedTasks(query);
    }

    filterTasks(query: TaskFilterQuery = {}): Promise<Task[]> {
        return this.tasks.filterTasks(query);
    }

    getUserProjects(): Promise<Project[]> {
        return this.projects.getUserProjects();
    }

    getProjectById(projectId: string): Promise<Project> {
        return this.projects.getProjectById(projectId);
    }

    getProjectWithData(projectId: string): Promise<ProjectData> {
        return this.projects.getProjectWithData(projectId);
    }

    createProject(projectData: Pick<Project, "name"> & Partial<Omit<Project, "id" | "permission" | "closed" | "groupId">>): Promise<Project> {
        return this.projects.createProject(projectData);
    }

    updateProject(projectId: string, projectData: Partial<Omit<Project, "id" | "permission" | "closed" | "groupId">>): Promise<Project> {
        return this.projects.updateProject(projectId, projectData);
    }

    deleteProject(projectId: string): Promise<void> {
        return this.projects.deleteProject(projectId);
    }
}
