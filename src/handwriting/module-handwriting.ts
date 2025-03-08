import * as ic from "@/icon"
import { Dialog, openTab, Plugin } from "siyuan";
import './handwriting.css';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

export class M_handwriting {
    private plugin: Plugin;
    private whiteBoardDialog;
    private root: ReactDOM.Root | null = null;
    private tldrawApp: any;
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
        // 布局准备完成后的初始化
    }

    private async openWhiteboard() {
        // 创建对话框
        const id = new Date().getTime().toString();
        this.whiteBoardDialog = await openTab({
            app: window.siyuan.ws.app,
            custom: {
                icon: "iconSTWhiteboard",
                title: `画板`,
                id: this.plugin.name + 'whiteboard-' + id, // 使用时间戳确保唯一性
            },
            // position: "right",
            keepCursor: false
        });
        this.whiteBoardDialog.panelElement.innerHTML = `
            <div id="tldraw-container-${id}" style="width: 100%; height: 100%;"></div>
        `;
        // 获取容器元素
        const container = document.querySelector('#tldraw-container-' + id);
        if (container) {
            // 使用React创建Tldraw组件
            this.root = ReactDOM.createRoot(container);
                       this.root.render(
                React.createElement(
                    React.StrictMode, 
                    null, 
                    React.createElement(Tldraw, {
                        // 添加TLDraw配置选项
                        darkMode: document.querySelector('html').getAttribute('data-theme') === 'dark',
                        showMenu: true,
                        showTools: true,
                        showUI: true,
                        autofocus: true,
                        onMount: (app) => {
                            // 保存应用实例以便后续操作
                            this.tldrawApp = app;
                        }
                    })
                )
            );
        }
    }

    async onunload() {
        // 卸载时的清理工作
        if (this.whiteBoardDialog) {
            this.whiteBoardDialog.destroy();
        }
        this.root?.unmount();
    }

    



}