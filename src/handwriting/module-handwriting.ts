import * as ic from "@/icon"
import { openTab, Plugin, showMessage } from "siyuan";
import './handwriting.css';
import styleDrawflow from 'drawflow/dist/drawflow.min.css'
import Drawflow from 'drawflow';

export class M_handwriting {
    private plugin: Plugin;
    private drawflowInstances: Map<string, Drawflow> = new Map();
    private activeToolButtons: Map<string, HTMLElement> = new Map();

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async init(settingdata) {
        // 添加图标
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 500 500">
               ${ic.steveTools_whiteboard}
            </symbol>  
            <symbol id="iconSelect" viewBox="0 0 1024 1024">
                <path d="M864 0h-704c-52.8 0-96 43.2-96 96v832c0 52.8 43.2 96 96 96h704c52.8 0 96-43.2 96-96v-832c0-52.8-43.2-96-96-96zM832 896h-640v-768h640v768z"/>
            </symbol>
            <symbol id="iconRect" viewBox="0 0 1024 1024">
                <path d="M928 128h-832c-52.8 0-96 43.2-96 96v576c0 52.8 43.2 96 96 96h832c52.8 0 96-43.2 96-96v-576c0-52.8-43.2-96-96-96z"/>
            </symbol>
            <symbol id="iconCircle" viewBox="0 0 1024 1024">
                <path d="M512 0c-282.8 0-512 229.2-512 512s229.2 512 512 512 512-229.2 512-512-229.2-512-512-512z"/>
            </symbol>
            <symbol id="iconLine" viewBox="0 0 1024 1024">
                <path d="M904 120l-784 784c-15.6 15.6-15.6 40.8 0 56.4 15.6 15.6 40.8 15.6 56.4 0l784-784c15.6-15.6 15.6-40.8 0-56.4-15.6-15.6-40.8-15.6-56.4 0z"/>
            </symbol>
            <symbol id="iconText" viewBox="0 0 1024 1024">
                <path d="M896 64h-768c-52.8 0-96 43.2-96 96v704c0 52.8 43.2 96 96 96h768c52.8 0 96-43.2 96-96v-704c0-52.8-43.2-96-96-96zM896 864h-768v-704h768v704z"/>
                <path d="M448 256h128v512h-128z"/>
                <path d="M256 448h512v128h-512z"/>
            </symbol>
            <symbol id="iconClear" viewBox="0 0 1024 1024">
                <path d="M512 0c-282.8 0-512 229.2-512 512s229.2 512 512 512 512-229.2 512-512-229.2-512-512-512zM768 682.4l-85.6 85.6-170.4-170.4-170.4 170.4-85.6-85.6 170.4-170.4-170.4-170.4 85.6-85.6 170.4 170.4 170.4-170.4 85.6 85.6-170.4 170.4 170.4 170.4z"/>
            </symbol>
            <symbol id="iconZoomIn" viewBox="0 0 1024 1024">
                <path d="M512 0c-282.8 0-512 229.2-512 512s229.2 512 512 512 512-229.2 512-512-229.2-512-512-512zM800 544h-256v256h-64v-256h-256v-64h256v-256h64v256h256v64z"/>
            </symbol>
            <symbol id="iconZoomOut" viewBox="0 0 1024 1024">
                <path d="M512 0c-282.8 0-512 229.2-512 512s229.2 512 512 512 512-229.2 512-512-229.2-512-512-512zM800 544h-576v-64h576v64z"/>
            </symbol>
            <symbol id="iconSave" viewBox="0 0 1024 1024">
                <path d="M896 0h-896v1024h1024v-896l-128-128zM512 64h128v256h-128v-256zM896 896h-768v-768h64v320h576v-320h14.6l113.4 113.4v654.6z"/>
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
        // 可以在这里初始化任何需要DOM加载完成后的逻辑
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
        <div id='steveTool-whiteboard-${id}' style="width: 100%; height: 100%;">
            <div id='drawflow-${id}' class="drawflow-canvas" style="width: 100%; height: 100%;"></div>
        </div>`;

        // 初始化 Drawflow
        const drawflowEl = document.getElementById(`drawflow-${id}`);
        const editor = new Drawflow(drawflowEl);
        editor.start();
        // 设置 Drawflow 选项
        editor.reroute = true;
        editor.reroute_fix_curvature = true;
        editor.force_first_input = false;
        editor.curvature = 0.5;
        editor.reroute_curvature = 0.5;
        editor.line_path = 2;
        

        // 设置默认缩放级别和模式
        editor.zoom = 1;
        editor.editor_mode = 'select';

        // 保存实例以便后续清理
        this.drawflowInstances.set(id, editor);

        // 添加基本事件监听
        editor.on('nodeCreated', (nodeId) => {
            console.log("Node created " + nodeId);

        });

        editor.on('nodeRemoved', function (id) {
            console.log("Node removed " + id);
        });

        editor.on('zoom', function (zoom) {
            console.log("Zoom level: " + zoom);
        });


    }






    

    async onunload() {
        // 清理白板实例
        this.cleanUp();
    }

    private cleanUp() {
        // 清理所有画板实例
        this.drawflowInstances.forEach((instance) => {
            instance.clear();
        });
        this.drawflowInstances.clear();
    }
}