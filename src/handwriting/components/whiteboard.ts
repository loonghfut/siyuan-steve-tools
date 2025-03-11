import { App, Box, Canvas, Group, Leafer, Rect } from 'leafer-ui';

export class WhiteBoard {
    private container: HTMLElement;
    private app: App;
    private canvas: Canvas;
    private background: Rect;
    private drawingGroup: Group;
    private width: number;
    private height: number;
    private isDarkMode: boolean;

    constructor(container: HTMLElement, isDarkMode: boolean) {
        this.container = container;
        this.isDarkMode = isDarkMode;
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        this.initLeafer();
    }

    private initLeafer() {
        // 创建LeaferJS应用实例
        this.app = new App({
            view: this.container,
        });

        // 创建Leafer容器
        const leaferContainer = new Leafer();
        this.app.add(leaferContainer);

        // 创建背景
        this.background = new Rect({
            width: 10000,
            height: 10000,
            x: -5000,
            y: -5000,
            fill: this.isDarkMode ? '#282828' : '#ffffff',
            stroke: this.isDarkMode ? '#3a3a3a' : '#eeeeee',
            strokeWidth: 1
        });
        leaferContainer.add(this.background);

        // 创建绘图层
        this.drawingGroup = new Group();
        leaferContainer.add(this.drawingGroup);

        // 创建画布
        this.canvas = new Canvas({
            width: this.width,
            height: this.height
        });
        this.drawingGroup.add(this.canvas);
    }

    // 获取绘图上下文
    getContext() {
        return this.canvas.context;
    }

    // 设置画笔样式
    setPenStyle(options: {color: string, width: number}) {
        const ctx = this.getContext();
        ctx.strokeStyle = options.color;
        ctx.lineWidth = options.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    // 开始绘图
    beginPath(x: number, y: number) {
        const ctx = this.getContext();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    // 继续绘图
    continuePath(x: number, y: number) {
        const ctx = this.getContext();
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    // 结束绘图
    endPath() {
        const ctx = this.getContext();
        ctx.closePath();
    }

    // 清空画布
    clear() {
        const ctx = this.getContext();
        ctx.clearRect(0, 0, this.width, this.height);
    }





    // 销毁
    destroy() {
        this.app.destroy();
    }
}