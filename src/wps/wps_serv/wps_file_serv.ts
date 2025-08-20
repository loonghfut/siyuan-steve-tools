import { appendBlock, generateSiyuanID, updateBlock } from "@/api/api";
import steveTools from "@/index";
import { IProtyle, showMessage } from "siyuan";
import { ChangeLinkStyle, extractIframeBlockInfo, runWpsScriptSync } from "../wps_api";
import { createWebviewDock_for_wps, getCursorBlockId, } from "@/api/api2";
import { generateLinkCard } from "@/api/api3";

declare global {
    interface Window {
        wps?: any;
    }
}

export class WpsFileServ {
    private settingdata: any;
    private plugin: steveTools;
    // private protyle: IProtyle;
    private now_protyle: IProtyle;
    private cursorID: string;
    private cursorID_b: string;

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;
        // 初始化全局函数
        window.wps = {
            ChangeLinkStyle,
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
                icon: "iconInfo",
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

        this.plugin.eventBus.on("click-blockicon", this.blockIconEvent.bind(this));
        this.plugin.eventBus.on("click-editorcontent", this.handleSelectionChange.bind(this));
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.now_protyle = event.detail.protyle;
            this.cursorID_b = event.detail.protyle.block.id;
            this.cursorID = this.cursorID_b;
            console.log("switch-image-protyle");
        });
    }

    async blockIconEvent({ detail }: any) {
        const info = extractIframeBlockInfo(detail.blockElements?.[0]);
        if (!info) {
            // showMessage('未识别到可转换的 iframe 块', 2000, 'error');
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
