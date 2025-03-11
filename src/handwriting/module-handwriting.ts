import * as ic from "@/icon"
import { openTab, Plugin } from "siyuan";
import './handwriting.css';
import { isDarkMode } from './utils/theme-utils';
import { WhiteBoard } from './components/whiteboard';
import { EventManager } from './components/event-manager';
import { ToolManager } from './components/tool-manager';

export class M_handwriting {
    private plugin: Plugin;
    private isdark: boolean = false;
    private whiteboard: WhiteBoard;
    private eventManager: EventManager;
    private toolManager: ToolManager;
    
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
        this.isdark = isDarkMode();
        console.log('layout ready', this.isdark);
    }

    private async openWhiteBoard() {
        const id = new Date().getTime().toString();
        const whiteBoardTab = await openTab({
            app: this.plugin.app,
            custom: {
                id: "steveTool-whiteboard-"+id,
                title: "无限画板",
                icon: "iconSTWhiteboard",
                data: {
                    text: "steveTool-whiteboard"
                },
            }
        });

        whiteBoardTab.panelElement.innerHTML = `
        <div  id='steveTool-whiteboard-${id}' ><div id='steveTool-whiteboard-${id}' ></div></div>`;
        this.createWhiteBoardUI(whiteBoardTab.panelElement
            .querySelector(`#steveTool-whiteboard-${id}`) as HTMLElement);

    }

    private createWhiteBoardUI(element: HTMLElement) {
        // 创建画板容器
        console.log('createWhiteBoardUI', element);
        const container = document.createElement("div");
        container.classList.add("steveTool-whiteboard-container");
        container.style.width = "90vw";
        container.style.height = "90vh";
        container.style.position = "relative";
        element.appendChild(container);

        // 创建工具栏
        const toolbar = document.createElement("div");
        toolbar.classList.add("steveTool-whiteboard-toolbar");
        toolbar.style.position = "absolute";
        toolbar.style.top = "10px";
        toolbar.style.left = "10px";
        toolbar.style.zIndex = "10";
        toolbar.style.backgroundColor = this.isdark ? "#3a3a3a" : "#f5f5f5";
        toolbar.style.padding = "5px";
        toolbar.style.borderRadius = "5px";
        toolbar.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
        container.appendChild(toolbar);

        // 添加画笔按钮
        const penButton = this.createToolButton("画笔", "✏️", () => {
            this.toolManager.setTool('pen');
            this.updateToolButtonsState(penButton);
        });
        toolbar.appendChild(penButton);

        // 添加橡皮擦按钮
        const eraserButton = this.createToolButton("橡皮擦", "🧽", () => {
            this.toolManager.setTool('eraser');
            this.updateToolButtonsState(eraserButton);
        });
        toolbar.appendChild(eraserButton);

        // 添加清除按钮
        const clearButton = this.createToolButton("清除", "🗑️", () => {
            if (confirm("确定要清空画板吗？")) {
                this.whiteboard.clear();
            }
        });
        toolbar.appendChild(clearButton);

        // 初始化白板
        this.whiteboard = new WhiteBoard(container, this.isdark);
        this.eventManager = new EventManager(this.whiteboard, container);
        this.toolManager = new ToolManager(this.whiteboard, this.isdark);

        // 默认选中画笔
        this.updateToolButtonsState(penButton);
    }

    private createToolButton(title: string, icon: string, clickHandler: () => void): HTMLElement {
        const button = document.createElement("button");
        button.title = title;
        button.innerHTML = icon;
        button.style.marginRight = "5px";
        button.style.padding = "5px 10px";
        button.style.border = "none";
        button.style.borderRadius = "3px";
        button.style.cursor = "pointer";
        button.style.backgroundColor = "transparent";
        button.onclick = clickHandler;
        return button;
    }

    private updateToolButtonsState(activeButton: HTMLElement) {
        const toolbar = activeButton.parentElement;
        const buttons = toolbar.querySelectorAll("button");
        buttons.forEach(button => {
            button.style.backgroundColor = "transparent";
        });
        activeButton.style.backgroundColor = this.isdark ? "#555" : "#ddd";
    }

    async onunload() {
        // 清理白板实例
        this.cleanUp();
    }

    private cleanUp() {
        if (this.eventManager) {
            this.eventManager.destroy();
            this.eventManager = null;
        }
        
        if (this.whiteboard) {
            this.whiteboard.destroy();
            this.whiteboard = null;
        }
    }
}