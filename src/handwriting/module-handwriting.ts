import * as ic from "@/icon"
import { Dialog, openTab, Plugin } from "siyuan";
import './handwriting.css';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

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
        // 检查是否为dark模式
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
        console.log(document.querySelector('html').getAttribute('data-theme-mode'));
        this.isdark = document.querySelector('html').getAttribute('data-theme-mode') === 'dark';
        // 布局准备完成后的初始化
        console.log('layout ready',this.isdark);
    }

    private async openWhiteboard() {
        // 创建对话框
        const id = new Date().getTime().toString();
        this.whiteBoardTab = await openTab({
            app: window.siyuan.ws.app,
            custom: {
                icon: "iconSTWhiteboard",
                title: `画板`,
                id: this.plugin.name + 'whiteboard-' + id, // 使用时间戳确保唯一性
            },
            // position: "right",
            keepCursor: false
        });
        this.whiteBoardTab.panelElement.innerHTML = `
            <div id="tldraw-container-${id}" style="width: 100%; height: 100%;"></div>
        `;
        // 获取容器元素
        const container = document.querySelector('#tldraw-container-' + id);
        if (container) {
            // 使用React创建Tldraw组件
            this.root = ReactDOM.createRoot(container);
            this.root.render(
                React.createElement(
                    Tldraw, {
                    darkMode: true,//无效
                    showMenu: true,
                    showTools: true,
                    showUI: true,
                    autofocus: true,
                    onMount: (app) => {
                        this.tldrawApp = app;
                    }
                }
                )
            );
        }
    }

    async onunload() {

    }





}