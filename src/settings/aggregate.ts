import type { SettingGroupDefinition, BuildContext } from "./types";

// Aggregate 设置默认值
export const aggregateDefaults: Record<string, any> = {
    "aggregate-enable": false,
    "aggregate-enable-sql-visualizer": true,
    // SQL 结果预览列（逗号/空格分隔）。为空则自动推断列
    "aggregate-sql-preview-columns": "",
    // SQL 结果预览列最大宽度（像素）
    "aggregate-sql-preview-col-max-width": 480,
};

export const aggregateGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "🚧聚合🚧",
    items: [
        { type: "checkbox", title: "启用聚合", description: "启用后再进行下面的设置", key: "aggregate-enable", value: ctx.settings["aggregate-enable"] },
        { type: "checkbox", title: "启用 SQL 可视化生成器", description: "在顶部栏显示 SQL 可视化生成器按钮", key: "aggregate-enable-sql-visualizer", value: ctx.settings["aggregate-enable-sql-visualizer"] },
        {
            type: "textarea",
            title: "SQL 预览列",
            description: "按需显示结果列，使用逗号/空格分隔，留空自动。示例：alias box content created fcontent hash hpath ial id length markdown memo",
            key: "aggregate-sql-preview-columns",
            value: ctx.settings["aggregate-sql-preview-columns"] ?? "",
            direction: "row",
        },
        {
            type: "number",
            title: "结果预览列最大宽度（px）",
            description: "限制结果表格中每一列的最大宽度，避免列过宽影响阅读。建议范围 240~1200，默认 480。",
            key: "aggregate-sql-preview-col-max-width",
            value: ctx.settings["aggregate-sql-preview-col-max-width"] ?? 480,
        },
    ]
});
