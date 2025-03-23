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
import { initCardsWithBlockIds } from './CardShape/card-shape-migrations';

const assetUrls = getAssetUrls({ baseUrl: 'plugins/siyuan-steve-tools/asset/' })


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
    private blockIds: string[] = [];
    constructor(id: string, container: HTMLElement,blockIds?: string[]) {
        this.id = id;
        this.container = container;
        this.blockIds = blockIds;
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
        const blockIds = this.blockIds;
        const id = this.id;
        // 生成 tldraw 组件，传入store和工具列表（可添加自定义工具）
        const tldrawComponent = (
            <div style={{ position: 'relative', width: '100%', height: '100%' }} className="tldraw__editor">
                <Tldraw
                    persistenceKey={id}
                    // Pass in the array of custom shape classes
                    shapeUtils={customShapeUtils}
                    // Pass in the array of custom tool classes
                    tools={customTools}
                    // Pass in any overrides to the user interface
                    overrides={uiOverrides}
                    // Pass in the new Keybaord Shortcuts component
                    components={components}
                    onMount={(editor) => {
                        // 初始化带有 blockIds 的卡片
                        initCardsWithBlockIds(editor, blockIds, {
                          startX: 50,
                          startY: 50,
                          columns: 2,
                          width: 400,
                          height: 300
                        })
                      }}
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
     * 获取tldraw实例
     */
    public getTldraw() {
        return this.tldrawComponent;
    }

    /**
     * 销毁tldraw实例和清理资源
     */
    public destroy() {

        // 清空容器
        this.container.innerHTML = '';

        // 销毁React根节点和组件
        // 根据实际使用的渲染方式来适配
        ReactDOM.unmountComponentAtNode(this.container);

        this.tldrawComponent = null;
    }
}