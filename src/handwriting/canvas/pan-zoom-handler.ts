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
            });
        }

        // 修改鼠标按下事件处理，增强中键处理
        this.canvas.on('mouse:down', (opt) => {
            const evt = opt.e;
            // 仅当中键点击时启用画布拖拽
            if (evt instanceof MouseEvent && evt.button === 0) {
                this.isDragging = true;
                this.lastPosX = evt.clientX;
                this.lastPosY = evt.clientY;
                this.canvas.selection = false; // 暂时禁用选择功能
                this.canvas.defaultCursor = 'grabbing';

                // 确保阻止中键的默认行为（通常是自动滚动）
                evt.preventDefault();
                evt.stopPropagation();
                return false; // 确保事件完全停止传播
            }
        });

        // 修改鼠标移动事件，确保拖拽功能正常
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