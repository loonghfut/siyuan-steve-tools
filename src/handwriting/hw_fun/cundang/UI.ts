import { Canvas } from './hw';
import { ToolType } from './interface';

export class WhiteboardUI {
    private canvas: Canvas;
    private container: HTMLElement;
    private toolbox: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.initUI();
    }

    private initUI(): void {
        // 创建画板容器
        this.container.classList.add('siyuan-whiteboard-container');
        
        // 创建工具栏
        this.toolbox = document.createElement('div');
        this.toolbox.className = 'siyuan-whiteboard-toolbox';
        this.container.appendChild(this.toolbox);
        
        // 创建画布容器
        const canvasContainer = document.createElement('div');
        canvasContainer.id = 'siyuan-whiteboard';
        this.container.appendChild(canvasContainer);
        
        // 初始化画布
        this.canvas = new Canvas(canvasContainer);
        
        // 添加工具按钮
        this.addToolButtons();
    }

    private addToolButtons(): void {
        // 画笔工具
        this.addToolButton('pen', 'Pen', ToolType.Pen);
        
        // 橡皮擦工具
        this.addToolButton('eraser', 'Eraser', ToolType.Eraser);
        
        // 线条工具
        this.addToolButton('line', 'Line', ToolType.Line);
        
        // 矩形工具
        this.addToolButton('rectangle', 'Rectangle', ToolType.Rectangle);
        
        // 圆形工具
        this.addToolButton('circle', 'Circle', ToolType.Circle);
        
        // 文本工具
        this.addToolButton('text', 'Text', ToolType.Text);
        
        // 添加颜色选择器
        this.addColorPicker();
        
        // 添加线宽选择器
        this.addWidthSelector();
        
        // 添加清除按钮
        this.addClearButton();
        
        // 添加保存按钮
        this.addSaveButton();
    }

    private addToolButton(name: string, label: string, tool: ToolType): void {
        const button = document.createElement('button');
        button.className = 'siyuan-whiteboard-tool';
        button.textContent = label;
        button.dataset.tool = name;
        
        button.addEventListener('click', () => {
            this.setActiveTool(button);
            this.canvas.setTool(tool);
        });
        
        this.toolbox.appendChild(button);
        
        // 默认选中画笔工具
        if (tool === ToolType.Pen) {
            this.setActiveTool(button);
        }
    }

    private addColorPicker(): void {
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.className = 'siyuan-whiteboard-color-picker';
        colorPicker.value = '#000000';
        
        colorPicker.addEventListener('change', (e) => {
            const color = (e.target as HTMLInputElement).value;
            this.canvas.setColor(color);
        });
        
        this.toolbox.appendChild(colorPicker);
    }

    private addWidthSelector(): void {
        const widthSelector = document.createElement('select');
        widthSelector.className = 'siyuan-whiteboard-width-selector';
        
        const widths = [1, 2, 3, 5, 8, 13];
        widths.forEach(width => {
            const option = document.createElement('option');
            option.value = width.toString();
            option.textContent = `${width}px`;
            if (width === 2) option.selected = true;
            widthSelector.appendChild(option);
        });
        
        widthSelector.addEventListener('change', (e) => {
            const width = parseInt((e.target as HTMLSelectElement).value);
            this.canvas.setWidth(width);
        });
        
        this.toolbox.appendChild(widthSelector);
    }

    private addClearButton(): void {
        const button = document.createElement('button');
        button.className = 'siyuan-whiteboard-tool';
        button.textContent = 'Clear';
        
        button.addEventListener('click', () => {
            if (confirm('确定要清除画布吗？')) {
                this.canvas.clear();
            }
        });
        
        this.toolbox.appendChild(button);
    }

    private addSaveButton(): void {
        const button = document.createElement('button');
        button.className = 'siyuan-whiteboard-tool';
        button.textContent = 'Save';
        
        button.addEventListener('click', () => {
            const dataURL = this.canvas.toDataURL();
            const link = document.createElement('a');
            link.download = `whiteboard-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            link.href = dataURL;
            link.click();
        });
        
        this.toolbox.appendChild(button);
    }

    private setActiveTool(button: HTMLElement): void {
        const allButtons = this.toolbox.querySelectorAll('.siyuan-whiteboard-tool');
        allButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
    }

    public destroy(): void {
        this.canvas.destroy();
        this.container.innerHTML = '';
    }
}