import steveTools from "@/index";
import * as ic from "@/icon";
import { createIframeDock } from "@/api/api2";
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
        
        // 使用封装的API创建dock
        createIframeDock({
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
            pointerEventsDelay: 300
        });

        console.log("ai模块初始化完成");

    }
}

