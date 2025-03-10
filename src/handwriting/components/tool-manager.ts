import Konva from 'konva';
import { Tool, ToolType } from '../types/whiteboard-types';

export class ToolManager {
    private currentTool: ToolType = 'select';
    private containerEl: HTMLElement;
    private tools: Map<ToolType, Tool> = new Map();
    
    constructor(containerEl: HTMLElement) {
        this.containerEl = containerEl;
    }
    
    public registerTool(type: ToolType, tool: Tool): void {
        this.tools.set(type, tool);
    }
    
    public setActiveTool(toolType: ToolType): void {
        this.currentTool = toolType;
        
        // 更新UI状态
        const tools = this.containerEl.querySelectorAll('.siyuan-whiteboard-tool');
        tools.forEach(tool => tool.classList.remove('active'));

        const currentTool = this.containerEl.querySelector(`[data-tool="${toolType}"]`);
        if (currentTool) {
            currentTool.classList.add('active');
        }
        
        // 设置光标
        const tool = this.tools.get(toolType);
        if (tool) {
            const container = document.getElementById(`konva-container-${this.containerEl.id}`);
            if (container) {
                container.style.cursor = tool.cursor;
            }
        }
    }
    
    public getCurrentTool(): ToolType {
        return this.currentTool;
    }
    
    public getTool(type: ToolType): Tool | undefined {
        return this.tools.get(type);
    }
}