import * as fabric from 'fabric';

export class Whiteboard {
    private canvas: fabric.Canvas;
    private containerEl: HTMLElement;
    private id: string;
    private isDarkMode: boolean;

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
                <div class="siyuan-whiteboard-tool active" data-tool="pencil">铅笔</div>
                <div class="siyuan-whiteboard-tool" data-tool="clear">清空</div>
                <div style="flex-grow: 1;"></div>
                <div class="siyuan-whiteboard-tool" data-tool="save">保存</div>
            </div>
            <canvas id="drawing-canvas-${this.id}"></canvas>
        `;

        // 初始化画布
        const canvasEl = document.getElementById(`drawing-canvas-${this.id}`) as HTMLCanvasElement;
        const containerRect = this.containerEl.getBoundingClientRect();
        canvasEl.width = containerRect.width;
        canvasEl.height = containerRect.height - 50; // 减去工具栏高度

        // 初始化Fabric.js画布
        this.canvas = new fabric.Canvas(`drawing-canvas-${this.id}`, {
            isDrawingMode: true,
            backgroundColor: this.isDarkMode ? '#2d2d2d' : 'white'
        });

        // 确保画布初始化完成后再设置画笔属性
        this.setupBrush();

        // 绑定工具栏事件
        this.bindEvents();

        // 监听窗口大小变化
        window.addEventListener('resize', this.resizeCanvas.bind(this));
    }

    private setupBrush() {
        // 确保画笔对象已创建
        if (this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.width = 2;
            this.canvas.freeDrawingBrush.color = this.isDarkMode ? '#ffffff' : '#000000';
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
            case 'pencil':
                this.setActiveTool(toolType);
                this.canvas.isDrawingMode = true;
                break;
            case 'clear':
                this.clearCanvas();
                break;
            case 'save':
                this.saveCanvas();
                break;
        }
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
        this.canvas.setWidth(containerRect.width);
        this.canvas.setHeight(containerRect.height - 50);
        this.canvas.renderAll();
    }

    public setDarkMode(isDark: boolean) {
        this.isDarkMode = isDark;
        this.canvas.backgroundColor = isDark ? '#2d2d2d' : 'white';
        
        if (this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.color = isDark ? '#ffffff' : '#000000';
        }
        
        this.canvas.renderAll();
    }

    public dispose() {
        window.removeEventListener('resize', this.resizeCanvas);
        if (this.canvas) {
            this.canvas.dispose();
        }
    }
}