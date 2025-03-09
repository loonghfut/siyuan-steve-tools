import * as fabric from 'fabric';

export class Whiteboard {
    private canvas: fabric.Canvas;
    private containerEl: HTMLElement;
    private id: string;
    private isDarkMode: boolean;
    private isPanning: boolean = false;
    private isMiddleButtonDown: boolean = false; // 添加中键按下状态
    private lastPosX: number = 0;
    private lastPosY: number = 0;
    private currentScale: number = 1; // 当前缩放级别
    private readonly maxZoom: number = 5; // 最大缩放级别
    private readonly minZoom: number = 0.1; // 最小缩放级别
    private hasSelection: boolean = false; // 添加新属性跟踪选择状态
    private currentMode: string = 'select'; // 当前模式，默认为选择模式

    constructor(containerId: string, isDark: boolean) {
        this.id = containerId;
        this.containerEl = document.getElementById(containerId) as HTMLElement;
        this.isDarkMode = isDark;
        this.initialize();
    }

    private initialize() {
        // 创建简化的白板容器结构
        this.containerEl.className = 'siyuan-whiteboard-container';
        this.containerEl.innerHTML = `
            <div class="siyuan-whiteboard-toolbox">
                <div class="siyuan-whiteboard-tool" data-tool="select">选择</div>
                <div class="siyuan-whiteboard-tool" data-tool="pencil">铅笔</div>
                <div class="siyuan-whiteboard-tool" data-tool="pan">移动</div>
                <div class="siyuan-whiteboard-tool" data-tool="clear">清空</div>
                <div class="siyuan-whiteboard-tool" data-tool="zoom-in">放大</div>
                <div class="siyuan-whiteboard-tool" data-tool="zoom-out">缩小</div>
                <div class="siyuan-whiteboard-tool" data-tool="zoom-reset">重置</div>
                <div style="flex-grow: 1;"></div>
                <div class="siyuan-whiteboard-tool" data-tool="save">保存</div>
            </div>
            <div class="siyuan-whiteboard-canvas-container">
                <canvas id="drawing-canvas-${this.id}"></canvas>
            </div>
        `;

        // 初始化画布
        const canvasEl = document.getElementById(`drawing-canvas-${this.id}`) as HTMLCanvasElement;
        const containerRect = this.containerEl.getBoundingClientRect();
        canvasEl.width = containerRect.width;
        canvasEl.height = containerRect.height - 45; // 减去工具栏高度

        // 初始化Fabric.js画布
        this.canvas = new fabric.Canvas(`drawing-canvas-${this.id}`, {
            isDrawingMode: false, // 默认不是绘图模式
            backgroundColor: this.isDarkMode ? '#2d2d2d' : 'white',
            selection: true, // 启用选择功能
            renderOnAddRemove: true
        });

        // 设置画布的视口变换矩阵
        this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

        // 设置画笔类型为铅笔
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);

        // 确保画布初始化完成后再设置画笔属性
        this.setupBrush();

        // 绑定工具栏事件
        this.bindEvents();

        // 绑定画布事件用于平移和缩放
        this.setupCanvasEvents();

        // 监听窗口大小变化
        window.addEventListener('resize', this.resizeCanvas);
        
        // 设置默认工具为选择
        this.setActiveTool('select');
    }

    private setupBrush() {
        // 确保画笔对象已创建
        if (this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.width = 2;
            this.canvas.freeDrawingBrush.color = this.isDarkMode ? '#ffffff' : '#000000'; // 根据深色模式调整画笔颜色
        } else {
            // 如果画笔对象未创建，则延迟设置
            setTimeout(() => {
                if (this.canvas && this.canvas.freeDrawingBrush) {
                    this.canvas.freeDrawingBrush.width = 2;
                    this.canvas.freeDrawingBrush.color = this.isDarkMode ? '#ffffff' : '#000000';
                }
            }, 100);
        }
    }

    private setupCanvasEvents() {
        // 监听鼠标事件
        this.canvas.on('mouse:down', (opt) => {
            // 检查是否是中键
            if (opt.e instanceof MouseEvent && opt.e.button === 1) {
                this.isMiddleButtonDown = true;
                this.canvas.selection = false; // 暂时禁用选择功能
                const clientPoint = this.getClientPoint(opt.e);
                this.lastPosX = clientPoint.x;
                this.lastPosY = clientPoint.y;
                this.canvas.setCursor('grabbing');
                opt.e.preventDefault();
            } else if (this.isPanning && !this.hasSelection) {
                // 原有的平移逻辑
                this.canvas.selection = false;
                const clientPoint = this.getClientPoint(opt.e);
                this.lastPosX = clientPoint.x;
                this.lastPosY = clientPoint.y;
                this.canvas.setCursor('grabbing');
            }
        });

        this.canvas.on('selection:created', () => {
            this.hasSelection = true;
            this.isPanning = false;
            this.canvas.setCursor('default');
        });

        this.canvas.on('selection:cleared', () => {
            this.hasSelection = false;
        });

        this.canvas.on('mouse:move', (opt) => {
            if (this.isMiddleButtonDown) {
                // 中键平移逻辑
                const vpt = this.canvas.viewportTransform;
                if (!vpt) return;

                const clientPoint = this.getClientPoint(opt.e);
                const deltaX = clientPoint.x - this.lastPosX;
                const deltaY = clientPoint.y - this.lastPosY;

                vpt[4] += deltaX;
                vpt[5] += deltaY;

                this.canvas.requestRenderAll();

                this.lastPosX = clientPoint.x;
                this.lastPosY = clientPoint.y;
                opt.e.preventDefault();
            } else if (this.isPanning && !this.hasSelection && this.isMouseButtonDown(opt.e)) {
                // 原有的平移逻辑
                const vpt = this.canvas.viewportTransform;
                if (!vpt) return;

                const clientPoint = this.getClientPoint(opt.e);
                const deltaX = clientPoint.x - this.lastPosX;
                const deltaY = clientPoint.y - this.lastPosY;

                vpt[4] += deltaX;
                vpt[5] += deltaY;

                this.canvas.requestRenderAll();

                this.lastPosX = clientPoint.x;
                this.lastPosY = clientPoint.y;
            }
        });

        this.canvas.on('mouse:up', (opt) => {
            // 检查是否释放中键
            if (opt.e instanceof MouseEvent && opt.e.button === 1) {
                this.isMiddleButtonDown = false;
                // 恢复到之前的模式
                if (this.currentMode === 'select') {
                    this.canvas.selection = true;
                    this.canvas.setCursor('default');
                } else if (this.isPanning) {
                    this.canvas.setCursor('grab');
                }
                opt.e.preventDefault();
            } else if (this.isPanning) {
                this.canvas.setCursor('grab');
            }
        });

        // 防止中键点击默认行为（通常是自动滚动）
        this.canvas.wrapperEl.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
            }
        });
        
        // 防止右键菜单
        this.canvas.wrapperEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // 监听鼠标滚轮事件，实现缩放功能
        this.canvas.on('mouse:wheel', (opt) => {
            opt.e.preventDefault();
            opt.e.stopPropagation();

            // 获取滚轮方向和缩放因子
            const delta = opt.e.deltaY;
            let zoom = this.canvas.getZoom();
            zoom = delta > 0 ? zoom * 0.9 : zoom * 1.1;

            // 限制缩放范围
            zoom = Math.min(Math.max(this.minZoom, zoom), this.maxZoom);

            // 相对于鼠标位置缩放
            const point = {
                x: opt.e.offsetX,
                y: opt.e.offsetY
            };

            this.zoomTo(zoom, point);
        });
    }

    // 添加辅助方法用于获取客户端坐标点，处理不同事件类型
    private getClientPoint(e: Event): { x: number, y: number } {
        // 处理鼠标事件
        if ('clientX' in e && 'clientY' in e) {
            return {
                x: (e as MouseEvent).clientX,
                y: (e as MouseEvent).clientY
            };
        }

        // 处理触摸事件
        if ('touches' in e && (e as TouchEvent).touches.length > 0) {
            return {
                x: (e as TouchEvent).touches[0].clientX,
                y: (e as TouchEvent).touches[0].clientY
            };
        }

        // 默认返回中心点坐标（这种情况不应该发生，但提供一个默认值）
        return {
            x: this.canvas.width! / 2,
            y: this.canvas.height! / 2
        };
    }


    // 添加辅助方法检查鼠标按钮是否按下
    private isMouseButtonDown(e: Event): boolean {
        // 处理鼠标事件
        if ('buttons' in e) {
            return e.buttons === 1;
        }

        // 处理触摸事件
        if ('touches' in e) {
            return (e as TouchEvent).touches.length > 0;
        }

        return false;
    }


    private bindEvents() {
        const tools = this.containerEl.querySelectorAll('.siyuan-whiteboard-tool');
        tools.forEach(tool => {
            tool.addEventListener('click', (e) => {
                const toolType = (e.currentTarget as HTMLElement).dataset.tool;
                this.handleToolClick(toolType);
            });
        });
    }

    private handleToolClick(toolType: string) {
        // 处理工具点击事件
        switch (toolType) {
            case 'select':
                this.setActiveTool(toolType);
                this.canvas.isDrawingMode = false;
                this.isPanning = false;
                this.canvas.selection = true; // 启用选择功能
                this.canvas.setCursor('default');
                this.currentMode = 'select';
                break;
            case 'pencil':
                this.setActiveTool(toolType);
                this.canvas.isDrawingMode = true;
                this.isPanning = false;
                this.canvas.selection = false; // 禁用选择功能
                this.canvas.setCursor('default');
                this.currentMode = 'pencil';
                break;
            case 'pan':
                this.setActiveTool(toolType);
                this.canvas.isDrawingMode = false;
                this.isPanning = true;
                this.canvas.selection = false; // 禁用选择功能
                this.canvas.setCursor('grab');
                this.currentMode = 'pan';
                break;
            case 'clear':
                this.clearCanvas();
                break;
            case 'save':
                this.saveCanvas();
                break;
            case 'zoom-in':
                this.zoom(1.1);
                break;
            case 'zoom-out':
                this.zoom(0.9);
                break;
            case 'zoom-reset':
                this.resetZoom();
                break;
        }
    }

    private zoom(factor: number) {
        let zoom = this.canvas.getZoom() * factor;
        zoom = Math.min(Math.max(this.minZoom, zoom), this.maxZoom);

        // 获取画布的中心点作为缩放中心
        const center = {
            x: this.canvas.width! / 2,
            y: this.canvas.height! / 2
        };

        this.zoomTo(zoom, center);
    }

    private zoomTo(zoom: number, point: { x: number, y: number }) {
        const vpt = this.canvas.viewportTransform;
        if (!vpt) return;

        // 保存当前缩放级别
        this.currentScale = zoom;

        // 设置缩放级别和位置
        this.canvas.zoomToPoint(point as fabric.Point, zoom);
    }

    private resetZoom() {
        const vpt = this.canvas.viewportTransform;
        if (!vpt) return;

        // 重置缩放和平移
        this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        this.currentScale = 1;
    }

    private setActiveTool(toolType: string) {
        // 取消所有工具的选中状态
        const tools = this.containerEl.querySelectorAll('.siyuan-whiteboard-tool');
        tools.forEach(tool => tool.classList.remove('active'));

        // 设置当前工具的选中状态
        const currentTool = this.containerEl.querySelector(`[data-tool="${toolType}"]`);
        if (currentTool) {
            currentTool.classList.add('active');
        }
    }

    private clearCanvas() {
        this.canvas.clear();
        this.canvas.backgroundColor = this.isDarkMode ? '#2d2d2d' : 'white';
        this.canvas.renderAll();
    }

    private saveCanvas() {
        // 保存为图片
        const dataURL = this.canvas.toDataURL({
            format: 'png',
            quality: 1.0,
            multiplier: 1.0
        });

        // 下载图片
        const link = document.createElement('a');
        link.download = 'whiteboard.png';
        link.href = dataURL;
        link.click();
    }

    private resizeCanvas = () => {
        if (!this.canvas || !this.containerEl) return;

        const containerRect = this.containerEl.getBoundingClientRect();
        this.canvas.setDimensions({ width: containerRect.width });
        this.canvas.setDimensions({ height: containerRect.height - 45 });
        this.canvas.renderAll();
    }

    public dispose() {
        window.removeEventListener('resize', this.resizeCanvas);
        if (this.canvas) {
            this.canvas.dispose();
        }
    }
}