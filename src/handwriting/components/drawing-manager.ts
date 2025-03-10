import Konva from 'konva';
import { Point } from '../types/whiteboard-types';

export class DrawingManager {
    private stage: Konva.Stage;
    private layer: Konva.Layer;
    private isDrawing: boolean = false;
    private currentLine: Konva.Line | null = null;
    private currentPoints: number[] = [];
    private isDarkMode: boolean;
    private stageScale: number = 1;
    
    constructor(stage: Konva.Stage, layer: Konva.Layer, isDarkMode: boolean) {
        this.stage = stage;
        this.layer = layer;
        this.isDarkMode = isDarkMode;
    }
    
    public setScale(scale: number): void {
        this.stageScale = scale;
    }
    
    public startDrawing(point: Point): void {
        this.isDrawing = true;
        this.currentPoints = [point.x, point.y];
        
        this.currentLine = new Konva.Line({
            points: this.currentPoints,
            stroke: this.isDarkMode ? 'white' : 'black',
            strokeWidth: 2 / this.stageScale, // 根据缩放调整线宽
            lineCap: 'round',
            lineJoin: 'round',
            tension: 0.5,
            draggable: true, // 使线条可拖动
        });
        
        this.layer.add(this.currentLine);
    }
    
    public continueDrawing(point: Point): void {
        if (!this.isDrawing || !this.currentLine) return;
        
        this.currentPoints.push(point.x, point.y);
        this.currentLine.points(this.currentPoints);
        this.layer.batchDraw();
    }
    
    public endDrawing(): void {
        this.isDrawing = false;
        this.currentLine = null;
    }
    
    public clearCanvas(): void {
        const children = this.layer.getChildren();
        for (const child of children) {
            child.destroy();
        }
        this.layer.batchDraw();
    }
    
    public isCurrentlyDrawing(): boolean {
        return this.isDrawing;
    }
}