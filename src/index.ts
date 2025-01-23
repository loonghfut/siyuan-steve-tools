import {
    Plugin,
    // showMessage,
    // confirm,
    Dialog,
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
import * as api from "@/api";
// import { ModuleA } from "./libs/moduleA";
import * as ic from "@/icon"
import { M_calendar } from "./calendar/module-calendar";
import { M_sync } from "./sync/module-sync";
import { M_ai  } from "./ai/ai";
// import * as api from "@/api"
import SettingExample from "@/setting-example.svelte";



let islog = true;
const myfile = "steveTools.json";
export let settingdata: any = {};
let setdialog: any;
export let moduleInstances: { [key: string]: any } = {};

export default class steveTools extends Plugin {
    // private modules: any[];
    private loadModule(ModuleClass: any, moduleName: string) {
        const moduleInstance = new ModuleClass(this);//解释：new ModuleClass(this)相当于new ModuleClass(steveTools)
        moduleInstances[moduleName] = moduleInstance; // 同时存储到全局对象中
    }
    private runloadModule(data: any) {
        if (data["cal-enable"] == true) {
            this.loadModule(M_calendar, 'M_calendar');
            console.log("日历模块加载");
        }
        if (data["sync-enable"] == true) {
            this.loadModule(M_sync, 'M_sync');
            console.log("同步模块加载");
        }
        if (data["ai-enable"] == true) {
            this.loadModule(M_ai, 'M_ai');
            console.log("ai模块加载");
        //    initdock();
        }

    }

    // private isMobile: boolean;
    // private settingUtils: SettingUtils;
    async onload() {
        this.addIcons(`
    <symbol id="iconST" viewBox="0 0 512 512">
       ${ic.steveTools_icon}
    </symbol>  
        `);
        
        this.addTopBar({
            icon: "iconST",
            title: "SteveTools",
            position: "left",
            callback: () => {
                this.openDIYSetting();
            }
        });
        settingdata = await this.loadData(myfile);
        this.runloadModule(settingdata);
        for (const moduleName in moduleInstances) {
            steveTools.outlog("init--"+moduleName);
            await moduleInstances[moduleName].init(settingdata);
        }

    }

    async onLayoutReady() {
        for (const moduleName in moduleInstances) {
            steveTools.outlog("onLayoutReady--"+moduleName);
            await moduleInstances[moduleName]?.onLayoutReady?.();
        }
    }
    async onunload() {
        // 卸载模块
        api.refresh();
        // this.modules.forEach(module => module.onunload());
    }

    openDIYSetting() {
        setdialog = new Dialog({
            title: "steveTools设置",
            content: `<div id="SettingPanel" style="height: 100%;"></div>`,
            width: "800px",
            destroyCallback: (options) => {
                console.log("destroyCallback", options);
                //You'd better destroy the component when the dialog is closed
                pannel.$destroy();
            }
        });
        let pannel = new SettingExample({
            target: setdialog.element.querySelector("#SettingPanel"),
            props: {
                plugin: this,
                myfile: myfile,
                setdialog: setdialog,
            }
        });
    }

    uninstall() {
        console.log("uninstall");
        for (const moduleName in moduleInstances) {
            moduleInstances[moduleName]?.onunload?.();
        }
    }
    static outlog(mag: any, mag2?: any, mag3?: any, mag4?: any, mag5?: any) {
        if (islog) {
            console.log(mag, mag2, mag3, mag4, mag5);
            console.trace(); // 输出堆栈跟踪
        }
    }
}
