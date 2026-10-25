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
  type TPluginDataChangeReason,
} from "siyuan";
import "@/index.scss";
import * as api from "@/api/api";
// import { ModuleA } from "./libs/moduleA";
import * as ic from "@/icon";
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
    const loadedModules = (window.__steveToolsLoadedModules =
      window.__steveToolsLoadedModules || {});
    if (loadedModules[moduleName]) {
      console.warn(`模块 ${moduleName} 已加载，跳过重复加载`);
      return;
    }

    const moduleInstance = new ModuleClass(this); //解释：new ModuleClass(this)相当于new ModuleClass(steveTools)
    moduleInstances[moduleName] = moduleInstance; // 同时存储到全局对象中

    // 标记该模块已加载
    loadedModules[moduleName] = true;
  }
  private runloadModule(data: any) {
    // 遍历模块配置，根据设置启用相应模块
    Object.keys(MODULE_CONFIG).forEach((moduleKey) => {
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
      },
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

  /**
   * 思源 3.8 起，插件若未覆盖 onDataChanged，自身存储被其它端改写时会被**整体卸载重载**
   * （思源 app/src/plugin/loader.ts 的 shouldReloadOnDataChange → app/src/plugin/lifecycle.ts 的 runDataChange）。
   * 本插件的设置会跨端保存（设置面板、memos/wucai/ai 同步都会写插件存储），
   * 整体重载会重建 dock 与浮动日历并清空内存态，因此这里只同步配置并推给支持热更新的模块。
   *
   * @param reason 数据变更来源：sync 为跨设备同步合并，overwrite 为其它前端实例写入
   */
  async onDataChanged(reason?: TPluginDataChangeReason) {
    try {
      console.debug(`STtools 插件配置被外部修改（${reason ?? "unknown"}），正在同步…`);
      const data = await this.loadData(myfile);
      if (data && typeof data === "object") {
        settingdata = { ...settingdata, ...data };
      }
      // 模块级配置（PluginConfig）同样存放在插件存储目录下，一并刷新。
      if (settingdata["PluginUsageStatistics"]) {
        await this.pluginConfig?.load?.();
      }
      // 推给支持热更新的模块，避免整体重载带来的状态丢失。
      moduleInstances["M_lifelog"]?.updateSettings?.(settingdata);
      moduleInstances["M_ai"]?.updateSettings?.(settingdata);
      moduleInstances["M_Minutiae"]?.updateSettings?.(settingdata, { skipBgRefresh: true });
      this.applyPageInvert();
    } catch (error) {
      console.warn("STtools 同步插件配置失败:", error);
    }
  }

  private async Stats() {
    try {
      const enabledFeatures = [""];
      if (settingdata["cal-enable"]) {
        enabledFeatures.push("calendar");
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
  // 设置
  openDIYSetting() {
    setdialog = new Dialog({
      title: "steveTools设置",
      content: `<div id="SettingPanel" style="height: 100%;"></div>`,
      width: "900px",
      destroyCallback: (options) => {
        console.debug("destroyCallback", options);
        //You'd better destroy the component when the dialog is closed
        pannel.$destroy();
      },
    });
    let pannel = new SettingExample({
      target: setdialog.element.querySelector("#SettingPanel"),
      props: {
        plugin: this,
        myfile: myfile,
      },
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
