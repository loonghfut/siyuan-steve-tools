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
import { cardShapeMigrations, initCardsWithBlockIds } from './CardShape/card-shape-migrations';
import { createTLStore, getSnapshot, loadSnapshot, throttle } from '@tldraw/tldraw';
import * as api from '@/api/api';
import { SlideShapeUtil } from './SlideShape/SlideShapeUtil';
import { SlideShapeTool } from './SlideShape/SlideShapeTool';
import { ICardShape } from './CardShape/card-shape-types';
import { showMessage } from 'siyuan';
import { settingdata } from '@/index';
import { MindMapNodeShapeUtil } from './MindMap/MindMapNodeShapeUtil';
import { MindMapNodeTool } from './MindMap/MindMapNodeTool';
const assetUrls = getAssetUrls({ baseUrl: 'plugins/siyuan-steve-tools/asset/' })


// There's a guide at the bottom of this file!

// [1]
const customShapeUtils = [...defaultShapeUtils, CardShapeUtil, SlideShapeUtil, MindMapNodeShapeUtil]
const customTools = [CardShapeTool, SlideShapeTool, MindMapNodeTool]
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
            shapeUtils: customShapeUtils,
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
        try {
            // 加载之前保存的数据
            await this.loadData();
            // 只有在加载成功后才渲染
            console.log("加载数据成功，开始渲染Tldraw");
            this.renderTldraw(root);
        } catch (error) {
            // 加载数据失败，停止初始化并显示错误信息
            console.error("初始化 Tldraw 失败，无法加载数据:", error);
            showMessage("加载画板数据失败，请检查数据文件或联系开发者。", 5000, "error");

            // 在 root 中显示错误信息和强制加载按钮
            root.innerHTML = `
                <div style="padding: 20px; color: red; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <p>加载画板数据失败，请检查控制台获取更多信息。</p>
                    <p style="color: orange; margin-top: 10px;">您可以强制创建一个新的空白画板，但这将导致无法加载的数据丢失。</p>
                    <button id="force-load-tldraw-${this.id}" style="margin-top: 15px; padding: 8px 15px; cursor: pointer;">强制创建新画板</button>
                </div>
            `;

            // 为按钮添加事件监听器
            const forceLoadButton = root.querySelector(`#force-load-tldraw-${this.id}`);
            if (forceLoadButton) {
                forceLoadButton.addEventListener('click', () => {
                    // 清空错误信息
                    root.innerHTML = '';
                    // 渲染一个新的 Tldraw 实例
                    showMessage("正在创建新的空白画板...", 3000, "info");
                    this.renderTldraw(root);
                });
            }
        }
    }

    /**
    * 加载保存的数据
    * @returns Promise<boolean> 是否加载成功
    */
    private async loadData(): Promise<boolean> {
        try {
            // 从思源笔记的存储中获取数据
            const data = await api.getFile(`/data/storage/petal/sttools/${this.storageKey}.json`);

            if (data) {
                console.log("加载到数据", data);
                // 尝试解析和加载快照
                try {
                    loadSnapshot(this.store, data);
                    console.log('已加载保存的画布数据');
                    return true; // 加载成功
                } catch (parseError) {
                    console.error('解析或加载快照失败', parseError);
                    // 如果解析或加载失败，也视为加载失败，抛出错误
                    throw new Error('加载画布数据失败：数据格式错误');
                }
            }
            return true; // 没有数据也算成功（使用空状态）
        } catch (error) {
            console.error('加载画布数据失败', error);
            // 抛出错误，中断后续操作
            throw error;
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
        const isGridMode = settingdata['isGridMode'] || false; // 是否网格模式
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
                    licenseKey="tldraw-2026-01-28/WyJzTmo2UUJDRSIsWyIqIl0sMTYsIjIwMjYtMDEtMjgiXQ.TPO1s+ITkaa0Ou5Xt1vXDVgtuRkEmOLWH+bM+P/GNjaiw0f158QNVK97eCRJTFGF9Lpv1RoaJrvGX4mV+Ioxwg" 
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
                        editor.on('sttools:importData', () => {
                            this.importData().catch(err => {
                                console.error('导入数据失败:', err);
                                showMessage('导入数据失败');
                            });
                        });

                        editor.on('sttools:exportData', () => {
                            this.backupData().catch(err => {
                                console.error('备份数据失败:', err);
                                showMessage('备份数据失败');
                            });
                        });
                        editor.on('sttools:backupData', () => {
                            this.backupToTrash("手动备份").then((filename) => {
                                showMessage('备份数据成功，文件名: ' + filename);
                            }
                            ).catch(err => {
                                console.error('备份数据失败:', err);
                                showMessage('备份数据失败');
                            }
                            );
                        });

                        editor.updateInstanceState({ isGridMode: isGridMode });
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

                        const handleDrop = async (e: DragEvent) => {
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
                            // console.log('拖拽的数据类型', e);
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
                            const idid = await api.generateSiyuanID();
                            const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                            let aproblock: string;
                            if (blockIdo_rigin.includes('nodeheading')) {
                                aproblock = blockId;
                                const link = `siyuan://plugins/siyuan-steve-tools/?rootid=${this.id}&blockid=${aproblock}&title=${this.title}`;
                                const content = (await api.getBlockByID(blockId)).markdown;
                                await api.updateBlock("markdown",`${content}[🔗](${link})`, aproblock)
                            }
                            else {
                                aproblock = idid as string;
                                const link = `siyuan://plugins/siyuan-steve-tools/?rootid=${this.id}&blockid=${aproblock}&title=${this.title}`;
                                await api.insertBlock("markdown", `##### [${timestamp}](${link})[🔗](${link})
{: id="${idid}" custom-st-tldraw="1" }`, blockId)
                            }
                            // 创建新的Card形状
                            // console.log("创建新的卡片形状",  aproblock[0].doOperations[0].id);
                            editor.createShape({
                                type: 'card',
                                x: x, // 默认宽度的一半，使形状中心在鼠标位置
                                y: y, // 默认高度的一半
                                props: {
                                    w: 300,
                                    h: 300,
                                    color: 'black',
                                    showMask: true,
                                    blockId: aproblock,
                                },
                            });
                            // api.setBlockAttrs(blockId, {
                            //     'custom-st-tldraw': '1',
                            // });
                            // console.log(`已在(${x}, ${y})位置创建包含块ID ${blockId} 的卡片`);
                        };

                        // 添加拖放事件监听器
                        container.addEventListener('drop', handleDrop);

                        // 删除组件块逻辑
                        editor.sideEffects.registerAfterDeleteHandler('shape', async (shape) => {
                            // Check if shape is a card shape type
                            if (shape.type !== 'card') return;

                            const cardShape = shape as ICardShape;
                            const blockId = cardShape.props?.blockId;
                            if (!blockId) return;

                            // 获取所有页面上的所有形状
                            const allShapes = editor.store.query.records('shape').get();
                            // 检查所有页面上是否还存在引用相同 blockId 的卡片
                            const remainingCardsWithSameBlockId = allShapes
                                .filter(s => s.type === 'card' && (s as ICardShape).props?.blockId === blockId);

                            // 只有当没有其他卡片引用此 blockId 时，才更新块属性
                            if (remainingCardsWithSameBlockId.length === 0) {
                                if (await api.getBlockByID(blockId)) {
                                    if (settingdata['SyncDelete']) {
                                        api.deleteBlock(blockId)
                                    } else {
                                        api.setBlockAttrs(blockId, { 'custom-st-tldraw': '0' })
                                            .then(() => console.log(`Block attribute updated for ${blockId} as it's no longer referenced.`))
                                            .catch(err => console.error('Failed to update block attributes:', err));
                                    }
                                }
                            } else {
                                console.log(`Block attribute for ${blockId} not updated as other cards still reference it.`);
                            }
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
         * 备份当前画布数据为JSON文件
         */
    public async backupData(): Promise<void> {
        try {
            // 获取当前画布数据快照

            const snapshot = getSnapshot(this.store);
            const jsonData = JSON.stringify(snapshot, null, 2);

            // 创建Blob对象
            const blob = new Blob([jsonData], { type: 'application/json' });

            // 创建下载链接
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const filename = `tldraw-backup-${this.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // 清理
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);

            return Promise.resolve();
        } catch (error) {
            console.error('备份画布数据失败', error);
            return Promise.reject(error);
        }
    }
    /**
     * 导入画布数据
     * @returns Promise
     */
    public async importData(): Promise<void> {
        try {
            // 创建文件选择器
            return new Promise<void>((resolve, reject) => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                // 监听文件选择
                fileInput.onchange = async (event) => {
                    try {
                        const file = (event.target as HTMLInputElement).files?.[0];
                        if (!file) {
                            document.body.removeChild(fileInput);
                            return reject(new Error('未选择文件'));
                        }

                        // 读取文件内容
                        const reader = new FileReader();
                        reader.onload = async (e) => {
                            try {
                                // 解析JSON数据
                                const jsonData = e.target?.result as string;
                                const data = JSON.parse(jsonData);

                                // 首先保存当前状态作为备份
                                await this.backupToTrash('导入前备份');

                                // 重置编辑器状态
                                if (this.editor) {
                                    // 加载导入的数据快照
                                    try {
                                        loadSnapshot(this.store, data);

                                        // 保存导入的数据
                                        await this.saveData();

                                        showMessage('画布数据导入成功');
                                        resolve();
                                    } catch (err) {
                                        console.error('加载导入数据失败:', err);
                                        showMessage('导入数据格式错误，请确保是有效的TLDraw备份文件');
                                        reject(err);
                                    }
                                } else {
                                    reject(new Error('编辑器实例未初始化'));
                                }
                            } catch (err) {
                                console.error('解析导入的JSON数据失败:', err);
                                showMessage('解析导入文件失败，请确保文件格式正确');
                                reject(err);
                            }
                            document.body.removeChild(fileInput);
                        };

                        reader.onerror = () => {
                            console.error('读取文件内容失败');
                            showMessage('读取文件内容失败');
                            document.body.removeChild(fileInput);
                            reject(new Error('读取文件内容失败'));
                        };

                        // 开始读取文件
                        reader.readAsText(file);
                    } catch (err) {
                        document.body.removeChild(fileInput);
                        reject(err);
                    }
                };

                // 用户取消选择
                fileInput.onabort = () => {
                    document.body.removeChild(fileInput);
                    reject(new Error('用户取消选择文件'));
                };

                // 触发文件选择对话框
                fileInput.click();
            });
        } catch (err) {
            console.error('导入画布数据失败:', err);
            return Promise.reject(err);
        }
    }
    private async backupToTrash(reason: string = '自动备份'): Promise<string> {
        try {
            // 确保回收站目录存在
            try {
                await api.putFile(`/data/storage/petal/sttools/trash/.gitkeep`, false, new Blob([''], { type: 'text/plain' }));
            } catch (err) {
                // 目录可能已存在，忽略错误
            }

            // 获取当前数据
            const snapshot = getSnapshot(this.store);
            const jsonData = JSON.stringify(snapshot);
            console.log('备份数据:', jsonData);

            // 生成备份文件名
            const trashFileName = `${this.storageKey}-${reason}-${Date.now()}.json`;

            // 将数据写入回收站
            const blob = new Blob([jsonData], { type: 'application/json' });
            await api.putFile(`/data/storage/petal/sttools/trash/${trashFileName}`, false, blob);

            return trashFileName;
        } catch (err) {
            console.error('备份数据到回收站失败:', err);
            throw err;
        }
    }
    /**
     * 清除当前画布数据
     * @param removeStorage 是否也从持久化存储中删除数据
     */
    public async clearData(removeStorage: boolean = false): Promise<void> {
        try {
            // 先创建备份，以防误操作
            await this.saveCurrentState();

            // 重置编辑器到空状态
            if (this.editor) {
                this.editor.selectAll();
                this.editor.deleteShapes(this.editor.getSelectedShapes());
            }

            // 如果需要，从存储中删除持久化数据
            if (removeStorage) {
                try {
                    // Create trash directory if it doesn't exist
                    try {
                        await api.putFile(`/data/storage/petal/sttools/trash/.gitkeep`, false, new Blob([''], { type: 'text/plain' }));
                    } catch (err) {
                        // Directory likely already exists
                    }

                    // Get the data content before removal
                    const dataContent = await api.getFile(`/data/storage/petal/sttools/${this.storageKey}.json`);

                    // Move to trash with timestamp
                    const trashFileName = `${this.storageKey}-${Date.now()}.json`;
                    await api.putFile(`/data/storage/petal/sttools/trash/${trashFileName}`, false, new Blob([dataContent], { type: 'application/json' }));

                    // Remove original file
                    await api.removeFile(`/data/storage/petal/sttools/${this.storageKey}.json`);
                    showMessage('已将画布数据移动到回收站' + `/data/storage/petal/sttools/trash/${trashFileName}`);
                } catch (err) {
                    // 如果文件不存在，忽略错误
                    console.warn('删除存储文件失败，可能文件不存在', err);
                }
            }

            return Promise.resolve();
        } catch (error) {
            console.error('清除画布数据失败', error);
            return Promise.reject(error);
        }
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
     * 导航到包含特定思源块的形状(二选一)
     * @param blockId 思源块ID
     * @param shapeId 形状ID（可选）
     * @returns 是否成功导航
     */
    public navigateToBlockShape(blockId: string, shapeId = "" as TLShapeId): boolean {
        if (shapeId === "") {
            shapeId = this.findShapeByBlockId(blockId);
        }
        console.log("导航到形状", shapeId, blockId);
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
    // console.log("判断思源主题", document.documentElement.getAttribute('data-theme-mode'));
    return document.documentElement.getAttribute('data-theme-mode') === 'dark';
}

//暴露给全局
// const waytotldraw = {
//     TldrawManager
// }
// declare global {
//     interface Window {
//         tldraw: typeof waytotldraw;
//     }
// }
// window.tldraw=waytotldraw;

