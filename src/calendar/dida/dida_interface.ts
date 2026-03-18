
export interface ChecklistItem {
    id?: string;
    title: string;
    status?: 0 | 1; // Normal: 0, Completed: 1
    completedTime?: string; // "yyyy-MM-dd'T'HH:mm:ssZ"
    isAllDay?: boolean;
    sortOrder?: number;
    startDate?: string; // "yyyy-MM-dd'T'HH:mm:ssZ"
    timeZone?: string;
}
export interface Task {
    id?: string;
    projectId: string;
    title: string;
    kind?: "TEXT" | "NOTE" | "CHECKLIST";
    isAllDay?: boolean;
    completedTime?: string; // "yyyy-MM-dd'T'HH:mm:ssZ"
    content?: string;
    desc?: string;
    dueDate?: string; // "yyyy-MM-dd'T'HH:mm:ssZ"
    items?: ChecklistItem[];
    priority?: 0 | 1 | 3 | 5; // None:0, Low:1, Medium:3, High:5
    reminders?: string[]; // Example : ["TRIGGER:-PT0S","TRIGGER:-PT5M","TRIGGER:-PT30M","TRIGGER:-PT60M","TRIGGER:-PT1440M"]
    repeatFlag?: string; // Example : "RRULE:FREQ=DAILY;INTERVAL=1"
    sortOrder?: number;
    startDate?: string; // "yyyy-MM-dd'T'HH:mm:ssZ"
    status?: 0 | 2; // Normal: 0, Completed: 2
    timeZone?: string;
    tags?: string[]; // Example: ["tag1", "tag2"]
    etag?: string;
}

export interface TaskMoveOperation {
    fromProjectId: string;
    toProjectId: string;
    taskId: string;
}

export interface TaskMoveResult {
    id: string;
    etag?: string;
}

export interface TaskCompletedQuery {
    projectIds?: string[];
    startDate?: string;
    endDate?: string;
}

export interface TaskFilterQuery {
    projectIds?: string[];
    startDate?: string;
    endDate?: string;
    priority?: Array<0 | 1 | 3 | 5>;
    tag?: string[];
    status?: Array<0 | 2>;
}

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
interface Column {
    id?: string;
    projectId?: string;
    name?: string;
    sortOrder?: number;
}
export interface ProjectData {
    project: Project;
    tasks: Task[];
    columns: Column[];
}


//转换数据函数
//将Project[]转换为
export function convertProjectsToRecord(projects: Project[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const project of projects) {
        if (project.id) {
            result[project.id] = project.name;
        }
    }
    console.debug("转换后的项目数据:", result);
    return result;
}