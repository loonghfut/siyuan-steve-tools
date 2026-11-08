import { formatLocalDate } from "../siyuan_api";
import { getDidaStatusAttr, removeDidaLinks } from "./task-mapper";

function formatDateTime(timestamp?: number): string {
    const formatted = formatLocalDate(timestamp as number);
    return formatted ? formatted.replace("T", " ") : "";
}

function formatDate(timestamp?: number): string {
    const formatted = formatLocalDate(timestamp as number);
    return formatted ? formatted.split("T")[0] : "";
}

function formatShortTime(timestamp?: number): string {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

export function renderDidaTemplate(template: string, data: Record<string, any>): string {
    const source = (template || "").trim();
    if (!source) return "";
    const rendered = source.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
        const value = data[key];
        if (Array.isArray(value)) return value.filter(item => item !== undefined && item !== null).join(", ");
        return value === undefined || value === null ? "" : String(value);
    });
    return rendered.replace(/^\s*[\r\n]/gm, "").replace(/\n\s*\n/g, "\n");
}

export function getDefaultDidaImportTemplate(): string {
    return `#### {{didaTitle}}

{: id="{{titleBlockId}}"}
{{description}}

{: id="{{descriptionBlockId}}"}`;
}

export function buildDidaImportTemplateData(
    taskData: any,
    blockId: string,
    itemID: string,
    titleBlockId: string,
    descriptionBlockId: string,
): Record<string, any> {
    const didaTitle = taskData.事件?.content || "新建任务";
    const content = taskData.描述?.content || "";
    const start = taskData.开始时间?.start;
    const end = taskData.开始时间?.end;
    const didaLink = taskData.链接?.content || "";
    const projectId = didaLink.match(/#p\/([^/]+)\/tasks\/[^)]+/)?.[1] || "";
    const tags = (taskData.标签?.content || [])
        .map((tag: any) => typeof tag === "string" ? tag : tag?.content)
        .filter(Boolean);
    const status = taskData.状态?.content || "未完成";

    return {
        title: removeDidaLinks(didaTitle),
        didaTitle,
        description: content || "描述：暂无",
        content,
        status,
        statusAttr: getDidaStatusAttr(status),
        priority: taskData.优先级?.content || "无",
        startDateTime: formatDateTime(start),
        endDateTime: formatDateTime(end),
        startDateTimeISO: formatLocalDate(start) || "",
        endDateTimeISO: formatLocalDate(end) || "",
        startDate: formatDate(start),
        endDate: formatDate(end),
        shortStartTime: formatShortTime(start),
        shortEndTime: formatShortTime(end),
        tags: tags.join(", "),
        tagList: tags.map((tag: string) => `#${tag}`).join(" "),
        didaID: taskData.didaID?.content || "",
        didaLink,
        projectId,
        blockId,
        itemID,
        titleBlockId,
        descriptionBlockId,
    };
}
