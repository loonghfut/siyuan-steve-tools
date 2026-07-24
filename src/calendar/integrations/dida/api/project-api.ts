import type { Project, ProjectData } from "../dida_interface";
import { DidaHttpClient } from "./http-client";

type ProjectWrite = Pick<Project, "name"> & Partial<Omit<Project, "id" | "permission" | "closed" | "groupId">>;
type ProjectUpdate = Partial<Omit<Project, "id" | "permission" | "closed" | "groupId">>;

export class DidaProjectApi {
    constructor(private readonly http: DidaHttpClient) {}

    getUserProjects(): Promise<Project[]> {
        return this.http.request("/project");
    }

    getProjectById(projectId: string): Promise<Project> {
        return this.http.request(`/project/${projectId}`);
    }

    getProjectWithData(projectId: string): Promise<ProjectData> {
        return this.http.request(`/project/${projectId}/data`);
    }

    createProject(projectData: ProjectWrite): Promise<Project> {
        return this.http.request("/project", { method: "POST", body: JSON.stringify(projectData) });
    }

    updateProject(projectId: string, projectData: ProjectUpdate): Promise<Project> {
        return this.http.request(`/project/${projectId}`, { method: "POST", body: JSON.stringify(projectData) });
    }

    async deleteProject(projectId: string): Promise<void> {
        await this.http.request(`/project/${projectId}`, { method: "DELETE" });
    }
}
