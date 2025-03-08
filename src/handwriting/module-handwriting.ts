import * as ic from "@/icon"
import { openTab, Plugin } from "siyuan";
import './handwriting.css';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { TldrawBoard } from './components/TldrawBoard';
import { isDarkMode } from './utils/theme-utils';

export class M_handwriting {
    private plugin: Plugin;
    private whiteBoardTab;
    private root: ReactDOM.Root | null = null;
    private tldrawApp: any;
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
                this.openWhiteboard();
            }
        });
    }

    async onLayoutReady(settingdata) {
        this.isdark = isDarkMode();
        console.log('layout ready', this.isdark);
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
            <div id="tldraw-container-${id}" style="width: 100%; height: 100%;"></div>
        `;
        
        const container = document.querySelector('#tldraw-container-' + id);
        if (container) {
            this.root = ReactDOM.createRoot(container);
            this.root.render(
                React.createElement(
                    TldrawBoard, {
                    darkMode: this.isdark,
                    onMount: (app) => {
                        this.tldrawApp = app;
                    }
                })
            );
        }
    }

    async onunload() {
        // 清理资源
        if (this.root) {
            this.root.unmount();
        }
    }
}