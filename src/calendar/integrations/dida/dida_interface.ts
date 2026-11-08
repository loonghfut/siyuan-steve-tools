import type { Project } from "./api/project-models";

export type { Column, Project, ProjectData } from "./api/project-models";
export type {
    ChecklistItem,
    Task,
    TaskCompletedQuery,
    TaskFilterQuery,
    TaskMoveOperation,
    TaskMoveResult,
} from "./features/tasks/models";

export function convertProjectsToRecord(projects: Project[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const project of projects) {
        if (project.id) result[project.id] = project.name;
    }
    return result;
}
