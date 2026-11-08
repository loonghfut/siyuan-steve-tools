export type DidaFocusType = 0 | 1;

export interface DidaFocusTaskBrief {
    taskId?: string;
    title?: string;
    habitId?: string;
    timerId?: string;
    timerName?: string;
    startTime?: string;
    endTime?: string;
}

export interface DidaFocusRecord {
    id: string;
    userId?: number;
    type: DidaFocusType;
    taskId?: string;
    note?: string;
    tasks?: DidaFocusTaskBrief[];
    status?: number;
    startTime?: string;
    endTime?: string;
    pauseDuration?: number;
    adjustTime?: number;
    added?: boolean;
    createdTime?: string;
    modifiedTime?: string;
    etimestamp?: number;
    etag?: string;
    duration?: number;
    relationType?: number[];
}

export interface DidaFocusCreateInput {
    type: DidaFocusType;
    taskId?: string;
    note?: string;
    startTime?: string;
    endTime?: string;
    pauseDuration?: number;
    duration?: number;
    relationType?: number[];
}
