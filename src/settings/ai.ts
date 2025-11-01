import type { SettingGroupDefinition, BuildContext } from "./types";

export const aiDefaults: Record<string, any> = {
    "ai-enable": false,
    // 这里保存最终使用的 url 字段仍沿用旧 key (ai-url) 供模块内部引用，界面上通过 ai-url-type 选择
    "ai-url": "https://www.doubao.com/chat/",
    "ai-url-custom": "",
    // 用户自定义 AI 地址列表，每行一条：名称|URL
    "ai-url-list": `豆包AI|https://www.doubao.com/chat/
kimi|https://kimi.moonshot.cn/
密塔|https://metaso.cn/
deepseek|https://chat.deepseek.com/
chatgpt|https://chatgpt.com/
custom|custom`
};

export const aiGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "ai侧边栏",
    items: [
        { type: "checkbox", title: "启用ai网页侧边栏", description: "启用后再进行下面设置", key: "ai-enable", value: ctx.settings["ai-enable"] },
        { type: "select", title: "ai网页地址", description: "选择内置或自定义地址", key: "ai-url", value: ctx.settings["ai-url-type"], options: { "https://www.doubao.com/chat/": "豆包AI", "https://kimi.moonshot.cn/": "kimi", "https://metaso.cn/": "密塔", "https://chat.deepseek.com/": "deepseek", "https://chatgpt.com/": "chatgpt", custom: "自定义地址" } },
        { type: "textinput", title: "自定义AI网页地址", description: "选择自定义地址时生效", key: "ai-url-custom", value: ctx.settings["ai-url-custom"], placeholder: "http(s)://" },
        { type: "textarea", title: "AI 地址列表", description: "每行一条，格式：名称|URL。保存后侧边栏下拉将刷新。例：豆包AI|https://www.doubao.com/chat/", key: "ai-url-list", value: ctx.settings["ai-url-list"], direction: "row" },
    ]
});
