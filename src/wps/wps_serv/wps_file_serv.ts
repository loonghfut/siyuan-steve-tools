import { appendBlock } from "@/api/api";
import steveTools from "@/index";
import { IProtyle, showMessage } from "siyuan";
import { runWpsScriptSync } from "../wps_api";
import { createWebviewDock_for_wps, getCursorBlockId, } from "@/api/api2";


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
        // console.log("WpsPicServ initialized with settings:", this.settingdata);
        // this.plugin.eventBus.on("switch-protyle", (e) => {
        //     this.protyle = e.detail.protyle;
        // });
        const handleWpsFileInsert = (e: { webview: any; getCurrentUrl: () => string }) => {
            // 后续在这里扩展插入逻辑，webview 可用于与 iframe 通信
            const fileurl = e.getCurrentUrl();
            appendBlock("markdown", `<iframe src="${fileurl}" width="600" height="400"></iframe>`, this.cursorID);
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

        this.plugin.eventBus.on("click-editorcontent", this.handleSelectionChange.bind(this));
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.now_protyle = event.detail.protyle;
            this.cursorID_b = event.detail.protyle.block.id;
            this.cursorID = this.cursorID_b;
            console.log("switch-image-protyle");
        });
    }

    async handleSelectionChange() {
        const blockId = getCursorBlockId();
        if (blockId) {
            this.cursorID = blockId;
        }
    }

}
