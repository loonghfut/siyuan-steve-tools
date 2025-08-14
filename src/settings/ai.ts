import type { SettingGroupDefinition, BuildContext } from "./types";

export const aiGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "ai侧边栏",
    items: [
        { type: "checkbox", title: "启用ai网页侧边栏", description: "启用后再进行下面设置", key: "ai-enable", value: ctx.settings["ai-enable"] },
        { type: "select", title: "ai网页地址", description: "选择内置或自定义地址", key: "ai-url", value: ctx.settings["ai-url-type"], options: { "https://www.doubao.com/chat/": "豆包AI", "https://kimi.moonshot.cn/": "kimi", "https://metaso.cn/": "密塔", "https://chat.deepseek.com/": "deepseek", "https://chatgpt.com/": "chatgpt", custom: "自定义地址" } },
        { type: "textinput", title: "自定义AI网页地址", description: "选择自定义地址时生效", key: "ai-url-custom", value: ctx.settings["ai-url-custom"], placeholder: "http(s)://" },
    ]
});
