import * as ic from "@/icon"
import { openTab, Plugin } from "siyuan";
import './handwriting.css';
import { App } from 'leafer-ui'



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

        // 添加顶栏按钮
        this.plugin.addTopBar({
            icon: "iconSTWhiteboard",
            title: "画板",
            position: "right",
            callback: () => {
                this.openWhiteBoard();
            }
        });
    }

    async onLayoutReady(settingdata) {

    }

    private async openWhiteBoard() {
        const id = new Date().getTime().toString();
        const whiteBoardTab = await openTab({
            app: this.plugin.app,
            custom: {
                id: "steveTool-whiteboard-" + id,
                title: "无限画板",
                icon: "iconSTWhiteboard",
                data: {
                    text: "steveTool-whiteboard"
                },
            }
        });

        whiteBoardTab.panelElement.innerHTML = `
        <div id='steveTool-whiteboard-${id}' style="width: 100%; height: 100%;"></div>`;
        const app = new App({
            view: document.getElementById(`steveTool-whiteboard-${id}`),
            // width: 100%,
            // height: 600,
        })
        const background = app.addLeafer({ hittable: false, usePartRender: false }) // 背景层，用于绘制网格等
        const leafer = app.addLeafer() // 内容层
        const stroke = app.addLeafer({ hittable: false }) // 描边层，用于绘制经常变化的hover、select描边效果


    }



    async onunload() {
        // 清理白板实例
        this.cleanUp();
    }

    private cleanUp() {

    }
}