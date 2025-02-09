// src/handwriting/module-handwriting.ts

import { Plugin } from "siyuan";

export class M_handwriting {
    private plugin: Plugin;
    private canvas: HTMLCanvasElement | null = null;
    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async onLayoutReady(settingdata: any) {
        console.log("init handwriting module");

    }

    
}