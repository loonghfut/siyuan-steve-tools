import React from 'react';
import ReactDOM from 'react-dom';
import {
    Tldraw,
    createTLStore,
    defaultTools,
    TLRecord,
    TLStoreWithStatus,
    TldrawProps,
} from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

export interface SiyuanBlockProps {
    x: number;
    y: number;
    width: number;
    height: number;
    content?: string;
}

/**
 * TldrawManager类，用于管理tldraw实例和操作
 */
export class TldrawManager {
    private id: string;
    private container: HTMLElement;
    private tldrawComponent: React.ReactElement<TldrawProps> | null = null;
    private customTools: any[] = [];

    constructor(id: string, container: HTMLElement) {
        this.id = id;
        this.container = container;
        
        // 初始化tldraw
        this.initialize();
    }

    /**
     * 初始化tldraw组件
     */
    private initialize() {
        // 创建React根节点
        const root = document.createElement('div');
        root.style.width = '100%';
        root.style.height = '100%';
        this.container.appendChild(root);

        // 渲染tldraw组件
        this.renderTldraw(root);
        
        // 添加事件监听
        // this.setupEventListeners();
    }

    /**
     * 渲染tldraw组件
     */
    private renderTldraw(rootElement: HTMLElement) {

    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners() {
        // 添加拖放事件监听
        this.container.addEventListener('dragover', this.handleDragOver);
        this.container.addEventListener('drop', this.handleDrop);
        
        // 添加其他必要的事件监听
    }

    /**
     * 处理拖动悬停事件
     */
    private handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'copy';
    }

    /**
     * 处理拖放事件
     */
    private handleDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 提取思源块ID
        const types = e.dataTransfer!.types;
        let blockId = '';
        
        if (types && types.length > 0) {
            for (const type of types) {
                if (type.startsWith('application/siyuan-')) {
                    const matches = type.match(/\d{14}-\w{7}/);
                    if (matches && matches.length > 0) {
                        blockId = matches[0];
                        break;
                    }
                }
            }
        }
        
        if (!blockId) return;
        
        // 获取拖放位置
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 添加块到画布
        this.addSiyuanBlock(blockId, {
            x,
            y,
            width: 300,
            height: 200
        });
    }

    /**
     * 添加思源块到画布
     */
    public async addSiyuanBlock(blockId: string, props: SiyuanBlockProps) {
        // 这里实际需要与tldraw API集成来创建和添加形状
        console.log(`添加思源块 ${blockId} 到位置 (${props.x}, ${props.y})`);
        
        // 实际实现时，需要使用tldraw的createShape和其他API
        // 例如：
        /*
        const app = this.tldrawComponent?.app;
        if (app) {
            app.createShape({
                type: 'siyuan-block',
                x: props.x,
                y: props.y,
                props: {
                    blockId,
                    width: props.width,
                    height: props.height,
                    content: props.content
                }
            });
        }
        */
    }

    /**
     * 获取tldraw实例
     */
    public getTldraw() {
        return this.tldrawComponent;
    }

    /**
     * 销毁tldraw实例和清理资源
     */
    public destroy() {
        // 移除事件监听
        this.container.removeEventListener('dragover', this.handleDragOver);
        this.container.removeEventListener('drop', this.handleDrop);
        
        // 清空容器
        this.container.innerHTML = '';
        
        // 销毁React根节点和组件
        // 根据实际使用的渲染方式来适配
        ReactDOM.unmountComponentAtNode(this.container);
        
        this.tldrawComponent = null;
    }
}