// filepath: c:\Users\dragon\Documents\node\public\siyuan-steve-tools\src\handwriting\canvas\grid-manager.ts
import { Canvas } from 'fabric/fabric-impl';

export class GridManager {
    private id: string;
    private canvas: Canvas;
    private styleElement: HTMLStyleElement | null = null;
    
    constructor(id: string, canvas: Canvas) {
        this.id = id;
        this.canvas = canvas;
        this.initBackgroundGrid();
    }
    
    /**
     * 初始化背景网格
     */
    private initBackgroundGrid(): void {
        // 创建并添加背景网格样式
        this.styleElement = document.createElement('style');
        this.styleElement.id = `grid-style-${this.id}`;
        this.styleElement.textContent = `
            #grid-${this.id} {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                background-size: 20px 20px;
                background-image: 
                    linear-gradient(to right, var(--b3-border-color) 1px, transparent 1px),
                    linear-gradient(to bottom, var(--b3-border-color) 1px, transparent 1px);
                transform-origin: 0 0;
            }
        `;
        document.head.appendChild(this.styleElement);
    }
    
    /**
     * 更新网格位置和大小以匹配画布变换
     * @param viewportTransform 视口变换矩阵
     */
    updateGridPosition(viewportTransform: number[]): void {
        const gridElement = document.getElementById(`grid-${this.id}`);
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
     * 清理资源
     */
    dispose(): void {
        if (this.styleElement) {
            this.styleElement.remove();
        }
    }
}