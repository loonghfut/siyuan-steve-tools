import steveTools from "@/index";
// import { IProtyle, showMessage } from "siyuan";
// import { runWpsScriptSync } from "./wps_api";
// import { appendBlock } from "@/api/api";
import { WpsPicServ } from "./wps_serv/wps_pic_serv";
import { WpsDataServ } from "./wps_serv/wps_data_serv";
import { WpsFileServ } from "./wps_serv/wps_file_serv";

// Wps 模块
export class M_Wps {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        console.log("Wps 模块初始化");
        if(settingdata["wps-pic-enable"]) {
            new WpsPicServ(this.plugin).init(settingdata);
        }
        if(settingdata["wps-data-enable"]) {
            new WpsDataServ(this.plugin).init(settingdata);
        }
        if(settingdata["wps-file-enable"]) {
            new WpsFileServ(this.plugin).init(settingdata);
        }
    }

    onunload() {
        console.log("M_Wps unloaded");
    }
}
