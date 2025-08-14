import type { SettingGroupDefinition, BuildContext } from "./types";

export const wpsDefaults: Record<string, any> = {
    "wps-enable": false,
    "wps-file-enable": false,
    "wps-pic-enable": false,
    "wps-data-enable": false
};

export const wpsGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "🛠️Wps开发中",
    subGroups: [
        {
            name: "WPS集成",
            items: [
                { type: "checkbox", title: "启用 WPS集成", description: "启用后可使用 Wps 功能", key: "wps-enable", value: ctx.settings["wps-enable"] },
            ]
        },
        {
            name: "WPS文件链接管理",
            items: [
                { type: "checkbox", title: "启用 WPS文件链接管理", description: "文件链接管理", key: "wps-file-enable", value: ctx.settings["wps-file-enable"] },
            ]
        },
        {
            name: 'WPS图片管理',
            items: [
                { type: "checkbox", title: "启用 WPS图片管理", description: "图片管理", key: "wps-pic-enable", value: ctx.settings["wps-pic-enable"] },
            ]
        },
        {
            name: "WPS数据导入",
            items: [
                { type: "checkbox", title: "启用 WPS数据导入", description: "数据导入", key: "wps-data-enable", value: ctx.settings["wps-data-enable"] },
            ]
        }
    ]
});
