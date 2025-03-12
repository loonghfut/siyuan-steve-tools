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
        // Debug.enable = true;
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
       


    }



    async onunload() {
        // 清理白板实例
        this.cleanUp();
    }

    private cleanUp() {

    }
}