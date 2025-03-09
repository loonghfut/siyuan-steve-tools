import * as ic from "@/icon"
import { openTab, Plugin } from "siyuan";
import './handwriting.css';
import { isDarkMode } from './utils/theme-utils';
import { Whiteboard } from './components/whiteboard';

export class M_handwriting {
    private plugin: Plugin;
    private whiteBoardTab;
    private isdark: boolean = false;
    private whiteboard: Whiteboard;
    
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
                this.openWhiteboard();
            }
        });
    }

    async onLayoutReady(settingdata) {
        this.isdark = isDarkMode();
        console.log('layout ready', this.isdark);
        
        // 监听主题变化
        window.addEventListener('themechange', () => {
            const newIsDark = isDarkMode();
            if (this.isdark !== newIsDark) {
                this.isdark = newIsDark;
                if (this.whiteboard) {
                    this.whiteboard.setDarkMode(this.isdark);
                }
            }
        });
    }

    private async openWhiteboard() {
        const id = new Date().getTime().toString();
        this.whiteBoardTab = await openTab({
            app: window.siyuan.ws.app,
            custom: {
                icon: "iconSTWhiteboard",
                title: `画板`,
                id: this.plugin.name + 'whiteboard-' + id,
            },
            keepCursor: false
        });
        
        this.whiteBoardTab.panelElement.innerHTML = `
            <div id="draw-container-${id}" style="width: 100%; height: 100%;"></div>
        `;
        
        const container = document.getElementById('draw-container-' + id);
        if (container) {
            // 初始化白板
            this.whiteboard = new Whiteboard('draw-container-' + id, this.isdark);
        }
    }

    async onunload() {
        // 清理白板实例
        if (this.whiteboard) {
            this.whiteboard.dispose();
        }
    }
}