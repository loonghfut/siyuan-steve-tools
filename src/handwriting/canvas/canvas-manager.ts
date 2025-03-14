// filepath: c:\Users\dragon\Documents\node\public\siyuan-steve-tools\src\handwriting\canvas\canvas-manager.ts
import { Canvas } from 'fabric/fabric-impl';
import * as fabric from 'fabric';
import { GridManager } from './grid-manager';
import { PanZoomHandler } from './pan-zoom-handler';
import { showMessage } from 'siyuan';

export class CanvasManager {
    private canvas: Canvas;
    private id: string;
    private gridManager: GridManager;
    private panZoomHandler: PanZoomHandler;
    
    constructor(id: string, containerElement: HTMLElement) {
        this.id = id;
        this.initializeCanvas(containerElement);
        this.gridManager = new GridManager(this.id, this.canvas);
        this.panZoomHandler = new PanZoomHandler(this.id, this.canvas);
        this.setupResponsiveCanvas(containerElement);
    }
    
    /**
     * 初始化Fabric.js画布
     * @param container 容器元素
     */
    private initializeCanvas(container: HTMLElement): void {
        const canvasEl = document.getElementById(`canvas-${this.id}`) as HTMLCanvasElement;

        if (!canvasEl) {
            showMessage("无法创建画板");
            return;
        }

        // 设置画布尺寸为容器大小
        canvasEl.width = container.clientWidth;
        canvasEl.height = container.clientHeight;

        // 创建Fabric画布实例
        this.canvas = new fabric.Canvas(canvasEl, {
            backgroundColor: 'transparent', // 透明背景，网格由CSS实现
            preserveObjectStacking: true,
            selection: true,
            renderOnAddRemove: true,
            allowTouchScrolling: false
        });
    }
    
    /**
     * 设置画布响应式尺寸
     * @param container 容器元素
     */
    private setupResponsiveCanvas(container: HTMLElement): void {
        // 使用ResizeObserver监听容器尺寸变化
        const resizeObserver = new ResizeObserver(() => {
            // 调整画布尺寸
            this.canvas.setWidth(container.clientWidth);
            this.canvas.setHeight(container.clientHeight);
            this.canvas.renderAll();
        });

        // 监听容器
        resizeObserver.observe(container);
    }
    
    /**
     * 获取画布实例
     */
    getCanvas(): Canvas {
        return this.canvas;
    }
    
    /**
     * 获取画布ID
     */
    getId(): string {
        return this.id;
    }
    
    /**
     * 销毁画布及相关资源
     */
    dispose(): void {
        this.canvas.dispose();
        // 清理其他资源
        this.gridManager.dispose();
        this.panZoomHandler.dispose();
    }
}