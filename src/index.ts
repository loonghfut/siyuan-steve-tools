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
// import { ModuleA } from "./libs/moduleA";
import { M_calendar } from "./calendar/module-calendar";
// import * as api from "@/api"
import SettingExample from "@/setting-example.svelte";



let islog = true;
const myfile = "steveTools.json";
let settingdata: any = {};
let setdialog: any;

export default class steveTools extends Plugin {
    private modules: any[];
    private loadModule(ModuleClass: any) {
        const moduleInstance = new ModuleClass(this);//解释：new ModuleClass(this)相当于new ModuleClass(steveTools)
        this.modules.push(moduleInstance);
    }
    private runloadModule(data: any) {
        if (data["cal-enable"] == true) {
            this.loadModule(M_calendar);
            console.log("日历模块加载");
        }
    }
    // private isMobile: boolean;
    // private settingUtils: SettingUtils;
    async onload() {
        this.modules = [];
        this.addTopBar({
            icon: "iconSettings",
            title: "SteveTools",
            position: "right",
            callback: () => {
                this.openDIYSetting();
            }
        });
        settingdata = await this.loadData(myfile);
        this.runloadModule(settingdata);

    }

    async onLayoutReady() {


        for (const module of this.modules) {
            await module.init(settingdata);
        }
    }

    async onunload() {
        // 卸载模块
        this.modules.forEach(module => module.onunload());
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
        this.modules.forEach(module => module.onunload());
    }
    outlog(mag: any) {
        if (islog) {
            console.log(mag);
            // console.trace(); // 输出堆栈跟踪
        }
    }
}
