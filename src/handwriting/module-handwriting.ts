import * as ic from "@/icon"
import { openTab, Plugin, Protyle, showMessage } from "siyuan";
import './handwriting.css';
// 引入 fabric.js 库
import { Canvas } from 'fabric/fabric-impl';
import * as fabric from 'fabric';
import { GridManager } from "./canvas/grid-manager";
import { PanZoomHandler } from "./canvas/pan-zoom-handler";
import { CanvasManager } from "./canvas/canvas-manager";
import { ElementInteractions } from "./elements/element-interactions";

export class M_handwriting {
    private plugin: Plugin;
    // 存储画布实例的映射表
    private canvasInstances: Map<string, Canvas> = new Map();
    private activeToolButtons: Map<string, HTMLElement> = new Map();
    private GridManager: GridManager;
    private PanZoomHandler: PanZoomHandler;
    private CanvasManager: CanvasManager;

    private currentid: string = "";

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
        this.plugin.eventBus.on('switch-protyle', (e) => {
            console.log("切换思源块:", e);
            this.currentid = e.detail.protyle.block.rootID;
            console.log(this.currentid);

            this.addWhiteboardButton(e);
        });
    }

    private addWhiteboardButton(e) {
        const breadcrumb = e.detail.protyle.element.querySelector('.protyle-breadcrumb');
        if (breadcrumb) {
            // Check if the button already exists
            const existingButton = breadcrumb.querySelector('.whiteboard-button');
            if (!existingButton) {
                // Create the button
                const button = document.createElement('button');
                button.className = 'b3-button b3-button--outline whiteboard-button';
                button.innerHTML = '画板';
                button.title = '在画板中打开';
                button.style.marginLeft = '8px';

                // Add click event
                button.addEventListener('click', () => {
                    this.openWhiteBoard_in(e);
                });

                // Add the button to breadcrumb
                breadcrumb.appendChild(button);
            }
        }
    }


    /**
     * 在当前笔记页中打开画板
     */
    private async openWhiteBoard_in(e) {
        // 查找当前页面的内容容器
        const protyleContent = e.detail.protyle.element.querySelector(`.protyle-content.protyle-content--transition`);
        
        if (!protyleContent) {
            showMessage("无法找到当前页面内容区域");
            return;
        }
        
        // 获取按钮并准备更新状态
        const button = e.detail.protyle.element.querySelector('.whiteboard-button');
        
        // 检查画板是否已存在
        let whiteboardContainer = protyleContent.querySelector('.whiteboard-container');
        
        // 生成唯一ID
        const id = this.currentid;
        
        if (whiteboardContainer) {
            // 画板已存在，检查当前状态
            if (whiteboardContainer.style.display === 'none') {
                // 如果画板是隐藏的，显示画板
                whiteboardContainer.style.display = 'block';
                
                // 隐藏原始内容
                const originalContent = protyleContent.querySelectorAll(':scope > :not(.whiteboard-container)');
                originalContent.forEach(el => {
                    (el as HTMLElement).style.display = 'none';
                });
                
                // 隐藏面包屑导航栏
                const breadcrumbBar = e.detail.protyle.element.querySelector('.protyle-breadcrumb__bar');
                if (breadcrumbBar) {
                    (breadcrumbBar as HTMLElement).style.display = 'none';
                }
                
                // 更新按钮文本
                if (button) button.innerHTML = '关闭画板';
                
                // 恢复画布实例（如果已有）
                const existingCanvas = this.canvasInstances.get(id);
                if (existingCanvas) {
                    existingCanvas.requestRenderAll();
                }
            } else {
                // 画板是显示的，隐藏画板
                whiteboardContainer.style.display = 'none';
                
                // 显示原始内容
                const originalContent = protyleContent.querySelectorAll(':scope > :not(.whiteboard-container)');
                originalContent.forEach(el => {
                    (el as HTMLElement).style.display = '';
                });
                
                // 显示面包屑导航栏
                const breadcrumbBar = e.detail.protyle.element.querySelector('.protyle-breadcrumb__bar');
                if (breadcrumbBar) {
                    (breadcrumbBar as HTMLElement).style.display = '';
                }
                
                // 更新按钮文本
                if (button) button.innerHTML = '画板';
            }
        } else {
            // 画板不存在，创建新的画板
            
            // 隐藏原始内容
            const originalContent = protyleContent.querySelectorAll(':scope > *');
            originalContent.forEach(el => {
                (el as HTMLElement).style.display = 'none';
            });
            
            // 隐藏面包屑导航栏
            const breadcrumbBar = e.detail.protyle.element.querySelector('.protyle-breadcrumb__bar');
            if (breadcrumbBar) {
                (breadcrumbBar as HTMLElement).style.display = 'none';
            }
            
            // 创建画板容器
            whiteboardContainer = document.createElement('div');
            whiteboardContainer.id = `steveTool-whiteboard-${id}`;
            whiteboardContainer.className = 'whiteboard-container';
            (whiteboardContainer as HTMLElement).style.cssText = 'width: 100%; height: calc(100vh - 100px); position: relative; overflow: hidden; background-color: var(--b3-theme-background);';
            
            // 添加控制元素和画布
            whiteboardContainer.innerHTML = `
            <div class="whiteboard-controls" style="position: absolute; top: 10px; right: 10px; z-index: ${window.siyuan.zIndex}; 
                 background-color: var(--b3-theme-background); padding: 5px 10px; border-radius: 4px; font-size: 14px; color: var(--b3-theme-on-background);">
                <span id="zoom-display-${id}">缩放: 100%</span>
                <button id="reset-view-${id}" style="margin-left: 10px; background: var(--b3-theme-background); border: 1px solid #ccc; 
                    border-radius: 4px; padding: 2px 8px; cursor: pointer; color: var(--b3-theme-on-background);">重置视图</button>
                <button id="add-button-${id}" style="margin-left: 10px; background: var(--b3-theme-background); border: 1px solid #ccc; 
                    border-radius: 4px; padding: 2px 8px; cursor: pointer; color: var(--b3-theme-on-background);">添加按钮</button>
            </div>
            <canvas id='canvas-${id}'></canvas>
            <div id='grid-${id}' class="whiteboard-grid"></div>
            <div id="dom-elements-container-${id}" style="position: absolute; top: 0; left: 0; pointer-events: none;"></div>
            `;
            
            // 将画板添加到内容区域
            protyleContent.appendChild(whiteboardContainer);
            
            // 初始化画布
            const Mcanvas = new CanvasManager(id, whiteboardContainer as HTMLElement);
            const canvas = Mcanvas.getCanvas();
            this.canvasInstances.set(id, canvas);
            
            // 设置DOM元素添加功能
            this.setupDomElementAddition(canvas, id);
            
            // 设置思源块拖放功能
            this.setupSiyuanBlockDrop(canvas, id);
            
            // 更新按钮文本
            if (button) button.innerHTML = '关闭画板';
            
            // 显示成功消息
            showMessage("画板已打开");
        }
    }




    /**
     * 打开白板并初始化画布
     */
    private async openWhiteBoard() {
        // 生成唯一ID
        // const id = new Date().getTime().toString();
        const id = "1234";
        // 创建新选项卡
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

        // 添加画布容器和网格背景
        whiteBoardTab.panelElement.innerHTML = `
        <div id='steveTool-whiteboard-${id}' class="whiteboard-container" 
         style="width: 100%; height: 100%; position: relative; overflow: hidden; background-color: var(--b3-theme-background);">
        <div class="whiteboard-controls" style="position: absolute; top: 10px; right: 10px; z-index: ${window.siyuan.zIndex}; 
             background-color: var(--b3-theme-background); padding: 5px 10px; border-radius: 4px; font-size: 14px; color: var(--b3-theme-on-background);">
            <span id="zoom-display-${id}">缩放: 100%</span>
            <button id="reset-view-${id}" style="margin-left: 10px; background: var(--b3-theme-background); border: 1px solid #ccc; 
                border-radius: 4px; padding: 2px 8px; cursor: pointer; color: var(--b3-theme-on-background);">重置视图</button>
            <button id="add-button-${id}" style="margin-left: 10px; background: var(--b3-theme-background); border: 1px solid #ccc; 
                border-radius: 4px; padding: 2px 8px; cursor: pointer; color: var(--b3-theme-on-background);">添加按钮</button>
        </div>
        <canvas id='canvas-${id}'></canvas>
        <div id='grid-${id}' class="whiteboard-grid"></div>
        <div id="dom-elements-container-${id}" style="position: absolute; top: 0; left: 0; pointer-events: none;"></div>
        </div>`;

        // 初始化画布
        // this.initializeCanvas(id);
        const Mcanvas = new CanvasManager(id, whiteBoardTab.panelElement);
        const canvas = Mcanvas.getCanvas();
        this.canvasInstances.set(id, canvas);
        // 设置DOM元素添加功能
        this.setupDomElementAddition(canvas, id);
        // 设置思源块拖放功能
        this.setupSiyuanBlockDrop(canvas, id);
    }

    /**
     * 设置思源笔记块的拖放功能
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     */
    private setupSiyuanBlockDrop(canvas: Canvas, id: string) {
        // 获取容器元素
        const container = document.getElementById(`steveTool-whiteboard-${id}`);
        const domContainer = document.getElementById(`dom-elements-container-${id}`);

        if (!container || !domContainer) return;

        // 添加拖拽相关事件监听
        container.addEventListener('dragover', (e) => {
            // 阻止默认行为以允许放置
            e.preventDefault();
            e.dataTransfer!.dropEffect = 'copy'; // 显示为复制操作
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 记录拖放数据类型
            const types = e.dataTransfer!.types;
            console.log("拖放数据类型:", types);

            // 尝试提取思源块ID
            let blockId = '';
            if (types && types.length > 0) {
                // 方法1: 从特殊类型中提取
                for (const type of types) {
                    if (type.startsWith('application/siyuan-')) {
                        const matches = type.match(/\d{14}-\w{7}/);
                        if (matches && matches.length > 0) {
                            blockId = matches[0];
                            console.log("提取到块ID:", blockId);
                            break;
                        }
                    }
                }
            }

            // 如果没有找到有效的思源块ID，则显示错误信息并退出
            if (!blockId) {
                // showMessage("未找到有效的思源块ID");
                return;
            }

            // 计算画布中的放置坐标
            // 获取鼠标在画布上的位置
            const rect = container.getBoundingClientRect();
            const dropX = e.clientX - rect.left;
            const dropY = e.clientY - rect.top;

            // 获取当前画布的变换矩阵
            const vpt = canvas.viewportTransform;
            if (!vpt) return;

            // 转换为画布坐标系中的位置
            const canvasX = (dropX - vpt[4]) / vpt[0];
            const canvasY = (dropY - vpt[5]) / vpt[3];

            // 生成唯一的DOM元素ID
            const domId = `dom-block-${id}-${Date.now()}`;

            // 创建容器元素
            const { container: protyledom, wrapper: wrapperDiv, dragHandle, resizeHandle } =
                this.createProtyleContainer(domId, blockId, { x: canvasX, y: canvasY });

            // 添加到DOM容器中
            domContainer.appendChild(protyledom);

            // 初始化Protyle编辑器
            const protyle = this.initProtyleEditor(wrapperDiv, blockId, id);

            // 添加缩放功能（但不添加拖拽功能）
            ElementInteractions.addResizableToElement(protyledom, resizeHandle, canvas);


            // 显示成功消息
            if (protyle) {
                showMessage(`已添加块 ${blockId}`);
            }

            // 记录调试信息
            console.log("拖放位置(画布坐标):", { x: canvasX, y: canvasY });
        });
    }

    /**
     * 设置DOM元素添加功能
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     */
    private setupDomElementAddition(canvas: Canvas, id: string) {
        // 获取添加按钮元素
        const addButtonBtn = document.getElementById(`add-button-${id}`);
        // 获取DOM元素容器
        const domContainer = document.getElementById(`dom-elements-container-${id}`);

        if (!addButtonBtn || !domContainer) return;

        // 确保DOM容器能接受交互事件
        domContainer.style.pointerEvents = 'none';

        // 生成唯一的DOM元素ID
        let domElementCounter = 0;
        // 添加拖拽创建功能
        this.setupDragToCreateElement(canvas, id, domElementCounter);

        // 监听画布变换（平移、缩放）以更新所有DOM元素的变换矩阵
        canvas.on('after:render', () => {
            // 更新DOM容器的变换以匹配画布变换
            const vpt = canvas.viewportTransform;
            if (!vpt) return;

            // 将整个DOM容器的变换设置为与画布相同
            domContainer.style.transform = `matrix(${vpt[0]}, ${vpt[1]}, ${vpt[2]}, ${vpt[3]}, ${vpt[4]}, ${vpt[5]})`;
        });
    }

    /**
     * 设置拖拽创建元素功能
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     * @param counter 计数器引用
     */
    private setupDragToCreateElement(canvas: Canvas, id: string, counter: number) {
        const container = document.getElementById(`steveTool-whiteboard-${id}`);
        const domContainer = document.getElementById(`dom-elements-container-${id}`);
        const addButtonBtn = document.getElementById(`add-button-${id}`);

        if (!container || !domContainer || !addButtonBtn) return;

        // 设置按钮为可拖动
        addButtonBtn.setAttribute('draggable', 'true');

        // 绑定拖拽开始事件
        addButtonBtn.addEventListener('dragstart', (e) => {
            // 设置拖拽数据
            e.dataTransfer!.setData('text/plain', 'create-new-element');
            e.dataTransfer!.effectAllowed = 'copy';
        });

        // 容器上监听拖放事件
        container.addEventListener('dragover', (e) => {
            // 阻止默认行为以允许放置
            e.preventDefault();
            e.dataTransfer!.dropEffect = 'copy';
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 检查是否是从添加按钮拖拽过来的
            const dragData = e.dataTransfer!.getData('text/plain');
            if (dragData !== 'create-new-element') return;

            // 获取鼠标在画布上的位置
            const rect = container.getBoundingClientRect();
            const dropX = e.clientX - rect.left;
            const dropY = e.clientY - rect.top;

            // 获取当前画布的变换矩阵
            const vpt = canvas.viewportTransform;
            if (!vpt) return;

            // 转换为画布坐标系中的位置
            const canvasX = (dropX - vpt[4]) / vpt[0];
            const canvasY = (dropY - vpt[5]) / vpt[3];


            // 创建唯一ID
            const domId = `dom-button-${id}-${counter++}`;

            // 使用封装好的方法创建容器
            const { container: protyledom, wrapper: wrapperDiv, dragHandle, resizeHandle } =
                this.createProtyleContainer(domId, "20250310234002-us3sb9j", { x: canvasX, y: canvasY });

            // 添加到DOM容器中
            domContainer.appendChild(protyledom);

            // 使用封装的方法初始化编辑器
            const protyle = this.initProtyleEditor(wrapperDiv, "20250310234002-us3sb9j", id);

            // 添加缩放功能
            ElementInteractions.addResizableToElement(protyledom, resizeHandle, canvas);
            // 显示成功消息
            showMessage('已添加新元素，可直接拖拽移动位置或缩放大小');

            console.log("拖放位置(画布坐标):", { x: canvasX, y: canvasY });
        });

        // 添加提示
        addButtonBtn.setAttribute('title', '拖拽此按钮到画布中创建新元素');
    }

    /**
     * 插件卸载时的清理工作
     */
    async onunload() {
        this.cleanUp();
    }

    /**
     * 创建一个思源笔记块容器
     * @param id 唯一ID
     * @param blockId 思源笔记块ID
     * @param position 初始位置
     * @returns 创建的DOM元素
     */
    private createProtyleContainer(id: string, blockId: string, position: { x: number, y: number }): {
        container: HTMLElement,
        wrapper: HTMLElement,
        dragHandle: HTMLElement,
        resizeHandle: HTMLElement
    } {
        // 创建主容器
        const container = document.createElement('div');
        container.id = blockId;
        container.className = 'siyuan-block-container';
        container.style.cssText = `
            position: absolute;
            width: 300px;
            height: 200px;
            background-color: #3573f0;
            border-radius: 6px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.15);
            pointer-events: auto; /* 允许元素接收事件 */
            transform-origin: 0 0;
            overflow: hidden;
            border: 1px solid var(--b3-border-color);
            left: ${position.x}px;
            top: ${position.y}px;
        `;

        // 添加拖动手柄
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 8px;
            cursor: move;
            background-color: rgba(0,0,0,0.1);
            border-radius: 4px 4px 0 0;
        `;

        // 添加缩放手柄
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        resizeHandle.style.cssText = `
            position: absolute;
            bottom: 0px;
            right: 0px;
            width: 10px;
            height: 10px;
            background-color: #2196F3;
            border-radius: 50%;
            cursor: nwse-resize;
            z-index: 100;
        `;

        // 创建容器包装器
        const wrapper = document.createElement('div');
        wrapper.className = 'protyle-wrapper';
        wrapper.style.cssText = `
            position: absolute;
            top: 8px;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

        // 组装各部分
        container.appendChild(dragHandle);
        container.appendChild(resizeHandle);
        container.appendChild(wrapper);

        return {
            container,
            wrapper,
            dragHandle,
            resizeHandle
        };
    }

    /**
     * 初始化思源块编辑器
     * @param wrapper 容器元素
     * @param blockId 思源块ID
     * @param id 画布ID
     * @returns 初始化的Protyle实例或null
     */
    private initProtyleEditor(wrapper: HTMLElement, blockId: string, id: string): Protyle | null {
        try {
            // 获取父容器元素（siyuan-block-container）
            const container = wrapper.parentElement;
            if (!container) {
                throw new Error("找不到父容器元素");
            }

            // 默认设置为不可交互状态
            wrapper.style.pointerEvents = 'none';

            // 创建一个半透明覆盖层，表示元素处于不可交互状态
            const overlayDiv = document.createElement('div');
            overlayDiv.className = 'block-overlay';
            overlayDiv.style.cssText = `
                position: absolute;
                top: 8px;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.1);
                z-index: 10;
                cursor: move; /* 默认显示移动光标 */
                border-radius: 0 0 4px 4px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // 创建删除按钮（初始状态为隐藏）- 放在容器元素内
            const deleteButton = document.createElement('button');
            deleteButton.className = 'block-delete-button';
            deleteButton.innerHTML = '×'; // 使用 × 符号作为删除按钮
            deleteButton.style.cssText = `
                position: absolute;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background-color:rgba(255, 77, 80, 0.45);
                color: white;
                border: none;
                font-size: 16px;
                font-weight: bold;
                line-height: 1;
                cursor: pointer;
                display: none; /* 初始隐藏 */
                z-index: 200;
                padding: 0;
                text-align: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                pointer-events: auto; /* 确保按钮可点击 */
            `;

            // 将删除按钮添加到容器元素内，这样它会跟随元素一起移动
            container.appendChild(deleteButton);

            // 为删除按钮添加事件监听器
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                e.preventDefault(); // 阻止默认行为

                // 确认删除对话框
                if (confirm('确定要删除此元素吗？')) {
                    // 从DOM中移除容器元素
                    container.remove();
                    // 显示删除成功提示
                    showMessage('元素已删除');
                }
            });

            // 将覆盖层添加到容器
            container.appendChild(overlayDiv);

            // 跟踪选择状态
            let isSelected = false;

            // 创建Protyle编辑器
            const protyle = new Protyle(window.siyuan.ws.app, wrapper, {
                blockId: blockId,
                render: {
                    breadcrumb: false,
                    gutter: false,
                },
                action: ["cb-get-focus"],
                mode: "wysiwyg",
            });

            // 双击覆盖层激活编辑
            overlayDiv.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                enableInteraction();
            });

            // 为覆盖层添加拖拽功能（非选中状态下）
            this.makeElementDraggable(overlayDiv, container, this.canvasInstances.get(id));

            // 点击画布空白处时禁用所有块的交互
            document.addEventListener('click', (e) => {
                // 检查点击是否在此容器外部
                if (isSelected && !container.contains(e.target as Node) && e.target !== deleteButton) {
                    disableInteraction();
                }
            });

            // 启用交互的函数
            function enableInteraction() {
                if (isSelected) return;

                // 移除覆盖层
                overlayDiv.style.display = 'none';

                // 启用交互
                wrapper.style.pointerEvents = 'auto';

                // 添加选中状态样式
                container.classList.add('block-selected');
                container.style.zIndex = '100';
                isSelected = true;

                // 显示删除按钮
                deleteButton.style.display = 'block';
            }

            // 禁用交互的函数
            function disableInteraction() {
                if (!isSelected) return;

                // 显示覆盖层
                overlayDiv.style.display = 'flex';

                // 禁用交互
                wrapper.style.pointerEvents = 'none';

                // 移除选中状态样式
                container.classList.remove('block-selected');
                container.style.zIndex = '';
                isSelected = false;

                // 隐藏删除按钮
                deleteButton.style.display = 'none';
            }
            return protyle;
        } catch (e) {
            console.error("初始化编辑器失败:", e);
            wrapper.innerHTML = `<div style="padding: 10px;">加载块 ${blockId} 失败</div>`;
            return null;
        }
    }

    /**
     * 使覆盖层可拖拽（任意位置拖拽元素）
     * @param overlayElement 覆盖层元素
     * @param containerElement 容器元素
     * @param canvas Fabric.js画布实例
     */
    private makeElementDraggable(overlayElement: HTMLElement, containerElement: HTMLElement, canvas: Canvas) {
        // 状态变量
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        // 开始拖拽的处理函数
        const startDrag = (e: MouseEvent | TouchEvent) => {
            // 阻止事件冒泡但允许默认行为
            e.stopPropagation();

            isDragging = true;

            // 获取触摸/鼠标的初始位置
            if (e instanceof MouseEvent) {
                startX = e.clientX;
                startY = e.clientY;
            } else if (e instanceof TouchEvent && e.touches && e.touches[0]) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }

            // 获取元素当前的CSS位置
            const currentLeftStr = containerElement.style.left || '0px';
            const currentTopStr = containerElement.style.top || '0px';
            initialLeft = parseFloat(currentLeftStr);
            initialTop = parseFloat(currentTopStr);

            // 添加临时事件监听器
            document.addEventListener('mousemove', moveDrag, { capture: true });
            document.addEventListener('touchmove', moveDrag, { capture: true, passive: false });
            document.addEventListener('mouseup', stopDrag, { capture: true });
            document.addEventListener('touchend', stopDrag, { capture: true });

            // 添加活动样式
            containerElement.style.opacity = '0.85';
            containerElement.style.zIndex = '1000';
            document.body.style.cursor = 'grabbing';
        };

        // 拖拽移动处理函数
        const moveDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();

            // 获取当前鼠标/触摸位置
            let clientX, clientY;
            if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if (e instanceof TouchEvent && e.touches && e.touches[0]) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                return;
            }

            // 考虑画布缩放比例
            const vpt = canvas.viewportTransform;
            if (!vpt) return;

            const scale = vpt[0]; // 假设x和y的缩放比例相同

            // 计算移动距离（考虑缩放）
            const deltaX = (clientX - startX) / scale;
            const deltaY = (clientY - startY) / scale;

            // 更新元素位置
            containerElement.style.left = `${initialLeft + deltaX}px`;
            containerElement.style.top = `${initialTop + deltaY}px`;
        };

        // 结束拖拽处理函数
        const stopDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;

            isDragging = false;

            // 移除临时事件监听器
            document.removeEventListener('mousemove', moveDrag, { capture: true });
            document.removeEventListener('touchmove', moveDrag, { capture: true });
            document.removeEventListener('mouseup', stopDrag, { capture: true });
            document.removeEventListener('touchend', stopDrag, { capture: true });

            // 恢复正常样式
            containerElement.style.opacity = '1';
            containerElement.style.zIndex = '';
            document.body.style.cursor = '';
        };

        // 添加拖拽事件监听器
        overlayElement.addEventListener('mousedown', startDrag);
        overlayElement.addEventListener('touchstart', startDrag, { passive: true });
    }

    /**
     * 清理所有画布实例和资源
     */
    private cleanUp() {
        // 销毁所有画布实例
        this.canvasInstances.forEach((canvas) => {
            canvas.dispose();
        });

        // 清空实例映射表
        this.canvasInstances.clear();

        // 移除可能添加的样式元素
        document.querySelectorAll('[id^="grid-style-"]').forEach(element => {
            element.remove();
        });
    }

}