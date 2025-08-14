import type { SettingGroupDefinition, BuildContext } from "./types";

export const commonGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "通用设置",
    items: [
        { type: "checkbox", title: "允许统计", description: "允许匿名使用情况统计", key: "PluginUsageStatistics", value: ctx.settings["PluginUsageStatistics"] },
        { type: "slider", title: "数据库操作延迟时间(建议1100)", description: "批量处理延迟(毫秒)", key: "transaction-delay", value: ctx.settings["transaction-delay"], slider: { min: 500, max: 5000, step: 100 } },
    ]
});
