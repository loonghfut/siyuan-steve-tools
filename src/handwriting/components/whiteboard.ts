import Konva from 'konva';
import { ToolManager } from './tool-manager';
import { DrawingManager } from './drawing-manager';
import { ViewManager } from './view-manager';
import { GridManager } from './grid-manager';
import { EventManager } from './event-manager';
import { WhiteboardOptions } from '../types/whiteboard-types';

export class Whiteboard {
    private stage: Konva.Stage;
    private layer: Konva.Layer;
    private containerEl: HTMLElement;
    private toolManager: ToolManager;
    private drawingManager: DrawingManager;
    private viewManager: ViewManager;
    private gridManager: GridManager;
    private eventManager: EventManager;
    
    constructor(containerId: string, isDark: boolean) {
        // 创建选项对象
        const options: WhiteboardOptions = {
            id: containerId,
            isDarkMode: isDark,
            gridSize: 50,
            maxScale: 5,
            minScale: 0.1
        };
        
        this.containerEl = document.getElementById(containerId) as HTMLElement;
        this.initialize(options);
    }
    
    private initialize(options: WhiteboardOptions): void {
        // 创建白板容器结构
        this.createDomStructure(options.id);
        
        // 获取容器尺寸
        const containerRect = this.containerEl.getBoundingClientRect();
        const canvasWidth = containerRect.width;
        const canvasHeight = containerRect.height - 45; // 减去工具栏高度
        
        // 创建Konva舞台和图层
        this.stage = new Konva.Stage({
            container: `konva-container-${options.id}`,
            width: canvasWidth,
            height: canvasHeight,
        });
        
        // 创建背景图层和内容图层
        const backgroundLayer = new Konva.Layer();
        this.layer = new Konva.Layer();
        this.stage.add(backgroundLayer);
        this.stage.add(this.layer);
        
        // 创建各个管理器
        this.toolManager = new ToolManager(this.containerEl);
        this.viewManager = new ViewManager(this.stage, options.minScale, options.maxScale);
        this.drawingManager = new DrawingManager(this.stage, this.layer, options.isDarkMode);
        this.gridManager = new GridManager(this.stage, backgroundLayer, options);
        
        // 创建事件管理器并绑定事件
        this.eventManager = new EventManager(
            this.stage,
            this.containerEl,
            this.toolManager,
            this.drawingManager,
            this.viewManager,
            this.gridManager
        );
        
        // 绘制网格背景
        this.gridManager.createGrid(canvasWidth, canvasHeight);
        
        // 绑定事件
        this.eventManager.bindEvents();
        
        // 注册工具
        this.registerTools();
        
        // 设置默认工具为选择
        this.toolManager.setActiveTool('select');
    }
    
    private createDomStructure(id: string): void {
        this.containerEl.className = 'siyuan-whiteboard-container';
        this.containerEl.innerHTML = `
            <div class="siyuan-whiteboard-toolbox">
                <div class="siyuan-whiteboard-tool" data-tool="select">选择</div>
                <div class="siyuan-whiteboard-tool" data-tool="pencil">铅笔</div>
                <div class="siyuan-whiteboard-tool" data-tool="pan">移动</div>
                <div class="siyuan-whiteboard-tool" data-tool="clear">清空</div>
                <div class="siyuan-whiteboard-tool" data-tool="zoom-in">放大</div>
                <div class="siyuan-whiteboard-tool" data-tool="zoom-out">缩小</div>
                <div class="siyuan-whiteboard-tool" data-tool="zoom-reset">重置</div>
                <div style="flex-grow: 1;"></div>
                <div class="siyuan-whiteboard-tool" data-tool="save">保存</div>
            </div>
            <div class="siyuan-whiteboard-canvas-container" id="konva-container-${id}"></div>
        `;
    }
    
    private registerTools(): void {
        // 注册选择工具
        this.toolManager.registerTool('select', {
            name: 'select',
            cursor: 'default'
        });
        
        // 注册铅笔工具
        this.toolManager.registerTool('pencil', {
            name: 'pencil',
            cursor: 'crosshair'
        });
        
        // 注册平移工具
        this.toolManager.registerTool('pan', {
            name: 'pan',
            cursor: 'grab'
        });
        
        // 其他工具...
    }
    
    public dispose(): void {
        this.eventManager.dispose();
        if (this.stage) {
            this.stage.destroy();
        }
    }
}