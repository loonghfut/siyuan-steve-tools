import {
    Plugin,
    // showMessage,
    // confirm,
    // Dialog,
    // Menu,
    // openTab,
    // adaptHotkey,
    // getFrontend,
    // getBackend,
    // IModel,
    // Protyle,
    // openWindow,
    // IOperation,
    // Constants,
    // openMobileFileById,
    // lockScreen,
    // ICard,
    // ICardData,
    // fetchPost
} from "siyuan";
import "@/index.scss";
import { ModuleA } from "./libs/moduleA";
import { M_calendar } from "./calendar/module-calendar";
import { SettingUtils } from "./libs/setting-utils";
import * as api from "@/api"

let islog = true;
// import { SettingUtils } from "./libs/setting-utils";
// const STORAGE_NAME = "menu-config";
// const TAB_TYPE = "custom_tab";
// const DOCK_TYPE = "dock_tab";

export default class steveTools extends Plugin {
    private modules: any[];
    private loadModule(ModuleClass: any) {
        const moduleInstance = new ModuleClass(this);//解释：new ModuleClass(this)相当于new ModuleClass(steveTools)
        this.modules.push(moduleInstance);
    }
    private runloadModule(ctools) {
        if (ctools.includes("日程订阅")) {
            this.loadModule(M_calendar);
            console.log("日程订阅");
        }
    }
    // private isMobile: boolean;
    Tools_settingUtils: SettingUtils;
    // private settingUtils: SettingUtils;
    async onload() {
        this.modules = [];
        // 按需加载模块
        this.Tools_settingUtils = new SettingUtils({
            plugin: this, name: "steveTools"
        });

        this.Tools_settingUtils.addItem({
            key: "Stools",
            value: "",
            type: "textarea",
            title: "选择工具",
            description: "输入要设置的工具，多个工具用英文逗号分开(1.日程订阅)",
            action: {
                // Called when focus is lost and content changes
                callback: async () => {
                    let tool = await this.Tools_settingUtils.take("Stools");
                    console.log(tool);
                }
            }
        });
        await this.Tools_settingUtils.load();
        const c_tools = this.Tools_settingUtils.get("Stools")
        this.runloadModule(c_tools);

    }

    onLayoutReady () {


        this.modules.forEach(module => module.init());
    }

    async onunload() {
        // 卸载模块
        this.modules.forEach(module => module.onunload());
    }

    uninstall() {
        console.log("uninstall");
        this.modules.forEach(module => module.onunload());
    }
    outlog(mag: any) {
        if (islog) {
            console.log(mag);
            // console.trace(); // 输出堆栈跟踪
        }
    }
}
