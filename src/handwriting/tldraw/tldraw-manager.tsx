import React from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client'; // 添加这个导入
import { CardShapeTool } from './CardShape/CardShapeTool'
import { CardShapeUtil } from './CardShape/CardShapeUtil'
import { components, uiOverrides } from './ui-overrides'
import {
    Tldraw,
    TLUiOverrides,
} from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import '../custom-tldraw.css';
import { getAssetUrls } from '@tldraw/assets/selfHosted'

const assetUrls = getAssetUrls({baseUrl:'plugins/siyuan-steve-tools/asset/'})

export interface SiyuanBlockProps {
    x: number;
    y: number;
    width: number;
    height: number;
    content?: string;
}


// There's a guide at the bottom of this file!

// [1]
const customShapeUtils = [CardShapeUtil]
const customTools = [CardShapeTool]
/**
 * TldrawManager类，用于管理tldraw实例和操作
 */
export class TldrawManager {
    private id: string;
    private container: HTMLElement;
    private tldrawComponent
    private customTools: any[] = [];
    private root: any; // 添加 root 属性
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
        const root = document.createElement('div');
        root.style.width = '100%';
        root.style.height = '100%';
        this.container.appendChild(root);

        // 渲染tldraw组件
        this.renderTldraw(root);
    }

    /**
     * 渲染tldraw组件
     */
    private renderTldraw(rootElement: HTMLElement) {
        // 防止外部字体加载的配置
        console.log('assetUrls', assetUrls);
        // 生成 tldraw 组件，传入store和工具列表（可添加自定义工具）
        const tldrawComponent = (
            <div style={{ position: 'relative', width: '100%', height: '100%' }} className="tldraw__editor">
                <Tldraw
                    // Pass in the array of custom shape classes
                    shapeUtils={customShapeUtils}
                    // Pass in the array of custom tool classes
                    tools={customTools}
                    // Pass in any overrides to the user interface
                    overrides={uiOverrides}
                    // Pass in the new Keybaord Shortcuts component
                    components={components}

                    assetUrls={assetUrls}
                />
            </div>
        );

        // 使用新的 createRoot API 替代 ReactDOM.render
        const root = createRoot(rootElement);
        root.render(tldrawComponent);

        // 保存 root 引用以便后续清理
        this.root = root;

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