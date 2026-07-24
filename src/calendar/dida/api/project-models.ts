export interface Project {
    id?: string;
    name: string;
    color?: string;
    sortOrder?: number;
    closed?: boolean;
    groupId?: string;
    viewMode?: "list" | "kanban" | "timeline";
    permission?: "read" | "write" | "comment";
    kind?: "TASK" | "NOTE";
}

export interface Column {
    id?: string;
    projectId?: string;
    name?: string;
    sortOrder?: number;
}

export interface ProjectData {
    project: Project;
    tasks: import("../features/tasks/models").Task[];
    columns: Column[];
}
