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
import { api } from "@frostime/siyuan-plugin-kits";

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

    private async addWhiteboardButton(e) {
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
                button.addEventListener('click', async () => {
                    let ChildBlocks = await api.getChildBlocks(this.currentid);

                    // 添加确认对话框，避免误操作加载大量块
                    if (ChildBlocks.length > 20) {
                        const confirmed = await new Promise<boolean>(resolve => {
                            const dialog = document.createElement('div');
                            dialog.className = 'block-confirm-dialog';
                            dialog.style.cssText = `
                                position: fixed;
                                top: 0;
                                left: 0;
                                right: 0;
                                bottom: 0;
                                z-index: 99999;
                                background-color: rgba(0,0,0,0.4);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            `;

                            dialog.innerHTML = `
                                <div style="background: var(--b3-theme-background); border-radius: 6px; padding: 16px; width: 340px; box-shadow: 0 0 20px rgba(0,0,0,0.15);">
                                    <h3 style="margin-top: 0;">大量块警告</h3>
                                    <p>当前文档包含 ${ChildBlocks.length} 个块，全部加载可能导致性能问题。</p>
                                    <div style="display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end;">
                                        <button class="b3-button cancel-btn">取消</button>
                                        <button class="b3-button b3-button--text optimize-btn">优化加载</button>
                                        <button class="b3-button b3-button--danger confirm-btn">强制加载全部</button>
                                    </div>
                                </div>
                            `;

                            document.body.appendChild(dialog);

                            dialog.querySelector('.cancel-btn').addEventListener('click', () => {
                                document.body.removeChild(dialog);
                                resolve(false);
                            });

                            dialog.querySelector('.optimize-btn').addEventListener('click', () => {
                                document.body.removeChild(dialog);
                                // 仅加载前15个块
                                ChildBlocks = ChildBlocks.slice(0, 15);
                                resolve(true);
                            });

                            dialog.querySelector('.confirm-btn').addEventListener('click', () => {
                                document.body.removeChild(dialog);
                                resolve(true);
                            });
                        });

                        if (!confirmed) return;
                    }

                    // 过滤和提取块ID
                    const blockIds = ChildBlocks
                        .filter(block => 
                            // block?.type === 'p' && 
                            block?.content?.trim())
                        .map(block => block.id);

                    console.log("Extracted block IDs:", blockIds);
                    this.openWhiteBoard_in(e, blockIds);
                });

                // Add the button to breadcrumb
                breadcrumb.appendChild(button);
            }
        }
    }


    /**
     * 在当前笔记页中打开画板
     */
    private async openWhiteBoard_in(e, defaultBlockIds: string[] = []) {
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
                //隐藏protyle-gutters

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
            (whiteboardContainer as HTMLElement).style.cssText = 'width: 100%; height: 100%; position: relative; overflow: hidden; background-color: var(--b3-theme-background);';
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
            // 添加默认块
            if (defaultBlockIds && defaultBlockIds.length > 0) {
                const domContainer = document.getElementById(`dom-elements-container-${id}`);
                if (domContainer) {
                    this.addDefaultBlocks(canvas, id, defaultBlockIds, domContainer);
                }
            }
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
        container.id = id; // 使用传入的id而不是blockId，避免ID冲突问题
        container.dataset.blockId = blockId; // 将blockId存储在dataset中
        container.className = 'siyuan-block-container';
        container.style.cssText = `
            position: absolute;
            width: 300px;
            height: 200px;
            background-color: var(--b3-theme-background);
            border-radius: 6px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.15);
            pointer-events: auto; 
            transform-origin: 0 0;
            overflow: hidden;
            border: 1px solid var(--b3-border-color);
            left: ${position.x}px;
            top: ${position.y}px;
            will-change: transform, left, top; /* 提高性能提示 */
        `;

        // 添加拖动手柄，简化样式
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 8px;
            cursor: move;
            background-color: rgba(0,0,0,0.08);
            border-radius: 4px 4px 0 0;
            z-index: 1;
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
     * 在画布上添加默认的思源块
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     * @param blockIds 思源块ID数组
     * @param domContainer DOM容器元素
     */
    private addDefaultBlocks(canvas: Canvas, id: string, blockIds: string[], domContainer: HTMLElement) {
        if (!blockIds || blockIds.length === 0 || !domContainer) return;

        // 计算每个块的布局位置
        const margin = 20;
        const startX = 50;
        const startY = 50;
        const columns = Math.min(1, blockIds.length);
        const blockWidth = 800;
        const blockHeight = 200;

        // 如果块数量超过阈值，使用延迟加载方式
        if (blockIds.length > 10) {
            // 显示提示
            showMessage(`正在加载 ${blockIds.length} 个块，使用延迟加载方式提高性能...`);

            // 创建加载指示器
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'whiteboard-loading-indicator';
            loadingIndicator.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.7);
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                z-index: 1000;
            `;
            loadingIndicator.innerHTML = `
                <div>正在加载块 <span id="loading-count-${id}">0</span>/${blockIds.length}</div>
                <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.3); margin-top: 8px; border-radius: 2px;">
                    <div id="loading-progress-${id}" style="width: 0%; height: 100%; background: #4CAF50; border-radius: 2px;"></div>
                </div>
            `;
            domContainer.appendChild(loadingIndicator);

            // 分批处理 + 延迟初始化
            const batchSize = 3;  // 减小每批处理的块数量
            let currentIndex = 0;

            const processNextBatch = () => {
                const endIndex = Math.min(currentIndex + batchSize, blockIds.length);
                const batch = blockIds.slice(currentIndex, endIndex);

                // 处理当前批次的块
                batch.forEach(async (blockId, batchIndex) => {
                    const index = currentIndex + batchIndex;

                    // 计算行和列
                    const col = index % columns;
                    const row = Math.floor(index / columns);

                    // 计算位置
                    const x = startX + col * (blockWidth + margin);
                    const y = startY + row * (blockHeight + margin);

                    // 创建容器元素，但先不初始化Protyle
                    const { container: protyledom, wrapper: wrapperDiv, dragHandle, resizeHandle } =
                        this.createProtyleContainer(`dom-default-block-${id}-${index}`, blockId, { x, y });

                    // 设置尺寸
                    protyledom.style.width = `${blockWidth}px`;
                    protyledom.style.height = `${blockHeight}px`;

                    // 先添加加载中的占位符
                    wrapperDiv.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%;">
                        <div class="b3-loading"></div>
                    </div>`;

                    // 添加到DOM容器
                    domContainer.appendChild(protyledom);

                    // 添加延迟初始化逻辑
                    protyledom.setAttribute('data-block-id', blockId);
                    protyledom.setAttribute('data-initialized', 'false');

                    // 尝试获取块内容预览
                    try {
                        // 获取块数据但限制加载
                        const blockData = await api.getBlockByID(blockId);

                        if (blockData && blockData.content) {
                            // 显示内容预览，限制长度
                            const previewContent = blockData.content.substring(0, 120); // 限制预览长度
                            wrapperDiv.innerHTML = `
                                <div class="block-preview" style="padding: 10px; height: 100%; overflow: hidden; display: flex; flex-direction: column;">
                                    <div style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-bottom: 6px;">点击加载完整内容</div>
                                    <div style="flex: 1; overflow: hidden; opacity: 0.85;">${previewContent}${blockData.content.length > 120 ? '...' : ''}</div>
                                </div>
                            `;
                        } else {
                            // 如果无法获取内容，显示默认占位符
                            wrapperDiv.innerHTML = `<div class="block-placeholder" style="padding: 10px; display: flex; align-items: center; justify-content: center; height: 100%;">
                                <span>点击加载块 ${index + 1}</span>
                            </div>`;
                        }
                    } catch (err) {
                        console.error("获取块预览失败:", err);
                        wrapperDiv.innerHTML = `<div class="block-placeholder" style="padding: 10px; display: flex; align-items: center; justify-content: center; height: 100%;">
                            <span>点击加载块 ${index + 1}</span>
                        </div>`;
                    }

                    // 只添加缩放功能，不初始化Protyle
                    ElementInteractions.addResizableToElement(protyledom, resizeHandle, canvas);

                    // 更新加载进度显示
                    const countElement = document.getElementById(`loading-count-${id}`);
                    const progressElement = document.getElementById(`loading-progress-${id}`);
                    if (countElement) countElement.textContent = `${index + 1}`;
                    if (progressElement) progressElement.style.width = `${((index + 1) / blockIds.length) * 100}%`;
                });

                // 更新索引
                currentIndex = endIndex;

                // 如果还有未处理的块，安排下一批处理
                if (currentIndex < blockIds.length) {
                    // 增加延时避免浏览器卡顿
                    setTimeout(processNextBatch, 100);
                } else {
                    // 全部加载完成，移除加载指示器
                    setTimeout(() => {
                        loadingIndicator.remove();

                        // 添加块初始化指导
                        const guide = document.createElement('div');
                        guide.className = 'whiteboard-guide';
                        guide.style.cssText = `
                            position: absolute;
                            bottom: 20px;
                            left: 50%;
                            transform: translateX(-50%);
                            background: rgba(33, 150, 243, 0.8);
                            color: white;
                            padding: 10px 16px;
                            border-radius: 4px;
                            font-size: 14px;
                            z-index: 900;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                            transition: opacity 0.5s;
                        `;
                        guide.innerHTML = '提示: 点击块可按需加载内容，双击已加载的块可编辑';
                        domContainer.appendChild(guide);

                        setTimeout(() => {
                            guide.style.opacity = '0';
                            setTimeout(() => guide.remove(), 500);
                        }, 5000);

                        showMessage(`已布局 ${blockIds.length} 个块，点击块可加载内容`);

                        // 给所有占位块添加点击事件，延迟初始化
                        this.setupLazyInitialization(id, domContainer, canvas);
                    }, 500);
                }
            };

            // 开始处理第一批
            setTimeout(processNextBatch, 100);
        } else {
            // 块数量较少，全部加载，但也使用延迟初始化
            blockIds.forEach((blockId, index) => {
                // 计算行和列
                const col = index % columns;
                const row = Math.floor(index / columns);

                // 计算位置
                const x = startX + col * (blockWidth + margin);
                const y = startY + row * (blockHeight + margin);

                // 创建容器元素
                const { container: protyledom, wrapper: wrapperDiv, dragHandle, resizeHandle } =
                    this.createProtyleContainer(`dom-default-block-${id}-${index}`, blockId, { x, y });

                // 设置尺寸
                protyledom.style.width = `${blockWidth}px`;
                protyledom.style.height = `${blockHeight}px`;

                // 仅对前3个块直接初始化，其余使用延迟加载
                if (index < 10) {
                    // 初始化编辑器
                    const protyle = this.initProtyleEditor(wrapperDiv, blockId, id);
                    protyledom.setAttribute('data-initialized', 'true');
                } else {
                    // 为其余块添加占位符
                    wrapperDiv.innerHTML = `<div class="block-placeholder" style="padding: 10px; display: flex; align-items: center; justify-content: center; height: 100%;">
                        <span>点击加载内容</span>
                    </div>`;
                    protyledom.setAttribute('data-block-id', blockId);
                    protyledom.setAttribute('data-initialized', 'false');
                }

                // 添加到DOM容器
                domContainer.appendChild(protyledom);

                // 添加缩放功能
                ElementInteractions.addResizableToElement(protyledom, resizeHandle, canvas);
            });

            // 设置延迟初始化
            this.setupLazyInitialization(id, domContainer, canvas);

            // 显示成功消息
            if (blockIds.length > 0) {
                showMessage(`已加载 ${blockIds.length} 个块，点击块可查看内容`);
            }
        }
    }

    // 添加新方法处理延迟初始化
    // 修改 setupLazyInitialization 方法中添加点击事件处理延迟加载的部分

    /**
     * 设置延迟初始化和视窗内自动加载
     * @param id 画布ID
     * @param domContainer DOM容器元素
     * @param canvas 画布实例
     */
    private setupLazyInitialization(id: string, domContainer: HTMLElement, canvas: Canvas) {
        // 查找所有未初始化的块
        const unInitializedBlocks = domContainer.querySelectorAll('[data-initialized="false"]');

        if (unInitializedBlocks.length === 0) return;

        // 保存加载中状态和回收状态的映射
        const loadingStates = new Map<HTMLElement, boolean>();
        const recycledStates = new Map<HTMLElement, boolean>();

        // 批量加载最多同时处理的块数
        const MAX_CONCURRENT_LOADS = 2;
        // 当前正在加载的块数量
        let currentlyLoading = 0;

        // 优先队列 - 按视窗距离排序等待加载的块
        const loadingQueue: { element: HTMLElement, priority: number }[] = [];

        // 已加载块的最大数量（超过此数量需要回收）
        const MAX_ACTIVE_BLOCKS = 30;

        // 检查并回收不在视窗内的块
        const recycleOffscreenBlocks = () => {
            // 仅当已加载的块超过阈值时进行回收
            const initializedBlocks = Array.from(domContainer.querySelectorAll('[data-initialized="true"]')) as HTMLElement[];

            if (initializedBlocks.length <= MAX_ACTIVE_BLOCKS) return;

            // 计算每个块的视窗优先级（视窗内的保留，视窗外按距离排序）
            const blockPriorities = initializedBlocks.map(block => {
                // 计算块到视窗的距离
                const isVisible = this.isElementInViewport(block, canvas, 0); // 0 padding表示严格在视窗内
                const rect = block.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const canvasRect = canvas.getElement().getBoundingClientRect();
                const canvasCenterX = canvasRect.left + canvasRect.width / 2;
                const canvasCenterY = canvasRect.top + canvasRect.height / 2;

                // 计算到视窗中心的距离
                const distance = Math.sqrt(
                    Math.pow(centerX - canvasCenterX, 2) +
                    Math.pow(centerY - canvasCenterY, 2)
                );

                return {
                    element: block,
                    isVisible,
                    distance,
                    blockId: block.getAttribute('data-block-id') || ''
                };
            });

            // 优先回收不在视图内且距离最远的块
            blockPriorities
                .filter(item => !item.isVisible) // 只处理不在视图内的块
                .sort((a, b) => b.distance - a.distance) // 距离越远，优先回收
                .slice(0, initializedBlocks.length - MAX_ACTIVE_BLOCKS) // 只回收超出上限的部分
                .forEach(item => {
                    // 标记为已回收
                    recycledStates.set(item.element, true);

                    // 找到wrapper元素
                    const wrapper = item.element.querySelector('.protyle-wrapper') as HTMLElement;
                    if (!wrapper) return;

                    // 将已初始化的块回收，保存部分预览内容
                    const blockId = item.blockId;
                    console.log(`回收视窗外块: ${blockId}`);

                    try {
                        // 提取当前内容用于预览
                        const contentElement = wrapper.querySelector('.protyle-wysiwyg') ||
                            wrapper.querySelector('.protyle-content');

                        let previewContent = '';
                        if (contentElement) {
                            // 提取内容的文本
                            previewContent = contentElement.textContent || '';
                            previewContent = previewContent.substring(0, 120);
                        }

                        // 在移除 Protyle 内容前将原有的 Protyle 实例清理
                        // 查找并清理所有相关的事件监听器和 DOM 元素
                        const protyleInstances = wrapper.querySelectorAll('[data-subtype="protyle"]');
                        protyleInstances.forEach(instance => {
                            // 尝试标记实例为已销毁，以防止重复使用
                            if (instance['protyle']) {
                                try {
                                    // 模拟销毁实例
                                    if (typeof instance['protyle'].destroy === 'function') {
                                        instance['protyle'].destroy();
                                    }
                                    // 移除所有属性
                                    Object.keys(instance['protyle']).forEach(key => {
                                        delete instance['protyle'][key];
                                    });
                                    instance['protyle'] = null;
                                } catch (e) {
                                    console.warn("清理 Protyle 实例失败", e);
                                }
                            }
                            // 移除元素
                            instance.remove();
                        });

                        // 清空 wrapper 内容
                        wrapper.innerHTML = '';

                        // 从DOM中移除protyle实例但保留容器
                        item.element.setAttribute('data-initialized', 'recycled');

                        // 显示预览内容
                        wrapper.innerHTML = `
                        <div class="block-preview" style="padding: 10px; height: 100%; overflow: hidden; display: flex; flex-direction: column;">
                            <div style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-bottom: 6px;">内容已回收，点击恢复</div>
                            <div style="flex: 1; overflow: hidden; opacity: 0.85;">${previewContent}${previewContent.length >= 120 ? '...' : ''}</div>
                        </div>
                    `;

                        // 添加点击事件以恢复块
                        const clickHandler = function () {
                            // 移除点击事件处理程序，防止重复触发
                            wrapper.removeEventListener('click', clickHandler);

                            // 恢复块
                            item.element.setAttribute('data-initialized', 'false');
                            recycledStates.delete(item.element);

                            // 延迟一点加载，以确保旧资源被完全清理
                            setTimeout(() => {
                                loadBlock(item.element);
                            }, 100);
                        };

                        wrapper.addEventListener('click', clickHandler);

                    } catch (err) {
                        console.error("回收块失败:", err);
                        // 清空内容，强制重新加载
                        wrapper.innerHTML = '';

                        wrapper.innerHTML = `<div style="padding: 10px; color: var(--b3-theme-on-surface-light);">
                        内容已回收，点击恢复
                    </div>`;

                        // 添加点击事件以恢复块
                        wrapper.addEventListener('click', () => {
                            item.element.setAttribute('data-initialized', 'false');
                            recycledStates.delete(item.element);

                            // 延迟加载
                            setTimeout(() => {
                                loadBlock(item.element);
                            }, 100);
                        });
                    }
                });
        };

        // 检查视窗内需要加载的元素
        const checkVisibleBlocks = () => {
            // 首先检查是否需要回收不在视图内的块
            recycleOffscreenBlocks();

            // 如果正在加载的块达到上限，不继续检查
            if (currentlyLoading >= MAX_CONCURRENT_LOADS) return;

            // 清空优先队列
            loadingQueue.length = 0;

            // 检查所有未初始化的块（包括被回收的块）
            const blocksToCheck = domContainer.querySelectorAll('[data-initialized="false"],[data-initialized="recycled"]');

            blocksToCheck.forEach((block) => {
                const blockElement = block as HTMLElement;

                // 已经在加载中的跳过
                if (loadingStates.get(blockElement)) return;

                // 检查是否在视窗内
                const isVisible = this.isElementInViewport(blockElement, canvas);

                if (isVisible) {
                    // 计算到视窗中心的距离作为优先级
                    const rect = blockElement.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const canvasRect = canvas.getElement().getBoundingClientRect();
                    const canvasCenterX = canvasRect.left + canvasRect.width / 2;
                    const canvasCenterY = canvasRect.top + canvasRect.height / 2;

                    // 计算距离视窗中心的距离
                    const distance = Math.sqrt(
                        Math.pow(centerX - canvasCenterX, 2) +
                        Math.pow(centerY - canvasCenterY, 2)
                    );

                    // 回收状态的优先级稍高（因为之前已经被查看过）
                    const priorityBonus = blockElement.getAttribute('data-initialized') === 'recycled' ? -500 : 0;

                    // 添加到优先队列，距离越近优先级越高
                    loadingQueue.push({
                        element: blockElement,
                        priority: distance + priorityBonus
                    });
                }
            });

            // 按优先级排序(距离越近越优先)
            loadingQueue.sort((a, b) => a.priority - b.priority);

            // 处理队列中的块
            while (loadingQueue.length > 0 && currentlyLoading < MAX_CONCURRENT_LOADS) {
                const { element } = loadingQueue.shift()!;
                loadBlock(element);
            }
        };

        // 异步加载块内容
        const loadBlock = async (blockElement: HTMLElement) => {
            if (loadingStates.get(blockElement)) return; // 已在加载中

            const blockId = blockElement.getAttribute('data-block-id');
            const wrapper = blockElement.querySelector('.protyle-wrapper');

            if (!blockId || !wrapper) return;

            // 标记为加载中
            loadingStates.set(blockElement, true);
            currentlyLoading++;

            // 显示加载状态
            (wrapper as HTMLElement).innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%;">
                <div class="b3-loading"></div>
            </div>`;

            try {
                // 使用延时确保UI更新
                await new Promise(resolve => setTimeout(resolve, 50));

                // 初始化编辑器
                const protyle = this.initProtyleEditor(wrapper as HTMLElement, blockId, id);

                if (protyle) {
                    blockElement.setAttribute('data-initialized', 'true');
                    console.log(`自动加载了视窗内块: ${blockId}`);
                } else {
                    // 初始化失败时显示错误信息
                    (wrapper as HTMLElement).innerHTML = `<div style="padding: 10px; color: var(--b3-theme-error);">
                        加载失败，点击重试
                    </div>`;
                }
            } catch (err) {
                console.error("加载块内容失败:", err);
                (wrapper as HTMLElement).innerHTML = `<div style="padding: 10px; color: var(--b3-theme-error);">
                    加载失败，点击重试
                </div>`;
            } finally {
                // 标记为加载完成
                loadingStates.set(blockElement, false);
                currentlyLoading--;

                // 加载完一个块后，检查是否还有其他可见块需要加载
                setTimeout(checkVisibleBlocks, 100);
            }
        };

        // 为未加载的块添加点击事件处理程序
        unInitializedBlocks.forEach(async block => {
            const blockElement = block as HTMLElement;
            const blockId = blockElement.getAttribute('data-block-id');
            const wrapper = blockElement.querySelector('.protyle-wrapper');

            if (!blockId || !wrapper) return;

            // 为未加载的块获取预览内容
            try {
                // 获取块内容用于预览显示
                const blockData = await api.getBlockByID(blockId);

                if (blockData && blockData.content) {
                    // 显示内容预览
                    const previewContent = blockData.content.substring(0, 120); // 限制预览长度
                    (wrapper as HTMLElement).innerHTML = `
                        <div class="block-preview" style="padding: 10px; height: 100%; overflow: hidden; display: flex; flex-direction: column;">
                            <div style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-bottom: 6px;">点击加载完整内容</div>
                            <div style="flex: 1; overflow: hidden; opacity: 0.85;">${previewContent}${blockData.content.length > 120 ? '...' : ''}</div>
                        </div>
                    `;
                } else {
                    // 如果无法获取内容，显示默认占位符
                    (wrapper as HTMLElement).innerHTML = `<div class="block-placeholder" style="padding: 10px; display: flex; align-items: center; justify-content: center; height: 100%;">
                        <span>点击加载块内容</span>
                    </div>`;
                }
            } catch (err) {
                console.error("获取块预览失败:", err);
                (wrapper as HTMLElement).innerHTML = `<div class="block-placeholder" style="padding: 10px; display: flex; align-items: center; justify-content: center; height: 100%;">
                    <span>点击加载块内容</span>
                </div>`;
            }

            // 添加点击事件处理延迟加载
            (wrapper as HTMLElement).addEventListener('click', () => {
                if (blockElement.getAttribute('data-initialized') === 'true') return;
                loadBlock(blockElement);
            });
        });

        // 使用限流处理平移和缩放事件，避免频繁触发
        let viewCheckTimer: number | null = null;
        let lastTransformMatrix: number[] | null = null;

        const debouncedViewCheck = () => {
            if (viewCheckTimer) {
                clearTimeout(viewCheckTimer);
            }

            viewCheckTimer = window.setTimeout(() => {
                // 检查变换矩阵是否有明显变化
                const currentTransform = canvas.viewportTransform;
                if (currentTransform && lastTransformMatrix) {
                    const hasSignificantChange =
                        Math.abs(currentTransform[4] - lastTransformMatrix[4]) > 10 ||
                        Math.abs(currentTransform[5] - lastTransformMatrix[5]) > 10 ||
                        Math.abs(currentTransform[0] - lastTransformMatrix[0]) > 0.01;

                    if (hasSignificantChange) {
                        checkVisibleBlocks();
                        lastTransformMatrix = [...currentTransform];
                    }
                } else if (currentTransform) {
                    lastTransformMatrix = [...currentTransform];
                    checkVisibleBlocks();
                }

                viewCheckTimer = null;
            }, 300);
        };

        // 监听画布事件
        canvas.on('mouse:up', debouncedViewCheck);
        canvas.on('mouse:wheel', debouncedViewCheck);


        // 初始化上次变换矩阵
        if (canvas.viewportTransform) {
            lastTransformMatrix = [...canvas.viewportTransform];
        }

        // 初次检查可视区域内的块
        setTimeout(() => {
            checkVisibleBlocks();
        }, 500);

        // 每5秒周期性检查一次，减少检查频率
        const intervalCheckId = window.setInterval(() => {
            const unloadedBlocksCount = domContainer.querySelectorAll('[data-initialized="false"],[data-initialized="recycled"]').length;
            if (unloadedBlocksCount === 0) {
                clearInterval(intervalCheckId);
            } else {
                checkVisibleBlocks();
            }
        }, 5000);  // 延长间隔时间

        // 保存定时器ID
        domContainer.setAttribute('data-interval-id', intervalCheckId.toString());
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
            // Check if overlay already exists before adding it
            const existingOverlay = container.querySelector('.block-overlay');
            if (!existingOverlay) {
                container.appendChild(overlayDiv);
            }

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
            this.makeElementDraggable(overlayDiv, container, this.canvasInstances.get(id),id);

            // 点击画布空白处时禁用所有块的交互 - 使用命名函数以便清理
            const handleDocumentClick = (e: MouseEvent) => {
                // 检查点击是否在此容器外部
                if (isSelected && !container.contains(e.target as Node) && e.target !== deleteButton) {
                    disableInteraction();
                }
            };

            // 添加点击监听
            document.addEventListener('click', handleDocumentClick);

            // 存储清理函数，以便之后移除监听器
            container.dataset.clickHandler = 'true';

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

            // 记录最后交互时间，用于回收策略
            container.dataset.lastInteractTime = Date.now().toString();

            // 当用户与块交互时更新时间戳
            const updateInteractionTime = () => {
                container.dataset.lastInteractTime = Date.now().toString();
            };

            overlayDiv.addEventListener('mousedown', updateInteractionTime);
            wrapper.addEventListener('click', updateInteractionTime);
            wrapper.addEventListener('focus', updateInteractionTime, true);

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
    private makeElementDraggable(overlayElement: HTMLElement, containerElement: HTMLElement, canvas: Canvas, id: string) {
        // 状态变量
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;
        let dragThrottleTimeout = null;

        // 开始拖拽的处理函数
        const startDrag = (e: MouseEvent | TouchEvent) => {
            // 阻止事件冒泡
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

            // 使用被动事件监听器提高性能
            document.addEventListener('mousemove', moveDrag, { capture: true });
            document.addEventListener('touchmove', moveDrag, { capture: true, passive: false });
            document.addEventListener('mouseup', stopDrag, { capture: true });
            document.addEventListener('touchend', stopDrag, { capture: true });

            // 添加活动样式，但减少不必要的样式变化
            containerElement.classList.add('dragging');
            containerElement.style.zIndex = '1000';
        };

        // 使用防抖处理拖拽移动，提升性能
        const moveDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();

            if (dragThrottleTimeout) return; // 如果计时器存在，直接返回

            // 设置节流计时器，提高性能
            dragThrottleTimeout = setTimeout(() => {
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

                // 使用transform而不是left/top，提高性能
                const newLeft = initialLeft + deltaX;
                const newTop = initialTop + deltaY;

                // 使用transform代替left/top属性提高性能
                containerElement.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;

                // 清除节流计时器
                dragThrottleTimeout = null;
            }, 16); // 8ms的节流间隔，约等于120fps
        };

        // 结束拖拽处理函数
        const stopDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;

            isDragging = false;

            // 清除节流计时器
            if (dragThrottleTimeout) {
                clearTimeout(dragThrottleTimeout);
                dragThrottleTimeout = null;
            }

            // 移除临时事件监听器
            document.removeEventListener('mousemove', moveDrag, { capture: true });
            document.removeEventListener('touchmove', moveDrag, { capture: true });
            document.removeEventListener('mouseup', stopDrag, { capture: true });
            document.removeEventListener('touchend', stopDrag, { capture: true });

            // 获取当前transform计算的位置
            const transformStyle = containerElement.style.transform;
            let deltaX = 0, deltaY = 0;

            if (transformStyle) {
                const match = transformStyle.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
                if (match) {
                    deltaX = parseFloat(match[1]);
                    deltaY = parseFloat(match[2]);
                }
            }

            // 更新实际位置并清除transform
            containerElement.style.left = `${initialLeft + deltaX}px`;
            containerElement.style.top = `${initialTop + deltaY}px`;
            containerElement.style.transform = '';

            // 恢复正常样式
            containerElement.classList.remove('dragging');
            containerElement.style.zIndex = '';
        };

        // 添加拖拽事件监听器，使用passive提高性能
        overlayElement.addEventListener('mousedown', startDrag);
        overlayElement.addEventListener('touchstart', startDrag, { passive: true });

        // 添加鼠标滚轮缩放功能
        containerElement.addEventListener('wheel', (e) => {
            // 检查元素是否处于选中状态，如果是则不执行缩放操作
            if (containerElement.classList.contains('block-selected')) {
            return; // 元素被选中时，不处理缩放
            }
            
            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
            
            // 直接调用 PanZoomHandler 中的缩放代码
            // 计算缩放系数
            const delta = e.deltaY;
            let zoom = canvas.getZoom();
            zoom = zoom * (0.999 ** delta);
            
            // 限制缩放范围
            zoom = Math.min(Math.max(0.1, zoom), 10);
            
            // 获取鼠标位置，以此为中心点进行缩放
            const rect = canvas.getElement().getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            const point = new fabric.Point(offsetX, offsetY);
            
            // 执行缩放
            canvas.zoomToPoint(point, zoom);
            
            // 更新网格
            const vpt = canvas.viewportTransform;
            if (vpt) {
            // 更新网格位置
            const gridManager = new GridManager(id, canvas);
            gridManager.updateGridPosition(vpt);
            
            // 更新缩放显示
            const zoomDisplay = document.getElementById(`zoom-display-${id}`);
            if (zoomDisplay) {
                const zoomPercent = Math.round(zoom * 100);
                zoomDisplay.textContent = `缩放: ${zoomPercent}%`;
            }
            }
        }, { passive: false });
    }

    /**
     * 检查给定元素是否在当前视窗内
     * 优化版本：使用边界框快速检测，减少计算量
     * @param element 要检查的DOM元素
     * @param canvas 画布实例
     * @param padding 视窗外的额外检查边距(像素)
     * @returns 是否在视窗内
     */
    /**
     * 优化版的 isElementInViewport 方法
     * 使用缓存和更高效的计算方式
     */
    private isElementInViewport(element: HTMLElement, canvas: Canvas, padding: number = 200): boolean {
        if (!canvas || !canvas.viewportTransform) return false;

        // 获取缓存的位置信息，避免重复计算
        let left, top, width, height;

        // 使用数据属性缓存最后计算的宽高（避免频繁的样式计算）
        const cachedWidth = element.getAttribute('data-cached-width');
        const cachedHeight = element.getAttribute('data-cached-height');

        if (cachedWidth && cachedHeight) {
            width = parseFloat(cachedWidth);
            height = parseFloat(cachedHeight);
        } else {
            // 如果没有缓存，计算并存储
            const style = window.getComputedStyle(element);
            width = parseFloat(style.width || '0');
            height = parseFloat(style.height || '0');

            // 缓存宽高（只有实际渲染后才能获取准确值）
            if (width > 0 && height > 0) {
                element.setAttribute('data-cached-width', width.toString());
                element.setAttribute('data-cached-height', height.toString());
            }
        }

        // 直接从样式中获取位置（这是更新频率最高的）
        left = parseFloat(element.style.left || '0');
        top = parseFloat(element.style.top || '0');

        // 如果元素没有尺寸，提前返回
        if (width <= 0 || height <= 0) return false;

        // 获取画布变换矩阵
        const vpt = canvas.viewportTransform;
        const zoom = vpt[0]; // 假设x和y的缩放一致

        // 获取视窗边界（考虑padding）
        const paddingInCanvasSpace = padding / zoom;
        const viewportLeft = -vpt[4] / zoom - paddingInCanvasSpace;
        const viewportTop = -vpt[5] / zoom - paddingInCanvasSpace;
        const viewportRight = viewportLeft + (canvas.width! / zoom) + 2 * paddingInCanvasSpace;
        const viewportBottom = viewportTop + (canvas.height! / zoom) + 2 * paddingInCanvasSpace;

        // 计算元素在画布坐标系中的边界框
        const elementRight = left + width / zoom;
        const elementBottom = top + height / zoom;

        // 使用AABB检测
        return !(
            elementRight < viewportLeft ||
            left > viewportRight ||
            elementBottom < viewportTop ||
            top > viewportBottom
        );
    }




    /**
     * 清理所有画布实例和资源
     */
    private cleanUp() {
        // 销毁所有画布实例
        this.canvasInstances.forEach((canvas) => {
            canvas.dispose();
        });

        // 清理自动加载的定时器
        document.querySelectorAll('[data-interval-id]').forEach(element => {
            const intervalId = parseInt(element.getAttribute('data-interval-id') || '0');
            if (intervalId) {
                clearInterval(intervalId);
            }
        });

        // 清空实例映射表
        this.canvasInstances.clear();

        // 移除可能添加的样式元素
        document.querySelectorAll('[id^="grid-style-"]').forEach(element => {
            element.remove();
        });
    }
}