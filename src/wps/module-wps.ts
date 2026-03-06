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
    private settingdata: any;
    private wpsPicServ?: WpsPicServ;
    private wpsDataServ?: WpsDataServ;
    private wpsFileServ?: WpsFileServ;

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;
        console.debug("Wps 模块初始化");
        if (this.settingdata["wps-pic-enable"]) {
            this.wpsPicServ = new WpsPicServ(this.plugin);
            this.wpsPicServ.init(settingdata);
        }
        if (this.settingdata["wps-data-enable"]) {
            this.wpsDataServ = new WpsDataServ(this.plugin);
            this.wpsDataServ.init(settingdata);
        }
        if (this.settingdata["wps-file-enable"]) {
            this.wpsFileServ = new WpsFileServ(this.plugin);
            this.wpsFileServ.init(settingdata);
        }
    }

    async onLayoutReady() {
        // console.debug("Wps onLayoutReady");
        if (this.settingdata["wps-pic-enable"]) {
            (this.wpsPicServ as any)?.onLayoutReady?.();
        }
        if (this.settingdata["wps-data-enable"]) {
            (this.wpsDataServ as any)?.onLayoutReady?.();
        }
        if (this.settingdata["wps-file-enable"]) {
            (this.wpsFileServ as any)?.onLayoutReady?.();
        }

    }

    onunload() {
        try {
            this.wpsPicServ?.destroy?.();
        } catch (error) {
            console.error("卸载 WpsPicServ 失败", error);
        }
        try {
            this.wpsDataServ?.destroy?.();
        } catch (error) {
            console.error("卸载 WpsDataServ 失败", error);
        }
        try {
            this.wpsFileServ?.destroy?.();
        } catch (error) {
            console.error("卸载 WpsFileServ 失败", error);
        }
        console.debug("M_Wps unloaded");
    }
}
