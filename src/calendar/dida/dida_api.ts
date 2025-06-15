import { Task, Project, ProjectData } from "./dida_interface";

export class Dida365ApiClient {
    private baseUrl = "https://api.dida365.com/open/v1";
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { message: response.statusText };
            }
            throw new Error(`API request failed with status ${response.status}: ${errorData.message || response.statusText}`);
        }

        if (response.status === 204 || response.headers.get("content-length") === "0") { // No Content
            return null as T;
        }
        return response.json() as Promise<T>;
    }

    // Task API
    async getTask(projectId: string, taskId: string): Promise<Task> {
        return this.request<Task>(`/project/${projectId}/task/${taskId}`);
    }

    async createTask(taskData: Omit<Task, 'id' | 'status' | 'completedTime'> & { projectId: string }): Promise<Task> {
        return this.request<Task>('/task', {
            method: 'POST',
            body: JSON.stringify(taskData),
        });
    }

    async updateTask(taskId: string, taskData: Partial<Task> & { id: string, projectId: string }): Promise<Task> {
        return this.request<Task>(`/task/${taskId}`, {
            method: 'POST',
            body: JSON.stringify(taskData),
        });
    }

    async completeTask(projectId: string, taskId: string): Promise<void> {
        await this.request<null>(`/project/${projectId}/task/${taskId}/complete`, {
            method: 'POST',
        });
    }

    async deleteTask(projectId: string, taskId: string): Promise<void> {
        await this.request<null>(`/project/${projectId}/task/${taskId}`, {
            method: 'DELETE',
        });
    }

    // Project API
    async getUserProjects(): Promise<Project[]> {
        return this.request<Project[]>('/project');
    }

    async getProjectById(projectId: string): Promise<Project> {
        // The API doc has a typo in the path parameter name, it says "project" but should be "projectId"
        return this.request<Project>(`/project/${projectId}`);
    }

    async getProjectWithData(projectId: string): Promise<ProjectData> {
        return this.request<ProjectData>(`/project/${projectId}/data`);
    }

    async createProject(projectData: Pick<Project, 'name'> & Partial<Omit<Project, 'id' | 'permission' | 'closed' | 'groupId'>>): Promise<Project> {
        return this.request<Project>('/project', {
            method: 'POST',
            body: JSON.stringify(projectData),
        });
    }

    async updateProject(projectId: string, projectData: Partial<Omit<Project, 'id' | 'permission' | 'closed' | 'groupId'>>): Promise<Project> {
        return this.request<Project>(`/project/${projectId}`, {
            method: 'POST',
            body: JSON.stringify(projectData),
        });
    }

    async deleteProject(projectId: string): Promise<void> {
        await this.request<null>(`/project/${projectId}`, {
            method: 'DELETE',
        });
    }
}

