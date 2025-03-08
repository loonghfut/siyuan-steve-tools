import * as ic from "@/icon"
import { Dialog, openTab, Plugin } from "siyuan";
import './handwriting.css';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

export class M_handwriting {
    private plugin: Plugin;
    private whiteBoardDialog: Dialog;
    private root: ReactDOM.Root | null = null;

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

    private openWhiteboard() {
        // 创建对话框
        this.whiteBoardDialog = new Dialog({
            title: "手写画板",
            content: `<div id="tldraw-container" style="height: 80vh;"></div>`,
            width: "90%",
            height: "90%",
            destroyCallback: () => {
                // 销毁React组件
                this.root?.unmount();
                this.root = null;
            }
        });

        // 获取容器元素
        const container = this.whiteBoardDialog.element.querySelector('#tldraw-container');
        if (container) {
            // 使用React创建Tldraw组件
            this.root = ReactDOM.createRoot(container);
            this.root.render(
                React.createElement(
                    React.StrictMode, 
                    null, 
                    React.createElement(Tldraw, {
                        // 可以添加Tldraw的配置选项
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