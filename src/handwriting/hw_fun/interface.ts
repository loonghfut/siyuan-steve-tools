
export enum ToolType {
    Pen,
    Eraser,
    Line,
    Rectangle,
    Circle,
    Text
}

export interface CanvasOptions {
    backgroundColor?: string;
    width?: number;
    height?: number;
    isDrawingMode?: boolean;
}
