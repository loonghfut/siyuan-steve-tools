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

/** 待补写的去重键：didaID 列写入失败时暂存，下一轮同步重试落盘。 */
export interface PendingDidaIdWrite {
    blockId: string;
    itemID: string;
    /** 远端任务 ID；creating 为 true 时为空，表示"正在创建、结果未知"。 */
    didaTaskId: string;
    /** 已尝试落盘次数，超过上限后不再重试，避免每轮同步空转。 */
    attempts: number;
    /** 去重键是否已成功落盘过：用于区分"用户手动清空列"与"尚未落盘"，避免还原用户的解绑操作。 */
    landed: boolean;
    /**
     * 是否是"创建意图"记录：远端任务创建前登记、拿到 ID 后补全。
     * 创建响应丢失或进程崩溃时，凭这条记录到远端核对是否已建，避免重复创建远端任务。
     */
    creating?: boolean;
    /**
     * 块已经建出来，但"加入数据库"这一步失败：块存在而数据库里还没有对应行，
     * 去重键无处可写，下一轮同步会为同一个滴答任务再建一个块。
     * 置位后由补偿流程补登记这一行；用户主动删除的行不会被重建（该标记只在
     * 插件自己登记失败时置位）。
     */
    rowUnregistered?: boolean;
}

export class TaskSyncStore {
    readonly tasks = new Map<string, Task>();
    /** 待补写的 didaID 列写入；用于避免去重键丢失期间重复创建任务。 */
    readonly pendingDidaIdWrites = new Map<string, PendingDidaIdWrite>();
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
        this.pendingDidaIdWrites.clear();
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
