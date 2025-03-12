import * as ic from "@/icon"
import { openTab, Plugin, showMessage } from "siyuan";
import './handwriting.css';
import Drawflow from 'drawflow';
import 'drawflow/dist/drawflow.min.css'; 
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

        // 添加背景网格层
        whiteBoardTab.panelElement.innerHTML = `
        <div id='steveTool-whiteboard-${id}' style="width: 100%; height: 100%; position: relative;">
            <div id='drawflow-${id}' class="drawflow-canvas" style="width: 100%; height: 100%;">
                <div class="background-grid" id="grid-${id}"></div>
            </div>
        </div>`;

        // 初始化 Drawflow
        const drawflowEl = document.getElementById(`drawflow-${id}`);
        const editor = new Drawflow(drawflowEl);
        editor.start();

        // 设置 Drawflow 选项
        // editor.reroute = true;
        // editor.reroute_fix_curvature = true;
        // editor.curvature = 0.5;
        // editor.reroute_curvature = 0.5;
        // editor.line_path = 2;

        // 设置默认缩放级别和模式
        editor.zoom = 1;
        editor.editor_mode = 'edit'; // 使用 edit 而非 select，因为 Drawflow 没有 select 模式

        // 保存实例以便后续清理
        this.drawflowInstances.set(id, editor);

        // 初始化背景网格样式
        this.initBackgroundGrid(id, editor);

        // 添加基本事件监听
        editor.on('nodeCreated', (nodeId) => {
            console.log("Node created " + nodeId);
        });

        editor.on('nodeRemoved', function (id) {
            console.log("Node removed " + id);
        });

        editor.on('zoom', (zoom) => {
            console.log("Zoom level: " + zoom);
            // 更新背景网格
            console.log("id", id)
            this.updateBackgroundGrid(id, zoom);
        });
    }

    private initBackgroundGrid(id: string, editor: Drawflow) {
        // 添加背景网格样式
        const styleElement = document.createElement('style');
        styleElement.id = `grid-style-${id}`;
        console.log("styleDrawflow", styleElement)
        styleElement.textContent = `
            #grid-${id} {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                background-size: 20px 20px;
                background-image: 
                    linear-gradient(to right, rgba(0, 0, 0, 0.1) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
                transform-origin: 0 0;
            }
            
            #drawflow-${id} {
                background-color:rgb(201, 194, 194);
                position: relative;
            }
        `;
        document.head.appendChild(styleElement);

        // 初始设置背景网格
        this.updateBackgroundGrid(id, editor.zoom);
    }

    // 更新背景网格
    private updateBackgroundGrid(id: string, zoom: number) {
        const gridElement = document.getElementById(`grid-${id}`);
        console.log("gridElement", gridElement)
        if (gridElement) {
            // 网格大小随缩放变化

            const gridSize = Math.max(10, 20 * zoom); // 最小10px，防止网格过密
            gridElement.style.backgroundSize = `${gridSize}px ${gridSize}px`;

            // 如果要实现平移效果，可以在这里处理
            const parent = gridElement.closest('.drawflow') as HTMLElement;
            if (parent) {
                const transform = parent.style.transform;
                if (transform) {
                    // 正则表达式提取平移值
                    const translateMatch = transform.match(/translate\((-?\d+(?:\.\d+)?)px, (-?\d+(?:\.\d+)?)px\)/);
                    if (translateMatch) {
                        const translateX = parseFloat(translateMatch[1]);
                        const translateY = parseFloat(translateMatch[2]);

                        // 使背景网格反向平移，保持网格固定在视图中
                        gridElement.style.backgroundPosition = `${-translateX % gridSize}px ${-translateY % gridSize}px`;
                    }
                }
            }
        }
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