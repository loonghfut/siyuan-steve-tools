import * as ic from "@/icon"
import { openTab, Plugin, showMessage, Tab } from "siyuan";
// import './handwriting.css';
import { TldrawManager } from './tldraw/tldraw-manager';
import { addWhiteboardButton } from "./function/assist";
import * as api from "@/api";
import { TLShapeId } from "@tldraw/tldraw";
const tldrawInstances: Map<string, TldrawManager> = new Map();
export class M_handwriting {
    private plugin: Plugin;
    // 存储画布实例的映射表

    private currentid: string = "";

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async init(settingdata) {
        // 添加图标
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 24 24">
               ${ic.steveTools_whiteboard}
            </symbol>  
        `);
        this.plugin.eventBus.on('open-siyuan-url-plugin', async (e) => {
            // console.log("打开思源URL插件:", e);
            const url = e.detail.url;
            if (url.startsWith('siyuan://plugins/siyuan-steve-tools/')) {
                try {
                    // 提取查询参数部分
                    const queryString = url.split('?')[1];
                    if (!queryString) return;

                    // 解析查询参数
                    const params = new URLSearchParams(queryString);
                    const rootid = params.get('rootid');
                    const blockid = params.get('blockid');
                    const shapeid = params.get('shapeid');
                    const title = params.get('title') || "画板" + rootid;
                    // console.log('解析思源 URL 参数:', { rootid, blockid });
                    //判断rootid和blockid是否存在
                    if (rootid && blockid === null) {
                        await openTab({
                            app: this.plugin.app,
                            custom: {
                                id: this.plugin.name + "steveTool-whiteboard",
                                title: title,
                                icon: "iconSTWhiteboard",
                                data: {
                                    text: "steveTool-whiteboard" + rootid,
                                    rootid: rootid,
                                },
                            },
                            position: "right",
                        });
                        return;
                    }

                    if (!rootid || !blockid) {
                        showMessage("缺少必要的参数");
                        return;
                    }

                    // 这里可以根据解析出的参数执行相应操作
                    if (rootid && blockid) {
                        const docblock = await api.getBlockByID(rootid);
                        const id = await api.getBlockByID(blockid);
                        if (!docblock) {
                            showMessage('未找到此rootid对应的块');
                            return;
                        }
                        if (docblock.id !== docblock.root_id) {
                            showMessage('当前块不是根块，请检查');
                            return;
                        }
                        if (!id) {
                            showMessage('未找到此blockid对应的块');
                            return;
                        }

                        const tab = await openTab({
                            app: this.plugin.app,
                            custom: {
                                id: this.plugin.name + "steveTool-whiteboard",
                                title: title,
                                icon: "iconSTWhiteboard",
                                data: {
                                    text: "steveTool-whiteboard" + rootid,
                                    rootid: rootid,
                                },
                            },
                            position: "right",
                        });
                        const tldrawManager = (tab.panelElement as any).tldrawManager as TldrawManager;
                        // console.log("tldrawManager", tldrawManager);
                        // 延时500毫秒后再导航
                        setTimeout(() => {
                            if (shapeid) {
                                tldrawManager.navigateToBlockShape(blockid, shapeid as TLShapeId);
                            } else if (blockid) {
                                tldrawManager.navigateToBlockShape(blockid);
                            }
                        }, 50);
                    }
                } catch (error) {
                    console.error('解析思源 URL 参数出错:', error);
                }
            }


        });
        this.plugin.addTab({
            type: "steveTool-whiteboard",
            async init() {
                console.log("初始化画板选项卡", this.tab.title);
                const panelElement = this.element;
                const tldrawContainer = document.createElement('div');
                tldrawContainer.id = `tldraw-container-${this.data.rootid}`;
                tldrawContainer.style.width = '100%';
                tldrawContainer.style.height = '100%';
                panelElement.appendChild(tldrawContainer);
                const tl = new TldrawManager(this.data.rootid, tldrawContainer, [this.data.rootid], this.tab.title);
                (panelElement as any).tldrawManager = tl;

            },
            async destroy() {
                console.log("销毁画板选项卡", this);
                const tldrawManager = (this.element as any).tldrawManager;
                if (tldrawManager) {
                    tldrawManager.destroy();
                    // console.log("销毁画板实例", tldrawManager);
                }
            }
        })
        // 添加顶栏按钮
        // this.plugin.addTopBar({
        //     icon: "iconSTWhiteboard",
        //     title: "画板",
        //     position: "right",
        //     callback: () => {
        //         this.openWhiteBoard();
        //     }
        // });
    }

    async onLayoutReady(settingdata) {
        // 可以在这里初始化任何需要DOM加载完成后的逻辑
        this.plugin.eventBus.on('switch-protyle', (e) => {
            // console.log("切换思源块:", e);
            this.currentid = e.detail.protyle.block.rootID;
            // console.log(this.currentid);

            addWhiteboardButton(e);
        });
    }

    /**
     * 在当前笔记页中打开画板
     */
    public async openWhiteBoard_in(e) {
        // 查找当前页面的内容容器
        const id = e.detail.protyle.block.rootID;
        const tabId = this.plugin.name + "steveTool-whiteboard";
        const titleText = e.detail.protyle.title.editElement.textContent;

        const whiteBoardTab = await openTab({
            app: this.plugin.app,
            custom: {
                id: tabId,
                title: titleText,
                icon: "iconSTWhiteboard",
                data: {
                    text: "steveTool-whiteboard" + id,
                    rootid: id,
                    //时间戳
                    // timestamp: Date.now(),
                },
            },
        });

        // 获取面板元素并初始化tldraw
        // const panelElement = whiteBoardTab.panelElement;

        // // 创建tldraw容器
        // const tldrawContainer = document.createElement('div');
        // tldrawContainer.id = `tldraw-container-${id}`;
        // tldrawContainer.style.width = '100%';
        // tldrawContainer.style.height = '100%';
        // panelElement.appendChild(tldrawContainer);

        // // 初始化TldrawManager
        // const tldrawManager = new TldrawManager(id, tldrawContainer, [e.detail.protyle.block.rootID]);
        // this.tldrawInstances.set(id, tldrawManager);
        // this.twhiteBoardTabInstances.set(id, whiteBoardTab);
        // return tldrawManager;
    }

    /**
     * 打开白板并初始化画布
     */
    // private async openWhiteBoard() {
    //     // 生成唯一ID
    //     const id = "main-whiteboard";

    //     // 创建新选项卡
    //     const whiteBoardTab = await openTab({
    //         app: this.plugin.app,
    //         custom: {
    //             id: "steveTool-whiteboard-" + id,
    //             title: "无限画板",
    //             icon: "iconSTWhiteboard",
    //             data: {
    //                 text: "steveTool-whiteboard"
    //             },
    //         }
    //     });

    //     // 获取面板元素并初始化tldraw
    //     const panelElement = whiteBoardTab.panelElement;

    //     // 创建tldraw容器
    //     const tldrawContainer = document.createElement('div');
    //     tldrawContainer.id = `tldraw-container-${id}`;
    //     tldrawContainer.style.width = '100%';
    //     tldrawContainer.style.height = '100%';
    //     panelElement.appendChild(tldrawContainer);

    //     // 初始化TldrawManager
    //     const tldrawManager = new TldrawManager(id, tldrawContainer);
    //     this.tldrawInstances.set(id, tldrawManager);

    //     // 初始化块处理器
    //     const blockHandler = new BlockHandler(tldrawManager, this.plugin);
    // }


    /**
     * 插件卸载时的清理工作
     */
    async onunload() {
        // 销毁所有tldraw实例
        tldrawInstances.forEach(instance => {
            instance.destroy();
        });

        // 清空实例映射表
        tldrawInstances.clear();
    }
}