import { WhiteBoard } from './whiteboard';

export type ToolType = 'pen' | 'eraser' | 'select';

export interface ToolOptions {
    pen: {
        color: string;
        width: number;
    };
    eraser: {
        width: number;
    };
}

export class ToolManager {
    private whiteboard: WhiteBoard;
    private currentTool: ToolType = 'pen';
    private options: ToolOptions = {
        pen: {
            color: '#000000',
            width: 2
        },
        eraser: {
            width: 10
        }
    };

    constructor(whiteboard: WhiteBoard, isDarkMode: boolean) {
        this.whiteboard = whiteboard;
        this.updateTheme(isDarkMode);
        this.setTool('pen');
    }

    public setTool(tool: ToolType) {
        this.currentTool = tool;
        
        if (tool === 'pen') {
            this.whiteboard.setPenStyle(this.options.pen);
        } else if (tool === 'eraser') {
            // 橡皮擦工具的处理
            this.whiteboard.setPenStyle({
                color: 'transparent', 
                width: this.options.eraser.width
            });
        }
    }

    public getCurrentTool(): ToolType {
        return this.currentTool;
    }

    public setToolOptions(tool: ToolType, options: any) {
        if (tool === 'pen') {
            this.options.pen = { ...this.options.pen, ...options };
            if (this.currentTool === 'pen') {
                this.whiteboard.setPenStyle(this.options.pen);
            }
        } else if (tool === 'eraser') {
            this.options.eraser = { ...this.options.eraser, ...options };
            if (this.currentTool === 'eraser') {
                this.whiteboard.setPenStyle({
                    color: 'transparent', 
                    width: this.options.eraser.width
                });
            }
        }
    }

    public updateTheme(isDarkMode: boolean) {
        if (isDarkMode) {
            this.options.pen.color = '#ffffff';
        } else {
            this.options.pen.color = '#000000';
        }
        
        if (this.currentTool === 'pen') {
            this.whiteboard.setPenStyle(this.options.pen);
        }
    }
}