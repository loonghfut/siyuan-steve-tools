// src/handwriting/module-handwriting.ts
import * as ic from "@/icon"
import { Plugin } from "siyuan";
import * as fabric from 'fabric';
import './handwriting.css';

export class M_handwriting {
    private plugin: Plugin;
    private canvas: fabric.Canvas | null = null;
    private container: HTMLDivElement | null = null;
    private toolbox: HTMLDivElement | null = null;
    private currentMode: 'draw' | 'select' | 'text' | 'block' = 'select';
    private currentColor: string = '#000000';
    private currentWidth: number = 2;
    private whiteboardButtonElement: HTMLElement | null = null;
    private isWhiteboardVisible: boolean = false;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }
    async init(settingdata) {
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 500 500">
               ${ic.steveTools_whiteboard}
            </symbol>  
                `);
    }

    async onLayoutReady() {
        console.log("init handwriting module");
        await this.initDependencies();
        this.initWhiteboard();
        this.addWhiteboardButton();
        this.plugin.addCommand({
            langKey: "openWhiteboard",
            hotkey: "Alt+W",
            callback: () => {
                this.toggleWhiteboard();
            }
        });
    }

    private async initDependencies() {
        // 检查是否已加载fabric.js，如果没有则动态加载
        console.log('initDependencies');
        if (typeof fabric === 'undefined') {
            console.log('fabric.js not found, loading from CDN');
            return new Promise<void>((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
                script.onload = () => resolve();
                document.head.appendChild(script);
            });
        }
    }

    private initWhiteboard() {
        // 创建白板容器
        this.container = document.createElement('div');
        this.container.className = 'siyuan-whiteboard-container';
        this.container.style.display = 'none';

        // 查找当前活动的编辑器区域
        const protyleContent = document.querySelector('.protyle-content');
        if (protyleContent) {
            // 如果找到了编辑区域，则挂载到编辑区域
            protyleContent.appendChild(this.container);
        } else {
            // 如果没有找到，则挂载到body作为备选
            document.body.appendChild(this.container);
            console.warn('未找到编辑区域(.protyle-content)，白板已挂载到body');
        }

        // 创建工具栏
        this.toolbox = document.createElement('div');
        this.toolbox.className = 'siyuan-whiteboard-toolbox';
        this.container.appendChild(this.toolbox);

        // 创建工具按钮
        this.createToolButton('select', '选择工具', '✓');
        this.createToolButton('draw', '绘图工具', '✏️');
        this.createToolButton('text', '文字工具', 'T');
        this.createToolButton('block', '思源块', '📄');
        this.createColorPicker();
        this.createWidthSelector();
        this.createClearButton();
        this.createSaveButton();
        this.createCloseButton();

        // 创建Canvas
        const canvasElement = document.createElement('canvas');
        canvasElement.id = 'siyuan-whiteboard';
        this.container.appendChild(canvasElement);

        // 初始化Fabric Canvas
        this.canvas = new fabric.Canvas('siyuan-whiteboard', {
            backgroundColor: '#ffffff',
            width: window.innerWidth - 40,
            height: window.innerHeight - 100,
            isDrawingMode: false
        });

        // 设置画笔属性
        if (this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.color = this.currentColor;
            this.canvas.freeDrawingBrush.width = this.currentWidth;
        }

        // 监听窗口大小变化，调整画布大小
        window.addEventListener('resize', this.resizeCanvas.bind(this));
    }

    private createToolButton(mode: 'draw' | 'select' | 'text' | 'block', title: string, icon: string) {
        const button = document.createElement('button');
        button.className = 'siyuan-whiteboard-tool';
        button.title = title;
        button.textContent = icon;
        button.addEventListener('click', () => this.setMode(mode));
        this.toolbox?.appendChild(button);
    }

    private createColorPicker() {
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = this.currentColor;
        colorPicker.className = 'siyuan-whiteboard-color-picker';
        colorPicker.addEventListener('input', (e) => {
            this.currentColor = (e.target as HTMLInputElement).value;
            if (this.canvas && this.canvas.freeDrawingBrush) {
                this.canvas.freeDrawingBrush.color = this.currentColor;
            }
        });
        this.toolbox?.appendChild(colorPicker);
    }

    private createWidthSelector() {
        const widthSelector = document.createElement('select');
        widthSelector.className = 'siyuan-whiteboard-width-selector';

        [1, 2, 4, 6, 8, 12].forEach(width => {
            const option = document.createElement('option');
            option.value = width.toString();
            option.textContent = `${width}px`;
            if (width === this.currentWidth) {
                option.selected = true;
            }
            widthSelector.appendChild(option);
        });

        widthSelector.addEventListener('change', (e) => {
            this.currentWidth = parseInt((e.target as HTMLSelectElement).value);
            if (this.canvas && this.canvas.freeDrawingBrush) {
                this.canvas.freeDrawingBrush.width = this.currentWidth;
            }
        });

        this.toolbox?.appendChild(widthSelector);
    }

    private createClearButton() {
        const button = document.createElement('button');
        button.className = 'siyuan-whiteboard-tool';
        button.title = '清空画板';
        button.textContent = '🗑️';
        button.addEventListener('click', () => this.clearCanvas());
        this.toolbox?.appendChild(button);
    }

    private createSaveButton() {
        const button = document.createElement('button');
        button.className = 'siyuan-whiteboard-tool';
        button.title = '保存为图片';
        button.textContent = '💾';
        button.addEventListener('click', () => this.saveCanvas());
        this.toolbox?.appendChild(button);
    }

    private createCloseButton() {
        const button = document.createElement('button');
        button.className = 'siyuan-whiteboard-tool';
        button.title = '关闭白板';
        button.textContent = '✖';
        button.addEventListener('click', () => this.hideWhiteboard());
        this.toolbox?.appendChild(button);
    }

    private setMode(mode: 'draw' | 'select' | 'text' | 'block') {
        this.currentMode = mode;

        if (!this.canvas) return;

        switch (mode) {
            case 'draw':
                this.canvas.isDrawingMode = true;
                break;
            case 'select':
                this.canvas.isDrawingMode = false;
                break;
            case 'text':
                this.canvas.isDrawingMode = false;
                this.addTextBox();
                break;
            case 'block':
                this.canvas.isDrawingMode = false;
                this.insertSiyuanBlock();
                break;
        }
    }

    private addTextBox() {
        if (!this.canvas) return;

        const text = new fabric.IText('编辑文本', {
            left: 100,
            top: 100,
            fontSize: 20,
            fill: this.currentColor
        });

        this.canvas.add(text);
        this.canvas.setActiveObject(text);
    }

    private async insertSiyuanBlock() {

    }

    private clearCanvas() {
        if (this.canvas) {
            this.canvas.clear();
            this.canvas.backgroundColor = '#ffffff';
        }
    }

    private saveCanvas() {
        if (!this.canvas) return;

        // 保存为PNG图片
        const dataUrl = this.canvas.toDataURL({
            format: 'png',
            quality: 1.0,
            multiplier: 1.0
        });

        // 创建一个下载链接
        const link = document.createElement('a');
        link.download = `思源白板_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    private resizeCanvas() {
        if (this.canvas && this.container) {
            this.canvas.setDimensions({
                width: window.innerWidth - 40,
                height: window.innerHeight - 100
            });
        }
    }

    // 公共方法：显示白板
    public showWhiteboard() {
        if (this.container) {
            // 在显示前检查容器是否在正确位置，如果不在则重新挂载
            const protyleContent = document.querySelector('.protyle-content');
            if (protyleContent && !protyleContent.contains(this.container)) {
                // 如果容器不在当前的编辑区域内，则重新挂载
                protyleContent.appendChild(this.container);
            }

            this.container.style.display = 'flex';
            this.resizeCanvas();
        } else {
            this.initWhiteboard();
            if (this.container) {
                this.container.style.display = 'flex';
            }
        }

        this.isWhiteboardVisible = true;
        this.updateButtonState();
    }

    // 公共方法：隐藏白板
    public hideWhiteboard() {
        if (this.container) {
            this.container.style.display = 'none';
        }

        this.isWhiteboardVisible = false;
        this.updateButtonState();
    }

    // 添加方法用于主插件调用
    public openWhiteboard() {
        this.toggleWhiteboard();
    }

    // 添加白板切换按钮到面包屑导航
    private addWhiteboardButton() {
        // 创建按钮
        this.whiteboardButtonElement = document.createElement('button');
        this.whiteboardButtonElement.className = 'toolbar__item b3-tooltips b3-tooltips__w';
        this.whiteboardButtonElement.setAttribute('aria-label', '白板');
        this.whiteboardButtonElement.innerHTML = '<svg class="toolbar__icon" style="width: 14px; height: 14px;"><use xlink:href="#iconSTWhiteboard"></use></svg>';
        console.log(this.whiteboardButtonElement);
        // 添加点击事件
        this.whiteboardButtonElement.addEventListener('click', () => {
            this.toggleWhiteboard();
        });

        // 观察DOM变化，确保面包屑导航栏出现时添加按钮
        this.observeBreadcrumb();
    }

    // 观察DOM变化，动态添加按钮到面包屑导航
    private observeBreadcrumb() {
        // 立即尝试添加一次
        this.tryAddButtonToBreadcrumb();
    }

    // 尝试添加按钮到面包屑导航
    private tryAddButtonToBreadcrumb() {
        if (!this.whiteboardButtonElement) return;

        // 查找所有面包屑导航栏
        const breadcrumbs = document.querySelectorAll('.protyle-breadcrumb');
        console.log(breadcrumbs);
        breadcrumbs.forEach(breadcrumb => {
            // 检查这个面包屑是否已经添加了我们的按钮
            const existingButton = breadcrumb.querySelector('.whiteboard-toggle-btn');
            if (!existingButton) {
                // 克隆按钮，给每个面包屑添加一个独立的按钮实例
                const buttonClone = this.whiteboardButtonElement.cloneNode(true) as HTMLElement;
                buttonClone.classList.add('whiteboard-toggle-btn'); // 添加标识类
                buttonClone.addEventListener('click', () => this.toggleWhiteboard());

                // 将按钮添加到面包屑末尾

                breadcrumb.appendChild(buttonClone);

            }
        });
    }

    // 切换白板显示状态
    public toggleWhiteboard() {
        if (this.isWhiteboardVisible) {
            this.hideWhiteboard();
        } else {
            this.showWhiteboard();
        }
        this.isWhiteboardVisible = !this.isWhiteboardVisible;

        // 更新所有按钮的状态
        this.updateButtonState();
    }

    // 更新所有白板按钮的状态
    private updateButtonState() {
        const buttons = document.querySelectorAll('.whiteboard-toggle-btn');
        buttons.forEach(button => {
            if (this.isWhiteboardVisible) {
                button.classList.add('toolbar__item--active');
            } else {
                button.classList.remove('toolbar__item--active');
            }
        });
    }
}