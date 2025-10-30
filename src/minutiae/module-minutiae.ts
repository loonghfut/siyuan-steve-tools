import steveTools from "@/index";
import { headImg } from "./minutiae/head_img";
import { backgroundImg } from "./minutiae/background_img";

// Minutiae 模块
export class M_Minutiae {
    private plugin: steveTools;
    private headImgServ?: headImg;
    private backgroundServ?: backgroundImg;
    private settingdata: any;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        console.log("Minutiae 模块初始化");
        this.settingdata = settingdata;
        await this.ensureHeadImgService();
        await this.ensureBackgroundService();

    }

    updateSettings(settingdata: any, options?: { skipBgRefresh?: boolean }) {
        this.settingdata = settingdata;
        void this.ensureHeadImgService();
        void this.ensureBackgroundService(options);
    }

    onunload() {
        console.log("M_Minutiae unloaded");
        this.headImgServ?.destroy();
        this.headImgServ = undefined;
        this.backgroundServ?.destroy();
        this.backgroundServ = undefined;
    }

    private async ensureHeadImgService() {
        const enabled = !!this.settingdata?.["minutiae-headimg-enable"];
        if (enabled) {
            if (!this.headImgServ) {
                this.headImgServ = new headImg(this.plugin, this.settingdata);
                await this.headImgServ.init();
            } else {
                this.headImgServ.updateSettingData(this.settingdata);
            }
        } else if (this.headImgServ) {
            this.headImgServ.destroy();
            this.headImgServ = undefined;
        }
    }

    private async ensureBackgroundService(options?: { skipBgRefresh?: boolean }) {
        const enabled = !!this.settingdata?.["minutiae-bg-enable"];
        if (enabled) {
            if (!this.backgroundServ) {
                this.backgroundServ = new backgroundImg(this.plugin, this.settingdata);
                await this.backgroundServ.init();
            } else {
                this.backgroundServ.updateSettingData(this.settingdata, options);
            }
        } else if (this.backgroundServ) {
            this.backgroundServ.destroy();
            this.backgroundServ = undefined;
        }
    }
}
