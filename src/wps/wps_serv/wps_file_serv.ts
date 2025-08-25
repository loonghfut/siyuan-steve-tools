import { appendBlock, generateSiyuanID, updateBlock } from "@/api/api";
import steveTools from "@/index";
import { showMessage } from "siyuan";
import { ChangeLinkStyle, extractIframeBlockInfo, ShowLinkContent } from "../wps_api";
import { createWebviewDock_for_wps, getCursorBlockId, } from "@/api/api2";
import { generateLinkCard } from "@/api/api3";
import * as ic from "@/icon"
declare global {
    interface Window {
        wps?: any;
    }
}

export class WpsFileServ {
    private settingdata: any;
    private plugin: steveTools;
    // private protyle: IProtyle;
    private cursorID: string;
    private cursorID_b: string;

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;

        this.plugin.addIcons(`
                <symbol id="iconSTwps" viewBox="0 0 32 32">
                   ${ic.steveTools_wps}
                </symbol>
            `)


        // 初始化全局函数
        window.wps = {
            ChangeLinkStyle,
            ShowLinkContent,
        };


        const handleWpsFileInsert = async (e: { webview: any; getCurrentUrl: () => string }) => {
            // 后续在这里扩展插入逻辑，webview 可用于与 iframe 通信
            const blockId = await generateSiyuanID() as string;
            const fileurl = e.getCurrentUrl();
            const cardHtml = await generateLinkCard(fileurl, [{
                id: 'change',
                title: '转换',
                text: '★',
                onClick: `window.wps.ChangeLinkStyle('${fileurl}', '${blockId}');`
            },
            {
                id: 'show',
                title: '预览',
                text: '🔍',
                onClick: `window.wps.ShowLinkContent('${fileurl}');`
            }
            ]);
            appendBlock("markdown",
                `<div>${cardHtml}</div>
{: id="${blockId}"  custom-st-wps="1"}`
                , this.cursorID);
            // appendBlock("markdown", `<iframe src="${fileurl}" width="600" height="400"></iframe>`, this.cursorID);
            showMessage('插入完成', 1000, 'info');
        };

        createWebviewDock_for_wps({
            plugin: this.plugin,
            config: {
                position: "RightTop",
                size: { width: 500, height: 0 },
                icon: "iconSTwps",
                title: "WPS文件",
            },
            buttons: [
                { id: 'copy', text: '复制', builtInAction: 'copy', order: 0 },
                { id: 'refresh', text: '刷新', builtInAction: 'refresh', order: 1 },
                // { id: 'dev', text: '调试', builtInAction: 'dev', order: 2, show: process.env.NODE_ENV !== 'production' },
                { id: 'custom', text: '插入', order: 3, onClick: handleWpsFileInsert }
            ],
            type: "wps-file-dock",
            url: this.settingdata["wps-file-weburl"],
            emptyUrlMessage: "请先配置网址...",
            containerClass: "wps-file-dock-container",
            iframeStyle: "height: 99vh ; width: 100%;  pointer-events: auto;",
            pointerEventsDelay: 300,
            zoom: 1,
        });

        // this.plugin.eventBus.on("open-menu-link", this.blockIconEvent.bind(this));
        this.plugin.eventBus.on("click-blockicon", this.blockIconEvent.bind(this));
        this.plugin.eventBus.on("click-editorcontent", this.handleSelectionChange.bind(this));
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.cursorID_b = event.detail.protyle.block.id;
            this.cursorID = this.cursorID_b;
            // console.log("switch-image-protyle");
        });
    }

    // async openMenuLink({ detail }: any) {
    //     console.log("WPS File Menu Link Opened:", detail);
    // }

    async blockIconEvent({ detail }: any) {
        console.log("WPS File Block Icon Clicked:", detail);
        const blockEl: HTMLElement | undefined = detail.blockElements?.[0];
        console.log("WPS File Block Icon Clicked:", blockEl);
        if (!blockEl) return;

        // 若是已生成的自定义 WPS 链接卡片（html 块）=> 提供“转换为链接”
        if (blockEl.getAttribute("custom-st-wps") === "1") {
            detail.menu.addItem({
                iconHTML: "",
                label: "转换为链接",
                click: async () => {
                    try {
                        // 解析 data-content 中的原始卡片 HTML，提取链接与标题
                        const protyleHtml = blockEl.querySelector('protyle-html');
                        const dataContent = protyleHtml?.getAttribute('data-content') || '';
                        const decoded = dataContent
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&amp;/g, '&')
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'");
                        const match = decoded.match(/<a[^>]+?(?:data-link|href)="([^"]+)"/i);
                        const url = match?.[1];
                        if (!url) {
                            showMessage('未能解析链接', 2000, 'error');
                            return;
                        }
                        // 尝试解析标题
                        let title = '';
                        try {
                            const tmp = document.createElement('div');
                            tmp.innerHTML = decoded;
                            // flex 容器内的第一个 div 即标题（结构参考 generateLinkCard 输出）
                            const titleEl = tmp.querySelector('.link-card-inner > div[style*="flex:1"] > div:first-child');
                            title = titleEl?.textContent?.trim() || '';
                        } catch { /* ignore */ }
                        if (!title) title = url;
                        // 转义 markdown 中的特殊字符
                        const esc = (s: string) => s.replace(/([\\`*_{}\[\]()#+\-.!])/g, '\\$1');
                        const md = `[${esc(title)}](${url.replace(/\)/g, '%29')})`;
                        const id = blockEl.getAttribute('data-node-id') as string;
                        await updateBlock("markdown", md, id);
                        showMessage('已还原为链接', 1500, 'info');
                    } catch (e) {
                        console.error(e);
                        showMessage('转换失败', 2000, 'error');
                    }
                }
            });
            return; // 不再继续处理 iframe -> 卡片 的逻辑
        }

        // 否则尝试识别 iframe 块并提供“转换为卡片”
        const info = extractIframeBlockInfo(blockEl);
        if (!info) {
            return;
        }
        detail.menu.addItem({
            iconHTML: "",
            label: "转换为卡片",
            click: async () => {
                console.log('WPS IFrame Block Info:', info);
                const cardHtml = await generateLinkCard(info.url, [{
                    id: 'change',
                    title: '转换',
                    text: '★',
                    onClick: `window.wps.ChangeLinkStyle('${info.url}', '${info.id}');`
                },
                {
                    id: 'show',
                    title: '预览',
                    text: '🔍',
                    onClick: `window.wps.ShowLinkContent('${info.url}');`
                }
                ]);
                updateBlock("markdown",
                    `<div>${cardHtml}</div>
{: id="${info.id}"  custom-st-wps="1"}`, info.id);
            }
        });
    }



    async handleSelectionChange() {
        const blockId = getCursorBlockId();
        if (blockId) {
            this.cursorID = blockId;
        }
    }

}
