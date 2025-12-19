import steveTools from "@/index";
import * as ic from "@/icon";
import { createWebviewDock_for_wps } from "@/api/api2";
import { 
    getAiUrlOptionsMap, 
    generateSelectOptionsHtml, 
    getActualUrl, 
    updateWebviewUrl 
} from "./ai-utils";
declare const siyuan: any;

export class M_ai {
    private plugin: steveTools;
    private dockContainerId = 'ai-dock-container';
    private selectId = 'ai-url-select';
    
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
        
        // 获取当前 URL
        const urlType = settingdata["ai-url-type"] || "https://www.doubao.com/chat/";
        this.url = getActualUrl(urlType, settingdata["ai-url-custom"]);

        // 生成下拉选项
        const aiOptions = getAiUrlOptionsMap(settingdata['ai-url-list'], true);
        const optionsHtml = generateSelectOptionsHtml(aiOptions, urlType);
        const selectHtml = `<select id="${this.selectId}" style="padding:6px 8px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);font-size:12px;background:#fff;color:#222;">${optionsHtml}</select>`;

        // 创建 webview dock
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
            containerClass: this.dockContainerId,
            iframeStyle: "height: 99vh; width: 100%; pointer-events: auto;",
            pointerEventsDelay: 300,
            enableButtons: true,
            injectCSS: `#${this.dockContainerId}-btns { left: auto !important; right: 8px !important; transform: none !important; } #${this.dockContainerId}-btns select { min-width: 140px; }`,
            buttons: [
                {
                    id: 'aiSelect',
                    text: selectHtml,
                    title: '切换 AI 地址',
                    style: 'padding: 4px; background: transparent; border: none;'
                    
                }
            ],
            initRun: () => {
                this.bindSelectChangeEvent(settingdata);
            }
        });

        // 绑定下拉切换事件
        

        console.log("ai模块初始化完成");

    }
    updateSettings(settingdata: any) {
        try {
            const urlType = settingdata["ai-url-type"] || "";
            const newUrl = getActualUrl(urlType, settingdata['ai-url-custom']);
            const root = this.getDockContainer();
            
            if (!root) return;

            // 更新下拉选项和选中值
            this.updateSelectOptions(root, settingdata['ai-url-list'], urlType);
            
            // 更新 URL（如果变化）
            if (newUrl && newUrl !== this.url) {
                this.url = newUrl;
                updateWebviewUrl(root, newUrl);
            }
        } catch (err) {
            console.error('M_ai.updateSettings failed', err);
        }
    }

    /**
     * 获取 dock 容器
     */
    private getDockContainer(): HTMLElement | null {
        return document.querySelector(`#${this.dockContainerId}`) as HTMLElement | null;
    }

    /**
     * 更新下拉选项
     */
    private updateSelectOptions(root: HTMLElement, urlList: string, selectedValue: string) {
        const sel = root.querySelector(`#${this.selectId}`) as HTMLSelectElement | null;
        if (!sel) return;

        try {
            // 重新生成 options
            const options = getAiUrlOptionsMap(urlList, true);
            sel.innerHTML = generateSelectOptionsHtml(options, selectedValue);
            sel.value = selectedValue;
        } catch (e) {
            console.warn('更新下拉选项失败', e);
        }
    }

    /**
     * 绑定下拉切换事件
     */
    private bindSelectChangeEvent(settingdata: any) {
        setTimeout(() => {
            try {
                const root = this.getDockContainer();
                if (!root) return;
                
                const sel = root.querySelector(`#${this.selectId}`) as HTMLSelectElement | null;
                if (!sel) return;

                sel.addEventListener('change', async (e) => {
                    const urlType = (e.target as HTMLSelectElement).value;
                    const newUrl = getActualUrl(urlType, settingdata['ai-url-custom']);
                    
                    // 更新 webview/iframe
                    updateWebviewUrl(root, newUrl);
                    this.url = newUrl;

                    // 保存设置
                    try {
                        settingdata['ai-url-type'] = urlType;
                        await this.plugin.saveData('steveTools.json', settingdata);
                    } catch (err) {
                        console.error('保存 AI 地址设置失败', err);
                    }
                });
            } catch (err) {
                console.warn('绑定 AI 下拉事件失败', err);
            }
        }, 300);
    }
}

