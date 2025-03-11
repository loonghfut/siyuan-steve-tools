import { WhiteBoard } from './whiteboard';

export class EventManager {
    private whiteboard: WhiteBoard;
    private container: HTMLElement;
    private isDrawing: boolean = false;
    private lastX: number = 0;
    private lastY: number = 0;

    constructor(whiteboard: WhiteBoard, container: HTMLElement) {
        this.whiteboard = whiteboard;
        this.container = container;
        this.bindEvents();
    }

    private bindEvents() {
        this.container.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        this.container.addEventListener('pointermove', this.handlePointerMove.bind(this));
        this.container.addEventListener('pointerup', this.handlePointerUp.bind(this));
        this.container.addEventListener('pointerleave', this.handlePointerUp.bind(this));
        // window.addEventListener('resize', this.handleResize.bind(this));
    }

    private handlePointerDown(e: PointerEvent) {
        if (e.button === 0) { // 只响应左键
            this.isDrawing = true;
            const rect = this.container.getBoundingClientRect();
            this.lastX = e.clientX - rect.left;
            this.lastY = e.clientY - rect.top;
            this.whiteboard.beginPath(this.lastX, this.lastY);
        }
    }

    private handlePointerMove(e: PointerEvent) {
        if (!this.isDrawing) return;
        
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.whiteboard.continuePath(x, y);
        this.lastX = x;
        this.lastY = y;
    }

    private handlePointerUp() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.whiteboard.endPath();
        }
    }

    // private handleResize() {
    //     this.whiteboard.resize(this.container.clientWidth, this.container.clientHeight);
    // }

    public destroy() {
        this.container.removeEventListener('pointerdown', this.handlePointerDown.bind(this));
        this.container.removeEventListener('pointermove', this.handlePointerMove.bind(this));
        this.container.removeEventListener('pointerup', this.handlePointerUp.bind(this));
        this.container.removeEventListener('pointerleave', this.handlePointerUp.bind(this));
        // window.removeEventListener('resize', this.handleResize.bind(this));
    }
}