import { appendBlock } from "@/api/api";
import steveTools from "@/index";
import { IProtyle, showMessage } from "siyuan";
import { runWpsScriptSync } from "../wps_api";
import { createWebviewDock_for_wps, } from "@/api/api2";
import { generateLinkCard } from "@/api/api3";
import * as ic from "@/icon"

export class WpsDataServ {
    private settingdata: any;
    private plugin: steveTools;
    private protyle: IProtyle;
    private topBarButton

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;
        this.plugin.addIcons(`
            <symbol id="iconSTwps_data" viewBox="0 0 16 16">
                ${ic.steveTools_wps_data}
            </symbol>
            <symbol id="iconSTwps_data2" viewBox="0 0 55 55">
                ${ic.steveTools_wps_data2}
            </symbol>
            `);
        this.topBarButton = this.plugin.addTopBar({
            icon: "iconSTwps_data2",
            title: "导入WPS数据", 
            position: "right",
            callback: async () => {
                console.log("导入WPS数据");
                this.updateTopBarIcon("iconSTwps_data");
            }
        });

    }

    private updateTopBarIcon(iconName: string) {
        if (this.topBarButton) {
            const svgUse = this.topBarButton.querySelector('svg use');
            if (svgUse) {
                svgUse.setAttribute('xlink:href', `#${iconName}`);
            }
        }
    }

}
