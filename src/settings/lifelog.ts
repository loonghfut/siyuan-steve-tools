import type { SettingGroupDefinition, BuildContext } from "./types";

export const lifelogDefaults: Record<string, any> = {
    "lifelog-enable": false,
    "lifelog-debug": false,
    // 解析配置
    "lifelog-time-separator": "any",               // auto/full(:)/half(:)/any(二者皆可)
    "lifelog-allow-seconds": true,                  // 识别 HH:mm:ss
    // 配色配置
    "lifelog-type-colors": "",                      // 类型=颜色 的多行字符串，空则用内置默认色
    // 日历显示
    "lifelog-slot-duration": "00:10:00",            // lifelog 视图粒度
    "lifelog-link-across-empty-days": false,        // 跨空天是否延续上一个事件的结束时间
};

export const lifelogGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "LifeLog",
    subGroups: [
        {
            name: "LifeLog 总设置",
            items: [
                { type: "checkbox", title: "启用 LifeLog", description: "记录日记中的时间记录（在日记段落中写入 HH:mm 类型：内容 即可被自动捕获）", key: "lifelog-enable", value: ctx.settings["lifelog-enable"] },
                { type: "checkbox", title: "启用调试日志", description: "输出调试信息到控制台", key: "lifelog-debug", value: ctx.settings["lifelog-debug"] },
                { type: "hint", title: "感谢", description: "此功能由 BoysFight PR 贡献", key: "lifelog-hint", value: "" },
            ]
        },
        {
            name: "解析配置",
            items: [
                { type: "hint", title: "说明", description: "LifeLog 通过监听思源的编辑事件识别日记文档中以「HH:mm」开头的段落。识别方式：读取段落所属文档块的 custom-dailynote-YYYYMMDD 属性（思源官方 daily note 标识），无需额外配置。", key: "lifelog-parse-info", value: "" },
                {
                    type: "select", title: "类型/内容分隔符", description: "「类型：内容」之间的冒号格式",
                    key: "lifelog-time-separator", value: ctx.settings["lifelog-time-separator"],
                    options: { "any": "全角/半角皆可（推荐）", "full": "仅全角：", "half": "仅半角:" }
                },
                { type: "checkbox", title: "识别秒级时间", description: "识别 HH:mm:ss 格式（关闭则只识别 HH:mm）", key: "lifelog-allow-seconds", value: ctx.settings["lifelog-allow-seconds"] },
            ]
        },
        {
            name: "类型配色",
            items: [
                { type: "hint", title: "说明", description: "自定义各类型的颜色（用于日历事件）。留空则使用内置默认色（固定/学习/工作/娱乐/家庭/朋友 等）；未在映射中的类型会按类型名哈希自动生成颜色。日记段落仍使用内置默认色。", key: "lifelog-color-info", value: "" },
                { type: "custom", component: "LifelogTypeColorEditor", title: "类型颜色映射", description: "为每个类型设置颜色", key: "lifelog-type-colors", value: ctx.settings["lifelog-type-colors"], direction: "column" },
            ]
        },
        {
            name: "日历显示",
            items: [
                {
                    type: "select", title: "时间粒度", description: "在日历视图中勾选 Lifelog 时切换到的时间槽粒度",
                    key: "lifelog-slot-duration", value: ctx.settings["lifelog-slot-duration"],
                    options: { "00:05:00": "5 分钟", "00:10:00": "10 分钟（默认）", "00:15:00": "15 分钟", "00:30:00": "30 分钟", "01:00:00": "1 小时" }
                },
                { type: "checkbox", title: "跨空天延续时段", description: "某天无记录时，是否让下一天的首事件从上一个有记录日的结束时间开始。默认关闭（更符合直觉）", key: "lifelog-link-across-empty-days", value: ctx.settings["lifelog-link-across-empty-days"] },
            ]
        }
    ]
});
