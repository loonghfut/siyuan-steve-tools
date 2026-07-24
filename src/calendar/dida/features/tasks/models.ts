export interface ChecklistItem {
    id?: string;
    title: string;
    status?: 0 | 1;
    completedTime?: string;
    isAllDay?: boolean;
    sortOrder?: number;
    startDate?: string;
    timeZone?: string;
}

export interface Task {
    id?: string;
    projectId: string;
    title: string;
    kind?: "TEXT" | "NOTE" | "CHECKLIST";
    isAllDay?: boolean;
    completedTime?: string;
    content?: string;
    desc?: string;
    dueDate?: string;
    items?: ChecklistItem[];
    priority?: 0 | 1 | 3 | 5;
    reminders?: string[];
    repeatFlag?: string;
    sortOrder?: number;
    startDate?: string;
    status?: 0 | 2;
    timeZone?: string;
    tags?: string[];
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
