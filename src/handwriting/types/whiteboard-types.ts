import Konva from 'konva';

export interface Point {
    x: number;
    y: number;
}



export interface Tool {
    name: string;
    cursor: string;
    handleMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    handleMouseMove?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    handleMouseUp?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export interface WhiteboardOptions {
    id: string;
    isDarkMode: boolean;
    gridSize: number;
    maxScale: number;
    minScale: number;
    selectionEnabled?: boolean; // 是否启用选择功能
}


export type ToolType = 'select' | 'pencil' | 'pan' | 'eraser';
