import type { Task } from "../dida_interface";

const STATUS_TAGS = ["完成", "进行中", "未完成", "归档"];

export function removeDidaLinks(title: string): string {
    return title
        .replace(/\s*\[D\]\(https:\/\/dida365\.com\/webapp\/#p\/[^/]+\/tasks\/[^)]+\)/g, "")
        .replace(/\s*\[S\]\(siyuan:\/\/blocks\/[^)]+\)/g, "")
        .trim();
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
