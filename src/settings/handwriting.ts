import type { SettingGroupDefinition, BuildContext } from "./types";
import { h6StyleDefaults, h6StyleGroup } from "./style-h6";

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
    // 全局禁止 JS 块执行脚本
    "js-shape-disable-execution": false,
    "enableDoubleClickCreateSingleBlock": true,
    // 精确箭头模式
    "tldraw-exact-arrow-mode": true,
    // 自定义卡片标题内容
    "tldraw-custom-card-title": "",
    // 文档树显示白板按钮
    "tldraw-show-in-file-tree": true,
    ...h6StyleDefaults,
};

export const handwritingGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "画板",
    subGroups: [
        {
            name: "基本设置", items: [
                { type: "checkbox", title: "启用画板功能", description: "启用后可使用画板模块", key: "handwriting-enable", value: ctx.settings["handwriting-enable"] },
                { type: "checkbox", title: "启用双击创建单块", description: "启用后双击画板空白处将创建单块", key: "enableDoubleClickCreateSingleBlock", value: ctx.settings["enableDoubleClickCreateSingleBlock"] },
                { type: "checkbox", title: "显示 Card 形状边框", description: "启用后 Card 形状将显示边框", key: "showCardBorder", value: ctx.settings["showCardBorder"] },
                { type: "checkbox", title: "启用画板网格背景", description: "默认开启网格", key: "isGridMode", value: ctx.settings["isGridMode"] },
                { type: "checkbox", title: "启用形状吸附模式", description: "启用后形状将自动吸附到网格", key: "isSnapMode", value: ctx.settings["isSnapMode"] },
                { type: "checkbox", title: "复制链接标题", description: "复制链接时包含标题", key: "copyLinkTitle", value: ctx.settings["copyLinkTitle"] },
                { type: "select", title: "画板链接协议", description: "选择写入块内容的画板引用链接使用 https 还是 siyuan 协议", key: "tldraw-link-scheme", value: ctx.settings["tldraw-link-scheme"], options: { "https": "https://plugins/...", "siyuan": "siyuan://plugins/..." } },
                { type: "select", title: "工具栏方向", description: "选择工具栏是垂直显示还是水平显示", key: "tldraw-toolbar-orientation", value: ctx.settings["tldraw-toolbar-orientation"], options: { "vertical": "垂直", "horizontal": "水平" } },
                { type: "checkbox", title: "文档块是否渲染题头图", description: "启用文档块题头图渲染", key: "tldraw-header-image", value: ctx.settings["tldraw-header-image"] },
                { type: "checkbox", title: "启用精确箭头模式", description: "启用后绘制箭头时将使用精确模式", key: "tldraw-exact-arrow-mode", value: ctx.settings["tldraw-exact-arrow-mode"] },
                { type: "textinput", title: "自定义卡片标题内容", description: "在此输入自定义的卡片标题内容，支持使用变量 ${timestamp}", key: "tldraw-custom-card-title", value: ctx.settings["tldraw-custom-card-title"] },
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
                {
                    type: "select", title: "Card 渲染模式", description: "选择非编辑状态如何渲染 Card：性能优先或一致性优先", key: "card-render-mode", value: ctx.settings["card-render-mode"], options: {
                        "static-dom": "性能优先：非编辑为 Protyle 元素（无实例）",
                        "live-protyle": "一致性优先：非编辑保留 Protyle 实例（禁用交互）"
                    }
                },
                { type: "checkbox", title: "仅加载视野内形状", description: "启用后 tldraw 仅在视区内加载形状以节省资源", key: "tldraw-viewport-culling", value: ctx.settings["tldraw-viewport-culling"] },
            ]
        },
        { name: "备份管理", items: [{ type: "custom", title: "画板备份管理", description: "管理画板备份", key: "tldraw-backup-manager", value: "", component: "TldrawBackupManager" }] },
        { name: "引用管理", items: [{ type: "custom", title: "画板引用管理", description: "管理未引用画板", key: "tldraw-reference-manager", value: "", component: "TldrawReferenceManager" }] },
    ]
});
