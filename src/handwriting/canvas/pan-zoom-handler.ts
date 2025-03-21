import { Canvas } from 'fabric/fabric-impl';
import * as fabric from 'fabric';
import { GridManager } from './grid-manager';

// 添加模式枚举
export enum CanvasMode {
    PAN = 'pan',
    DRAW = 'draw'
}

export class PanZoomHandler {
    private canvas: Canvas;
    private id: string;
    private isDragging: boolean = false;
    private lastPosX: number = 0;
    private lastPosY: number = 0;

    // 添加手写相关属性
    private currentMode: CanvasMode = CanvasMode.PAN; // 默认为平移模式
    private drawingColor: string = '#000000';
    private drawingWidth: number = 2;
    private currentPath: fabric.Path | null = null;
    private pathStarted: boolean = false;

    constructor(id: string, canvas: Canvas) {
        this.id = id;
        this.canvas = canvas;
        this.setupPanZoom();
        this.setupDrawingToolbar(); // 添加工具栏
    }

    /**
     * 设置画布模式
     */
    public setCanvasMode(mode: CanvasMode): void {
        this.currentMode = mode;

        if (mode === CanvasMode.DRAW) {
            // 在绘制模式下修改光标和禁用选择
            this.canvas.selection = false;
            this.canvas.defaultCursor = 'crosshair';
        } else {
            // 恢复默认设置
            this.canvas.selection = true;
            this.canvas.defaultCursor = 'default';
        }
    }

    /**
     * 设置绘制颜色
     */
    public setDrawingColor(color: string): void {
        this.drawingColor = color;
    }

    /**
     * 设置绘制线宽
     */
    public setDrawingWidth(width: number): void {
        this.drawingWidth = width;
    }

    /**
     * 清除所有绘制内容
     */
    public clearDrawing(): void {
        // 移除所有路径对象
        const pathObjects = this.canvas.getObjects().filter(obj =>
            obj instanceof fabric.Path && obj.stroke === this.drawingColor);

        pathObjects.forEach(obj => {
            this.canvas.remove(obj);
        });

        this.canvas.requestRenderAll();
    }






    /**
     * 设置画布的平移和缩放功能
     */
    private setupPanZoom(): void {
        // 获取缩放显示元素和重置按钮
        const zoomDisplay = document.getElementById(`zoom-display-${this.id}`);
        const resetViewButton = document.getElementById(`reset-view-${this.id}`);

        // 初始更新缩放显示
        this.updateZoomDisplay(this.canvas.getZoom());

        // 绑定重置视图按钮事件
        if (resetViewButton) {
            resetViewButton.addEventListener('click', () => {
                // 重置视口变换为默认状态
                this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

                // 更新网格
                this.updateGridPosition(this.canvas.viewportTransform || [1, 0, 0, 1, 0, 0]);

                // 更新缩放显示
                this.updateZoomDisplay(1);
            });
        }

        // 修改鼠标按下事件处理
        this.canvas.on('mouse:down', (opt) => {
            const evt = opt.e;

            // 根据当前模式处理事件
            if (this.currentMode === CanvasMode.DRAW) {
                this.handleDrawStart(opt);
            } else if (evt instanceof MouseEvent && evt.button === 0) {
                this.isDragging = true;
                this.lastPosX = evt.clientX;
                this.lastPosY = evt.clientY;
                this.canvas.selection = false;
                this.canvas.defaultCursor = 'grabbing';

                evt.preventDefault();
                evt.stopPropagation();
            }
        });

        // 修改鼠标移动事件
        this.canvas.on('mouse:move', (opt) => {
            const evt = opt.e;

            // 根据当前模式处理事件
            if (this.currentMode === CanvasMode.DRAW && this.pathStarted) {
                this.handleDrawMove(opt);
                return;
            }

            if (this.isDragging) {
                // 处理不同类型的事件(鼠标或触摸)
                const clientX = evt instanceof MouseEvent ? evt.clientX :
                    evt.touches && evt.touches[0] ? evt.touches[0].clientX : this.lastPosX;
                const clientY = evt instanceof MouseEvent ? evt.clientY :
                    evt.touches && evt.touches[0] ? evt.touches[0].clientY : this.lastPosY;

                const deltaX = clientX - this.lastPosX;
                const deltaY = clientY - this.lastPosY;
                this.lastPosX = clientX;
                this.lastPosY = clientY;

                // 获取并更新视口变换矩阵
                const vpt = this.canvas.viewportTransform;
                if (!vpt) return;

                // 平移视口
                vpt[4] += deltaX;
                vpt[5] += deltaY;

                // 更新画布和网格
                this.canvas.requestRenderAll();
                this.updateGridPosition(vpt);

                evt.preventDefault();
                evt.stopPropagation();
            }
        });

        // 修改鼠标释放事件
        this.canvas.on('mouse:up', (opt) => {
            if (this.currentMode === CanvasMode.DRAW && this.pathStarted) {
                this.handleDrawEnd(opt);
                return;
            }

            if (this.isDragging) {
                this.isDragging = false;
                this.canvas.selection = true;
                this.canvas.defaultCursor = 'default';
            }
        });

        // 鼠标滚轮事件处理 - 统一处理滚轮事件
        this.canvas.on('mouse:wheel', (opt) => {
            const evt = opt.e;
            evt.preventDefault();
            evt.stopPropagation();

            // 获取当前视口变换
            const vpt = this.canvas.viewportTransform;
            if (!vpt) return;

            if (evt.ctrlKey) {
                // Ctrl+滚轮进行缩放
                // 计算缩放系数 - 调整为更自然的缩放系数
                const delta = evt.deltaY;
                let zoom = this.canvas.getZoom();
                const scaleFactor = delta > 0 ? 0.95 : 1.05; // 简化缩放计算
                zoom = zoom * scaleFactor;

                // 限制缩放范围
                zoom = Math.min(Math.max(0.1, zoom), 10);

                // 获取鼠标在画布上的准确位置
                const canvasEl = this.canvas.getElement();
                const canvasRect = canvasEl.getBoundingClientRect();
                const x = evt.clientX - canvasRect.left;
                const y = evt.clientY - canvasRect.top;
                const point = new fabric.Point(x, y);

                // 执行缩放并更新画布
                this.canvas.zoomToPoint(point, zoom);

                // 更新缩放显示
                this.updateZoomDisplay(zoom);
            } else {
                // 设置平移速度因子
                const speed = 1.5;

                // 修正: 反转滚动方向使其更符合直觉
                // 水平滚动时 (Shift + 滚轮) 平移横向，否则平移纵向
                if (evt.shiftKey) {
                    vpt[4] -= evt.deltaY * speed; // 横向平移 - 反转方向
                } else {
                    vpt[5] -= evt.deltaY * speed; // 纵向平移 - 反转方向
                }

                this.canvas.requestRenderAll();
            }

            // 更新网格位置
            this.updateGridPosition(this.canvas.viewportTransform || [1, 0, 0, 1, 0, 0]);
        });

        // 移除单独的wheel事件监听器，统一使用fabric的mouse:wheel事件
        // 这样避免事件冲突和不一致的处理
    }



/**
 * 绘制开始
 */
private handleDrawStart(opt: fabric.IEvent): void {
    this.pathStarted = true;
    const pointer = this.canvas.getPointer(opt.e);

    // 创建一个新的路径
    const path = new fabric.Path(`M ${pointer.x} ${pointer.y}`, {
        stroke: this.drawingColor,
        strokeWidth: this.drawingWidth,
        fill: '',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        selectable: true,
        evented: true,
        objectCaching: false // 禁用对象缓存可以提高绘制性能
    });

    this.currentPath = path;
    this.canvas.add(path);
    this.canvas.requestRenderAll();

    opt.e.preventDefault();
    opt.e.stopPropagation();
}

/**
 * 绘制移动
 */
private handleDrawMove(opt: fabric.IEvent): void {
    if (!this.currentPath || !this.pathStarted) return;

    const pointer = this.canvas.getPointer(opt.e);
    
    // 确保path属性存在且为数组
    if (!this.currentPath.path || !Array.isArray(this.currentPath.path)) {
        this.currentPath.path = [['M', pointer.x, pointer.y]];
    } else {
        // 添加线条点
        this.currentPath.path.push(['L', pointer.x, pointer.y]);
    }

    // 更新路径并强制重绘
    this.currentPath.dirty = true;
    this.canvas.requestRenderAll();

    opt.e.preventDefault();
    opt.e.stopPropagation();
}

/**
 * 绘制结束
 */
private handleDrawEnd(opt: fabric.IEvent): void {
    if (this.currentPath) {
        // 确保路径完成
        this.currentPath.setCoords();
    }
    
    this.pathStarted = false;
    this.currentPath = null;
    this.canvas.requestRenderAll();

    opt.e.preventDefault();
    opt.e.stopPropagation();
}

    /**
     * 初始化手写工具栏
     */
    private setupDrawingToolbar(): void {
        const canvasContainer = this.canvas.getElement().parentElement;
        if (!canvasContainer) return;

        // 创建工具栏容器
        const toolbar = document.createElement('div');
        toolbar.id = `drawing-toolbar-${this.id}`;
        toolbar.className = 'drawing-toolbar';
        toolbar.style.cssText = `
        position: absolute;
        top: 50px;
        left: 10px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        padding: 5px;
        display: flex;
        align-items: center;
        z-index: 100;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    `;

        // 添加模式切换按钮
        const panButton = this.createToolbarButton('移动', CanvasMode.PAN);
        const drawButton = this.createToolbarButton('手写', CanvasMode.DRAW);

        // 添加颜色选择器
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = this.drawingColor;
        colorPicker.style.cssText = `
        margin: 0 5px;
        width: 24px;
        height: 24px;
        border: none;
        padding: 0;
        cursor: pointer;
    `;
        colorPicker.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            this.setDrawingColor(target.value);
        });

        // 添加线宽选择器
        const widthSelector = document.createElement('select');
        widthSelector.style.cssText = `
        margin: 0 5px;
        padding: 2px 5px;
        border: 1px solid var(--b3-border-color);
        border-radius: 3px;
    `;

        // 添加线宽选项
        [1, 2, 3, 5, 8].forEach(width => {
            const option = document.createElement('option');
            option.value = width.toString();
            option.text = `${width}px`;
            if (width === this.drawingWidth) {
                option.selected = true;
            }
            widthSelector.appendChild(option);
        });

        widthSelector.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.setDrawingWidth(parseInt(target.value));
        });

        // 添加清除按钮
        const clearButton = document.createElement('button');
        clearButton.textContent = '清除';
        clearButton.className = 'toolbar-button';
        clearButton.style.cssText = `
        margin: 0 5px;
        padding: 3px 8px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 3px;
        cursor: pointer;
    `;
        clearButton.addEventListener('click', () => {
            this.clearDrawing();
        });

        // 将所有元素添加到工具栏
        toolbar.appendChild(panButton);
        toolbar.appendChild(drawButton);
        toolbar.appendChild(colorPicker);
        toolbar.appendChild(widthSelector);
        toolbar.appendChild(clearButton);

        // 添加工具栏到画布容器
        canvasContainer.appendChild(toolbar);

        // 默认选中平移模式
        this.updateToolbarButtonState(panButton, true);
    }

    /**
     * 创建工具栏按钮
     */
    private createToolbarButton(text: string, mode: CanvasMode): HTMLButtonElement {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = 'toolbar-button';
        button.dataset.mode = mode;
        button.style.cssText = `
        margin: 0 5px;
        padding: 3px 8px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 3px;
        cursor: pointer;
    `;

        button.addEventListener('click', () => {
            this.setCanvasMode(mode);

            // 更新所有按钮状态
            const toolbar = document.getElementById(`drawing-toolbar-${this.id}`);
            if (toolbar) {
                const buttons = toolbar.querySelectorAll('.toolbar-button[data-mode]');
                buttons.forEach(btn => {
                    const button = btn as HTMLButtonElement;
                    this.updateToolbarButtonState(button, button.dataset.mode === mode);
                });
            }
        });

        return button;
    }

    /**
     * 更新工具栏按钮状态
     */
    private updateToolbarButtonState(button: HTMLButtonElement, isActive: boolean): void {
        if (isActive) {
            button.style.backgroundColor = 'var(--b3-theme-primary)';
            button.style.color = 'white';
        } else {
            button.style.backgroundColor = 'var(--b3-theme-background)';
            button.style.color = 'var(--b3-theme-on-background)';
        }
    }

    /**
     * 更新网格位置和大小以匹配画布变换
     * @param viewportTransform 视口变换矩阵
     */
    private updateGridPosition(viewportTransform: number[]): void {
        const gridManager = new GridManager(this.id, this.canvas);
        gridManager.updateGridPosition(viewportTransform);
    }

    /**
     * 更新缩放比例显示
     * @param zoom 缩放比例
     */
    private updateZoomDisplay(zoom: number): void {
        const zoomDisplay = document.getElementById(`zoom-display-${this.id}`);
        if (zoomDisplay) {
            // 将缩放比例转换为百分比并显示
            const zoomPercent = Math.round(zoom * 100);
            zoomDisplay.textContent = `缩放: ${zoomPercent}%`;
        }
    }

    /**
     * 清理资源
     */
    dispose(): void {
        // 移除事件监听器等清理工作
    }
}