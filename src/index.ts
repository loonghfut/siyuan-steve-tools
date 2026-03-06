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
import * as api from "@/api/api";
// import { ModuleA } from "./libs/moduleA";
import * as ic from "@/icon"
import { MODULE_CONFIG, ModuleClasses } from "./modules.config";
import { check, stopCheck, trackFeatureUsage } from "./stats/public-stats";

// import * as api from "@/api"
import SettingExample from "@/setting.svelte";
import { PluginConfig } from "./savedata";

declare global {
    interface Window {
        __steveToolsLoadedModules?: Record<string, boolean>;
    }
}

export let frontEnd;

// let islog = false;
const myfile = "steveTools.json";
export let settingdata: any = {};
let setdialog: any;
export let moduleInstances: ModuleClasses = {};

export default class steveTools extends Plugin {
    private pluginConfig: PluginConfig;
    // private modules: any[];
    private loadModule(ModuleClass: any, moduleName: string) {
        // 检查模块是否已加载，防止重复加载
        const loadedModules = window.__steveToolsLoadedModules = window.__steveToolsLoadedModules || {};
        if (loadedModules[moduleName]) {
            console.warn(`模块 ${moduleName} 已加载，跳过重复加载`);
            return;
        }
        
        const moduleInstance = new ModuleClass(this);//解释：new ModuleClass(this)相当于new ModuleClass(steveTools)
        moduleInstances[moduleName] = moduleInstance; // 同时存储到全局对象中
        
        // 标记该模块已加载
        loadedModules[moduleName] = true;
    }
    private runloadModule(data: any) {
        // 遍历模块配置，根据设置启用相应模块
        Object.keys(MODULE_CONFIG).forEach(moduleKey => {
            const moduleConfig = MODULE_CONFIG[moduleKey];
            if (data[moduleConfig.settingKey] === true) {
                this.loadModule(moduleConfig.class, moduleConfig.name);
                console.debug(moduleConfig.logMessage);
            }
        });
    }

    // private isMobile: boolean;
    // private settingUtils: SettingUtils;
    async onload() {
        this.pluginConfig = new PluginConfig(this.name, "M_steveTools");
        frontEnd = window.siyuan.config.system.os;
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
                // await this.vip();
                this.openDIYSetting();
            }
        });
        settingdata = await this.loadData(myfile);
        this.runloadModule(settingdata);
        for (const moduleName in moduleInstances) {
            await moduleInstances[moduleName]?.init?.(settingdata);
        }
    // 应用页面反色设置
    this.applyPageInvert();
    }

    async onLayoutReady() {
        for (const moduleName in moduleInstances) {
            // steveTools.outlog("onLayoutReady--" + moduleName);
            await moduleInstances[moduleName]?.onLayoutReady?.();
        }

        if (settingdata["PluginUsageStatistics"]) {
            await this.pluginConfig.load();
            await this.Stats();
        }

        check();
    }

    private async Stats() {
        try {
            const enabledFeatures = [""];
            if (settingdata["cal-enable"]) {
                enabledFeatures.push("calendar");
            }
            if (settingdata["handwriting-enable"]) {
                enabledFeatures.push("handwriting");
            }
            if (settingdata["ai-enable"]) {
                enabledFeatures.push("ai");
            }
            if (settingdata["sync-enable"]) {
                enabledFeatures.push("sync");
            }
            if (settingdata["img-compress-enable"]) {
                enabledFeatures.push("image");
            }
            if (settingdata["lifelog-enable"]) {
                enabledFeatures.push("lifelog");
            }
            if (settingdata["cal-dida-enable"]) {
                enabledFeatures.push("dida");
            }
            if (settingdata["cal-ics-enable-subscribe"]) {
                enabledFeatures.push("ics");
            }
            if (settingdata["cal-qq-enable"]) {
                enabledFeatures.push("qq");
            }
            if (settingdata["wps-pic-enable"]) {
                enabledFeatures.push("wps-pic");
            }
            if (settingdata["wps-file-enable"]) {
                enabledFeatures.push("wps-file");
            }
            if (settingdata["wps-data-enable"]) {
                enabledFeatures.push("wps-data");
            }
            if (settingdata["aggregate-enable"]) {
                enabledFeatures.push("aggregate");
            }
            const mergedFeatures = enabledFeatures.join("+");
            console.debug("功能:", mergedFeatures);
            await trackFeatureUsage(this.pluginConfig, mergedFeatures);
        } catch (error) {
            console.warn("统计失败:", error);
        }

    }
    async onunload() {
        // 卸载模块
        for (const moduleName in moduleInstances) {
            try {
                await moduleInstances[moduleName]?.onunload?.();
            } catch (error) {
                console.error(`卸载模块 ${moduleName} 失败`, error);
            }
            delete moduleInstances[moduleName];
        }
        if (window.__steveToolsLoadedModules) {
            window.__steveToolsLoadedModules = {};
        }
        stopCheck();
        api.refresh();
        // this.modules.forEach(module => module.onunload());
    document.body.classList.remove("st-invert-mode");
    }

    async vip() {
        //椒盐会员模式
    }



    openDIYSetting() {
        setdialog = new Dialog({
            title: "steveTools设置",
            content: `<div id="SettingPanel" style="height: 100%;"></div>`,
            width: "900px",
            destroyCallback: (options) => {
                console.debug("destroyCallback", options);
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
        console.debug("uninstall");
        for (const moduleName in moduleInstances) {
            moduleInstances[moduleName]?.onunload?.();
        }
    }
    private applyPageInvert() {
        if (settingdata && settingdata["invert-page-enable"]) {
            document.body.classList.add("st-invert-mode");
        } else {
            document.body.classList.remove("st-invert-mode");
        }
    }
    // static outlog(mag: any, mag2?: any, mag3?: any, mag4?: any, mag5?: any) {

    // }
}
