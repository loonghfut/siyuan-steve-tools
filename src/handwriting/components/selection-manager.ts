import Konva from 'konva';
import { Point } from '../types/whiteboard-types';

export class SelectionManager {
    private stage: Konva.Stage;
    private layer: Konva.Layer;
    private selectedShape: Konva.Shape | null = null;
    private transformer: Konva.Transformer;
    private isDarkMode: boolean;
    
    constructor(stage: Konva.Stage, layer: Konva.Layer, isDarkMode: boolean) {
        this.stage = stage;
        this.layer = layer;
        this.isDarkMode = isDarkMode;
        
        // 创建变换器
        this.transformer = new Konva.Transformer({
            // 设置变换器样式
            borderStroke: this.isDarkMode ? '#99CCFF' : '#0066FF',
            borderStrokeWidth: 1,
            anchorStroke: this.isDarkMode ? '#99CCFF' : '#0066FF',
            anchorFill: this.isDarkMode ? '#333333' : '#FFFFFF',
            anchorSize: 8,
            rotateAnchorOffset: 20,
            enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-right', 
                           'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
            rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
            // 保持原比例
            keepRatio: false,
            // 边界大小限制
            boundBoxFunc: (oldBox, newBox) => {
                // 防止尺寸太小
                if (newBox.width < 5 || newBox.height < 5) {
                    return oldBox;
                }
                return newBox;
            },
        });
        
        this.layer.add(this.transformer);
    }
    
    public startSelection(point: Point): void {
        // 获取点击位置的图形
        const shape = this.stage.getIntersection(point) as Konva.Shape;
        
        
        // 如果点击空白区域或背景/网格，则清除选择
        if (!shape || shape.hasName('background') || shape.hasName('grid')) {
            this.clearSelection();
            return;
        }
        
        // 选中图形
        this.selectShape(shape);
    }
    



    private getShapeAtPoint(point: Point): Konva.Shape | null {
        // 获取点击位置的形状
        const shape = this.stage.getIntersection(point) as Konva.Shape;
        
        // 过滤掉背景和网格
        if (shape && !shape.hasName('background') && !shape.hasName('grid')) {
            return shape;
        }
        
        return null;
    }
    
    public selectShape(shape: Konva.Shape): void {
        // 清除当前选择
        this.clearSelection();
        
        // 设置新的选中图形
        this.selectedShape = shape;
        
        // 将图形添加到变换器节点中
        this.transformer.nodes([shape]);
        
        // 重绘图层
        this.layer.batchDraw();
    }
    
    public clearSelection(): void {
        this.selectedShape = null;
        this.transformer.nodes([]);
        this.layer.batchDraw();
    }
    
    public getSelectedShape(): Konva.Shape | null {
        return this.selectedShape;
    }
    
    public deleteSelected(): void {
        if (this.selectedShape) {
            this.selectedShape.destroy();
            this.clearSelection();
        }
    }
    
    public duplicateSelected(): void {
        if (this.selectedShape) {
            const clone = this.selectedShape.clone({
                x: this.selectedShape.x() + 10,
                y: this.selectedShape.y() + 10,
            });
            this.layer.add(clone);
            this.selectShape(clone);
        }
    }
}