import Konva from 'konva';
import { ToolManager } from './tool-manager';
import { DrawingManager } from './drawing-manager';
import { ViewManager } from './view-manager';
import { GridManager } from './grid-manager';
import { SelectionManager } from './selection-manager';
import { Point } from '../types/whiteboard-types';


export class EventManager {
    private stage: Konva.Stage;
    private containerEl: HTMLElement;
    private toolManager: ToolManager;
    private drawingManager: DrawingManager;
    private viewManager: ViewManager;
    private gridManager: GridManager;
    private selectionManager: SelectionManager;

    constructor(
        stage: Konva.Stage,
        containerEl: HTMLElement,
        toolManager: ToolManager,
        drawingManager: DrawingManager,
        viewManager: ViewManager,
        gridManager: GridManager,
        selectionManager: SelectionManager
    ) {
        this.stage = stage;
        this.containerEl = containerEl;
        this.toolManager = toolManager;
        this.drawingManager = drawingManager;
        this.viewManager = viewManager;
        this.gridManager = gridManager;
        this.selectionManager = selectionManager;
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
        const pos = this.stage.getPointerPosition() as Point;

        if (!pos) return;

        if (currentTool === 'select') {
            this.selectionManager.startSelection(pos);
        } else if (currentTool === 'pencil') {
            const relPos = this.viewManager.getRelativePointerPosition(pos);
            this.drawingManager.startDrawing(relPos);
        } else if (currentTool === 'pan') {
            document.body.style.cursor = 'grabbing';
            this.viewManager.startPan(pos);
        } else if (currentTool === 'eraser') {
            this.startErasing(pos);
        }
    }

    // 在handleMouseMove方法中添加框选更新的处理
    private handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
        const currentTool = this.toolManager.getCurrentTool();
        const pos = this.stage.getPointerPosition();

        if (!pos) return;

        if (currentTool === 'select' && this.selectionManager.isSelecting()) {
            // 如果在选择模式下进行框选
            this.selectionManager.updateBoxSelection(pos);
        } else if (currentTool === 'pencil' && this.drawingManager.isCurrentlyDrawing()) {
            const relPos = this.viewManager.getRelativePointerPosition(pos);
            this.drawingManager.continueDrawing(relPos);
        } else if (currentTool === 'pan') {
            this.viewManager.pan(pos);
            this.gridManager.updateGrid(this.viewManager.getScale());
            this.stage.batchDraw();
        }
    }

    private handleMouseUp = (): void => {
        const currentTool = this.toolManager.getCurrentTool();

        if (currentTool === 'select' && this.selectionManager.isSelecting()) {
            // 如果在选择模式下完成框选
            this.selectionManager.endBoxSelection();
        } else if (currentTool === 'pencil') {
            this.drawingManager.endDrawing();
        } else if (currentTool === 'pan') {
            document.body.style.cursor = 'grab';
            this.viewManager.endPan();
        }
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
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // 删除选中的元素
            this.selectionManager.deleteSelected();
        } else if (e.ctrlKey && e.key === 'd') {
            // 复制选中的元素
            e.preventDefault();
            this.selectionManager.duplicateSelected();
        } else if (e.ctrlKey && e.key === 'z') {
            // 撤销功能
            e.preventDefault();
            // TODO: 实现撤销功能
        } else if (e.ctrlKey && e.key === 'y') {
            // 重做功能
            e.preventDefault();
            // TODO: 实现重做功能
        }
    }

    private handleToolClick = (toolType: string): void => {
        switch (toolType) {
            case 'select':
            case 'pencil':
            case 'pan':
            // case 'text':
            case 'eraser':
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

    private createTextElement(pos: Point): void {
        // 创建文本节点
        const relPos = this.viewManager.getRelativePointerPosition(pos);

        const textNode = new Konva.Text({
            x: relPos.x,
            y: relPos.y,
            text: '双击编辑文本',
            fontSize: 16 / this.viewManager.getScale(),
            // fill: this.drawingManager.getStrokeColor(),
            width: 200 / this.viewManager.getScale(),
            padding: 5,
            draggable: true,
        });

        this.stage.getLayers()[1].add(textNode);

        // 添加双击事件
        textNode.on('dblclick', () => {
            this.editText(textNode);
        });

        // 选中新创建的文本
        this.selectionManager.selectShape(textNode);
    }

    private editText(textNode: Konva.Text): void {
        // 创建文本区域进行编辑
        const textPosition = textNode.absolutePosition();
        const stageContainer = this.stage.container();
        const areaPosition = {
            x: textPosition.x,
            y: textPosition.y
        };

        // 创建textarea元素
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        textarea.value = textNode.text();
        textarea.style.position = 'absolute';
        textarea.style.top = `${areaPosition.y}px`;
        textarea.style.left = `${areaPosition.x}px`;
        textarea.style.width = `${textNode.width() * this.viewManager.getScale()}px`;
        textarea.style.height = `${textNode.height() * this.viewManager.getScale()}px`;
        textarea.style.fontSize = `${textNode.fontSize() * this.viewManager.getScale()}px`;
        textarea.style.border = 'none';
        textarea.style.padding = '5px';
        textarea.style.margin = '0px';
        textarea.style.overflow = 'hidden';
        textarea.style.background = 'none';
        textarea.style.outline = 'none';
        textarea.style.resize = 'none';
        textarea.style.zIndex = '1000';
        textarea.style.fontFamily = 'Arial';
        // textarea.style.color = textNode.fill();

        textarea.focus();

        // 隐藏文本节点
        textNode.hide();

        // 更新图层
        this.stage.getLayers()[1].batchDraw();

        // 文本区域完成编辑
        const removeTextarea = () => {
            document.body.removeChild(textarea);
            window.removeEventListener('click', handleOutsideClick);
            textNode.show();
            this.stage.getLayers()[1].batchDraw();
            this.selectionManager.selectShape(textNode);
        };

        // 点击外部区域完成编辑
        const handleOutsideClick = (e) => {
            if (e.target !== textarea) {
                textNode.text(textarea.value);
                removeTextarea();
            }
        };

        // 键盘事件
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                textNode.text(textarea.value);
                removeTextarea();
            }

            if (e.key === 'Escape') {
                removeTextarea();
            }
        });

        // 失去焦点时保存
        textarea.addEventListener('blur', () => {
            textNode.text(textarea.value);
            removeTextarea();
        });

        // 添加点击外部区域的事件监听
        setTimeout(() => {
            window.addEventListener('click', handleOutsideClick);
        }, 0);
    }

    private startErasing(pos: Point): void {
        const shape = this.stage.getIntersection(pos) as Konva.Shape;

        if (shape && !shape.hasName('background') && !shape.hasName('grid')) {
            shape.destroy();
            this.selectionManager.clearSelection();
            this.stage.getLayers()[1].batchDraw();
        }
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