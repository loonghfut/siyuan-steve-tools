import { appendBlock } from "@/api/api";
import steveTools from "@/index";
import { IProtyle, showMessage } from "siyuan";
import { runWpsScriptSync } from "../wps_api";
import { createWebviewDock_for_wps, } from "@/api/api2";


export class WpsFileServ {
    private settingdata: any;
    private plugin: steveTools;
    private protyle: IProtyle;

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;
        // console.log("WpsPicServ initialized with settings:", this.settingdata);
        // this.plugin.eventBus.on("switch-protyle", (e) => {
        //     this.protyle = e.detail.protyle;
        // });
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
                { id: 'dev', text: '调试', builtInAction: 'dev', order: 2, show: process.env.NODE_ENV !== 'production' },
                { id: 'custom', text: '自定义', order: 3, onClick: ({ webview }) => showMessage('自定义完成', 1000, 'info') }
            ],
            type: "wps-file-dock",
            url: this.settingdata["wps-file-weburl"],
            emptyUrlMessage: "请先配置网址...",
            containerClass: "wps-file-dock-container",
            iframeStyle: "height: 99vh ; width: 100%;  pointer-events: auto;",
            pointerEventsDelay: 300,
            zoom: 1,
        });

        // this.plugin.addTopBar({
        //     icon: "iconInfo",
        //     title: "WPS数据处理",
        //     position: "right",
        //     callback: async () => {

        //     }
        // });
    }


}
