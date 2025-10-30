import type { SettingGroupDefinition, BuildContext } from "./types";

// Minutiae 设置默认值
export const minutiaeDefaults: Record<string, any> = {
    "minutiae-enable": false,
    "minutiae-headimg-enable": false,
    "minutiae-headimg-url": "",
    "minutiae-headimg-id-mapping": "{}",
    "minutiae-headimg-default-save-dir": "",
    "minutiae-bg-enable": false,
    "minutiae-bg-url": "",
    "minutiae-bg-id-mapping": "{}",
    "minutiae-bg-default-save-dir": "",
    "minutiae-bg-opacity": 0.6,
    "minutiae-bg-blur": 6,
    "minutiae-bg-brightness": 1,
    "minutiae-bg-mode": "switch",
    "minutiae-bg-switch-threshold": 2,
};

export const minutiaeGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "Minutiae",
    subGroups: [
        {
            name: "Minutiae总设置",
            items: [
                { type: "checkbox", title: "启用Minutiae", description: "启用后再进行下面的设置", key: "minutiae-enable", value: ctx.settings["minutiae-enable"] },
            ]
        },
        {
            name: "自动题头图",
            items: [
                { type: "hint", title: "自动题头图", description: "自动题头图功能会在切换编辑器时检测当前文档是否有题头图，如果没有则自动添加一个默认题头图（可自行修改代码更换图片）。如果已经有题头图则不进行任何操作。（只会自动添加一次）", key: "minutiae-headimg-info", value: "" },
                { type: "checkbox", title: "启用自动题头图", description: "启用会对文档自动设置题头图", key: "minutiae-headimg-enable", value: ctx.settings["minutiae-headimg-enable"] },
                { type: "textinput", title: "题头图地址", description: "设置一个默认的题头图地址（建议使用外链地址）", key: "minutiae-headimg-url", value: ctx.settings["minutiae-headimg-url"] },
                { type: "custom", component: "HeadimgMappingEditor", title: "文档ID题头图映射", description: "为每个文档ID直观配置远程URL与本地目录（目录=随机源；显示优先远程，下载保存到目录）", key: "minutiae-headimg-id-mapping", value: ctx.settings["minutiae-headimg-id-mapping"], direction: "column" },
                { type: "textinput", title: "默认保存目录", description: "当映射/全局地址无法推导保存目录时，下载或上传将保存到此目录（assets/<目录>）。可填如 headimg", key: "minutiae-headimg-default-save-dir", value: ctx.settings["minutiae-headimg-default-save-dir"] },
            ]
        },
        {
            name: "随机背景图",
            items: [
                { type: "hint", title: "说明", description: "为编辑器注入独立Canvas背景，可按文档设置自定义图源，背景参数实时生效。（背景图的实现逻辑参考替换背景图片插件）", key: "minutiae-bg-info", value: "" },
                { type: "checkbox", title: "启用随机背景图", description: "为文档注入背景图（刷新或切换文档生效）", key: "minutiae-bg-enable", value: ctx.settings["minutiae-bg-enable"] },
                { type: "textinput", title: "背景图地址", description: "设置全局默认背景图地址，可为远程链接或本地路径。", key: "minutiae-bg-url", value: ctx.settings["minutiae-bg-url"] },
                { type: "custom", component: "HeadimgMappingEditor", title: "文档ID背景图映射", description: "类似题头图映射：支持为每个文档指定远程URL与本地目录（目录表示随机源）。", key: "minutiae-bg-id-mapping", value: ctx.settings["minutiae-bg-id-mapping"], direction: "column" },
                { type: "textinput", title: "默认保存目录", description: "当映射/全局地址无法推导保存目录时，下载或上传会保存到该目录（assets/<目录>），例如 background。", key: "minutiae-bg-default-save-dir", value: ctx.settings["minutiae-bg-default-save-dir"] },
                { type: "select", title: "背景切换模式", description: "选择背景切换策略：切换文档 / 每次启动（启动时选择并可持久化）", key: "minutiae-bg-mode", value: ctx.settings["minutiae-bg-mode"], options: { switch: "切换文档时切换", startup: "每次启动时切换（首次选择后可持久化）" } },
                { type: "slider", title: "切换防抖阈值（秒）", description: "当处于“切换文档时切换”模式时，最小间隔（秒）内不会重复请求图片，防止短时间内大量请求。设为0则不限制。", key: "minutiae-bg-switch-threshold", value: ctx.settings["minutiae-bg-switch-threshold"], slider: { min: 0, max: 300, step: 0.5 } },
                { type: "slider", title: "透明度", description: "0.1-1（应用公式 0.99 - 0.25x 调整页面透明）", key: "minutiae-bg-opacity", value: ctx.settings["minutiae-bg-opacity"], slider: { min: 0.1, max: 1, step: 0.01 } },
                { type: "slider", title: "模糊强度", description: "单位 px，范围 0-20。", key: "minutiae-bg-blur", value: ctx.settings["minutiae-bg-blur"], slider: { min: 0, max: 20, step: 1 } },
                { type: "slider", title: "亮度", description: "0.5-1.5，1 为原始亮度。", key: "minutiae-bg-brightness", value: ctx.settings["minutiae-bg-brightness"], slider: { min: 0.5, max: 1.5, step: 0.05 } }
            ]
        }
    ]

});
