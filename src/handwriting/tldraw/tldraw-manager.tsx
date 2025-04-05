import React from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client'; // 添加这个导入
import { CardShapeTool } from './CardShape/CardShapeTool'
import { CardShapeUtil } from './CardShape/CardShapeUtil'
import { components, uiOverrides } from './ui-overrides'
import {
    Tldraw,
    TldrawOptions,
    TLUiOverrides,
    defaultShapeUtils,
    TLStore,
    Editor,
    createShapeId,
    TLShapeId,
} from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import '../custom-tldraw.css';
import { getAssetUrls } from '@tldraw/assets/selfHosted'
import { initCardsWithBlockIds } from './CardShape/card-shape-migrations';
import { createTLStore, getSnapshot, loadSnapshot, throttle } from '@tldraw/tldraw';
import * as api from '@/api';
import { SlideShapeUtil } from './SlideShape/SlideShapeUtil';
import { SlideShapeTool } from './SlideShape/SlideShapeTool';
import { ICardShape } from './CardShape/card-shape-types';
const assetUrls = getAssetUrls({ baseUrl: 'plugins/siyuan-steve-tools/asset/' })


// There's a guide at the bottom of this file!

// [1]
const customShapeUtils = [...defaultShapeUtils, CardShapeUtil, SlideShapeUtil]
const customTools = [CardShapeTool, SlideShapeTool]
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
    private store: TLStore; // 存储 TLDraw 的数据
    private editor: Editor; // 引用 TLDraw 编辑器实例
    private storageKey: string; // 存储键值
    // 在 TldrawManager 类中添加一个标志
    private dropHandled;
    private applyingRemoteChanges = false;
    private title: string;

    constructor(id: string, container: HTMLElement, blockIds?: string[], title?: string) {
        this.id = id;
        this.title = title || `画板-${id}`;
        this.container = container;
        this.blockIds = blockIds || [];
        this.storageKey = `tldraw-data-${this.id}`;
        this.store = createTLStore({
            shapeUtils: customShapeUtils
        });

        // 初始化tldraw
        this.initialize();
    }

    /**
     * 初始化tldraw组件
     */
    private async initialize() {
        const root = document.createElement('div');
        root.style.width = '100%';
        root.style.height = '100%';
        this.container.appendChild(root);

        // 加载之前保存的数据
        await this.loadData();

        // 渲染tldraw组件
        this.renderTldraw(root);
    }

    /**
    * 加载保存的数据
    */
    private async loadData() {
        try {
            // 从思源笔记的存储中获取数据
            const data = await api.getFile(`/data/storage/petal/sttools/${this.storageKey}.json`);

            if (data) {
                console.log("dadasss", data);
                loadSnapshot(this.store, data);
                console.log('已加载保存的画布数据');
            }
        } catch (error) {
            console.warn('加载画布数据失败或无保存数据', error);
            // 无保存数据时继续使用空的 store
        }
    }

    private async saveData() {
        try {
            const snapshot = getSnapshot(this.store);
            const jsonData = JSON.stringify(snapshot);

            // 保存到思源笔记的存储中
            const blob = new Blob([jsonData], { type: 'application/json' });
            await api.putFile(`/data/storage/petal/sttools/${this.storageKey}.json`, false, blob);
            console.log('画布数据已保存');
        } catch (error) {
            console.error('保存画布数据失败', error);
        }
    }


    private options: Partial<TldrawOptions> = {
        createTextOnCanvasDoubleClick: false,
        maxFontsToLoadBeforeRender: 10,

    }
    /**
     * 渲染tldraw组件
     */
    private renderTldraw(rootElement: HTMLElement) {
        // 防止外部字体加载的配置
        const blockIds = this.blockIds;
        const id = this.id;
        const store = this.store;
        api.setBlockAttrs(id, {
            'custom-sttools-tldraw': '1',
        })
        // 生成 tldraw 组件
        const tldrawComponent = (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}
                className="tldraw__editor"
                data-tldraw-id={this.id}
                data-tldraw-title={this.title}>
                <Tldraw
                    store={store}
                    shapeUtils={customShapeUtils}
                    tools={customTools}
                    overrides={uiOverrides}
                    options={this.options}
                    inferDarkMode={isDarkTheme()}
                    components={components}
                    onMount={(editor) => {
                        this.editor = editor;
                        // 设置自动保存功能
                        this.setupAutosave();
                        this.setupRealtimeSync(editor);
                        editor.updateInstanceState({});
                        // editor.user.updateUserPreferences({ animationSpeed: 0 });
                        // this.editor.navigateToDeepLink();
                        // 只有在没有已保存数据的情况下才初始化卡片
                        if (editor.getCurrentPageShapes().length === 0 && blockIds.length > 0) {
                            initCardsWithBlockIds(editor, blockIds, {
                                startX: 50,
                                startY: 50,
                            });
                        }
                        // 添加全局拖放事件监听
                        const container = editor.getContainer();

                        const handleDrop = (e: DragEvent) => {
                            e.preventDefault();
                            e.stopPropagation();

                            // 增加防重复处理机制
                            const now = Date.now();
                            if (this.dropHandled && now - this.dropHandled < 300) {
                                return;
                            }
                            this.dropHandled = now;

                            // 解析拖拽数据
                            const blockIdo_rigin = e.dataTransfer!.types[0];
                            // console.log('拖拽的数据类型', blockIdo_rigin);
                            // 使用正则表达式提取块ID
                            let blockId = '';
                            if (blockIdo_rigin.startsWith('application/siyuan')) {
                                const matches = blockIdo_rigin.match(/(\d{14}-\w{7})/g);
                                if (matches && matches.length > 0) {
                                    blockId = matches[0]; // 获取第一个匹配的块ID
                                    console.log('从数据类型中提取的块ID', blockId);
                                }
                            }
                            if (!blockId) {
                                console.log('未能识别拖拽的块ID');
                                return;
                            }

                            // 获取鼠标在画布上的位置
                            const { x, y } = editor.screenToPage({
                                x: e.clientX,
                                y: e.clientY,
                            });

                            // 创建新的Card形状
                            editor.createShape({
                                type: 'card',
                                x: x, // 默认宽度的一半，使形状中心在鼠标位置
                                y: y, // 默认高度的一半
                                props: {
                                    w: 300,
                                    h: 300,
                                    color: 'black',
                                    showMask: true,
                                    blockId: blockId,
                                },
                            });
                            api.setBlockAttrs(blockId, {
                                'custom-st-tldraw': '1',
                            });
                            // console.log(`已在(${x}, ${y})位置创建包含块ID ${blockId} 的卡片`);
                        };

                        // 添加拖放事件监听器
                        container.addEventListener('drop', handleDrop);

                        // 删除组件块逻辑
                        editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
                            // Check if shape is a card shape type
                            if (shape.type !== 'card') return;

                            const cardShape = shape as ICardShape;
                            const blockId = cardShape.props?.blockId;
                            if (!blockId) return;

                            api.setBlockAttrs(blockId, { 'custom-st-tldraw': '0' })
                                .then(() => console.log(`Block ${blockId} TLDraw property set to inactive`))
                                .catch(err => console.error('Failed to update block attributes:', err));
                        });


                    }}
                    assetUrls={assetUrls}
                />
            </div>
        );

        // 使用新的 createRoot API
        const root = createRoot(rootElement);
        root.render(tldrawComponent);
        this.root = root;
    }
    /**
     * 设置实时同步功能
     */
    private setupRealtimeSync(Meditor: Editor) {
        if (!this.store || !this.editor) return;
        // console.log("设置实时同步功能");
        // 创建一个专用于此TLDraw实例的广播频道
        const channelName = `tldraw-sync-${this.id}`;
        const broadcastChannel = new BroadcastChannel(channelName);

        // 为识别消息源，生成一个唯一的会话ID
        const sessionId = Date.now().toString() + Math.random().toString(36).slice(2);

        // 监听本地变更并广播
        const unlisten = this.store.listen(
            (update) => {
                // 如果当前正在应用远程更改，不广播以避免循环
                if (this.applyingRemoteChanges) return;

                // 通过广播频道发送更改
                broadcastChannel.postMessage({
                    changes: update,
                    timestamp: Date.now(),
                    source: sessionId // 使用会话ID标识消息来源
                });
            },
            { scope: 'document', source: 'user' } // 只监听用户操作引起的文档变更
        );

        // 监听来自其他页签的更新
        broadcastChannel.onmessage = (event) => {
            // 忽略自己发出的事件
            // console.log("收到远程TLDraw更改:", event.data);
            if (event.data.source === sessionId) {
                console.log("忽略自己发出的事件AAAA:", event.data.source, sessionId);
                return;
            }

            try {
                this.applyingRemoteChanges = true;

                // 应用远程更改到本地存储
                Meditor.store.mergeRemoteChanges(() => {
                    // console.log("应用远程TLDraw更改:", event.data.changes.changes);
                    // 应用收到的变更
                    Meditor.store.applyDiff(event.data.changes.changes);
                });

            } catch (err) {
                console.error('应用远程TLDraw更改失败:', err);
            } finally {
                this.applyingRemoteChanges = false;
            }
        };
        // console.log('已设置实时同步功能');
    }
    /**
     * 设置自动保存功能
     */
    private setupAutosave() {
        if (!this.store) return;

        // 使用节流函数确保不会过于频繁地保存
        const throttledSave = throttle(() => {
            this.saveData();
        }, 2000); // 2秒节流

        // 监听存储变化
        this.store.listen(throttledSave);
    }

    /**
     * 获取tldraw实例
     */
    public getTldraw() {
        return this.tldrawComponent;
    }

    /**
     * 立即保存当前画布状态
     */
    public async saveCurrentState() {
        await this.saveData();
    }
    /**
     * 销毁tldraw实例和清理资源
     */
    public async destroy() {
        // 销毁前保存当前状态
        await this.saveData();

        // 清空容器
        this.container.innerHTML = '';

        // 销毁React根节点
        if (this.root) {
            this.root.unmount();
        }

        this.tldrawComponent = null;
    }

    /**
     * 根据思源块ID查找对应的形状
     * @param blockId 思源块ID
     * @returns 对应的形状ID，如果未找到则返回null
     */
    public findShapeByBlockId(blockId: string): TLShapeId | null {
        if (!this.editor) return null;

        const shapes = this.editor.getCurrentPageShapes();
        const cardShape = shapes.find(shape =>
            shape.type === 'card' &&
            (shape as ICardShape).props?.blockId === blockId
        );

        return cardShape?.id || null;
    }

    /**
     * 导航到包含特定思源块的形状
     * @param blockId 思源块ID
     * @returns 是否成功导航
     */
    public navigateToBlockShape(blockId: string): boolean {
        const shapeId = this.findShapeByBlockId(blockId);
        console.log("导航到块形状", shapeId, blockId);
        if (!shapeId) return false;

        if (this.editor) {
            // 选中并聚焦到该形状
            this.editor.select(shapeId);
            this.editor.zoomToSelection({ animation: { duration: 500 } });
            return true;
        }
        return false;
    }


}

function isDarkTheme(): boolean {
    // 思源笔记暗色主题通常通过 data-theme 属性判断
    return document.documentElement.getAttribute('data-theme-mode') === 'dark';
}