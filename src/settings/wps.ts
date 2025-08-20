import { airscript_pic_code } from "@/wps/wps_api";
import type { SettingGroupDefinition, BuildContext } from "./types";
import { showMessage } from "siyuan";

export const wpsDefaults: Record<string, any> = {
    "wps-enable": false,
    "wps-file-enable": false,
    "wps-pic-enable": false,
    "wps-data-enable": false,
    "wps-airscript-token": "",
    "wps-pic-url": "",
    "wps-data-weburl": "",
    "wps-file-weburl": "https://www.kdocs.cn/latest",
};

export const wpsGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "🛠️Wps联动开发中...",
    subGroups: [
        {
            name: "WPS集成",
            items: [
                { type: "checkbox", title: "启用 WPS集成", description: "启用后可使用 WPS联动相关功能", key: "wps-enable", value: ctx.settings["wps-enable"] },
                { type: "textinput", title: "AirScript-Token", description: "WPS AirScript-Token", key: "wps-airscript-token", value: ctx.settings["wps-airscript-token"] },
            ]
        },
        {
            name: "WPS文件管理",
            items: [
                { type: "checkbox", title: "启用 WPS文件管理", description: "文件管理", key: "wps-file-enable", value: ctx.settings["wps-file-enable"] },
                { type: "textinput", title: "文件夹链接", description: "WPS文件夹链接", key: "wps-file-weburl", value: ctx.settings["wps-file-weburl"] },
            ]
        },
        {
            name: 'WPS图片管理',
            items: [
                { type: "checkbox", title: "启用 WPS图片管理", description: "图片管理", key: "wps-pic-enable", value: ctx.settings["wps-pic-enable"] },
                { type: "textinput", title: "图片脚本链接", description: "处理图片逻辑的链接", key: "wps-pic-url", value: ctx.settings["wps-pic-url"] },
                {
                    type: "button",
                    title: "复制图片处理脚本到剪切板",
                    description: "点击复制 AirScript 图片处理代码",
                    key: "wps-pic-copy-script",
                    value: "",
                    button: {
                        label: "复制",
                        callback: () => {
                            copyImageScriptToClipboard();
                        }
                    }
                }
            ]
        },
        {
            name: "WPS数据导入",
            items: [
                { type: "checkbox", title: "启用 WPS数据导入", description: "数据导入", key: "wps-data-enable", value: ctx.settings["wps-data-enable"] },
                { type: "textinput", title: "数据收集表", description: "多维表中收集表的链接", key: "wps-data-weburl", value: ctx.settings["wps-data-weburl"] },
            ]
        }
    ]
});


function copyImageScriptToClipboard() {
    navigator.clipboard.writeText(airscript_pic_code).then(() => {
        showMessage("图片处理脚本已复制到剪切板");
    }).catch(err => {
        showMessage("复制失败:" + err);
    });
}

