export interface Point {
    x: number;
    y: number;
}

export interface PenStyle {
    color: string;
    width: number;
}

export interface EraserStyle {
    width: number;
}

export interface BackgroundStyle {
    color: string;
    gridColor: string;
    showGrid: boolean;
}

export interface HistoryItem {
    type: 'stroke' | 'erase' | 'clear';
    data: any;
}

export type ToolType = 'pen' | 'eraser' | 'select';

export interface ToolOptions {
    pen: PenStyle;
    eraser: EraserStyle;
}