import type { SettingGroupDefinition, BuildContext } from "./types";
import { showMessage } from "siyuan";
import { MemosSyncService, type MemosSyncResult } from "@/memos/memos-sync-service";

// Memos 设置默认值
export const memosDefaults: Record<string, any> = {
    "memos-enable": false,
    "memos-base-url": "",
    "memos-token": "",
    "memos-notebook": "",
    "memos-page-size": 200,
    "memos-include-archived": true,
    "memos-incremental-sync": true,
    "memos-sync-attachments": true,
    "memos-assets-dir": "/assets/",
    "memos-anchor-template": "- {{title}}",
    "memos-custom-template": "",
    "memos-last-sync-time": "",
    "memos-last-sync-at": "",
    "memos-last-sync-cursor": "",
    "memos-last-success-sync-time": "",
    "memos-last-sync-failed": false,
    "memos-sync-history": [],
};

function formatDateTimeLabel(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function applyMemosSyncResult(settings: Record<string, any>, result: MemosSyncResult) {
    const finishedAt = result.syncFinishedAt || new Date().toISOString();
    const startedAt = result.syncStartedAt || finishedAt;

    settings["memos-last-sync-time"] = formatDateTimeLabel(finishedAt);
    settings["memos-last-sync-at"] = finishedAt;
    settings["memos-last-sync-failed"] = !result.success;

    if (result.success) {
        const cursor = result.nextSyncCursor || startedAt;
        settings["memos-last-sync-cursor"] = cursor;
        settings["memos-last-success-sync-time"] = formatDateTimeLabel(cursor);
    }

    const history = Array.isArray(settings["memos-sync-history"]) ? settings["memos-sync-history"] : [];
    history.unshift({
        startedAt,
        finishedAt,
        success: result.success,
        incremental: !!result.incremental,
        totalFetchedCount: result.totalFetchedCount || 0,
        processedCount: result.processedCount || 0,
        syncedCount: result.syncedCount || 0,
        skippedCount: result.skippedCount || 0,
        message: result.message,
    });
    settings["memos-sync-history"] = history.slice(0, 20);
}

function notebookOptions() {
    const notebooks = (window as any).siyuan?.notebooks;
    if (!Array.isArray(notebooks) || notebooks.length === 0) {
        return { "": "无可用笔记本" };
    }
    return Object.fromEntries(notebooks.map((item: any) => [item.id, item.name]));
}

export const memosGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "Memos",
    subGroups: [
        {
            name: "基础配置",
            items: [
                { type: "checkbox", title: "启用 Memos", description: "启用后显示顶栏同步按钮", key: "memos-enable", value: ctx.settings["memos-enable"] },
                { type: "textinput", title: "Memos 地址", description: "例如 https://memos.example.com", key: "memos-base-url", value: ctx.settings["memos-base-url"] || "" },
                { type: "textinput", title: "Memos Token", description: "Bearer Token，可在 Memos 账户设置中创建", key: "memos-token", value: ctx.settings["memos-token"] || "" },
                { type: "select", title: "同步目标笔记本", description: "Memos 数据会按日期写入该笔记本的日记中", key: "memos-notebook", value: ctx.settings["memos-notebook"] || "", options: notebookOptions() },
            ]
        },
        {
            name: "同步选项",
            items: [
                { type: "checkbox", title: "同步归档 Memo", description: "开启后会额外拉取 ARCHIVED 状态的 Memo", key: "memos-include-archived", value: ctx.settings["memos-include-archived"] },
                { type: "checkbox", title: "启用增量同步", description: "开启后会记录上次成功同步游标，并仅处理此后有变更的 Memo；首次同步或清空游标时会执行全量同步", key: "memos-incremental-sync", value: ctx.settings["memos-incremental-sync"] },
                { type: "checkbox", title: "同步附件到思源资源库", description: "开启后会上传附件到思源 assets，并在文档中插入本地资源链接", key: "memos-sync-attachments", value: ctx.settings["memos-sync-attachments"] },
                { type: "textinput", title: "资源目录", description: "对应思源 /api/asset/upload 的 assetsDirPath，建议保持 /assets/", key: "memos-assets-dir", value: ctx.settings["memos-assets-dir"] || "/assets/" },
                { type: "slider", title: "分页大小", description: "每次从 Memos 拉取的数据量，Memos 官方上限为 1000", key: "memos-page-size", value: ctx.settings["memos-page-size"] || 200, slider: { min: 50, max: 1000, step: 50 } },
                {
                    type: "textarea",
                    title: "锚点块内容模板",
                    description: "控制每条 Memo 的锚点块 Markdown。默认是 `- {{title}}`。支持与正文模板相同的占位符，也支持动态时间格式变量，例如：{{createHHmm}}、{{createMM:mm}}、{{createYYYY-MM-DD HH:mm}}、{{updateYYYYMMDD}}、{{displayYYYYMMDDHHmmss}}、{{dateYYYY/MM}}。可用时间标记：YYYY YY MM DD HH mm ss。",
                    key: "memos-anchor-template",
                    value: ctx.settings["memos-anchor-template"] || "- {{title}}",
                    direction: "row"
                },
                {
                    type: "textarea",
                    title: "自定义导入模板",
                    description: "留空则不创建正文块，不再使用内置默认模板。支持占位符：\n{{title}} 标题\n{{content}} 原始内容\n{{memoId}} Memos ID\n{{createTime}} / {{updateTime}} / {{displayTime}} 原始时间\n{{createTimeLocal}} / {{updateTimeLocal}} / {{displayTimeLocal}} 本地时间\n{{createHHmm}} / {{updateHHmm}} / {{displayHHmm}} 时分格式\n{{createMM:mm}} / {{updateYYYY-MM-DD HH:mm}} 这种自定义时间格式\n{{createTimeCompact}} / {{updateTimeCompact}} / {{displayTimeCompact}} 紧凑时间(YYYYMMDDHHmmss)\n{{createYYYYMM}} / {{updateYYYYMMDD}} / {{displayYYYYMMDDHHmmss}} 紧凑格式时间\n{{dateYYYYMM}} / {{dateYYYY/MM}} / {{dateYYYY-MM-DD}} Memo 日期\n{{visibility}} 可见性\n{{state}} 状态\n{{pinnedText}} 置顶文本\n{{tags}} 标签原文\n{{tagList}} #标签形式\n{{attachmentCount}} 附件数量\n{{attachments}} 附件文件名列表\n{{attachmentNames}} 附件名列表\n{{snippet}} 摘要\n时间格式可用标记：YYYY YY MM DD HH mm ss。启用模板后将不再额外插入单独的元信息块。",
                    key: "memos-custom-template",
                    value: ctx.settings["memos-custom-template"] || "",
                    direction: "row"
                },
            ]
        },
        {
            name: "手动同步",
            items: [
                {
                    type: "button",
                    title: "立即同步",
                    description: ctx.settings["memos-last-sync-time"]
                        ? `上次尝试：${ctx.settings["memos-last-sync-time"]}${ctx.settings["memos-last-success-sync-time"] ? ` | 上次成功：${ctx.settings["memos-last-success-sync-time"]}` : ''}${ctx.settings["memos-incremental-sync"] !== false && ctx.settings["memos-last-sync-cursor"] ? ` | 增量游标：${formatDateTimeLabel(ctx.settings["memos-last-sync-cursor"] as string)}` : ''}`
                        : "点击开始将 Memos 数据同步到思源",
                    key: "memos-sync-now",
                    value: "",
                    button: {
                        label: ctx.settings["memos-last-sync-failed"] ? "🔄 重新同步" : "🚀 开始同步",
                        callback: async () => {
                            const baseUrl = String(ctx.settings["memos-base-url"] || '').trim();
                            const token = String(ctx.settings["memos-token"] || '').trim();
                            const notebookId = String(ctx.settings["memos-notebook"] || '').trim();

                            if (!baseUrl) {
                                showMessage("请先填写 Memos 地址", 3000, "error");
                                return;
                            }
                            if (!token) {
                                showMessage("请先填写 Memos Token", 3000, "error");
                                return;
                            }
                            if (!notebookId) {
                                showMessage("请先选择同步目标笔记本", 3000, "error");
                                return;
                            }

                            showMessage("正在同步 Memos 数据...", 3000, "info");
                            const service = new MemosSyncService({
                                baseUrl,
                                token,
                                notebookId,
                                includeArchived: !!ctx.settings["memos-include-archived"],
                                incrementalSync: ctx.settings["memos-incremental-sync"] !== false,
                                lastSyncCursor: String(ctx.settings["memos-last-sync-cursor"] || ''),
                                syncAttachments: ctx.settings["memos-sync-attachments"] !== false,
                                assetsDir: String(ctx.settings["memos-assets-dir"] || '/assets/'),
                                pageSize: Number(ctx.settings["memos-page-size"] || 200),
                                anchorTemplate: String(ctx.settings["memos-anchor-template"] || '- {{title}}'),
                                customTemplate: String(ctx.settings["memos-custom-template"] || ''),
                            });

                            const result = await service.startSync();
                            applyMemosSyncResult(ctx.settings, result);
                            await ctx.plugin.saveData("steveTools.json", ctx.settings);
                            showMessage(result.message, 5000, result.success ? "info" : "error");
                        }
                    }
                },
                {
                    type: "button",
                    title: "清空增量游标",
                    description: ctx.settings["memos-last-sync-cursor"]
                        ? `当前游标：${formatDateTimeLabel(String(ctx.settings["memos-last-sync-cursor"]))}`
                        : "当前没有增量游标；下次同步会按全量处理",
                    key: "memos-clear-sync-cursor",
                    value: "",
                    button: {
                        label: "🧹 清空游标",
                        callback: async () => {
                            ctx.settings["memos-last-sync-cursor"] = "";
                            await ctx.plugin.saveData("steveTools.json", ctx.settings);
                            showMessage("已清空 Memos 增量同步游标，下次将执行全量同步", 4000, "info");
                        }
                    }
                }
            ]
        }
    ]
});
