import Konva from 'konva';
import { Point } from '../types/whiteboard-types';

export class ViewManager {
    private stage: Konva.Stage;
    private stageScale: number = 1;
    private readonly maxScale: number;
    private readonly minScale: number;
    private lastPointerPosition: Point | null = null;
    
    constructor(stage: Konva.Stage, minScale: number = 0.1, maxScale: number = 5) {
        this.stage = stage;
        this.minScale = minScale;
        this.maxScale = maxScale;
    }
    
    public getScale(): number {
        return this.stageScale;
    }
    
    public zoom(factor: number): void {
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
    }
    
    public zoomAtPoint(point: Point, factor: number): void {
        const oldScale = this.stageScale;
        
        const mousePointTo = {
            x: (point.x - this.stage.x()) / oldScale,
            y: (point.y - this.stage.y()) / oldScale,
        };
    
        const newScale = oldScale * factor;
        this.stageScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    
        const newPos = {
            x: point.x - mousePointTo.x * this.stageScale,
            y: point.y - mousePointTo.y * this.stageScale,
        };
    
        this.stage.scale({ x: this.stageScale, y: this.stageScale });
        this.stage.position(newPos);
    }
    
    public resetZoom(): void {
        this.stageScale = 1;
        this.stage.scale({ x: 1, y: 1 });
        this.stage.position({ x: 0, y: 0 });
    }
    
    public startPan(point: Point): void {
        this.lastPointerPosition = point;
    }
    
    public pan(point: Point): void {
        if (!this.lastPointerPosition) return;
        
        const dx = point.x - this.lastPointerPosition.x;
        const dy = point.y - this.lastPointerPosition.y;
        
        this.stage.position({
            x: this.stage.x() + dx,
            y: this.stage.y() + dy
        });
        
        this.lastPointerPosition = point;
    }
    
    public endPan(): void {
        this.lastPointerPosition = null;
    }
    
    public getRelativePointerPosition(point: Point): Point {
        return {
            x: (point.x - this.stage.x()) / this.stageScale,
            y: (point.y - this.stage.y()) / this.stageScale
        };
    }
}