import { Canvas } from 'fabric/fabric-impl';
import * as fabric from 'fabric';
import { GridManager } from './grid-manager';

export class PanZoomHandler {
    private canvas: Canvas;
    private id: string;
    private isDragging: boolean = false;
    private lastPosX: number = 0;
    private lastPosY: number = 0;
    
    constructor(id: string, canvas: Canvas) {
        this.id = id;
        this.canvas = canvas;
        this.setupPanZoom();
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

                // 重新渲染画布
                this.canvas.requestRenderAll();
            });
        }

        // 鼠标按下事件
        this.canvas.on('mouse:down', (opt) => {
            const evt = opt.e;

            // 空格键按下时或中键点击时或在空白处左键点击
            if (evt instanceof MouseEvent && (evt.button === 1 || (evt.button === 0 && !opt.target))) {
                this.isDragging = true;
                this.lastPosX = evt.clientX;
                this.lastPosY = evt.clientY;
                this.canvas.selection = false; // 暂时禁用选择功能
                this.canvas.defaultCursor = 'grabbing';
                evt.preventDefault();
                evt.stopPropagation();
            }
        });

        // 鼠标移动事件
        this.canvas.on('mouse:move', (opt) => {
            if (this.isDragging) {
                const evt = opt.e;
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

        // 鼠标释放事件
        this.canvas.on('mouse:up', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.canvas.selection = true;
                this.canvas.defaultCursor = 'default';
            }
        });

        // 鼠标滚轮缩放事件
        this.canvas.on('mouse:wheel', (opt) => {
            const evt = opt.e;
            evt.preventDefault();
            evt.stopPropagation();

            // 计算缩放系数
            const delta = evt.deltaY;
            let zoom = this.canvas.getZoom();
            zoom = zoom * (0.999 ** delta);

            // 限制缩放范围
            zoom = Math.min(Math.max(0.1, zoom), 10);

            // 获取鼠标位置，以此为中心点进行缩放
            const point = new fabric.Point(evt.offsetX, evt.offsetY);

            // 执行缩放
            this.canvas.zoomToPoint(point, zoom);

            // 更新网格
            const vpt = this.canvas.viewportTransform;
            if (vpt) {
                this.updateGridPosition(vpt);

                // 更新缩放显示
                this.updateZoomDisplay(zoom);
            }
        });
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