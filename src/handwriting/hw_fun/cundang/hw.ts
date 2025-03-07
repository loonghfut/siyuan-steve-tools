import * as fabric from 'fabric';
import { ToolType, CanvasOptions } from './interface';

export class Canvas {
    private fabricCanvas: fabric.Canvas;
    private container: HTMLElement;
    private currentTool: ToolType = ToolType.Pen;
    private currentColor: string = '#000000';
    private currentWidth: number = 2;

    constructor(container: HTMLElement, options: CanvasOptions = {}) {
        this.container = container;

        // 创建canvas元素
        const canvas = document.createElement('canvas');
        canvas.id = 'drawing-canvas';
        this.container.appendChild(canvas);

        // 初始化fabric画布
        this.fabricCanvas = new fabric.Canvas(canvas, {
            backgroundColor: options.backgroundColor || 'white',
            width: options.width || this.container.clientWidth,
            height: options.height || this.container.clientHeight,
            isDrawingMode: options.isDrawingMode !== undefined ? options.isDrawingMode : true
        });

        this.initializeBrush();
        // 窗口大小调整时重新设置画布大小
        window.addEventListener('resize', this.handleResize.bind(this));
    }


    private initializeBrush(): void {
        // 确保画布处于绘画模式
        this.fabricCanvas.isDrawingMode = true;

        // 设置画笔类型为铅笔画笔
        this.fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(this.fabricCanvas);

        // 现在可以安全地设置画笔属性
        this.fabricCanvas.freeDrawingBrush.color = this.currentColor;
        this.fabricCanvas.freeDrawingBrush.width = this.currentWidth;
    }

    public setTool(tool: ToolType): void {
        this.currentTool = tool;

        switch (tool) {
            case ToolType.Pen:
                this.fabricCanvas.isDrawingMode = true;
                this.fabricCanvas.freeDrawingBrush.color = this.currentColor;
                this.fabricCanvas.freeDrawingBrush.width = this.currentWidth;
                break;
            case ToolType.Eraser:
                this.fabricCanvas.isDrawingMode = true;
                this.fabricCanvas.freeDrawingBrush.color = 'white';
                this.fabricCanvas.freeDrawingBrush.width = this.currentWidth * 2;
                break;
            default:
                this.fabricCanvas.isDrawingMode = false;
                break;
        }
    }

    public setColor(color: string): void {
        this.currentColor = color;
        if (this.currentTool === ToolType.Pen) {
            this.fabricCanvas.freeDrawingBrush.color = color;
        }
    }

    public setWidth(width: number): void {
        this.currentWidth = width;
        this.fabricCanvas.freeDrawingBrush.width =
            this.currentTool === ToolType.Eraser ? width * 2 : width;
    }

    public clear(): void {
        this.fabricCanvas.clear();
        this.fabricCanvas.backgroundColor = 'white';
    }

    public toDataURL(): string {
        return this.fabricCanvas.toDataURL({
            format: 'png',
            quality: 1,
            multiplier: 1
        });
    }

    public destroy(): void {
        window.removeEventListener('resize', this.handleResize.bind(this));
        this.fabricCanvas.dispose();
    }

    private handleResize(): void {
        this.fabricCanvas.setWidth(this.container.clientWidth);
        this.fabricCanvas.setHeight(this.container.clientHeight);
        this.fabricCanvas.renderAll();
    }
}