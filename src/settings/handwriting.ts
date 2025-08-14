import type { SettingGroupDefinition, BuildContext } from "./types";

export const handwritingGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "画板",
    subGroups: [
        { name: "基本设置", items: [
            { type: "checkbox", title: "启用画板功能", description: "启用后可使用画板", key: "handwriting-enable", value: ctx.settings["handwriting-enable"] },
            { type: "select", title: "画板数据块备用创建位置", description: "选择日记本", key: "tl-draw-create-note-id", value: ctx.settings["tl-draw-create-note-id"], options: (() => { const nb=(window as any).siyuan?.notebooks; if(!Array.isArray(nb)||!nb.length) return {"":"无可用日记本"}; return Object.fromEntries(nb.map((n:any)=>[n.id,n.name])); })() },
            { type: "checkbox", title: "启用画板网格背景", description: "默认开启网格", key: "isGridMode", value: ctx.settings["isGridMode"] },
            { type: "checkbox", title: "复制链接标题", description: "复制链接时包含标题", key: "copyLinkTitle", value: ctx.settings["copyLinkTitle"] },
            { type: "checkbox", title: "同步删除(不建议启用)", description: "删除画板块时同步删除笔记块", key: "SyncDelete", value: ctx.settings["SyncDelete"] },
        ]},
        { name: "备份管理", items: [ { type: "custom", title: "画板备份管理", description: "管理画板备份", key: "tldraw-backup-manager", value: "", component: "TldrawBackupManager" } ] },
        { name: "引用管理", items: [ { type: "custom", title: "画板引用管理", description: "管理未引用画板", key: "tldraw-reference-manager", value: "", component: "TldrawReferenceManager" } ] },
    ]
});
