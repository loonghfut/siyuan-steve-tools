import Konva from 'konva';

export class Whiteboard {
    private stage: Konva.Stage;
    private layer: Konva.Layer;
    private containerEl: HTMLElement;
    private id: string;
    private isDarkMode: boolean;
    private isPanning: boolean = false;
    private isDrawing: boolean = false;
    private currentLine: Konva.Line | null = null;
    private currentPoints: number[] = [];
    private currentTool: string = 'select';

    // 用于平移和缩放的变量
    private lastPointerPosition: { x: number, y: number } | null = null;
    private stageScale: number = 1;
    private readonly maxScale: number = 5;
    private readonly minScale: number = 0.1;

    // 网格相关
    private gridGroup: Konva.Group | null = null;
    private background: Konva.Rect | null = null;
    private gridSize: number = 50;

    constructor(containerId: string, isDark: boolean) {
        this.id = containerId;
        this.containerEl = document.getElementById(containerId) as HTMLElement;
        this.isDarkMode = isDark;
        this.initialize();
    }

    private initialize() {
        // 创建白板容器结构
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
            <div class="siyuan-whiteboard-canvas-container" id="konva-container-${this.id}"></div>
        `;

        // 获取容器尺寸
        const containerRect = this.containerEl.getBoundingClientRect();
        const canvasWidth = containerRect.width;
        const canvasHeight = containerRect.height - 45; // 减去工具栏高度

        // 创建Konva舞台和图层
        this.stage = new Konva.Stage({
            container: `konva-container-${this.id}`,
            width: canvasWidth,
            height: canvasHeight,
        });

        // 创建背景图层和内容图层
        const backgroundLayer = new Konva.Layer();
        this.layer = new Konva.Layer();
        this.stage.add(backgroundLayer);
        this.stage.add(this.layer);

        // 绘制无限网格背景
        this.drawGrid(backgroundLayer, canvasWidth, canvasHeight);

        // 绑定工具栏事件
        this.bindEvents();

        // 监听窗口大小变化
        window.addEventListener('resize', this.resizeStage);

        // 设置默认工具为选择
        this.setActiveTool('select');
    }

    private drawGrid(layer: Konva.Layer, width: number, height: number) {
        const gridSize = 50; // 网格大小
        const gridColor = this.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        // 创建背景矩形
        const background = new Konva.Rect({
            x: 0,
            y: 0,
            width: width,
            height: height,
            fill: this.isDarkMode ? '#2d2d2d' : 'white',
            name: 'background'
        });
        layer.add(background);

        // 创建网格组
        const gridGroup = new Konva.Group({
            name: 'grid'
        });

        // 创建垂直线
        const verticalLines = new Konva.Line({
            points: [],
            stroke: gridColor,
            strokeWidth: 1,
        });

        // 创建水平线
        const horizontalLines = new Konva.Line({
            points: [],
            stroke: gridColor,
            strokeWidth: 1,
        });

        // 更新网格线的点
        this.updateGridLines(verticalLines, horizontalLines, width, height, gridSize);

        gridGroup.add(verticalLines);
        gridGroup.add(horizontalLines);
        layer.add(gridGroup);

        // 存储参考，以便在缩放和平移时更新
        this.gridGroup = gridGroup;
        this.background = background;
        this.gridSize = gridSize;

        layer.batchDraw();
    }

    private updateGridLines(vLines: Konva.Line, hLines: Konva.Line, width: number, height: number, gridSize: number) {
        const vPoints: number[] = [];
        const hPoints: number[] = [];

        // 计算当前视口的左上角和右下角在世界坐标系中的位置
        const scale = this.stage.scaleX();
        const position = this.stage.position();

        const topLeftX = -position.x / scale;
        const topLeftY = -position.y / scale;
        const bottomRightX = (width - position.x) / scale;
        const bottomRightY = (height - position.y) / scale;

        // 计算网格起始点（保证网格线对齐）
        const startX = Math.floor(topLeftX / gridSize) * gridSize;
        const startY = Math.floor(topLeftY / gridSize) * gridSize;
        const endX = Math.ceil(bottomRightX / gridSize) * gridSize;
        const endY = Math.ceil(bottomRightY / gridSize) * gridSize;

        // 生成垂直线
        for (let x = startX; x <= endX; x += gridSize) {
            vPoints.push(x, startY);
            vPoints.push(x, endY);
            vPoints.push(x, startY); // 添加一个移动点，分隔不同的线段
        }

        // 生成水平线
        for (let y = startY; y <= endY; y += gridSize) {
            hPoints.push(startX, y);
            hPoints.push(endX, y);
            hPoints.push(startX, y); // 添加一个移动点，分隔不同的线段
        }

        vLines.points(vPoints);
        hLines.points(hPoints);
    }


    private bindEvents() {
        // 绑定工具按钮事件
        const tools = this.containerEl.querySelectorAll('.siyuan-whiteboard-tool');
        tools.forEach(tool => {
            tool.addEventListener('click', (e) => {
                const toolType = (e.currentTarget as HTMLElement).dataset.tool;
                if (toolType) {
                    this.handleToolClick(toolType);
                }
            });
        });

        // 绑定舞台事件
        const container = this.stage.container();

        // 鼠标按下事件
        this.stage.on('mousedown touchstart', (e) => {
            // 阻止默认行为
            if (e.evt.button === 1 || e.evt.button === 2) {
                e.evt.preventDefault();
                return;
            }

            if (this.currentTool === 'pencil') {
                this.isDrawing = true;
                this.currentPoints = [];
                const pos = this.stage.getPointerPosition();
                if (pos) {
                    // 将鼠标位置转换为考虑缩放和平移后的坐标
                    const stagePos = this.getRelativePointerPosition();
                    if (stagePos) {
                        this.currentPoints = [stagePos.x, stagePos.y];
                        this.currentLine = new Konva.Line({
                            points: this.currentPoints,
                            stroke: this.isDarkMode ? 'white' : 'black',
                            strokeWidth: 2 / this.stageScale, // 根据缩放调整线宽
                            lineCap: 'round',
                            lineJoin: 'round',
                            tension: 0.5,
                            draggable: false,
                        });
                        this.layer.add(this.currentLine);
                    }
                }
            } else if (this.currentTool === 'pan') {
                container.style.cursor = 'grabbing';
                this.lastPointerPosition = this.stage.getPointerPosition();
            }
        });

        // 鼠标移动事件
        this.stage.on('mousemove touchmove', (e) => {
            if (this.isDrawing && this.currentLine) {
                const stagePos = this.getRelativePointerPosition();
                if (stagePos) {
                    this.currentPoints.push(stagePos.x);
                    this.currentPoints.push(stagePos.y);
                    this.currentLine.points(this.currentPoints);
                    this.layer.batchDraw();
                }
            } else if (this.currentTool === 'pan' && this.lastPointerPosition) {
                const pos = this.stage.getPointerPosition();
                if (!pos) return;

                const dx = pos.x - this.lastPointerPosition.x;
                const dy = pos.y - this.lastPointerPosition.y;

                const newPos = {
                    x: this.stage.x() + dx,
                    y: this.stage.y() + dy
                };

                this.stage.position(newPos);

                // 更新网格
                this.updateGrid();

                this.stage.batchDraw();
                this.lastPointerPosition = pos;
            }
        });




        // 鼠标抬起事件
        this.stage.on('mouseup touchend', () => {
            if (this.isDrawing) {
                this.isDrawing = false;
                this.currentLine = null;
            } else if (this.currentTool === 'pan') {
                container.style.cursor = 'grab';
                this.lastPointerPosition = null;
            }
        });

        // 鼠标滚轮事件
        this.stage.on('wheel', (e) => {
            e.evt.preventDefault();

            const oldScale = this.stageScale;
            const pointer = this.stage.getPointerPosition();

            if (!pointer) return;

            const mousePointTo = {
                x: (pointer.x - this.stage.x()) / oldScale,
                y: (pointer.y - this.stage.y()) / oldScale,
            };

            // 根据滚轮方向确定是放大还是缩小
            const direction = e.evt.deltaY > 0 ? -1 : 1;
            const scaleBy = 1.1;
            const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

            // 限制缩放范围
            this.stageScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

            // 计算新位置
            const newPos = {
                x: pointer.x - mousePointTo.x * this.stageScale,
                y: pointer.y - mousePointTo.y * this.stageScale,
            };

            // 应用新的缩放和位置
            this.stage.scale({ x: this.stageScale, y: this.stageScale });
            this.stage.position(newPos);

            // 更新网格
            this.updateGrid();

            this.stage.batchDraw();
        });

        // 阻止右键菜单
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // 中键平移
        container.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // 中键
                e.preventDefault();
                container.style.cursor = 'grabbing';
                this.lastPointerPosition = this.stage.getPointerPosition();
                
                // 添加鼠标移动监听器
                const handleMouseMove = (moveEvent: MouseEvent) => {
                    const pos = this.stage.getPointerPosition();
                    if (pos && this.lastPointerPosition) {
                        const dx = pos.x - this.lastPointerPosition.x;
                        const dy = pos.y - this.lastPointerPosition.y;
                        
                        this.stage.position({
                            x: this.stage.x() + dx,
                            y: this.stage.y() + dy
                        });
                        
                        this.updateGrid();
                        this.stage.batchDraw();
                        this.lastPointerPosition = pos;
                    }
                };
                
                // 添加鼠标抬起监听器
                const handleMouseUp = (upEvent: MouseEvent) => {
                    if (upEvent.button === 1) {
                        container.style.cursor = this.currentTool === 'pan' ? 'grab' : 'default';
                        this.lastPointerPosition = null;
                        window.removeEventListener('mousemove', handleMouseMove);
                        window.removeEventListener('mouseup', handleMouseUp);
                    }
                };
                
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 1) {
                container.style.cursor = this.currentTool === 'pan' ? 'grab' : 'default';
            }
        });
    }

    // 在类的成员方法中添加
    private getRelativePointerPosition() {
        const pos = this.stage.getPointerPosition();
        if (pos) {
            // 将鼠标坐标转换为相对于舞台的坐标，考虑缩放和平移
            return {
                x: (pos.x - this.stage.x()) / this.stageScale,
                y: (pos.y - this.stage.y()) / this.stageScale
            };
        }
        return null;
    }



    private updateGrid() {
        if (!this.gridGroup || !this.background) return;
    
        const width = this.stage.width();
        const height = this.stage.height();
        const scale = this.stageScale;
        const position = this.stage.position();
    
        // 计算背景矩形需要的尺寸和位置，以确保覆盖整个视口
        const bgX = -position.x / scale;
        const bgY = -position.y / scale;
        const bgWidth = width / scale;
        const bgHeight = height / scale;
    
        // 更新背景大小和位置
        this.background.position({
            x: bgX,
            y: bgY
        });
        this.background.size({
            width: bgWidth,
            height: bgHeight
        });
    
        // 更新网格线
        const verticalLines = this.gridGroup.findOne('Line') as Konva.Line;
        const horizontalLines = this.gridGroup.getChildren(node => node !== verticalLines)[0] as Konva.Line;
    
        if (verticalLines && horizontalLines) {
            this.updateGridLines(verticalLines, horizontalLines, width, height, this.gridSize);
        }
    }


    private handleToolClick(toolType: string) {
        switch (toolType) {
            case 'select':
                this.setActiveTool(toolType);
                this.currentTool = 'select';
                this.stage.container().style.cursor = 'default';
                break;

            case 'pencil':
                this.setActiveTool(toolType);
                this.currentTool = 'pencil';
                this.stage.container().style.cursor = 'crosshair';
                break;

            case 'pan':
                this.setActiveTool(toolType);
                this.currentTool = 'pan';
                this.stage.container().style.cursor = 'grab';
                break;

            case 'clear':
                this.clearCanvas();
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

            case 'save':
                this.saveCanvas();
                break;
        }
    }

    private zoom(factor: number) {
        const oldScale = this.stageScale;
        const center = {
            x: this.stage.width() / 2,
            y: this.stage.height() / 2,
        };
    
        const mousePointTo = {
            x: (center.x - this.stage.x()) / oldScale,
            y: (center.y - this.stage.y()) / oldScale,
        };
    
        const newScale = oldScale * factor;
        this.stageScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    
        const newPos = {
            x: center.x - mousePointTo.x * this.stageScale,
            y: center.y - mousePointTo.y * this.stageScale,
        };
    
        this.stage.scale({ x: this.stageScale, y: this.stageScale });
        this.stage.position(newPos);
        
        // 更新网格和背景
        this.updateGrid();
        
        this.stage.batchDraw();
    }
    
    private resetZoom() {
        this.stageScale = 1;
        this.stage.scale({ x: 1, y: 1 });
        this.stage.position({ x: 0, y: 0 });
        
        // 更新网格和背景
        this.updateGrid();
        
        this.stage.batchDraw();
    }

    private setActiveTool(toolType: string) {
        // 移除所有工具的激活状态
        const tools = this.containerEl.querySelectorAll('.siyuan-whiteboard-tool');
        tools.forEach(tool => tool.classList.remove('active'));

        // 设置当前工具的激活状态
        const currentTool = this.containerEl.querySelector(`[data-tool="${toolType}"]`);
        if (currentTool) {
            currentTool.classList.add('active');
        }
    }

    private clearCanvas() {
        // 清空所有图形，保留网格背景
        const children = this.layer.getChildren();
        for (const child of children) {
            child.destroy();
        }

        this.layer.batchDraw();
    }

    private saveCanvas() {
        // 保存为图片
        const dataURL = this.stage.toDataURL({ pixelRatio: 2 });

        // 下载图片
        const link = document.createElement('a');
        link.download = 'whiteboard.png';
        link.href = dataURL;
        link.click();
    }

    private resizeStage = () => {
        if (!this.stage || !this.containerEl) return;
        
        const containerRect = this.containerEl.getBoundingClientRect();
        const width = containerRect.width;
        const height = containerRect.height - 45; // 减去工具栏高度
        
        this.stage.width(width);
        this.stage.height(height);
        
        // 更新网格
        this.updateGrid();
        
        this.stage.batchDraw();
    }

    public dispose() {
        window.removeEventListener('resize', this.resizeStage);
        if (this.stage) {
            this.stage.destroy();
        }
    }
}