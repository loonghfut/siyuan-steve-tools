import * as ic from "@/icon"
import { openTab, Plugin, showMessage } from "siyuan";
// import './handwriting.css';
import { TldrawManager } from './tldraw/tldraw-manager';
import { BlockHandler } from './tldraw/block-handler';
import { addWhiteboardButton } from "./function/assist";
import { api } from "@frostime/siyuan-plugin-kits";
import { BLOCK_LAYOUT } from "./parameter";

export class M_handwriting {
    private plugin: Plugin;
    // 存储画布实例的映射表
    private tldrawInstances: Map<string, TldrawManager> = new Map();
    private currentid: string = "";

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async init(settingdata) {
        // 添加图标
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 500 500">
               ${ic.steveTools_whiteboard}
            </symbol>  
        `);

        // 添加顶栏按钮
        this.plugin.addTopBar({
            icon: "iconSTWhiteboard",
            title: "画板",
            position: "right",
            callback: () => {
                this.openWhiteBoard();
            }
        });
    }

    async onLayoutReady(settingdata) {
        // 可以在这里初始化任何需要DOM加载完成后的逻辑
        this.plugin.eventBus.on('switch-protyle', (e) => {
            console.log("切换思源块:", e);
            this.currentid = e.detail.protyle.block.rootID;
            console.log(this.currentid);

            addWhiteboardButton(e);
        });
    }

    /**
     * 在当前笔记页中打开画板
     */
    public async openWhiteBoard_in(e, defaultBlockIds: string[] = []) {
        // 查找当前页面的内容容器
        const id = e.detail.protyle.block.rootID;
        const whiteBoardTab = await openTab({
            app: this.plugin.app,
            custom: {
                id: "steveTool-whiteboard-" + id,
                title: id,
                icon: "iconSTWhiteboard",
                data: {
                    text: "steveTool-whiteboard"
                },
            }
        });
        
        // 获取面板元素并初始化tldraw
        const panelElement = whiteBoardTab.panelElement;
        
        // 创建tldraw容器
        const tldrawContainer = document.createElement('div');
        tldrawContainer.id = `tldraw-container-${id}`;
        tldrawContainer.style.width = '100%';
        tldrawContainer.style.height = '100%';
        panelElement.appendChild(tldrawContainer);
        
        // 初始化TldrawManager
        const tldrawManager = new TldrawManager(id, tldrawContainer);
        this.tldrawInstances.set(id, tldrawManager);
        
        // // 初始化块处理器
        // const blockHandler = new BlockHandler(tldrawManager, this.plugin);
        
        // // 如果有默认块，添加它们
        // if (defaultBlockIds.length > 0) {
        //     await this.addDefaultBlocks(tldrawManager, id, defaultBlockIds);
        // }
        
        return tldrawManager;
    }

    /**
     * 打开白板并初始化画布
     */
    private async openWhiteBoard() {
        // 生成唯一ID
        const id = "main-whiteboard";
        
        // 创建新选项卡
        const whiteBoardTab = await openTab({
            app: this.plugin.app,
            custom: {
                id: "steveTool-whiteboard-" + id,
                title: "无限画板",
                icon: "iconSTWhiteboard",
                data: {
                    text: "steveTool-whiteboard"
                },
            }
        });

        // 获取面板元素并初始化tldraw
        const panelElement = whiteBoardTab.panelElement;
        
        // 创建tldraw容器
        const tldrawContainer = document.createElement('div');
        tldrawContainer.id = `tldraw-container-${id}`;
        tldrawContainer.style.width = '100%';
        tldrawContainer.style.height = '100%';
        panelElement.appendChild(tldrawContainer);
        
        // 初始化TldrawManager
        const tldrawManager = new TldrawManager(id, tldrawContainer);
        this.tldrawInstances.set(id, tldrawManager);
        
        // 初始化块处理器
        const blockHandler = new BlockHandler(tldrawManager, this.plugin);
    }

    /**
     * 添加默认块到画布
     */
    private async addDefaultBlocks(tldrawManager: TldrawManager, id: string, blockIds: string[]) {
        if (!blockIds || blockIds.length === 0) return;

        // 显示加载提示
        showMessage(`正在加载 ${blockIds.length} 个块...`);

        // 计算每个块的布局位置
        const margin = BLOCK_LAYOUT.MARGIN;
        const startX = BLOCK_LAYOUT.START_X;
        const startY = BLOCK_LAYOUT.START_Y;
        const columns = Math.min(BLOCK_LAYOUT.MAX_COLUMNS, blockIds.length);
        const blockWidth = BLOCK_LAYOUT.WIDTH;
        const blockHeight = BLOCK_LAYOUT.HEIGHT;

        // 批量处理块
        const batchSize = 5;
        for (let i = 0; i < blockIds.length; i += batchSize) {
            const batch = blockIds.slice(i, i + batchSize);
            
            // 并行处理当前批次的块
            await Promise.all(batch.map(async (blockId, batchIndex) => {
                const index = i + batchIndex;
                
                // 计算行列位置
                const col = index % columns;
                const row = Math.floor(index / columns);
                
                // 计算坐标
                const x = startX + col * (blockWidth + margin);
                const y = startY + row * (blockHeight + margin);
                
                try {
                    // 获取块数据用于预览
                    const blockData = await api.getBlockByID(blockId);
                    
                    // 添加块到画布
                    await tldrawManager.addSiyuanBlock(blockId, {
                        x,
                        y,
                        width: blockWidth,
                        height: blockHeight,
                        content: blockData?.content || '加载中...'
                    });
                    
                } catch (err) {
                    console.error(`添加块 ${blockId} 失败:`, err);
                }
            }));
            
            // 添加延迟以避免UI冻结
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        showMessage(`已布局 ${blockIds.length} 个块`);
    }

    /**
     * 插件卸载时的清理工作
     */
    async onunload() {
        // 销毁所有tldraw实例
        this.tldrawInstances.forEach(instance => {
            instance.destroy();
        });
        
        // 清空实例映射表
        this.tldrawInstances.clear();
    }
}