import steveTools from "@/index";
import * as ic from "@/icon";
import { createWebviewDock_for_wps } from "@/api/api2";
declare const siyuan: any;

export class M_ai {
    private plugin: steveTools;
    
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    public url = "";
    async init(settingdata: any) {
        this.plugin.addIcons(`
            <symbol id="iconSTai" viewBox="0 0 48 48">
               ${ic.steveTools_ai}
            </symbol>  
                `);
        console.log("ai模块初始化");
        // console.log(this.plugin);
        this.url = settingdata["ai-url"];
        if (this.url === "custom") {
            this.url = settingdata["ai-url-custom"];
        }

        // 从设置中的 ai-url-list 解析下拉选项（每行：名称|URL）
        const parseAiList = (listStr: any) => {
            const m: Record<string, string> = {};
            try {
                if (typeof listStr === 'string' && listStr.trim()) {
                    const lines = listStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    for (const line of lines) {
                        const idx = line.indexOf('|');
                        if (idx > -1) {
                            const name = line.slice(0, idx).trim();
                            const url = line.slice(idx + 1).trim();
                            if (url) m[url] = name || url;
                        } else {
                            // 若无分隔符，作为 url 且 label 用原文
                            m[line] = line;
                        }
                    }
                }
            } catch (e) { /* ignore parse errors */ }
            // 保证 custom 项存在
            if (!m['custom']) m['custom'] = '自定义地址';
            return m;
        };

        const aiOptions = parseAiList(settingdata['ai-url-list']);
        const currentSelection = settingdata["ai-url"] || "";
        const optionsHtml = Object.keys(aiOptions).map(k => {
            const selected = k === currentSelection ? ' selected' : '';
            return `<option value="${k}"${selected}>${aiOptions[k]}</option>`;
        }).join('\n');

        const selectId = `ai-url-select`;
        const selectHtml = `<select id="${selectId}" style="padding:6px 8px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);font-size:12px;background:#fff;color:#222;">${optionsHtml}</select>`;

        // 改用 webview dock（支持更多特性与注入能力）
        createWebviewDock_for_wps({
            plugin: this.plugin,
            config: {
                position: "RightTop",
                size: { width: 250, height: 0 },
                icon: "iconSTai",
                title: "ai",
            },
            type: "ai-dock",
            url: this.url,
            emptyUrlMessage: "请先配置ai网址...",
            containerClass: "ai-dock-container",
            iframeStyle: "height: 99vh ; width: 100%;  pointer-events: auto;",
            pointerEventsDelay: 300,
            // 启用顶部按钮并通过自定义按钮注入下拉
            enableButtons: true,
            // 通过 injectCSS 将按钮容器移动到右上角
            injectCSS: `#ai-dock-container-btns{ left: auto !important; right: 8px !important; transform: none !important; } #ai-dock-container-btns select { min-width: 140px; }`,
            buttons: [
                {
                    id: 'aiSelect',
                    text: selectHtml,
                    title: '切换 AI 地址',
                    style: 'padding: 4px; background: transparent; border: none;'
                }
            ]
    });

        // 在 dock DOM 就绪后绑定下拉 change 事件以切换地址并保存设置
        // 使用小延时尝试定位元素（dock 初始化是异步的）
        setTimeout(() => {
            try {
                const root = document.querySelector('#ai-dock-container') as HTMLElement | null;
                if (!root) return;
                const sel = root.querySelector(`#${selectId}`) as HTMLSelectElement | null;
                if (!sel) return;
                sel.addEventListener('change', async (e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    const newUrl = v === 'custom' ? (settingdata['ai-url-custom'] || '') : v;
                    // 更新 webview 或 iframe 的 src
                    const webview = root.querySelector('webview') as any | null;
                    if (webview) {
                        try {
                            if (typeof webview.loadURL === 'function') {
                                webview.loadURL(newUrl);
                            } else if (webview.setAttribute) {
                                webview.setAttribute('src', newUrl);
                            }
                        } catch (e) { /* ignore */ }
                    } else {
                        const iframe = root.querySelector('iframe') as HTMLIFrameElement | null;
                        if (iframe && iframe.setAttribute) iframe.setAttribute('src', newUrl);
                    }

                    // 更新内存中的设置并保存到文件（保持与设置面板一致）
                    try {
                        settingdata['ai-url'] = v;
                        // 若选择 custom，确保 ai-url 字段指向自定义值（已有设置会生效）
                        if (v === 'custom' && settingdata['ai-url-custom']) {
                            settingdata['ai-url'] = 'custom';
                        }
                        // 持久化到 steveTools.json（与设置面板保存同一路径）
                        // myfile 在 index.ts 中定义为 "steveTools.json"
                        await this.plugin.saveData('steveTools.json', settingdata);
                    } catch (err) {
                        console.error('保存 AI 地址设置失败', err);
                    }
                });
            } catch (err) {
                // 忽略 DOM 查找错误
                console.warn('绑定 AI 下拉事件失败', err);
            }
        }, 300);

        console.log("ai模块初始化完成");

    }
    updateSettings(settingdata: any) {
        try {
            const selKey = settingdata["ai-url"] || "";
            const newUrl = selKey === 'custom' ? (settingdata['ai-url-custom'] || '') : selKey;
            // 更新下拉显示（若存在）
            try {
                const root = document.querySelector('#ai-dock-container') as HTMLElement | null;
                if (root) {
                    const sel = root.querySelector('#ai-url-select') as HTMLSelectElement | null;
                    // 若用户在设置中修改了地址列表，需要重新渲染下拉 options
                    try {
                        const list = settingdata['ai-url-list'];
                        if (typeof list === 'string' && sel) {
                            // 重新生成 options
                            const parseAiList = (listStr: any) => {
                                const m: Record<string, string> = {};
                                try {
                                    if (typeof listStr === 'string' && listStr.trim()) {
                                        const lines = listStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                                        for (const line of lines) {
                                            const idx = line.indexOf('|');
                                            if (idx > -1) {
                                                const name = line.slice(0, idx).trim();
                                                const url = line.slice(idx + 1).trim();
                                                if (url) m[url] = name || url;
                                            } else {
                                                m[line] = line;
                                            }
                                        }
                                    }
                                } catch (e) { }
                                if (!m['custom']) m['custom'] = '自定义地址';
                                return m;
                            };
                            const opts = parseAiList(list);
                            sel.innerHTML = Object.keys(opts).map(k => `<option value="${k}">${opts[k]}</option>`).join('\n');
                        }
                    } catch (e) { /* ignore */ }

                    if (sel) {
                        sel.value = selKey;
                    }
                    // 若地址变化则更新 webview/iframe
                    if (newUrl && newUrl !== this.url) {
                        this.url = newUrl;
                        const webview = root.querySelector('webview') as any | null;
                        if (webview) {
                            try {
                                if (typeof webview.loadURL === 'function') {
                                    webview.loadURL(newUrl);
                                } else if (webview.setAttribute) {
                                    webview.setAttribute('src', newUrl);
                                }
                            } catch (e) { /* ignore */ }
                        } else {
                            const iframe = root.querySelector('iframe') as HTMLIFrameElement | null;
                            if (iframe && iframe.setAttribute) iframe.setAttribute('src', newUrl);
                        }
                    }
                }
            } catch (e) {
                // ignore DOM errors
            }
        } catch (err) {
            console.error('M_ai.updateSettings failed', err);
        }
    }
}

