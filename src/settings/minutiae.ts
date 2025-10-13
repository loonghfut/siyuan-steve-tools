import type { SettingGroupDefinition, BuildContext } from "./types";

// Minutiae 设置默认值
export const minutiaeDefaults: Record<string, any> = {
    "minutiae-enable": false,
    "minutiae-headimg-enable": false,
    "minutiae-headimg-url": "",
    "minutiae-headimg-id-mapping": "{}",
    "minutiae-headimg-default-save-dir": "",
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
        }
    ]

});
