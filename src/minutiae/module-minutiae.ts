import steveTools from "@/index";
import { headImg } from "./minutiae/head_img";

// Minutiae 模块
export class M_Minutiae {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        console.log("Minutiae 模块初始化");
        if (settingdata["minutiae-headimg-enable"]) {
            const headImgServ = new headImg(this.plugin, settingdata);
            headImgServ.init();
        }

    }

    onunload() {
        console.log("M_Minutiae unloaded");
    }
}
