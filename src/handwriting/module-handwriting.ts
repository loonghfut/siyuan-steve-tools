// src/handwriting/module-handwriting.ts
import * as ic from "@/icon"
import { Plugin } from "siyuan";
import * as fabric from 'fabric';
import './handwriting.css';

export class M_handwriting {
    private plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }
    async init(settingdata) {
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 500 500">
               ${ic.steveTools_whiteboard}
            </symbol>  
                `);
    }

    async onLayoutReady() {

    }

}