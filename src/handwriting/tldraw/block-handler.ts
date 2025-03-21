import { Plugin, Protyle, showMessage } from "siyuan";
import { TldrawManager } from "./tldraw-manager";
import { api } from "@frostime/siyuan-plugin-kits";
import { BLOCK_LOADING } from "../parameter";

/**
 * 处理思源块在tldraw中的行为
 */
export class BlockHandler {
    private tldrawManager: TldrawManager;
    private plugin: Plugin;
    private protyleInstances: Map<string, Protyle> = new Map();

    constructor(tldrawManager: TldrawManager, plugin: Plugin) {
        this.tldrawManager = tldrawManager;
        this.plugin = plugin;
        
        // 初始化自定义形状和工具
        this.initializeCustomShapes();
    }

    /**
     * 初始化自定义形状和工具
     */
    private initializeCustomShapes() {
        // 向tldraw注册思源块自定义形状
        // 这里需要根据tldraw的API来实现自定义形状
        
        // 实现思源块的渲染逻辑
        // 包括如何显示、编辑和交互
    }

    /**
     * 初始化块的Protyle编辑器
     */
    public async initProtyleEditor(container: HTMLElement, blockId: string): Promise<Protyle | null> {
        try {
            // 创建Protyle编辑器
            const protyle = new Protyle(window.siyuan.ws.app, container, {
                blockId: blockId,
                render: {
                    breadcrumb: true,
                    gutter: false,
                    breadcrumbDocName: true,
                },
                mode: "wysiwyg",
            });
            
            // 存储实例以便后续管理
            this.protyleInstances.set(blockId, protyle);
            
            return protyle;
        } catch (e) {
            console.error("初始化编辑器失败:", e);
            container.innerHTML = `<div style="padding: 10px;">加载块 ${blockId} 失败</div>`;
            return null;
        }
    }

    /**
     * 获取块内容预览
     */
    public async getBlockPreview(blockId: string, maxLength: number = 120): Promise<string> {
        try {
            const blockData = await api.getBlockByID(blockId);
            if (blockData && blockData.content) {
                const content = blockData.content.substring(0, maxLength);
                return content + (blockData.content.length > maxLength ? '...' : '');
            }
        } catch (err) {
            console.error("获取块预览失败:", err);
        }
        return "加载内容中...";
    }

    /**
     * 回收不在视图内的块
     */
    public recycleOffscreenBlocks() {
        // 实现基于tldraw视图的块回收逻辑
        // 这需要与tldraw的视图API结合
    }

    /**
     * 清理资源
     */
    public cleanup() {
        // 销毁所有Protyle实例
        this.protyleInstances.forEach(protyle => {
            if (protyle.destroy) {
                protyle.destroy();
            }
        });
        
        this.protyleInstances.clear();
    }
}