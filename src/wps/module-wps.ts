import steveTools from "@/index";
import { showMessage } from "siyuan";

// Wps 模块
export class M_Wps {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        // 在这里编写初始化逻辑, 可使用 settingdata 访问设置项
        console.log("Wps 模块初始化");
        // 示例: 根据设置添加一个顶部按钮
        this.plugin.addTopBar({
          icon: "iconInfo",
          title: "Wps",
          position: "left",
          callback: () => { 
            showMessage("WPS插件已启用");
            console.log("Wps clicked"); }
        });
    }

    onunload() {
        console.log("M_Wps unloaded");
    }
}
