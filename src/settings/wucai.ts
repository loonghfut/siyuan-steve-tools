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

    // ===== 渲染模板（留空=使用内置默认格式） =====
    // 标题模板：只填写标题文本部分（无需写 "##"），支持占位符
    "wucai-title-template": "",
    // meta 模板：用于 meta 子块内容（域名/时间/标签/笔记/五彩链接等）
    "wucai-meta-template": "",
    // 高亮模板：用于每条高亮子块内容
    "wucai-highlight-template": "",
    // 查询过滤：将作为五彩服务端 syquery 传入（留空则使用服务端默认）
    "wucai-query": "",
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
                                const titleTemplate = ctx.settings["wucai-title-template"] || "";
                                const metaTemplate = ctx.settings["wucai-meta-template"] || "";
                                const highlightTemplate = ctx.settings["wucai-highlight-template"] || "";
                                const localQuery = ctx.settings["wucai-query"] || "";

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
                                            titleTemplate,
                                            metaTemplate,
                                            highlightTemplate,
                                            localQuery,
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

                    {
                        type: "textarea",
                        title: "标题模板",
                        description:
                            "可选：自定义写入标题（h2）的文本内容（无需写 ## 前缀）。\n" +
                            "支持占位符：{{title}} {{url}} {{domain}} {{domain2}} {{tags}} {{alltags}} {{createat}} {{updateat}} {{wucaiurl}}\n" +
                            "留空使用默认：标题 + (可选)原文链接。",
                        key: "wucai-title-template",
                        value: ctx.settings["wucai-title-template"] || "",
                        direction: "row",
                    },
                    {
                        type: "textarea",
                        title: "Meta 模板",
                        description:
                            "可选：自定义 meta 子块内容（展示域名/时间/标签/页面笔记等）。\n" +
                            "支持占位符：{{domain}} {{createat}} {{updateat}} {{tags}} {{alltags}} {{pagenote}} {{wucaiurl}} {{url}}\n" +
                            "留空使用默认内置 meta（含 \"### 高亮\" 分隔）。",
                        key: "wucai-meta-template",
                        value: ctx.settings["wucai-meta-template"] || "",
                        direction: "row",
                    },
                    {
                        type: "textarea",
                        title: "高亮模板",
                        description:
                            "可选：自定义单条高亮子块内容。\n" +
                            "支持占位符：{{note}} {{annotation}} {{color}} {{refurl}} {{imageurl}} {{type}} 以及页面级占位符如 {{title}} {{url}}\n" +
                            "留空使用默认格式（文字/图片 + 批注/颜色/定位链接）。",
                        key: "wucai-highlight-template",
                        value: ctx.settings["wucai-highlight-template"] || "",
                        direction: "row",
                    },
                    {
                        type: "textinput",
                        title: "查询过滤（syquery）",
                        description: "可选：作为五彩服务端查询条件传入（留空=使用服务端默认）。",
                        key: "wucai-query",
                        value: ctx.settings["wucai-query"] || "",
                    },
                ]
            }
        ]
    };
};
