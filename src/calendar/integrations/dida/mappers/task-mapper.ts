import type { Task } from "../dida_interface";

const STATUS_TAGS = ["完成", "进行中", "未完成", "归档"];
const PRIORITY_MAP: Record<string, 0 | 1 | 3 | 5> = { "无": 0, "低": 1, "中": 3, "高": 5 };

export function removeDidaLinks(title: string): string {
    return title
        .replace(/\s*\[D\]\(https:\/\/dida365\.com\/webapp\/#p\/[^/]+\/tasks\/[^)]+\)/g, "")
        .replace(/\s*\[S\]\(siyuan:\/\/blocks\/[^)]+\)/g, "")
        .trim();
}

/** 从滴答任务标题中提取回链的思源块 ID（`[S](siyuan://blocks/<id>)`）。 */
export function extractSiyuanBlockIdFromDidaTitle(title?: string): string {
    if (!title) return "";
    const match = title.match(/\[S\]\(siyuan:\/\/blocks\/([^)\s]+)\)/);
    return match?.[1] || "";
}

/** 构造思源块回链标记（`[S](siyuan://blocks/<id>)`）。 */
export function buildSiyuanBacklinkMarker(blockId: string): string {
    if (!blockId) return "";
    return `[S](siyuan://blocks/${blockId})`;
}

/**
 * 在任务列表中查找标题里带指定思源块回链的任务。
 *
 * 这类 [S] 回链是插件创建任务时写下的，可以证明"这一行曾经绑定过该任务"，
 * 用于去重键写丢后（回写失败、进程崩溃、创建响应丢失）恢复绑定，而不是新建重复任务。
 * 数据库 didaID 列仍是去重的唯一依据，这里只作为丢失去重键时的修复线索。
 */
export function findTaskBySiyuanBacklink(tasks: Iterable<Task>, blockId: string): Task | undefined {
    const marker = buildSiyuanBacklinkMarker(blockId);
    if (!marker) return undefined;
    for (const task of tasks) {
        if (task?.id && typeof task.title === "string" && task.title.includes(marker)) {
            return task;
        }
    }
    return undefined;
}

/** 思源行与滴答任务的绑定动作。 */
export type DidaBindingAction = "update" | "repair" | "create";

export interface DidaBindingDecision {
    action: DidaBindingAction;
    didaTaskId: string;
}

/**
 * 决定思源行与滴答任务的绑定动作。
 *
 * 去重依据只有数据库 didaID 列，不存在内存影子映射：
 * - 列中有值：更新该滴答任务；
 * - 列为空但存在待补写记录（上次回写落盘失败）：先补写去重键，再更新该任务，
 *   避免去重键丢失期间重复创建滴答任务；
 * - 其余：新建滴答任务。
 */
export function resolveDidaBinding(row: any, pendingDidaId?: string): DidaBindingDecision {
    const didaTaskId = row?.didaID?.content || "";
    if (didaTaskId) return { action: "update", didaTaskId };
    if (pendingDidaId) return { action: "repair", didaTaskId: pendingDidaId };
    return { action: "create", didaTaskId: "" };
}

/** 待补写去重键记录的处理结果。 */
export type PendingDidaIdWriteAction = "drop" | "block" | "compensate" | "unknown";

/** 待补写记录的最小结构（与 TaskSyncStore.PendingDidaIdWrite 字段对齐）。 */
export interface PendingDidaIdWriteState {
    itemID: string;
    blockId: string;
    didaTaskId: string;
    attempts: number;
    landed: boolean;
    /** 是否是"创建意图"记录（远端任务创建前登记、拿到 ID 后补全）。 */
    creating?: boolean;
    /** 块已建出但未登记进数据库：补偿时需要先补登记行，再写去重键。 */
    rowUnregistered?: boolean;
}

/**
 * 判定一条待补写记录在当前行状态下应如何处理。
 *
 * - "drop"：记录已失效（去重键已落盘 / 行已改绑 / 用户手动清空过列），应删除；
 * - "compensate"：去重键尚未落盘，需要补写；
 * - "block"：重试次数已用尽。补偿流程会提示用户并把计数归零后继续补写；
 *   建块判定处则把它当作"本轮不处理"（先不建块，等下一轮补写成功再说）。
 *   无论哪种用法，记录都必须保留——它就是去重键，丢了下一轮就会重复创建远端任务或重复建块；
 * - "unknown"：行不可见（可能已被过滤或删除），需要调用方进一步确认。
 *
 * currentDidaId 为 null 表示"行不可见"，与"列为空"严格区分。
 */
export function resolvePendingDidaIdWriteAction(
    pending: PendingDidaIdWriteState,
    currentDidaId: string | null,
    maxAttempts: number,
): PendingDidaIdWriteAction {
    // 行不可见：状态未知，交由调用方确认后再决定
    if (currentDidaId === null) return "unknown";
    // 去重键已落盘：记录可以清理
    if (currentDidaId === pending.didaTaskId) return "drop";
    // 行已改绑到别的滴答任务：过期记录清理
    if (currentDidaId) return "drop";
    // 曾经落盘过、之后被用户手动清空：尊重用户的解绑操作，不还原
    if (pending.landed) return "drop";
    // 重试次数用尽：保留记录（防止重复创建），但不再写入
    if (pending.attempts >= maxAttempts) return "block";
    return "compensate";
}

/**
 * 待补写记录在"行不可见"时的处理结果。
 */
export type PendingRowAction = "drop" | "compensate";

/**
 * 判定"行不可见"的待补写记录该怎么处理。
 *
 * - "drop"：绑定已经失效（块没了，或这一行确实被删了），记录可以丢弃；
 * - "compensate"：记录必须保留并继续补写。
 *
 * 关键约束：块还活着时绝不能因为"重试次数用尽"就丢弃记录——记录就是去重键，
 * 丢了下一轮就会为同一个滴答任务再建一个块。
 * 区分"行被用户删了"与"行从没建出来"靠 rowUnregistered：后者是插件自己登记失败，
 * 必须补登记；前者是用户的操作，保留记录反而会让该滴答任务永远同步不进来。
 */
export function resolvePendingRowAction(params: {
    /** 绑定块是否还存在。 */
    blockAlive: boolean;
    /** 上一轮是否"块已建出、行未登记"。 */
    rowUnregistered: boolean;
    /** 块当前绑定到哪一行："" 表示没有绑定（行不存在），null 表示查询失败。 */
    boundItemId: string | null;
}): PendingRowAction {
    if (!params.blockAlive) return "drop";
    if (params.rowUnregistered) return "compensate";
    if (params.boundItemId === "") return "drop";
    return "compensate";
}

/**
 * 待补写记录在"绑定迁移校验"后的处理结果。
 */
export type PendingTargetAction = "write" | "register" | "rekey" | "drop" | "skip";

/**
 * 判定待补写记录的去重键应该写到哪一行。
 *
 * 内核按行 ID 定位单元格，所以去重键必须跟着块走：
 * - 块仍绑在记录里的那一行（write）：直接写进去；
 * - 块已建出但没登记进数据库（register）：先补登记这一行，再写去重键；
 * - 块迁到别的行（rekey）：记录跟着迁过去，否则键会写进已经装着别的块的旧行；
 * - 块已不在数据库（drop）：绑定确实失效，记录可以丢；
 * - 查询失败（skip）：状态未知，本轮不动，宁可漏写也不误丢去重键。
 *
 * "块已建出、行未登记"的记录不能当成绑定失效——它只是登记没成功，要交给补登记流程。
 */
export function resolvePendingTargetAction(params: {
    /** 块当前绑定到哪一行："" 表示没有绑定，null 表示查询失败。 */
    boundItemId: string | null;
    /** 记录里记着的行 ID。 */
    itemID: string;
    /** 是否是"块已建出、行未登记"的记录。 */
    rowUnregistered: boolean;
}): PendingTargetAction {
    // 查询失败：状态未知，本轮不动，保留记录
    if (params.boundItemId === null) return "skip";
    if (params.boundItemId) {
        return params.boundItemId === params.itemID ? "write" : "rekey";
    }
    // 块已经不在数据库里：除非是插件自己登记失败（要补登记），否则绑定确实失效
    return params.rowUnregistered ? "register" : "drop";
}

/**
 * 合并一条新的待补写记录。
 *
 * 重试次数累加；"已落盘"标记只在去重键（didaTaskId）没变时保留——换了任务 ID 必须重置，
 * 否则新任务的去重键会被误当成"用户手动清空"而丢弃，进而重复创建远端任务。
 * "行未登记"标记同理：只有同一条去重键才代表同一个未登记的行。
 * 创建意图（creating）在拿到真实任务 ID 后自动结束。
 */
export function mergePendingDidaIdWrite(
    previous: PendingDidaIdWriteState | undefined,
    next: { blockId: string; itemID: string; didaTaskId: string },
): PendingDidaIdWriteState {
    const sameKey = previous?.didaTaskId === next.didaTaskId;
    return {
        blockId: next.blockId,
        itemID: next.itemID,
        didaTaskId: next.didaTaskId,
        attempts: (previous?.attempts || 0) + 1,
        landed: sameKey ? previous.landed : false,
        creating: Boolean(previous?.creating) && !next.didaTaskId,
        rowUnregistered: sameKey ? Boolean(previous?.rowUnregistered) : false,
    };
}

/**
 * 构造一条"创建意图"记录：远端任务创建前登记、拿到 ID 后补全。
 *
 * 用途：远端任务其实已建成、但响应丢失或进程崩溃时，本地没有任务 ID 可记，
 * 凭这条记录可以在下一轮先到远端核对是否已建，避免重复创建远端任务。
 */
export function buildCreatingIntent(blockId: string, itemID: string): PendingDidaIdWriteState {
    return {
        blockId,
        itemID,
        didaTaskId: "",
        attempts: 0,
        landed: false,
        creating: true,
    };
}

function normalizeDidaIsoTimestamp(dateInput: unknown): string | undefined {
    if (!dateInput) return undefined;
    const date = dateInput instanceof Date
        ? dateInput
        : (typeof dateInput === "string" || typeof dateInput === "number")
            ? new Date(dateInput)
            : null;
    if (!date || Number.isNaN(date.getTime())) {
        return undefined;
    }
    return date.toISOString().replace("Z", "+0000");
}

function areDidaTimestampsEqual(a?: string, b?: string): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const parsedA = Date.parse(a);
    const parsedB = Date.parse(b);
    if (Number.isFinite(parsedA) && Number.isFinite(parsedB)) {
        return parsedA === parsedB;
    }
    return a === b;
}

/** 将思源任务行转换为写回滴答的 updatePayload，保持与现有字段语义一致。 */
export function buildDidaTaskUpdatePayload(
    siyuanTask: any,
    blockId: string,
    cachedTask: Task,
    defaultRemindersInput?: unknown,
): Partial<Task> {
    const updatePayload: Partial<Task> = {};
    const statusText = siyuanTask?.状态?.content;
    updatePayload.status = statusText === "完成" ? 2 : 0;

    if (siyuanTask?.事件?.content) {
        const originalTitle = removeDidaLinks(siyuanTask.事件.content);
        updatePayload.title = `${originalTitle} [S](siyuan://blocks/${blockId})`;
    }

    const description = siyuanTask?.描述?.content;
    if (description) {
        updatePayload.content = description;
    } else if (cachedTask.content) {
        updatePayload.content = "";
    }

    const priorityText = siyuanTask?.优先级?.content;
    if (priorityText && priorityText in PRIORITY_MAP) {
        updatePayload.priority = PRIORITY_MAP[priorityText];
    }

    const newStartISO = siyuanTask?.开始时间?.start
        ? normalizeDidaIsoTimestamp(siyuanTask.开始时间.start)
        : undefined;
    const newDueISO = siyuanTask?.开始时间?.end
        ? normalizeDidaIsoTimestamp(siyuanTask.开始时间.end)
        : undefined;
    const timeChanged = !areDidaTimestampsEqual(newStartISO, cachedTask.startDate)
        || !areDidaTimestampsEqual(newDueISO, cachedTask.dueDate);

    if (siyuanTask?.开始时间) {
        updatePayload.startDate = newStartISO;
        updatePayload.dueDate = newDueISO;
        updatePayload.isAllDay = false;
        updatePayload.timeZone = "Asia/Shanghai";
    } else {
        updatePayload.startDate = undefined;
        updatePayload.dueDate = undefined;
        updatePayload.timeZone = "Asia/Shanghai";
    }

    if (timeChanged && (newStartISO || newDueISO)) {
        const defaults = parseDidaReminders(defaultRemindersInput);
        if (defaults.length > 0) {
            updatePayload.reminders = defaults;
        }
    }

    const rawTags = Array.isArray(siyuanTask?.标签?.content) ? siyuanTask.标签.content : [];
    const tagsFromSiyuan = rawTags
        .map((item: any) => typeof item === "string" ? item : item?.content)
        .filter((tag: unknown): tag is string => typeof tag === "string" && tag.length > 0 && !STATUS_TAGS.includes(tag));
    const statusTags: string[] = [];
    if (statusText === "进行中") {
        statusTags.push("进行中");
    } else if (statusText === "归档") {
        statusTags.push("归档");
    }
    updatePayload.tags = [...tagsFromSiyuan, ...statusTags];

    return updatePayload;
}

/** 比较待写回滴答的变更集与缓存任务，无实质变化时跳过远端更新和冷却刷新。 */
export function hasDidaTaskChanged(updatePayload: Partial<Task>, cachedTask: Task): boolean {
    if ((updatePayload.status ?? 0) !== (cachedTask.status ?? 0)) return true;

    if (updatePayload.title !== undefined) {
        if (removeDidaLinks(updatePayload.title) !== removeDidaLinks(cachedTask.title || "")) {
            return true;
        }
    }

    if ((updatePayload.content ?? "") !== (cachedTask.content ?? "")) return true;

    if (updatePayload.priority !== undefined && updatePayload.priority !== (cachedTask.priority ?? 0)) {
        return true;
    }

    if (!areDidaTimestampsEqual(updatePayload.startDate, cachedTask.startDate)) return true;
    if (!areDidaTimestampsEqual(updatePayload.dueDate, cachedTask.dueDate)) return true;

    const newTags = [...(updatePayload.tags || [])].sort().join("\0");
    const oldTags = [...(cachedTask.tags || [])].sort().join("\0");
    if (newTags !== oldTags) return true;

    return false;
}

export function getDidaStatusAttr(status?: string): "todo" | "inprogress" | "done" | "archive" {
    if (status === "完成") return "done";
    if (status === "进行中") return "inprogress";
    if (status === "归档") return "archive";
    return "todo";
}

function getPriority(priority: number): string {
    if (priority === 1) return "低";
    if (priority === 3) return "中";
    if (priority === 5) return "高";
    return "无";
}

function getStatus(task: Task): string {
    if (task.status === 2) return "完成";
    if (task.tags?.includes("进行中")) return "进行中";
    if (task.tags?.includes("归档")) return "归档";
    return "未完成";
}

export function mapDidaTaskToSiyuan(didaTask: Task, existingTask?: any): any {
    const start = didaTask.startDate ? new Date(didaTask.startDate).getTime() : undefined;
    const end = didaTask.dueDate ? new Date(didaTask.dueDate).getTime() : undefined;
    const taskId = didaTask.id || "";
    const projectId = didaTask.projectId || "";
    const title = `${removeDidaLinks(didaTask.title || "")} [D](https://dida365.com/webapp/#p/${projectId}/tasks/${taskId})`;

    return {
        didaID: { content: taskId, keyID: existingTask?.didaID?.keyID },
        事件: { content: title, keyID: existingTask?.事件?.keyID },
        开始时间: start || end ? {
            start,
            end,
            hasEndDate: !!end,
            keyID: existingTask?.开始时间?.keyID,
        } : undefined,
        优先级: { content: getPriority(didaTask.priority || 0), keyID: existingTask?.优先级?.keyID },
        链接: {
            content: taskId ? `https://dida365.com/webapp/#p/${projectId}/tasks/${taskId}` : "",
            keyID: existingTask?.链接?.keyID,
        },
        状态: { content: getStatus(didaTask), keyID: existingTask?.状态?.keyID },
        标签: {
            content: (didaTask.tags || []).filter(tag => !STATUS_TAGS.includes(tag)).map(content => ({ content })),
            keyID: existingTask?.标签?.keyID,
        },
        描述: { content: didaTask.content || "", keyID: existingTask?.描述?.keyID },
    };
}

export function hasSiyuanTaskChanged(newTask: any, oldTask: any): boolean {
    if (removeDidaLinks(newTask.事件.content) !== removeDidaLinks(oldTask.事件?.content || "")) return true;
    if (newTask.优先级.content !== oldTask.优先级?.content) return true;
    if (newTask.状态.content !== oldTask.状态?.content) return true;

    const newTags = (newTask.标签.content || []).map((tag: any) => tag.content).sort();
    const oldTags = (oldTask.标签?.content || []).map((tag: any) => tag).sort();
    if (newTags.join(",") !== oldTags.join(",")) return true;
    if ((newTask.描述.content || "") !== (oldTask.描述?.content || "")) return true;

    const newStart = newTask.开始时间?.start || null;
    const newEnd = newTask.开始时间?.end || null;
    const oldStart = oldTask.开始时间?.start || null;
    const oldEnd = oldTask.开始时间?.end || null;
    if (newStart !== oldStart || newEnd !== oldEnd) return true;

    return (newTask.链接?.content || "") !== (oldTask.链接?.content || "");
}

export function parseDidaReminders(input: unknown): string[] {
    if (!input) return [];
    const parts = Array.isArray(input)
        ? input as string[]
        : typeof input === "string"
            ? input.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)
            : [];
    const normalized = parts.map(value => value.startsWith("TRIGGER:")
        ? value
        : value.startsWith("-PT") ? `TRIGGER:${value}` : value);
    return [...new Set(normalized.filter(value => value.startsWith("TRIGGER:")))];
}
