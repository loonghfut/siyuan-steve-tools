import type { SettingGroupDefinition, BuildContext } from "./types";

export const commonDefaults: Record<string, any> = {
    "PluginUsageStatistics": true,
    "transaction-delay": 1000,
    "invert-page-enable": false,
};

export const commonGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "通用设置",
    items: [
        { type: "checkbox", title: "允许统计", description: "允许统计功能使用情况", key: "PluginUsageStatistics", value: ctx.settings["PluginUsageStatistics"] },
        { type: "slider", title: "数据库操作延迟时间(建议1100)", description: "批量处理延迟(毫秒)", key: "transaction-delay", value: ctx.settings["transaction-delay"], slider: { min: 500, max: 5000, step: 100 } },
        { type: "checkbox", title: "页面反色", description: "反转页面整体颜色(图片与图标除外)", key: "invert-page-enable", value: ctx.settings["invert-page-enable"] },
    ]
});
