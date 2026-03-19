import { airscript_data_code, airscript_pic_code } from "@/wps/wps_api";
import type { SettingGroupDefinition, BuildContext } from "./types";
import { showMessage } from "siyuan";

export const wpsDefaults: Record<string, any> = {
    "wps-enable": false,
    "wps-file-enable": false,
    // 是否在插入/导入 WPS 文件块时直接生成链接卡片（而不是使用文本模板）
    "wps-file-insert-as-card": false,
    // 暗色主题下对嵌入页面应用反色滤镜
    "wps-webview-invert-dark": false,
    // 以桌面浏览器环境启用 webview（桌面 UA / 语言偏好 / 持久分区）
    "wps-webview-real-browser-env": true,
    // dock 内 webview 空闲休眠
    "wps-webview-sleep-enable": true,
    // dock 内 webview 空闲休眠阈值（分钟）
    "wps-webview-sleep-minutes": 10,
    // 自定义 UA（留空使用默认桌面 UA）
    "wps-webview-user-agent": "",
    "wps-pic-enable": false,
    "wps-data-enable": false,
    "wps-airscript-token": "",
    "wps-pic-url": "",
    "wps-data-url": "",
    // 需要提取的字段列表，逗号分隔；可包含 (A) 标记表示附件
    "wps-data-fields": "field1,field2",
    // 数据插入目标日记所在笔记本ID（相当于 calendar 的 cal-create-pos）
    "wps-data-notebook": "",
    // 自定义模板：支持 {{#records}}...{{/records}} 循环与 {{字段名}} 占位符；附件字段输出为 markdown 链接集合
    "wps-data-template": "",
    "wps-file-weburl": "https://www.kdocs.cn/latest",
    // WPS 文件块自定义模板；支持占位符 {{name}} {{url}} {{file_type}} {{file_src}}，留空则使用内置默认模板
    "wps-file-block-template": "",
    // 顶栏按钮打开的新页签链接
    "wps-file-topbar-url": "",
    // 打开思源时后台预加载 WPS 页面，用于捕获 roaming 数据
    "wps-file-background-preload": true,
    // 后台预加载 webview 空闲休眠阈值（分钟）
    "wps-file-background-sleep-minutes": 8,
    // WPS 文件导入到日记的目标笔记本
    "wps-file-daily-notebook": "",
};

export const wpsGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "WPS联动",
    subGroups: [
        {
            name: "WPS联动",
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
                { type: "textinput", title: "顶栏按钮链接", description: "点击顶栏按钮时打开的新页签链接", key: "wps-file-topbar-url", value: ctx.settings["wps-file-topbar-url"] },
                { type: "checkbox", title: "后台预加载 WPS 页面", description: "打开思源时在后台加载 WPS 页面并抓取 roaming 数据", key: "wps-file-background-preload", value: ctx.settings["wps-file-background-preload"] },
                { type: "checkbox", title: "WebView 使用桌面浏览器环境", description: "启用后使用桌面 UA + 语言偏好 + 持久分区，尽量贴近真实浏览器行为", key: "wps-webview-real-browser-env", value: ctx.settings["wps-webview-real-browser-env"] },
                { type: "textinput", title: "自定义 WebView UA", description: "可选；留空使用内置桌面 UA", key: "wps-webview-user-agent", value: ctx.settings["wps-webview-user-agent"] },
                { type: "checkbox", title: "Dock WebView 空闲休眠", description: "开启后，超过阈值未活动将自动休眠，降低内存占用", key: "wps-webview-sleep-enable", value: ctx.settings["wps-webview-sleep-enable"] },
                { type: "number", title: "Dock 休眠阈值(分钟)", description: "建议 5~20 分钟", key: "wps-webview-sleep-minutes", value: ctx.settings["wps-webview-sleep-minutes"] },
                { type: "number", title: "后台预加载休眠阈值(分钟)", description: "后台抓取页空闲超过阈值后进入休眠", key: "wps-file-background-sleep-minutes", value: ctx.settings["wps-file-background-sleep-minutes"] },
                { type: "select", title: "导入到日记的笔记本", description: "用于创建/定位当日日记的笔记本", key: "wps-file-daily-notebook", value: ctx.settings["wps-file-daily-notebook"], options: notebookOptions() },
                { type: "checkbox", title: "暗色主题下反色预览页面", description: "开启后：当 data-theme-mode=dark 时对嵌入的 webview/iframe 应用反色滤镜（invert+hue-rotate）", key: "wps-webview-invert-dark", value: ctx.settings["wps-webview-invert-dark"] },
                { type: "checkbox", title: "文件以卡片形式插入", description: "启用后：单条插入与批量导入都会调用 generateLinkCard 生成链接卡片(忽略文本模板)", key: "wps-file-insert-as-card", value: ctx.settings["wps-file-insert-as-card"] },
                { type: "custom", component: "TemplateEditor", title: "文件块模板", description: "可视化编辑文件块模板，支持占位符插入和预览", key: "wps-file-block-template", value: ctx.settings["wps-file-block-template"], direction: "column", placeholders: ["name", "url", "file_type", "file_src"], placeholderDescriptions: { "name": "文件名称", "url": "文件链接", "file_type": "文件类型", "file_src": "文件来源" }, placeholderCategories: { "文件信息": ["name", "file_type", "file_src"], "链接": ["url"] }, rows: 6 },
            ]
        },
        {
            name: '🛠️WPS图片管理🛠️',
            items: [
                { type: "checkbox", title: "启用 WPS图片管理", description: "图片管理(限制：图片链接有效期不足1天,请及时转为本地文件）", key: "wps-pic-enable", value: ctx.settings["wps-pic-enable"] },
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
                { type: "textinput", title: "数据导入脚本链接", description: "多维表格数据导入链接", key: "wps-data-url", value: ctx.settings["wps-data-url"] },
                { type: "textarea", title: "提取字段列表", description: "要提取的字段，使用英文逗号分隔；附件字段以 (A) 或 （A） 结尾", key: "wps-data-fields", value: ctx.settings["wps-data-fields"], direction: "row" },
                { type: "select", title: "导入数据笔记本", description: "用于创建/定位当日日记的笔记本", key: "wps-data-notebook", value: ctx.settings["wps-data-notebook"], options: notebookOptions() },
                { type: "custom", component: "TemplateEditor", title: "自定义模板", description: "可视化编辑数据导入模板，支持占位符插入和预览", key: "wps-data-template", value: ctx.settings["wps-data-template"], direction: "column", placeholders: ["records", "字段名"], placeholderDescriptions: { "records": "记录循环块 {{#records}}...{{/records}}", "字段名": "数据字段名称" }, placeholderCategories: { "循环结构": ["records"], "数据字段": ["字段名"] }, rows: 8 },
                {
                    type: "button",
                    title: "复制数据导入处理脚本到剪切板",
                    description: "点击复制 AirScript 数据导入处理代码",
                    key: "wps-data-copy-script",
                    value: "",
                    button: {
                        label: "复制",
                        callback: () => {
                            copyDataScriptToClipboard();
                        }
                    }
                },
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

function copyDataScriptToClipboard() {
    navigator.clipboard.writeText(airscript_data_code).then(() => {
        showMessage("数据导入处理脚本已复制到剪切板");
    }).catch(err => {
        showMessage("复制失败:" + err);
    });
}

function notebookOptions() {
    const nb = (window as any).siyuan?.notebooks;
    if (!Array.isArray(nb) || nb.length === 0) return { "": "无可用日记本" };
    return Object.fromEntries(nb.map((n: any) => [n.id, n.name]));
}