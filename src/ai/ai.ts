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
            enableButtons: false // AI 面板暂不需要顶部按钮
        });

        console.log("ai模块初始化完成");

    }
}

