import type { Task } from "../dida_interface";

export type TaskSyncDirection = "siyuan-to-dida" | "dida-to-siyuan";

export interface PendingSiyuanConfirmTarget {
    blockId: string;
    itemID: string;
    dueAt: number;
    attempts: number;
}

export interface PendingSiyuanTarget {
    blockId: string;
    itemID: string;
    isDetached: boolean;
    attempts: number;
}

export class TaskSyncStore {
    readonly tasks = new Map<string, Task>();
    /** 块 ID -> 滴答任务 ID；以块自定义属性为主，AV didaID 列仅作旧数据回退。 */
    readonly didaTaskIdsByBlock = new Map<string, string>();
    readonly creatingDidaIds = new Set<string>();
    readonly pendingSiyuanCreates = new Map<string, number>();
    readonly lastModifiedTime = new Map<string, number>();
    readonly taskSyncLocks = new Map<string, boolean>();
    readonly lastSyncDirection = new Map<string, TaskSyncDirection>();
    readonly pendingDidaUpdates = new Map<string, number>();
    readonly pendingSiyuanConfirmTargets = new Map<string, PendingSiyuanConfirmTarget>();
    readonly pendingSiyuanTargets = new Map<string, PendingSiyuanTarget>();

    clear(): void {
        this.tasks.clear();
        this.didaTaskIdsByBlock.clear();
        this.creatingDidaIds.clear();
        this.pendingSiyuanCreates.clear();
        this.lastModifiedTime.clear();
        this.taskSyncLocks.clear();
        this.lastSyncDirection.clear();
        this.pendingDidaUpdates.clear();
        this.pendingSiyuanConfirmTargets.clear();
        this.pendingSiyuanTargets.clear();
    }
}
