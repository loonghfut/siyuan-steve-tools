import * as ic from "@/icon"
import { openTab, Plugin, showMessage } from "siyuan";
import './handwriting.css';
// 引入 fabric.js 库
import { Canvas } from 'fabric/fabric-impl';
import * as fabric from 'fabric';

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
        const id = new Date().getTime().toString();

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
        <div class="whiteboard-controls" style="position: absolute; top: 10px; right: 10px; z-index: 100; 
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

        // 为每个DOM元素存储位置信息的映射
        const domElementPositions = new Map<string, { left: number, top: number }>();
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
            const buttonId = `dom-button-${id}-${domElementCounter++}`;

            // 1. 创建一个DOM按钮元素
            const button = document.createElement('button');
            button.id = buttonId;
            button.textContent = '可拖拽按钮';
            button.style.cssText = `
                position: absolute;
                background: #e8e8e8;
                border: 1px solid #ccc;
                border-radius: 4px;
                padding: 6px 12px;
                cursor: pointer;
                pointer-events: auto;
                z-index: 10;
                font-size: 14px;
            `;
            
            // 添加点击事件处理器
            button.addEventListener('click', (event) => {
                event.stopPropagation(); // 防止事件冒泡到画布
                showMessage(`按钮 ${buttonId} 被点击了!`);
                // 在这里可以添加更多的点击后的逻辑
            });

            // 2. 将按钮添加到DOM容器中
            domContainer.appendChild(button);

            // 3. 存储初始位置
            domElementPositions.set(buttonId, { left: centerX, top: centerY });

            // 4. 创建Fabric.js图像占位符，用于拖拽和定位
            const rect = new fabric.Rect({
                left: centerX,
                top: centerY,
                width: 100,
                height: 30,
                fill: 'rgba(255,255,255,0.01)',
                stroke: 'rgba(0,0,0,0.2)',
                strokeWidth: 1,
                rx: 4,
                ry: 4,
                hasControls: true,
                hasBorders: true,
                // lockRotation: true, // 防止旋转影响DOM元素定位
                data: { domId: buttonId } as any // 关联DOM元素ID
            });

            // 5. 添加到Fabric画布
            canvas.add(rect);

            // 6. 立即更新DOM元素位置
            this.updateDomElementPosition(button, rect, vpt);

            // 7. 显示提示
            showMessage('已添加DOM按钮，可拖拽移动位置');

            // 8. 设置移动事件处理
            rect.on('moving', () => {
                this.updateDomElementPosition(button, rect, canvas.viewportTransform);
            });

            rect.on('modified', () => {
                // 保存新位置
                if (rect.left !== undefined && rect.top !== undefined) {
                    domElementPositions.set(buttonId, { left: rect.left, top: rect.top });
                }
            });
        });

        // 监听画布变换（平移、缩放）以更新所有DOM元素位置
        canvas.on('after:render', () => {
            // 获取所有Fabric占位对象
            const objects = canvas.getObjects().filter(obj => {
                return obj['data'] && obj['data'].domId;
            });

            // 更新每个对象关联的DOM元素位置
            objects.forEach(obj => {
                const domId = obj['data'].domId;
                const domElement = document.getElementById(domId);
                if (domElement) {
                    this.updateDomElementPosition(domElement, obj, canvas.viewportTransform);
                }
            });
        });
    }

    /**
     * 更新DOM元素位置以匹配Fabric对象位置
     * @param domElement DOM元素
     * @param fabricObj Fabric对象
     * @param viewportTransform 视口变换矩阵
     */
    private updateDomElementPosition(domElement: HTMLElement, fabricObj: fabric.Object, viewportTransform?: number[] | null) {
        if (!viewportTransform || fabricObj.left === undefined || fabricObj.top === undefined) return;

        // 1. 获取Fabric对象在画布上的坐标
        const objLeft = fabricObj.left;
        const objTop = fabricObj.top;

        // 2. 应用视口变换计算屏幕坐标
        // 矩阵变换：[x, y, 1] * [vpt0, vpt1, vpt2, vpt3, vpt4, vpt5]
        const screenX = objLeft * viewportTransform[0] + objTop * viewportTransform[1] + viewportTransform[4];
        const screenY = objLeft * viewportTransform[2] + objTop * viewportTransform[3] + viewportTransform[5];

        // 3. 考虑对象尺寸的水平居中
        const objWidth = fabricObj.getScaledWidth() || 100;
        const offsetX = objWidth / 2 * viewportTransform[0];

        // 4. 设置DOM元素位置
        domElement.style.left = `${screenX - offsetX}px`;
        domElement.style.top = `${screenY}px`;

        // 5. 设置缩放 (可选，根据需要)
        const scale = viewportTransform[0]; // 假设x和y的缩放是一致的
        domElement.style.transform = `scale(${scale})`;
        domElement.style.transformOrigin = 'left top';
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