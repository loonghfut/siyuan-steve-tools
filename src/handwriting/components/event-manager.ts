import Konva from 'konva';
import { ToolManager } from './tool-manager';
import { DrawingManager } from './drawing-manager';
import { ViewManager } from './view-manager';
import { GridManager } from './grid-manager';

export class EventManager {
    private stage: Konva.Stage;
    private toolManager: ToolManager;
    private drawingManager: DrawingManager;
    private viewManager: ViewManager;
    private gridManager: GridManager;
    private containerEl: HTMLElement;
    
    constructor(
        stage: Konva.Stage, 
        containerEl: HTMLElement,
        toolManager: ToolManager,
        drawingManager: DrawingManager,
        viewManager: ViewManager,
        gridManager: GridManager
    ) {
        this.stage = stage;
        this.containerEl = containerEl;
        this.toolManager = toolManager;
        this.drawingManager = drawingManager;
        this.viewManager = viewManager;
        this.gridManager = gridManager;
    }
    
    public bindEvents(): void {
        this.bindToolbarEvents();
        this.bindMouseEvents();
        this.bindKeyboardEvents();
        
        // 监听窗口大小变化
        window.addEventListener('resize', this.handleResize);
    }
    
    private bindToolbarEvents(): void {
        const tools = this.containerEl.querySelectorAll('.siyuan-whiteboard-tool');
        tools.forEach(tool => {
            tool.addEventListener('click', (e) => {
                const toolType = (e.currentTarget as HTMLElement).dataset.tool;
                if (toolType) {
                    this.handleToolClick(toolType);
                }
            });
        });
    }
    
    private bindMouseEvents(): void {
        const container = this.stage.container();
        
        // 鼠标按下事件
        this.stage.on('mousedown touchstart', this.handleMouseDown);
        
        // 鼠标移动事件
        this.stage.on('mousemove touchmove', this.handleMouseMove);
        
        // 鼠标抬起事件
        this.stage.on('mouseup touchend', this.handleMouseUp);
        
        // 鼠标滚轮事件
        this.stage.on('wheel', this.handleWheel);
        
        // 阻止右键菜单
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // 中键平移
        container.addEventListener('mousedown', this.handleMiddleMouseDown);
    }
    
    private bindKeyboardEvents(): void {
        // 键盘事件绑定，例如快捷键
        window.addEventListener('keydown', this.handleKeyDown);
    }
    
    private handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
        // 阻止中键和右键的默认行为
        if (e.evt.button === 1 || e.evt.button === 2) {
            e.evt.preventDefault();
            return;
        }
        
        const currentTool = this.toolManager.getCurrentTool();
        const pos = this.stage.getPointerPosition();
        
        if (!pos) return;
        
        if (currentTool === 'pencil') {
            const relPos = this.viewManager.getRelativePointerPosition(pos);
            this.drawingManager.startDrawing(relPos);
        } else if (currentTool === 'pan') {
            document.body.style.cursor = 'grabbing';
            this.viewManager.startPan(pos);
        }
        
        // 其他工具的处理逻辑...
    }
    
    private handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
        const currentTool = this.toolManager.getCurrentTool();
        const pos = this.stage.getPointerPosition();
        
        if (!pos) return;
        
        if (currentTool === 'pencil' && this.drawingManager.isCurrentlyDrawing()) {
            const relPos = this.viewManager.getRelativePointerPosition(pos);
            this.drawingManager.continueDrawing(relPos);
        } else if (currentTool === 'pan') {
            this.viewManager.pan(pos);
            this.gridManager.updateGrid(this.viewManager.getScale());
            this.stage.batchDraw();
        }
        
        // 其他工具的处理逻辑...
    }
    
    private handleMouseUp = (): void => {
        const currentTool = this.toolManager.getCurrentTool();
        
        if (currentTool === 'pencil') {
            this.drawingManager.endDrawing();
        } else if (currentTool === 'pan') {
            document.body.style.cursor = 'grab';
            this.viewManager.endPan();
        }
        
        // 其他工具的处理逻辑...
    }
    
    private handleWheel = (e: Konva.KonvaEventObject<WheelEvent>): void => {
        e.evt.preventDefault();
        
        const pointer = this.stage.getPointerPosition();
        if (!pointer) return;
        
        // 根据滚轮方向确定是放大还是缩小
        const direction = e.evt.deltaY > 0 ? -1 : 1;
        const scaleBy = 1.1;
        const factor = direction > 0 ? scaleBy : 1 / scaleBy;
        
        this.viewManager.zoomAtPoint(pointer, factor);
        this.gridManager.updateGrid(this.viewManager.getScale());
        
        // 更新绘图管理器的缩放比例
        this.drawingManager.setScale(this.viewManager.getScale());
        
        this.stage.batchDraw();
    }
    
    private handleMiddleMouseDown = (e: MouseEvent): void => {
        if (e.button === 1) { // 中键
            e.preventDefault();
            document.body.style.cursor = 'grabbing';
            
            const pos = this.stage.getPointerPosition();
            if (pos) {
                this.viewManager.startPan(pos);
            }
            
            // 添加鼠标移动监听器
            const handleMouseMove = (moveEvent: MouseEvent) => {
                const newPos = this.stage.getPointerPosition();
                if (newPos) {
                    this.viewManager.pan(newPos);
                    this.gridManager.updateGrid(this.viewManager.getScale());
                    this.stage.batchDraw();
                }
            };
            
            // 添加鼠标抬起监听器
            const handleMouseUp = (upEvent: MouseEvent) => {
                if (upEvent.button === 1) {
                    const currentTool = this.toolManager.getCurrentTool();
                    document.body.style.cursor = currentTool === 'pan' ? 'grab' : 'default';
                    this.viewManager.endPan();
                    window.removeEventListener('mousemove', handleMouseMove);
                    window.removeEventListener('mouseup', handleMouseUp);
                }
            };
            
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
    }
    
    private handleKeyDown = (e: KeyboardEvent): void => {
        // 处理快捷键
        // 例如：Ctrl+Z 撤销，Ctrl+Y 重做等
    }
    
    private handleToolClick = (toolType: string): void => {
        switch (toolType) {
            case 'select':
            case 'pencil':
            case 'pan':
                this.toolManager.setActiveTool(toolType as any);
                break;
                
            case 'clear':
                this.drawingManager.clearCanvas();
                break;
                
            case 'zoom-in':
                this.viewManager.zoom(1.1);
                this.gridManager.updateGrid(this.viewManager.getScale());
                this.drawingManager.setScale(this.viewManager.getScale());
                this.stage.batchDraw();
                break;
                
            case 'zoom-out':
                this.viewManager.zoom(0.9);
                this.gridManager.updateGrid(this.viewManager.getScale());
                this.drawingManager.setScale(this.viewManager.getScale());
                this.stage.batchDraw();
                break;
                
            case 'zoom-reset':
                this.viewManager.resetZoom();
                this.gridManager.updateGrid(this.viewManager.getScale());
                this.drawingManager.setScale(this.viewManager.getScale());
                this.stage.batchDraw();
                break;
                
            case 'save':
                this.saveCanvas();
                break;
        }
    }
    
    private saveCanvas(): void {
        // 保存为图片
        const dataURL = this.stage.toDataURL({ pixelRatio: 2 });

        // 下载图片
        const link = document.createElement('a');
        link.download = 'whiteboard.png';
        link.href = dataURL;
        link.click();
    }
    
    private handleResize = (): void => {
        if (!this.stage || !this.containerEl) return;
        
        const containerRect = this.containerEl.getBoundingClientRect();
        const width = containerRect.width;
        const height = containerRect.height - 45; // 减去工具栏高度
        
        this.stage.width(width);
        this.stage.height(height);
        
        // 更新网格
        this.gridManager.updateGrid(this.viewManager.getScale());
        
        this.stage.batchDraw();
    }
    
    public dispose(): void {
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
    }
}