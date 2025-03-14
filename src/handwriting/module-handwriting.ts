import * as ic from "@/icon"
import { openTab, Plugin, Protyle, showMessage } from "siyuan";
import './handwriting.css';
// 引入 fabric.js 库
import { Canvas } from 'fabric/fabric-impl';
import * as fabric from 'fabric';
import { PluginConfig } from "@/savedata";

export class M_handwriting {
    private plugin: Plugin;
    // 存储画布实例的映射表
    private canvasInstances: Map<string, Canvas> = new Map();
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
        this.initializeCanvas(id);
    }


    /**
     * 初始化Fabric.js画布
     * @param id 画布ID
     */
    private initializeCanvas(id: string) {
        // 获取容器和画布元素
        const container = document.getElementById(`steveTool-whiteboard-${id}`);
        const canvasEl = document.getElementById(`canvas-${id}`) as HTMLCanvasElement;

        if (!container || !canvasEl) {
            showMessage("无法创建画板");
            return;
        }

        // 设置画布尺寸为容器大小
        canvasEl.width = container.clientWidth;
        canvasEl.height = container.clientHeight;

        // 创建Fabric画布实例
        const canvas = new fabric.Canvas(canvasEl, {
            backgroundColor: 'transparent', // 透明背景，网格由CSS实现
            preserveObjectStacking: true,
            selection: true,
            renderOnAddRemove: true,
            // 允许画布内容超出可视区域（实现无限画布的关键）
            allowTouchScrolling: false
        });

        // 保存画布实例以便后续使用
        this.canvasInstances.set(id, canvas);

        // 初始化背景网格
        this.initBackgroundGrid(id);

        // 设置画布平移和缩放功能
        this.setupPanZoom(canvas, id);

        // 设置DOM元素添加功能
        this.setupDomElementAddition(canvas, id);

        // 设置思源块拖放功能
        this.setupSiyuanBlockDrop(canvas, id);

        // 设置响应式尺寸
        this.setupResponsiveCanvas(canvas, container);
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
            this.setupElementInteractions(protyledom, dragHandle, resizeHandle, canvas, id);


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

            // 添加缩放功能（但不添加拖拽功能）
            this.setupElementInteractions(protyledom, dragHandle, resizeHandle, canvas, id);

            // 显示成功消息
            showMessage('已添加新元素，可直接拖拽移动位置或缩放大小');

            console.log("拖放位置(画布坐标):", { x: canvasX, y: canvasY });
        });

        // 添加提示
        addButtonBtn.setAttribute('title', '拖拽此按钮到画布中创建新元素');
    }



    /**
     * 为元素添加缩放功能
     * @param element 要添加缩放功能的元素
     * @param handle 缩放手柄元素
     * @param canvas 相关的Fabric画布
     */
    private addResizableToElement(element: HTMLElement, handle: HTMLElement, canvas: Canvas) {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        const startResize = (e: MouseEvent | TouchEvent) => {
            isResizing = true;

            // 获取触摸/鼠标的初始位置
            if (e instanceof MouseEvent) {
                startX = e.clientX;
                startY = e.clientY;
            } else if (e instanceof TouchEvent && e.touches && e.touches[0]) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }

            // 获取元素的当前样式
            const computedStyle = window.getComputedStyle(element);
            startWidth = parseFloat(computedStyle.width);
            startHeight = parseFloat(computedStyle.height);

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();

            // 添加临时事件监听器
            document.addEventListener('mousemove', moveResize);
            document.addEventListener('touchmove', moveResize, { passive: false });
            document.addEventListener('mouseup', stopResize);
            document.addEventListener('touchend', stopResize);

            // 添加活动样式
            element.style.opacity = '0.8';
        };

        const moveResize = (e: MouseEvent | TouchEvent) => {
            if (!isResizing) return;

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
            const deltaX = (clientX - startX) / scale;
            const deltaY = (clientY - startY) / scale;

            // 计算新尺寸（确保最小尺寸）
            const newWidth = Math.max(50, startWidth + deltaX);
            const newHeight = Math.max(50, startHeight + deltaY);

            // 更新元素尺寸
            element.style.width = `${newWidth}px`;
            element.style.height = `${newHeight}px`;

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
        };

        const stopResize = (e: MouseEvent | TouchEvent) => {
            if (!isResizing) return;
            isResizing = false;

            // 移除临时事件监听器
            document.removeEventListener('mousemove', moveResize);
            document.removeEventListener('touchmove', moveResize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('touchend', stopResize);

            // 恢复正常样式
            element.style.opacity = '1';

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
        };

        // 添加缩放事件监听器
        handle.addEventListener('mousedown', startResize);
        handle.addEventListener('touchstart', startResize, { passive: false });
    }







    /**
     * 初始化背景网格
     * @param id 画布ID
     */
    private initBackgroundGrid(id: string) {
        // 创建并添加背景网格样式
        const styleElement = document.createElement('style');
        styleElement.id = `grid-style-${id}`;
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
                    linear-gradient(to right, var(--b3-border-color) 1px, transparent 1px),
                    linear-gradient(to bottom, var(--b3-border-color) 1px, transparent 1px);
                transform-origin: 0 0;
            }
        `;
        document.head.appendChild(styleElement);
    }



    /**
     * 设置画布的平移和缩放功能
     * @param canvas Fabric.js画布实例
     * @param id 画布ID 
     */
    private setupPanZoom(canvas: Canvas, id: string) {
        // 状态变量
        let isDragging = false;
        let lastPosX = 0;
        let lastPosY = 0;

        // 获取缩放显示元素和重置按钮
        const zoomDisplay = document.getElementById(`zoom-display-${id}`);
        const resetViewButton = document.getElementById(`reset-view-${id}`);

        // 初始更新缩放显示
        this.updateZoomDisplay(id, canvas.getZoom());

        // 绑定重置视图按钮事件
        if (resetViewButton) {
            resetViewButton.addEventListener('click', () => {
                // 重置视口变换为默认状态
                canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

                // 更新网格
                this.updateGridPosition(id, canvas.viewportTransform || [1, 0, 0, 1, 0, 0]);

                // 更新缩放显示
                this.updateZoomDisplay(id, 1);

                // 重新渲染画布
                canvas.requestRenderAll();
            });
        }

        // 鼠标按下事件
        canvas.on('mouse:down', (opt) => {
            const evt = opt.e;

            // 空格键按下时或中键点击时或在空白处左键点击
            if (evt instanceof MouseEvent && (evt.button === 1 || (evt.button === 0 && !opt.target))) {
                isDragging = true;
                lastPosX = evt.clientX;
                lastPosY = evt.clientY;
                canvas.selection = false; // 暂时禁用选择功能
                canvas.defaultCursor = 'grabbing';
                evt.preventDefault();
                evt.stopPropagation();
            }
        });

        // 鼠标移动事件
        canvas.on('mouse:move', (opt) => {
            if (isDragging) {
                const evt = opt.e;
                // 处理不同类型的事件(鼠标或触摸)
                const clientX = evt instanceof MouseEvent ? evt.clientX :
                    evt.touches && evt.touches[0] ? evt.touches[0].clientX : lastPosX;
                const clientY = evt instanceof MouseEvent ? evt.clientY :
                    evt.touches && evt.touches[0] ? evt.touches[0].clientY : lastPosY;

                const deltaX = clientX - lastPosX;
                const deltaY = clientY - lastPosY;
                lastPosX = clientX;
                lastPosY = clientY;

                // 获取并更新视口变换矩阵
                const vpt = canvas.viewportTransform;
                if (!vpt) return;

                // 平移视口
                vpt[4] += deltaX;
                vpt[5] += deltaY;

                // 更新画布和网格
                canvas.requestRenderAll();
                this.updateGridPosition(id, vpt);

                evt.preventDefault();
                evt.stopPropagation();
            }
        });

        // 鼠标释放事件
        canvas.on('mouse:up', () => {
            if (isDragging) {
                isDragging = false;
                canvas.selection = true;
                canvas.defaultCursor = 'default';
            }
        });

        // 鼠标滚轮缩放事件
        canvas.on('mouse:wheel', (opt) => {
            const evt = opt.e;
            evt.preventDefault();
            evt.stopPropagation();

            // 计算缩放系数
            const delta = evt.deltaY;
            let zoom = canvas.getZoom();
            zoom = zoom * (0.999 ** delta);

            // 限制缩放范围
            zoom = Math.min(Math.max(0.1, zoom), 10);

            // 获取鼠标位置，以此为中心点进行缩放
            const point = new fabric.Point(evt.offsetX, evt.offsetY);

            // 执行缩放
            canvas.zoomToPoint(point, zoom);

            // 更新网格
            const vpt = canvas.viewportTransform;
            if (vpt) {
                this.updateGridPosition(id, vpt);

                // 更新缩放显示
                this.updateZoomDisplay(id, zoom);
            }
        });
    }

    /**
     * 更新缩放比例显示
     * @param id 画布ID
     * @param zoom 缩放比例
     */
    private updateZoomDisplay(id: string, zoom: number) {
        const zoomDisplay = document.getElementById(`zoom-display-${id}`);
        if (zoomDisplay) {
            // 将缩放比例转换为百分比并显示
            const zoomPercent = Math.round(zoom * 100);
            zoomDisplay.textContent = `缩放: ${zoomPercent}%`;
        }
    }

    /**
     * 更新网格位置和大小以匹配画布变换
     * @param id 画布ID
     * @param viewportTransform 视口变换矩阵
     */
    private updateGridPosition(id: string, viewportTransform: number[]) {
        const gridElement = document.getElementById(`grid-${id}`);
        if (!gridElement) return;

        // 获取当前缩放比例
        const zoom = viewportTransform[0];

        // 计算网格尺寸，随缩放变化
        const gridSize = Math.max(10, 20 * zoom);

        // 计算网格偏移量，实现平移效果
        const offsetX = viewportTransform[4] % gridSize;
        const offsetY = viewportTransform[5] % gridSize;

        // 应用变换
        gridElement.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        gridElement.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
    }

    /**
     * 设置画布响应式尺寸
     * @param canvas Fabric.js画布实例
     * @param container 容器元素
     */
    private setupResponsiveCanvas(canvas: Canvas, container: HTMLElement) {
        // 使用ResizeObserver监听容器尺寸变化
        const resizeObserver = new ResizeObserver(() => {
            // 调整画布尺寸
            canvas.setWidth(container.clientWidth);
            canvas.setHeight(container.clientHeight);
            canvas.renderAll();
        });

        // 监听容器
        resizeObserver.observe(container);
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
     * 为元素添加拖拽和缩放功能
     * @param element 要处理的元素
     * @param dragHandle 拖动手柄元素
     * @param resizeHandle 缩放手柄元素
     * @param canvas 相关的Fabric画布
     * @param id 画布ID
     */
    private setupElementInteractions(element: HTMLElement, dragHandle: HTMLElement, resizeHandle: HTMLElement, canvas: Canvas, id: string) {
        // 为缩放手柄添加缩放功能
        this.addResizableToElement(element, resizeHandle, canvas);

        // 不需要再将拖拽功能绑定到拖动手柄，因为我们已经通过覆盖层实现了拖拽
        // 可以隐藏或者移除拖动手柄，或者赋予它其他功能

        // 可选：将拖动手柄改为标题栏或隐藏按钮
        dragHandle.style.cursor = 'default';
        dragHandle.title = '双击编辑内容';
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