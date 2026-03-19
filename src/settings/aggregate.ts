import type { SettingGroupDefinition, BuildContext } from "./types";

// Aggregate 设置默认值
export const aggregateDefaults: Record<string, any> = {
    "aggregate-enable": false,
    "aggregate-enable-sql-visualizer": true,
    // SQL 结果预览列（逗号/空格分隔）。为空则自动推断列
    "aggregate-sql-preview-columns": "",
    // SQL 结果预览列最大宽度（像素）
    "aggregate-sql-preview-col-max-width": 480,
    // 分段嵌入：起始、结束与间隔（天）
    "aggregate-segment-embed-start": "",
    "aggregate-segment-embed-end": "",
    "aggregate-segment-embed-interval-days": 7,
    // 图表功能
    "chart-enable": false,
    // 聚合器功能
    "aggregate-enable-content-aggregator": false,
    // 文档插入位置（append: 末尾，prepend: 开头）
    "aggregate-insert-mode": "append",
    // SQL 结果预览模板（支持占位符，例如 {{markdown}} {{content}} {{id}}）
    "aggregate-sql-preview-template": "",
    // Row 之间的分隔符（默认 ---）
    "aggregate-row-separator": "---",
    // 时间过滤字段（用于避免重复插入已处理的内容）
    "aggregate-time-field": "created",
    "aggregate-recent-update-minutes": 5, // 检查最近更新的时间阈值（分钟）
};

export const aggregateGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "可视化聚合",
    subGroups: [
        {
            name: "SQL聚合",
            items: [
                { type: "checkbox", title: "启用可视化聚合", description: "启用后再进行此模块的设置", key: "aggregate-enable", value: ctx.settings["aggregate-enable"] },
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
                {
                    type: "datetime-local",
                    title: "分段开始（created）",
                    description: "用于“分段嵌入”功能。支持 YYYYMMDDHHmmss 或 YYYY-MM-DD HH:mm（秒默认 00）",
                    key: "aggregate-segment-embed-start",
                    value: ctx.settings["aggregate-segment-embed-start"] ?? "",
                },
                {
                    type: "datetime-local",
                    title: "分段结束（created）",
                    description: "用于“分段嵌入”功能。支持 YYYYMMDDHHmmss 或 YYYY-MM-DD HH:mm（秒默认 00）",
                    key: "aggregate-segment-embed-end",
                    value: ctx.settings["aggregate-segment-embed-end"] ?? "",
                },
                {
                    type: "number",
                    title: "分段间隔（天）",
                    description: "用于“分段嵌入”功能。按天拆分区间（>0）。默认 7 天。",
                    key: "aggregate-segment-embed-interval-days",
                    value: ctx.settings["aggregate-segment-embed-interval-days"] ?? 7,
                },
            ],
        },
        {
            name: "图表聚合",
            items: [
                { type: "checkbox", title: "启用图表功能", description: "启用后再进行下面的设置", key: "chart-enable", value: ctx.settings["chart-enable"] },
            ],
        },
        {   
            name: "块聚合",
            items: [
                { type: "checkbox", title: "启用块聚合", description: "启用后再进行下面的设置", key: "aggregate-enable-content-aggregator", value: ctx.settings["aggregate-enable-content-aggregator"] },
                {
                    type: "select",
                    title: "文档插入位置",
                    description: "将聚合内容插入到目标文档的开头或末尾",
                    key: "aggregate-insert-mode",
                    value: ctx.settings["aggregate-insert-mode"] ?? "append",
                    options: {
                        append: "末尾 (append)",
                        prepend: "开头 (prepend)",
                    },
                },
                {
                    type: "custom",
                    component: "TemplateEditor",
                    title: "SQL 聚合默认模板",
                    description: "可视化编辑 SQL 聚合模板，支持占位符插入和预览",
                    key: "aggregate-sql-preview-template",
                    value: ctx.settings["aggregate-sql-preview-template"] ?? "",
                    direction: "column",
                    placeholders: ["markdown", "content", "id"],
                    placeholderDescriptions: { "markdown": "Markdown 格式内容", "content": "原始内容", "id": "块 ID" },
                    placeholderCategories: { "内容格式": ["markdown", "content"], "标识符": ["id"] },
                    rows: 8
                },
                // {
                //     type: "textinput",
                //     title: "Row 分隔符",
                //     description: "用于分隔每个 SQL 结果行的字符串，支持 Markdown 语法，默认 ---",
                //     key: "aggregate-row-separator",
                //     value: ctx.settings["aggregate-row-separator"] ?? "",
                //     direction: "row",
                // },
                {
                    type: "select",
                    title: "时间过滤字段",
                    description: "用于过滤已插入内容的时间字段(避免重复插入)，选择 created(创建时间) 或 updated(更新时间)",
                    key: "aggregate-time-field",
                    value: ctx.settings["aggregate-time-field"] ?? "created",
                    options: {
                        created: "创建时间 (created)",
                        updated: "更新时间 (updated)",
                    },
                },
                {
                    type: "number",
                    title: "最近更新检查阈值（分钟）",
                    description: "检查 SQL 返回结果中，是否有在最近 N 分钟内更新的块，避免用户编辑块时，聚合块",
                    key: "aggregate-recent-update-minutes",
                    value: ctx.settings["aggregate-recent-update-minutes"] ?? 5,
                },
            ],
        },
    ],
});
