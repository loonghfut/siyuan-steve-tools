import Konva from 'konva';
import { Point } from '../types/whiteboard-types';

export class SelectionManager {
    private stage: Konva.Stage;
    private layer: Konva.Layer;
    private selectedShape: Konva.Shape | null = null;
    private selectedShapes: Konva.Shape[] = [];  // 存储多选的图形
    private transformer: Konva.Transformer;
    private isDarkMode: boolean;
    private selectionRect: Konva.Rect | null = null;  // 用于显示选择框
    private selectionStartPoint: Point | null = null;  // 框选的起始点
    
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
        
        // 创建选择矩形
        this.selectionRect = new Konva.Rect({
            fill: this.isDarkMode ? 'rgba(153, 204, 255, 0.2)' : 'rgba(0, 102, 255, 0.2)',
            stroke: this.isDarkMode ? '#99CCFF' : '#0066FF',
            strokeWidth: 1,
            dash: [5, 5],
            visible: false
        });
        this.layer.add(this.selectionRect);
    }
    
    public startSelection(point: Point): void {
        const shape = this.stage.getIntersection(point) as Konva.Shape;
        
        // 如果点击了空白区域或背景/网格，则开始框选
        if (!shape || shape.hasName('background') || shape.hasName('grid')) {
            this.clearSelection();
            this.startBoxSelection(point);
            return;
        }
        
        // 如果按住Shift键，则添加/移除到多选
        if (window.event && (window.event as MouseEvent).shiftKey) {
            this.toggleShapeSelection(shape);
        } else {
            // 否则选中单个图形
            this.selectShape(shape);
        }
    }
    
    private startBoxSelection(point: Point): void {
        this.selectionStartPoint = point;
        this.selectionRect?.setAttrs({
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
            visible: true
        });
        this.layer.batchDraw();
    }
    
    public updateBoxSelection(point: Point): void {
        if (!this.selectionStartPoint || !this.selectionRect) return;
        
        const x = Math.min(point.x, this.selectionStartPoint.x);
        const y = Math.min(point.y, this.selectionStartPoint.y);
        const width = Math.abs(point.x - this.selectionStartPoint.x);
        const height = Math.abs(point.y - this.selectionStartPoint.y);
        
        this.selectionRect.setAttrs({
            x: x,
            y: y,
            width: width,
            height: height
        });
        this.layer.batchDraw();
    }
    
    public endBoxSelection(): void {
        if (!this.selectionStartPoint || !this.selectionRect) return;
        
        // 隐藏选择框
        this.selectionRect.visible(false);
        
        // 获取框选区域内的所有图形
        const box = {
            x1: this.selectionRect.x(),
            y1: this.selectionRect.y(),
            x2: this.selectionRect.x() + this.selectionRect.width(),
            y2: this.selectionRect.y() + this.selectionRect.height()
        };
        
        // 获取所有图形
        const shapes = this.layer.getChildren((node) => {
            // 忽略背景、网格、变换器和选择框本身
            if (node === this.transformer || node === this.selectionRect || 
                node.hasName('background') || node.hasName('grid')) {
                return false;
            }
            return true;
        });
        
        // 找出所有在选择框内的图形
        this.selectedShapes = [];
        shapes.forEach((shape) => {
            const shapeBox = shape.getClientRect();
            
            // 检查图形是否与选择框重叠
            if (this.boxesIntersect(box, {
                x1: shapeBox.x,
                y1: shapeBox.y,
                x2: shapeBox.x + shapeBox.width,
                y2: shapeBox.y + shapeBox.height
            })) {
                this.selectedShapes.push(shape as Konva.Shape);
            }
        });
        
        // 如果有选中的图形，则添加到变换器
        if (this.selectedShapes.length > 0) {
            this.transformer.nodes(this.selectedShapes);
            this.selectedShape = this.selectedShapes.length === 1 ? this.selectedShapes[0] : null;
        }
        
        this.layer.batchDraw();
        this.selectionStartPoint = null;
    }
    
    private boxesIntersect(a: { x1: number, y1: number, x2: number, y2: number }, 
                          b: { x1: number, y1: number, x2: number, y2: number }): boolean {
        // 检查两个矩形是否相交
        return !(
            a.x2 < b.x1 ||
            a.x1 > b.x2 ||
            a.y2 < b.y1 ||
            a.y1 > b.y2
        );
    }
    
    private toggleShapeSelection(shape: Konva.Shape): void {
        const index = this.selectedShapes.indexOf(shape);
        
        if (index >= 0) {
            // 如果已经选中，则取消选中
            this.selectedShapes.splice(index, 1);
        } else {
            // 如果未选中，则添加到选中列表
            this.selectedShapes.push(shape);
        }
        
        // 更新变换器
        this.transformer.nodes(this.selectedShapes);
        this.selectedShape = this.selectedShapes.length === 1 ? this.selectedShapes[0] : null;
        this.layer.batchDraw();
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
        this.selectedShapes = [shape];
        
        // 将图形添加到变换器节点中
        this.transformer.nodes([shape]);
        
        // 重绘图层
        this.layer.batchDraw();
    }
    
    public clearSelection(): void {
        this.selectedShape = null;
        this.selectedShapes = [];
        this.transformer.nodes([]);
        this.layer.batchDraw();
    }
    
    public getSelectedShape(): Konva.Shape | null {
        return this.selectedShape;
    }
    
    public getSelectedShapes(): Konva.Shape[] {
        return this.selectedShapes;
    }
    
    public deleteSelected(): void {
        if (this.selectedShapes.length > 0) {
            this.selectedShapes.forEach(shape => shape.destroy());
            this.clearSelection();
        }
    }
    
    public duplicateSelected(): void {
        if (this.selectedShapes.length > 0) {
            const newShapes: Konva.Shape[] = [];
            
            this.selectedShapes.forEach(shape => {
                const clone = shape.clone({
                    x: shape.x() + 10,
                    y: shape.y() + 10,
                });
                this.layer.add(clone);
                newShapes.push(clone);
            });
            
            this.selectedShapes = newShapes;
            this.transformer.nodes(newShapes);
            this.selectedShape = newShapes.length === 1 ? newShapes[0] : null;
            this.layer.batchDraw();
        }
    }
    
    public isSelecting(): boolean {
        return this.selectionStartPoint !== null;
    }
}