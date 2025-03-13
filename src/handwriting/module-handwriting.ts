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
        const id = "123";
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
         style="width: 100%; height: 100%; position: relative; overflow: hidden; background-color: #f5f5f5;">
        <div class="whiteboard-controls" style="position: absolute; top: 10px; right: 10px; z-index: ${window.siyuan.zIndex}; 
             background-color: rgba(255, 255, 255, 0.7); padding: 5px 10px; border-radius: 4px; font-size: 14px;">
            <span id="zoom-display-${id}">缩放: 100%</span>
            <button id="reset-view-${id}" style="margin-left: 10px; background: #e8e8e8; border: 1px solid #ccc; 
                    border-radius: 4px; padding: 2px 8px; cursor: pointer;">重置视图</button>
            <button id="add-text-${id}" style="margin-left: 10px; background: #e8e8e8; border: 1px solid #ccc; 
                    border-radius: 4px; padding: 2px 8px; cursor: pointer;">添加文本</button>
            <button id="add-button-${id}" style="margin-left: 10px; background: #e8e8e8; border: 1px solid #ccc; 
                    border-radius: 4px; padding: 2px 8px; cursor: pointer;">添加按钮</button>
        </div>
        <canvas id='canvas-${id}'></canvas>
        <div id='grid-${id}' class="whiteboard-grid"></div>
        <div id="dom-elements-container-${id}" style="position: absolute; top: 0; left: 0; pointer-events: none;"></div>
    </div>`;

        // 初始化画布
        this.initializeCanvas(id);
    }

    /**
     * 为无限画板添加数据保存与恢复功能
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     */
    private setupSaveAndRestore(canvas: Canvas, id: string) {
        // 获取控制栏，添加保存按钮
        const controlsContainer = document.querySelector(`.whiteboard-controls`);

        if (!controlsContainer) return;

        // 创建保存按钮
        const saveButton = document.createElement('button');
        saveButton.id = `save-whiteboard-${id}`;
        saveButton.textContent = '保存';
        saveButton.style.cssText = `
            margin-left: 10px; 
            background: #e8e8e8; 
            border: 1px solid #ccc; 
            border-radius: 4px; 
            padding: 2px 8px; 
            cursor: pointer;
        `;

        // 添加保存按钮到控制栏
        controlsContainer.appendChild(saveButton);

        // 绑定保存按钮点击事件
        saveButton.addEventListener('click', () => {
            this.saveWhiteboardData(canvas, id);
        });

        // 尝试恢复已保存的数据
        this.restoreWhiteboardData(canvas, id);
    }

    /**
     * 保存画板数据
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     */
    private async saveWhiteboardData(canvas: Canvas, id: string) {
        try {
            // 1. 初始化配置管理器
            const configManager = new PluginConfig("siyuan-steve-tools", "whiteboard");
            await configManager.load();


            // 2. 收集Canvas中的对象数据
            const canvasData = canvas.toObject(['id', 'name', 'customType']);

            // 3. 收集DOM元素数据
            const domElements = document.querySelectorAll(`#dom-elements-container-${id} > div`);
            const domElementsData: any[] = [];

            domElements.forEach((el: HTMLElement) => {
                // 仅处理有ID的元素
                if (el.id) {
                    // 获取位置和尺寸
                    const style = window.getComputedStyle(el);

                    // 获取内部编辑器内容
                    const wrapper = el.querySelector('.protyle-wrapper');
                    let editorContent = '';

                    if (wrapper) {
                        const contentElement = wrapper.querySelector('[contenteditable="true"]');
                        if (contentElement) {
                            editorContent = contentElement.innerHTML;
                        } else {
                            // 尝试获取protyle内容区
                            const contentBlock = wrapper.querySelector('.protyle-content');
                            if (contentBlock) {
                                editorContent = contentBlock.innerHTML;
                            }
                        }
                    }

                    // 收集元素数据
                    domElementsData.push({
                        id: el.id,
                        type: 'protyle-dom',
                        left: parseFloat(el.style.left || '0'),
                        top: parseFloat(el.style.top || '0'),
                        width: parseFloat(style.width),
                        height: parseFloat(style.height),
                        editorContent: editorContent,
                        // 记录protyle所需的参数
                        blockId: "20250310234002-us3sb9j", // 使用固定ID，或从元素中获取
                        rootId: "20250310234002-p8g1pls"
                    });
                }
            });

            // 4. 收集视图状态数据
            const viewportData = {
                transform: canvas.viewportTransform,
                zoom: canvas.getZoom()
            };

            // 5. 合并所有数据
            const whiteboardData = {
                id: id,
                timestamp: new Date().getTime(),
                canvasData: canvasData,
                domElementsData: domElementsData,
                viewportData: viewportData
            };

            // 6. 保存到思源笔记的存储系统
            const whiteboardsData = configManager.get("whiteboards", {});
            whiteboardsData[id] = whiteboardData;
            configManager.set("whiteboards", whiteboardsData);

            // 7. 保存配置
            await configManager.save();

            // 显示成功提示
            showMessage('画板数据保存成功');
        } catch (error) {
            console.error('保存画板数据失败:', error);
            showMessage('保存画板数据失败: ' + (error as Error).message);
        }
    }

    /**
     * 恢复画板数据
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     */
    private async restoreWhiteboardData(canvas: Canvas, id: string) {
        try {
            // 1. 初始化配置管理器
            const configManager = new PluginConfig("siyuan-steve-tools", "whiteboard");
            await configManager.load();

            // 2. 获取保存的数据
            const whiteboardsData = configManager.get("whiteboards", {});
            const savedData = whiteboardsData[id];

            if (!savedData) {
                // 没有保存的数据，这是一个新画板
                return;
            }

            // 3. 恢复视图状态
            if (savedData.viewportData && savedData.viewportData.transform) {
                canvas.setViewportTransform(savedData.viewportData.transform);
                this.updateGridPosition(id, savedData.viewportData.transform);
                this.updateZoomDisplay(id, savedData.viewportData.zoom || 1);
            }

            // 4. 恢复Canvas对象
            if (savedData.canvasData) {
                // 使用loadFromJSON异步加载数据
                canvas.loadFromJSON(savedData.canvasData, () => {
                    canvas.renderAll();
                    console.log('Canvas对象恢复完成');
                });
            }

            // 5. 恢复DOM元素
            if (savedData.domElementsData && Array.isArray(savedData.domElementsData)) {
                const domContainer = document.getElementById(`dom-elements-container-${id}`);
                if (!domContainer) return;

                // 异步恢复DOM元素，确保DOM渲染完成
                setTimeout(() => {
                    savedData.domElementsData.forEach(itemData => {
                        if (itemData.type === 'protyle-dom') {
                            // 创建DOM元素
                            this.restoreProtyleElement(itemData, canvas, id, domContainer);
                        }
                    });
                }, 100);
            }

            // 显示成功提示
            showMessage('画板数据恢复完成');
        } catch (error) {
            console.error('恢复画板数据失败:', error);
            showMessage('恢复画板数据失败: ' + (error as Error).message);
        }
    }

    /**
     * 恢复Protyle编辑器元素
     * @param itemData 元素数据
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     * @param domContainer DOM容器元素
     */
    private restoreProtyleElement(itemData: any, canvas: Canvas, id: string, domContainer: HTMLElement) {
        // 1. 创建一个DOM元素
        const protyledom = document.createElement('div');
        protyledom.id = itemData.id; // 使用保存的ID
        protyledom.style.cssText = `
            position: absolute;
            width: ${itemData.width}px;
            height: ${itemData.height}px;
            left: ${itemData.left}px;
            top: ${itemData.top}px;
            background-color: white;
            border-radius: 6px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.15);
            pointer-events: auto;
            transform-origin: 0 0;
            overflow: hidden;
        `;

        // 2. 创建容器包装器
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'protyle-wrapper';
        wrapperDiv.style.cssText = `
            position: absolute;
            top: 8px;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

        // 3. 添加拖动手柄和缩放手柄
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

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        resizeHandle.style.cssText = `
            position: absolute;
            bottom: -5px;
            right: -5px;
            width: 10px;
            height: 10px;
            background-color: #2196F3;
            border-radius: 50%;
            cursor: nwse-resize;
            z-index: 100;
        `;

        // 4. 添加元素到DOM
        protyledom.appendChild(dragHandle);
        protyledom.appendChild(resizeHandle);
        protyledom.appendChild(wrapperDiv);
        domContainer.appendChild(protyledom);

        // 5. 初始化Protyle编辑器
        try {
            const protyle = new Protyle(window.siyuan.ws.app, wrapperDiv, {
                blockId: itemData.blockId || "20250310234002-us3sb9j",
                rootId: itemData.rootId || "20250310234002-p8g1pls",
                render: {
                    breadcrumb: false,
                    gutter: false,
                },
                action: ["cb-get-focus"],
                mode: "wysiwyg",
            });

            // 6. 恢复编辑器内容（如果有）
            if (itemData.editorContent) {
                // 稍后设置内容，确保编辑器已加载
                setTimeout(() => {
                    const contentEditable = wrapperDiv.querySelector('[contenteditable="true"]');
                    if (contentEditable) {
                        contentEditable.innerHTML = itemData.editorContent;
                    } else {
                        // 尝试找到内容容器
                        const contentBlock = wrapperDiv.querySelector('.protyle-content');
                        if (contentBlock) {
                            contentBlock.innerHTML = itemData.editorContent;
                        }
                    }
                }, 50);
            }
        } catch (e) {
            console.error("初始化编辑器失败:", e);
            wrapperDiv.innerHTML = '<div style="padding: 10px;">编辑器初始化失败</div>';
        }

        // 7. 为按钮添加拖拽和缩放功能
        this.addDraggableToElement(protyledom, dragHandle, canvas, id);
        this.addResizableToElement(protyledom, resizeHandle, canvas);
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

        // 设置HTML元素添加功能
        this.setupHtmlElementAddition(canvas, id);

        // 设置DOM元素添加功能
        this.setupDomElementAddition(canvas, id);

        // 设置保存和恢复功能
        this.setupSaveAndRestore(canvas, id);

        // 设置响应式尺寸
        this.setupResponsiveCanvas(canvas, container);
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

        // 绑定点击事件
        addButtonBtn.addEventListener('click', () => {
            // 获取画布中心点坐标（在画布坐标系中）
            const vpt = canvas.viewportTransform;
            if (!vpt) return;

            // 计算当前视口中心在画布坐标系中的位置
            const centerX = -vpt[4] / vpt[0] + (canvas.getWidth() / 2) / vpt[0];
            const centerY = -vpt[5] / vpt[3] + (canvas.getHeight() / 2) / vpt[3];

            // 创建唯一ID
            const domId = `dom-button-${id}-${domElementCounter++}`;

            // 1. 创建一个DOM元素
            const protyledom = document.createElement('div');
            protyledom.id = domId;
            protyledom.style.cssText = `
            position: absolute;
            width: 200px;
            height: 150px;
            background-color: white;
            border-radius: 6px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.15);
            pointer-events: auto; /* 重要：允许元素接收事件 */
            transform-origin: 0 0;
            overflow: hidden;
        `;

            // Create a container wrapper for better interaction
            const wrapperDiv = document.createElement('div');
            wrapperDiv.className = 'protyle-wrapper';
            wrapperDiv.style.cssText = `
            position: absolute;
            top: 8px;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

            try {
                // Initialize the Protyle editor inside the wrapper
                const protyle = new Protyle(window.siyuan.ws.app, wrapperDiv, {
                    blockId: "20250310234002-us3sb9j",
                    rootId: "20250310234002-p8g1pls",
                    render: {
                        breadcrumb: false,
                        gutter: false,
                    },
                    action: ["cb-get-focus"],
                    mode: "wysiwyg",
                });
            } catch (e) {
                console.error("初始化编辑器失败:", e);
                wrapperDiv.innerHTML = '<div style="padding: 10px;">编辑器初始化失败</div>';
            }

            // 添加拖动手柄和缩放手柄
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

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.style.cssText = `
            position: absolute;
            bottom: -5px;
            right: -5px;
            width: 10px;
            height: 10px;
            background-color: #2196F3;
            border-radius: 50%;
            cursor: nwse-resize;
            z-index: 100;
        `;

            // 先添加手柄，再添加内容包装器
            protyledom.appendChild(dragHandle);
            protyledom.appendChild(resizeHandle);
            protyledom.appendChild(wrapperDiv);

            // 2. 将protyle添加到DOM容器中
            domContainer.appendChild(protyledom);

            // 3. 计算初始位置
            const initialScreenX = centerX * vpt[0] + vpt[4];
            const initialScreenY = centerY * vpt[3] + vpt[5];

            // 4. 设置按钮初始位置
            protyledom.style.left = `${initialScreenX}px`;
            protyledom.style.top = `${initialScreenY}px`;

            // 5. 为按钮添加拖拽功能
            this.addDraggableToElement(protyledom, dragHandle, canvas, id);

            // 6. 为按钮添加缩放功能
            this.addResizableToElement(protyledom, resizeHandle, canvas);

            // 7. 显示提示
            showMessage('已添加DOM按钮，可直接拖拽移动位置或缩放大小');
        });

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
     * 为元素添加拖拽功能
     * @param element 要添加拖拽功能的元素
     * @param handle 拖动手柄元素
     * @param canvas 相关的Fabric画布
     * @param id 画布ID
     */
    private addDraggableToElement(element: HTMLElement, handle: HTMLElement, canvas: Canvas, id: string) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        const startDrag = (e: MouseEvent | TouchEvent) => {
            isDragging = true;

            // 获取触摸/鼠标的初始位置
            if (e instanceof MouseEvent) {
                startX = e.clientX;
                startY = e.clientY;
            } else if (e instanceof TouchEvent && e.touches && e.touches[0]) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }

            // 获取元素当前的CSS位置（去掉px单位）
            const currentLeftStr = element.style.left || '0px';
            const currentTopStr = element.style.top || '0px';
            initialLeft = parseFloat(currentLeftStr);
            initialTop = parseFloat(currentTopStr);

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();

            // 添加临时事件监听器
            document.addEventListener('mousemove', moveDrag);
            document.addEventListener('touchmove', moveDrag, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);

            // 添加活动样式
            element.style.opacity = '0.8';
            element.style.zIndex = '1000';
        };

        const moveDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;

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
            element.style.left = `${initialLeft + deltaX}px`;
            element.style.top = `${initialTop + deltaY}px`;

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
        };

        const stopDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;
            isDragging = false;

            // 移除临时事件监听器
            document.removeEventListener('mousemove', moveDrag);
            document.removeEventListener('touchmove', moveDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);

            // 恢复正常样式
            element.style.opacity = '1';
            element.style.zIndex = '';

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
        };

        // 添加拖拽事件监听器
        handle.addEventListener('mousedown', startDrag);
        handle.addEventListener('touchstart', startDrag, { passive: false });
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
     * 设置HTML元素添加功能
     * @param canvas Fabric.js画布实例
     * @param id 画布ID
     */
    private setupHtmlElementAddition(canvas: Canvas, id: string) {
        // 获取添加文本按钮元素
        const addTextButton = document.getElementById(`add-text-${id}`);

        // 绑定点击事件
        if (addTextButton) {
            addTextButton.addEventListener('click', () => {
                // 获取画布中心点坐标
                const vpt = canvas.viewportTransform;
                if (!vpt) return;

                // 计算当前视口中心在画布坐标系中的位置
                const centerX = -vpt[4] / vpt[0] + (canvas.getWidth() / 2) / vpt[0];
                const centerY = -vpt[5] / vpt[3] + (canvas.getHeight() / 2) / vpt[3];

                // 创建可编辑文本元素
                const text = new fabric.IText('双击编辑文本', {
                    left: centerX,
                    top: centerY,
                    fontSize: 20,
                    fill: '#333333',
                    fontFamily: 'Arial',
                    padding: 5,
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    selectable: true,
                    hasControls: true,
                    hasBorders: true,
                    editable: true
                });

                // 添加到画布
                canvas.add(text);

                // 激活文本元素
                canvas.setActiveObject(text);

                // 渲染画布
                canvas.requestRenderAll();

                // 显示提示
                showMessage("已添加文本元素，双击可编辑内容，拖拽可移动位置");
            });
        }

        // 设置对象移动事件监听（用于细化拖拽交互）
        canvas.on('object:moving', (opt) => {
            // 拖动对象时确保对象可视，避免拖出视野范围
            const obj = opt.target;
            if (!obj) return;

            // 可选：添加拖拽时的视觉提示
            if (obj.type === 'i-text') {
                obj.set('opacity', 0.8); // 拖拽时半透明效果
            }

            // 渲染画布
            canvas.requestRenderAll();
        });

        // 设置对象移动结束事件监听
        canvas.on('object:modified', (opt) => {
            const obj = opt.target;
            if (!obj) return;

            // 恢复正常显示
            if (obj.type === 'i-text') {
                obj.set('opacity', 1);
            }

            // 渲染画布
            canvas.requestRenderAll();
        });

        // 双击编辑
        canvas.on('mouse:dblclick', (opt) => {
            // 检查是否点击的是文本
            if (opt.target && opt.target.type === 'i-text') {
                // 激活文本元素的编辑模式
                const iTextObject = opt.target as fabric.IText;
                iTextObject.enterEditing();

                // 如果是初始文本，则全选方便用户直接输入
                if (iTextObject.text === '双击编辑文本') {
                    iTextObject.selectAll();
                }
            }
        });
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
                    linear-gradient(to right, rgba(0, 0, 0, 0.1) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
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