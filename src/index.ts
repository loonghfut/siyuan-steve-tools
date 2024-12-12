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
import { M_calendar } from "./libs/module-calendar";

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
    // private isMobile: boolean;

    // private settingUtils: SettingUtils;
    async onload() {
        this.modules = [];
        // 按需加载模块
        this.loadModule(ModuleA);
        this.loadModule(M_calendar);//日历模块
    }

    onLayoutReady() {
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
