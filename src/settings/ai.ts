import type { SettingGroupDefinition, BuildContext } from "./types";
import { getAiUrlOptionsMap } from "@/ai/ai-utils";

export const aiDefaults: Record<string, any> = {
    "ai-enable": false,
    // 当前选择的 AI 地址类型（URL 或 'custom'）
    "ai-url-type": "https://www.doubao.com/chat/",
    // 自定义 AI 地址（当 ai-url-type 为 'custom' 时使用）
    "ai-url-custom": "",
    // AI 地址列表，每行一条：名称|URL
    "ai-url-list": `豆包AI|https://www.doubao.com/chat/
Kimi|https://kimi.moonshot.cn/
密塔搜索|https://metaso.cn/
DeepSeek|https://chat.deepseek.com/
ChatGPT|https://chatgpt.com/
Claude|https://claude.ai/
文心一言|https://yiyan.baidu.com/
通义千问|https://tongyi.aliyun.com/qianwen/
智谱清言|https://chatglm.cn/
Copilot|https://copilot.microsoft.com/
自定义|custom`
};

export const aiGroup = (ctx: BuildContext): SettingGroupDefinition => {
    const listRaw = ctx.settings["ai-url-list"] || aiDefaults["ai-url-list"];
    const options = getAiUrlOptionsMap(listRaw, true);
    const currentValue = ctx.settings["ai-url-type"] || aiDefaults["ai-url-type"];
    const isCustom = currentValue === "custom";

    const items: any[] = [
        { 
            type: "checkbox", 
            title: "启用 AI 网页侧边栏", 
            description: "在思源笔记右侧显示一个 AI 助手面板，方便随时使用 AI 功能", 
            key: "ai-enable", 
            value: ctx.settings["ai-enable"] 
        },
        { 
            type: "select", 
            title: "AI 服务选择", 
            description: "从下拉列表选择你想使用的 AI 服务，或选择「自定义地址」添加其他 AI 网站", 
            key: "ai-url-type", 
            value: currentValue, 
            options 
        }
    ];

    // 当选择自定义时，显示输入框
    if (isCustom) {
        items.push({
            type: "textinput",
            title: "自定义 AI 地址",
            description: "输入完整的 AI 网站 URL，例如：https://your-ai-service.com/chat",
            key: "ai-url-custom",
            value: ctx.settings["ai-url-custom"] || "",
            placeholder: "https://your-ai-service.com/chat"
        });
    }

    // 添加使用提示
    items.push({
        type: "hint",
        title: "💡 使用提示",
        description: `• 点击右侧边栏的 AI 图标 🤖 即可打开 AI 助手面板
• 使用面板顶部的下拉菜单可以快速切换不同的 AI 服务
• 每次切换都会自动保存，下次打开直接使用上次选择的服务
• 建议提前在浏览器中登录各个 AI 网站，这样在侧边栏中就无需重复登录
• 如果遇到加载问题，可以尝试刷新页面或重启思源笔记`,
        key: "ai-hint",
        value: ""
    });

    // 添加地址列表配置
    items.push({
        type: "custom",
        component: "ListEditor",
        title: "📝 AI 服务列表（高级设置）", 
        description: `可视化编辑 AI 服务列表，支持添加、删除、排序操作`,
        key: "ai-url-list", 
        value: ctx.settings["ai-url-list"], 
        direction: "column",
        columns: ["服务名称", "URL"],
        separator: "|"
    });

    return {
        name: "🤖 AI 侧边栏",
        items
    };
};
