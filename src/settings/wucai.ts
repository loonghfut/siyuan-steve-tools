import type { SettingGroupDefinition, BuildContext } from "./types";
import { showMessage } from "siyuan";
import { WucaiSyncService } from "@/wucai/wucai-sync-service";
import { genClientID, WUCAI_BASE_URL, WUCAI_SERVICE_ID } from "@/api/wucai-api";

// Wucai 设置默认值
export const wucaiDefaults: Record<string, any> = {
    "wucai-enable": false,
    // 五彩Token
    "wucai-token": "",
    // 客户端ID（自动生成）
    "wucai-client-id": "",
    // 同步目标日记本ID
    "wucai-notebook": "",
    // 上次同步游标
    "wucai-last-cursor": "",
    // 上次同步时间
    "wucai-last-sync-time": "",
    // 上次同步是否失败
    "wucai-last-sync-failed": false,
};

// 获取笔记本选项
function notebookOptions() {
    const nb = (window as any).siyuan?.notebooks;
    if (!Array.isArray(nb) || nb.length === 0) return { "": "无可用日记本" };
    return Object.fromEntries(nb.map((n: any) => [n.id, n.name]));
}

// 获取或生成客户端ID
function getOrCreateClientId(ctx: BuildContext): string {
    let clientId = ctx.settings["wucai-client-id"];
    if (!clientId) {
        clientId = genClientID();
        // 自动保存到设置中
        ctx.settings["wucai-client-id"] = clientId;
    }
    return clientId;
}

// 获取Token生成链接
function getTokenLink(clientId: string): string {
    return `${WUCAI_BASE_URL}/page/gentoken/${WUCAI_SERVICE_ID}/${clientId}`;
}

export const wucaiGroup = (ctx: BuildContext): SettingGroupDefinition => {
    // 确保有客户端ID
    const clientId = getOrCreateClientId(ctx);

    return {
        name: "五彩同步",
        subGroups: [
            {
                name: "基础配置",
                items: [
                    { 
                        type: "checkbox", 
                        title: "启用五彩同步", 
                        description: "启用后可将五彩高亮数据同步到思源日记", 
                        key: "wucai-enable", 
                        value: ctx.settings["wucai-enable"] 
                    },
                    { 
                        type: "textinput", 
                        title: "五彩Token", 
                        description: "从五彩获取的同步Token", 
                        key: "wucai-token", 
                        value: ctx.settings["wucai-token"] 
                    },
                    {
                        type: "button",
                        title: "获取Token",
                        description: "点击打开五彩Token生成页面，登录后复制Token",
                        key: "wucai-get-token",
                        value: "",
                        button: {
                            label: "打开Token页面",
                            callback: () => {
                                const tokenUrl = getTokenLink(clientId);
                                window.open(tokenUrl, '_blank');
                                showMessage("请在打开的页面登录五彩账号，然后复制Token");
                            }
                        }
                    },
                    { 
                        type: "select", 
                        title: "同步目标日记本", 
                        description: "五彩数据将追加到该日记本的日记中", 
                        key: "wucai-notebook", 
                        value: ctx.settings["wucai-notebook"], 
                        options: notebookOptions() 
                    },
                ]
            },
            {
                name: "同步操作",
                items: [
                    {
                        type: "button",
                        title: "立即同步",
                        description: ctx.settings["wucai-last-sync-time"] 
                            ? `上次同步: ${ctx.settings["wucai-last-sync-time"]}` 
                            : "点击开始同步五彩数据",
                        key: "wucai-sync-now",
                        value: "",
                        button: {
                            label: ctx.settings["wucai-last-sync-failed"] ? "🔄 重新同步" : "🚀 开始同步",
                            callback: async () => {
                                const token = ctx.settings["wucai-token"];
                                const notebookId = ctx.settings["wucai-notebook"];
                                const lastCursor = ctx.settings["wucai-last-cursor"] || "";

                                if (!token) {
                                    showMessage("请先配置五彩Token", 3000, "error");
                                    return;
                                }

                                if (!notebookId) {
                                    showMessage("请先选择同步目标日记本", 3000, "error");
                                    return;
                                }

                                showMessage("正在同步五彩数据...", 3000);

                                try {
                                    const service = new WucaiSyncService(
                                        {
                                            token,
                                            clientId,
                                            notename: '',
                                            notebook: notebookId,
                                            lastCursor2: lastCursor,
                                            exportConfig: {
                                                sytitlet: '',
                                                sytpl: '',
                                                sywrites: 0,
                                                syquery: '',
                                            },
                                            lastSyncFailed: false,
                                        },
                                        notebookId
                                    );

                                    const result = await service.startSync();

                                    if (result.success) {
                                        // 更新设置
                                        ctx.settings["wucai-last-cursor"] = result.lastCursor || lastCursor;
                                        ctx.settings["wucai-last-sync-time"] = new Date().toLocaleString();
                                        ctx.settings["wucai-last-sync-failed"] = false;
                                        
                                        showMessage(result.message, 5000, "info");
                                    } else {
                                        ctx.settings["wucai-last-sync-failed"] = true;
                                        showMessage(result.message, 5000, "error");
                                    }
                                } catch (error) {
                                    ctx.settings["wucai-last-sync-failed"] = true;
                                    const errorMsg = error instanceof Error ? error.message : "同步失败";
                                    showMessage(errorMsg, 5000, "error");
                                }
                            }
                        }
                    },
                    {
                        type: "button",
                        title: "重置同步状态",
                        description: "清除同步游标，下次将全量同步（慎用）",
                        key: "wucai-reset-sync",
                        value: "",
                        button: {
                            label: "⚠️ 重置",
                            callback: () => {
                                ctx.settings["wucai-last-cursor"] = "";
                                ctx.settings["wucai-last-sync-time"] = "";
                                ctx.settings["wucai-last-sync-failed"] = false;
                                showMessage("同步状态已重置，下次将全量同步", 3000);
                            }
                        }
                    },
                ]
            },
            {
                name: "高级配置",
                items: [
                    { 
                        type: "textinput", 
                        title: "客户端ID", 
                        description: "自动生成的唯一标识，一般无需修改", 
                        key: "wucai-client-id", 
                        value: clientId 
                    },
                    { 
                        type: "textinput", 
                        title: "同步游标", 
                        description: "断点续传用的游标，一般无需修改", 
                        key: "wucai-last-cursor", 
                        value: ctx.settings["wucai-last-cursor"] || "" 
                    },
                ]
            }
        ]
    };
};
