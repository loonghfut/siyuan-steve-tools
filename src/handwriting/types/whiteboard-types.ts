import Konva from 'konva';

export interface Point {
    x: number;
    y: number;
}

export interface WhiteboardOptions {
    id: string;
    isDarkMode: boolean;
    gridSize?: number;
    maxScale?: number;
    minScale?: number;
}

export interface Tool {
    name: string;
    cursor: string;
    handleMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    handleMouseMove?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    handleMouseUp?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export type ToolType = 'select' | 'pencil' | 'pan' | 'clear' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'save';