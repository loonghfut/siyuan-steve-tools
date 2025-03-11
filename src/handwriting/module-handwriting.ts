import * as ic from "@/icon"
import { openTab, Plugin } from "siyuan";
import './handwriting.css';
import { isDarkMode } from './utils/theme-utils';

export class M_handwriting {
    private plugin: Plugin;
    private whiteBoardTab;
    private isdark: boolean = false;
    
    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async init(settingdata) {
        // 添加图标
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 500 500">
               ${ic.steveTools_whiteboard}
            </symbol>  
        `);

        // 添加顶栏按钮
        this.plugin.addTopBar({
            icon: "iconSTWhiteboard",
            title: "画板",
            position: "right",
            callback: () => {

            }
        });
    }

    async onLayoutReady(settingdata) {
        this.isdark = isDarkMode();
        console.log('layout ready', this.isdark);

    }

    async onunload() {
        // 清理白板实例

    }
}