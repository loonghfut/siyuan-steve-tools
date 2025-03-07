import * as ic from "@/icon"
import { openTab, Plugin } from "siyuan";
import './handwriting.css';


export class M_handwriting {
    private plugin: Plugin;

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

    }

    async onLayoutReady(settingdata) {
        // 添加工具栏按钮
        // 添加命令
    }
}