import type { SettingGroupDefinition, BuildContext } from "./types";

export const lifelogGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "LifeLog",
    items: [
        { type: "checkbox", title: "启用 LifeLog", description: "记录日记中的时间记录", key: "lifelog-enable", value: ctx.settings["lifelog-enable"] },
        { type: "checkbox", title: "启用调试日志", description: "输出调试信息", key: "lifelog-debug", value: ctx.settings["lifelog-debug"] },
        { type: "hint", title: "感谢", description: "此功能由 BoysFight PR 贡献", key: "lifelog-hint", value: "" },
    ]
});
