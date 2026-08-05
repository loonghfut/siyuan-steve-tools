import type { SettingGroupDefinition, BuildContext } from "./types";
import { h6StyleDefaults, h6StyleGroup } from "./style-h6";
import { DEFAULT_TLDRAW_AGENT_ACTION_NAMES } from "@/handwriting/tldraw/agent/tools/metadata";

export const handwritingDefaults: Record<string, any> = {
    "handwriting-enable": false,
    "tl-draw-create-note-id": null,
    "isGridMode": false,
    // 是否显示card形状边框
    "showCardBorder": true,
    // 是否始终吸附
    "isSnapMode": true,
    // 复制链接时是否包含标题
    "copyLinkTitle": true,
    // 画板引用链接协议：https://plugins/... 或 siyuan://plugins/...
    "tldraw-link-scheme": "https",
    "SyncDelete": false,
    "tldraw-viewport-culling": true,
    // 工具栏方向：vertical | horizontal
    "tldraw-toolbar-orientation": "vertical",
    // card 渲染模式：static-dom（非编辑仅保留 Protyle 元素，无实例），live-protyle（非编辑保留 Protyle 实例，禁用交互）
    "card-render-mode": "static-dom",
    "tldraw-header-image": true,
    "tldraw-max-active-shapes": 40,
    // Card / 单块形状屏幕尺寸低于此值时使用轻量预览，0 表示关闭。
    "tldraw-card-low-detail-threshold": 48,
    // 当前视区内 Card / 单块形状达到此数量后才启用低缩放轻量预览，0 表示不限制数量。
    "tldraw-card-low-detail-count-threshold": 90,
    // 全局禁止 JS 块执行脚本
    "js-shape-disable-execution": false,
    // 双击画板空白处创建的形状：text | single-block | card
    "enableDoubleClickCreateSingleBlock": "single-block",
    // 精确箭头模式
    "tldraw-exact-arrow-mode": true,
    // 导出 PNG 时的图片质量与倍率
    "tldraw-export-image-quality": 100,
    "tldraw-export-pixel-ratio": 2,
    // Card / 单块形状超过此数量时，仅导出轮廓以提升性能
    "tldraw-export-outline-only-threshold": 90,
    // 自定义卡片标题内容
    "tldraw-custom-card-title": "",
    // 新建 Card 的思源载体块类型：heading | blockquote
    "tldraw-card-default-block-type": "heading",
    // 新建普通卡片时是否询问标题
    "tldraw-prompt-card-title": false,
    // 文档树显示白板按钮
    "tldraw-show-in-file-tree": true,
    "tldraw-agent-actions-enable": false,
    "tldraw-agent-enabled-actions": DEFAULT_TLDRAW_AGENT_ACTION_NAMES,
    ...h6StyleDefaults,
};

export const handwritingGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "画板",
    subGroups: [
        {
            name: "基本设置", items: [
                { type: "checkbox", title: "启用画板功能", description: "启用后可使用画板模块", key: "handwriting-enable", value: ctx.settings["handwriting-enable"] },
                {
                    type: "select",
                    title: "双击画板空白处创建",
                    description: "选择双击画板空白处时创建文本、单块或卡片。旧版开关设置会自动兼容：开启为单块，关闭为文本。",
                    key: "enableDoubleClickCreateSingleBlock",
                    value: ctx.settings["enableDoubleClickCreateSingleBlock"] === false
                        ? "text"
                        : ctx.settings["enableDoubleClickCreateSingleBlock"] === true
                            ? "single-block"
                            : ctx.settings["enableDoubleClickCreateSingleBlock"],
                    options: { "text": "文本", "single-block": "单块", "card": "Card" },
                },
                { type: "checkbox", title: "显示 Card 形状边框", description: "启用后 Card 形状将显示边框", key: "showCardBorder", value: ctx.settings["showCardBorder"] },
                { type: "checkbox", title: "启用画板网格背景", description: "默认开启网格", key: "isGridMode", value: ctx.settings["isGridMode"] },
                { type: "checkbox", title: "启用形状吸附模式", description: "启用后形状将自动吸附到网格", key: "isSnapMode", value: ctx.settings["isSnapMode"] },
                { type: "checkbox", title: "复制链接标题", description: "复制链接时包含标题", key: "copyLinkTitle", value: ctx.settings["copyLinkTitle"] },
                { type: "select", title: "画板链接协议", description: "选择写入块内容的画板引用链接使用 https 还是 siyuan 协议", key: "tldraw-link-scheme", value: ctx.settings["tldraw-link-scheme"], options: { "https": "https://plugins/...", "siyuan": "siyuan://plugins/..." } },
                { type: "select", title: "工具栏方向", description: "选择工具栏是垂直显示还是水平显示", key: "tldraw-toolbar-orientation", value: ctx.settings["tldraw-toolbar-orientation"], options: { "vertical": "垂直", "horizontal": "水平" } },
                { type: "checkbox", title: "文档块是否渲染题头图", description: "启用文档块题头图渲染", key: "tldraw-header-image", value: ctx.settings["tldraw-header-image"] },
                { type: "checkbox", title: "启用精确箭头模式", description: "启用后绘制箭头时将使用精确模式", key: "tldraw-exact-arrow-mode", value: ctx.settings["tldraw-exact-arrow-mode"] },
                { type: "slider", title: "导出图片质量", description: "PNG/SVG 导出为位图时使用的质量参数，范围 10-100。对有损格式影响最明显。", key: "tldraw-export-image-quality", value: ctx.settings["tldraw-export-image-quality"], slider: { min: 10, max: 100, step: 5 } },
                { type: "slider", title: "导出图片倍率", description: "控制导出位图的像素倍率。降低倍率可明显减小 PNG 体积。", key: "tldraw-export-pixel-ratio", value: ctx.settings["tldraw-export-pixel-ratio"], slider: { min: 0.5, max: 4, step: 0.25 } },
                { type: "number", title: "导出轮廓模式阈值", description: "单次导出中 Card 与单块形状数量超过此值时，仅导出形状轮廓以提升性能。默认 90。", key: "tldraw-export-outline-only-threshold", value: ctx.settings["tldraw-export-outline-only-threshold"] },
                { type: "select", title: "新建 Card 默认块类型", description: "选择通过 Card 工具创建空卡片时，在思源中生成标题块还是引述块。", key: "tldraw-card-default-block-type", value: ctx.settings["tldraw-card-default-block-type"], options: { "heading": "标题块", "blockquote": "引述块" } },
                { type: "textinput", title: "自定义卡片标题内容", description: "在此输入自定义的卡片标题内容，支持变量 ${timestamp}", key: "tldraw-custom-card-title", value: ctx.settings["tldraw-custom-card-title"] },
                { type: "checkbox", title: "编辑新卡片时询问标题", description: "启用后，仅在编辑没有绑定思源块 ID 的普通 Card 时询问标题；Agent 创建卡片不受此设置影响", key: "tldraw-prompt-card-title", value: ctx.settings["tldraw-prompt-card-title"] },
                { type: "checkbox", title: "文档树显示白板按钮", description: "在文档树每个条目左侧显示白板图标按钮", key: "tldraw-show-in-file-tree", value: ctx.settings["tldraw-show-in-file-tree"] },
            ]
        },
        h6StyleGroup(ctx),
        {
            name: "高级设置", items: [
                { type: "select", title: "画板数据块备用创建位置", description: "选择日记本", key: "tl-draw-create-note-id", value: ctx.settings["tl-draw-create-note-id"], options: (() => { const nb = (window as any).siyuan?.notebooks; if (!Array.isArray(nb) || !nb.length) return { "": "无可用日记本" }; return Object.fromEntries(nb.map((n: any) => [n.id, n.name])); })() },
                { type: "checkbox", title: "同步删除(不建议启用)", description: "删除画板块时同步删除笔记块", key: "SyncDelete", value: ctx.settings["SyncDelete"] },
                { type: "checkbox", title: "全局禁止 JS 块执行脚本", description: "启用后所有 JS 形状将不执行脚本代码（安全模式）", key: "js-shape-disable-execution", value: ctx.settings["js-shape-disable-execution"] },
                { type: "number", title: "最大激活形状数", description: "限制同时激活的形状数量以节省资源", key: "tldraw-max-active-shapes", value: ctx.settings["tldraw-max-active-shapes"] },
                { type: "number", title: "Card / 单块轻量预览阈值", description: "Card 或单块的屏幕最小边小于此像素值时只显示轻量预览；设为 0 可关闭。默认 48。", key: "tldraw-card-low-detail-threshold", value: ctx.settings["tldraw-card-low-detail-threshold"] },
                { type: "number", title: "Card / 单块轻量预览数量阈值", description: "当前视区内 Card 与单块数量达到此值后才按屏幕尺寸启用轻量预览；设为 0 表示不限制数量。默认 90。", key: "tldraw-card-low-detail-count-threshold", value: ctx.settings["tldraw-card-low-detail-count-threshold"] },
                {
                    type: "select", title: "Card 渲染模式", description: "选择非编辑状态如何渲染 Card：性能优先或一致性优先", key: "card-render-mode", value: ctx.settings["card-render-mode"], options: {
                        "static-dom": "性能优先：非编辑为 Protyle 元素（无实例）",
                        "live-protyle": "一致性优先：非编辑保留 Protyle 实例（禁用交互）"
                    }
                },
                { type: "checkbox", title: "仅加载视野内形状", description: "启用后 tldraw 仅在视区内加载形状以节省资源", key: "tldraw-viewport-culling", value: ctx.settings["tldraw-viewport-culling"] },
            ]
        },
        {
            name: "Agent", items: [
                { type: "checkbox", title: "启用思源智能体操作白板（测试中）", description: "启用后，思源 Agent 可以通过 frontend action 打开、读取并修改 tldraw 白板", key: "tldraw-agent-actions-enable", value: ctx.settings["tldraw-agent-actions-enable"] },
                { type: "custom", title: "Agent 可用 Actions", description: "选择哪些 tldraw frontend action 暴露给思源 Agent。关闭后即使已经注册过，也会在执行时被拦截。", key: "tldraw-agent-enabled-actions", value: ctx.settings["tldraw-agent-enabled-actions"], component: "TldrawAgentActionsSettings" },
            ]
        },
        { name: "备份管理", items: [{ type: "custom", title: "画板备份管理", description: "管理画板备份", key: "tldraw-backup-manager", value: "", component: "TldrawBackupManager" }] },
        { name: "引用管理", items: [{ type: "custom", title: "画板引用管理", description: "管理未引用画板", key: "tldraw-reference-manager", value: "", component: "TldrawReferenceManager" }] },
    ]
});
