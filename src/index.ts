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
    IModel,
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


// import { SettingUtils } from "./libs/setting-utils";
// const STORAGE_NAME = "menu-config";
// const TAB_TYPE = "custom_tab";
// const DOCK_TYPE = "dock_tab";

export default class PluginSample extends Plugin {

    customTab: () => IModel;
    // private isMobile: boolean;

    // private settingUtils: SettingUtils;
    async onload() {
       
    }

    onLayoutReady() {
       
    }

    async onunload() {
        
    }

    uninstall() {
        console.log("uninstall");
    }

    
}
