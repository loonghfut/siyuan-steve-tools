import * as ic from "@/icon"
import { openTab, Plugin, showMessage, Tab } from "siyuan";
// import './handwriting.css';
import { TldrawManager } from './tldraw/tldraw-manager';
import { addWhiteboardButton } from "./function/assist";
import * as api from "@/api/api";
import { TLShapeId } from "@tldraw/tldraw";
const tldrawInstances: Map<string, TldrawManager> = new Map();
export class M_handwriting {
    private plugin: Plugin;
    // 存储画布实例的映射表

    private currentid: string = "";
    // 记录点击拦截器以便卸载时移除
    private clickHandler?: (e: MouseEvent) => void;

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
        // 统一处理插件 URL 的逻辑，供多处调用（事件总线或页面点击）
        const handlePluginUrl = async (url: string) => {
            try {
                // 支持两种前缀：siyuan://plugins/... 或 https://plugins/...
                if (!url || (!url.startsWith('siyuan://plugins/siyuan-steve-tools/') && !url.startsWith('https://plugins/siyuan-steve-tools/'))) {
                    return;
                }

                // 规范化 URL：把 HTML 实体中的 &amp; 解码为 &，避免查询参数解析失败
                let normalizedUrl = url;
                if (normalizedUrl.includes('&amp;')) {
                    // 多次替换，处理可能出现的 &amp;amp; 等情况
                    while (normalizedUrl.includes('&amp;')) {
                        normalizedUrl = normalizedUrl.replace(/&amp;/g, '&');
                    }
                }

                // 提取查询参数部分
                const queryString = normalizedUrl.split('?')[1];
                if (!queryString) return;

                // 解析查询参数
                const params = new URLSearchParams(queryString);
                const rootid = params.get('rootid');
                const blockid = params.get('blockid');
                const shapeid = params.get('shapeid');
                const title = params.get('title') || "画板" + rootid;

                // 如果只有 rootid（且 blockid 显式为 null），直接打开空白画板
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

                // 根据解析出的参数执行相应操作
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
                    // 延时后再导航到指定块/形状
                    setTimeout(() => {
                        if (shapeid) {
                            tldrawManager.navigateToBlockShape(blockid, shapeid as TLShapeId);
                        } else if (blockid) {
                            tldrawManager.navigateToBlockShape(blockid);
                        }
                    }, 50);
                }
            } catch (error) {
                console.error('解析插件 URL 参数出错:', error);
            }
        };

        // 监听来自思源的自定义事件（原有逻辑）
        this.plugin.eventBus.on('open-siyuan-url-plugin', async (e) => {
            const url = e.detail.url as string;
            await handlePluginUrl(url);
        });

        // 拦截以 https://plugins/siyuan-steve-tools/ 开头的链接点击并交给 handlePluginUrl 处理
        this.clickHandler = async (e: MouseEvent) => {
            // 仅处理左键点击且未被修饰键干预的常规点击
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

            // 向上寻找最近的 <a> 元素
            const path = e.composedPath ? e.composedPath() : [];
            let anchor: HTMLAnchorElement | null = null;
            let dataHrefEl: HTMLElement | null = null;
            let candidateUrl: string | null = null;
            for (const node of path as any[]) {
                if (node instanceof HTMLAnchorElement) { anchor = node; break; }
                if (!anchor && node instanceof HTMLElement) {
                    const dt = node.getAttribute && node.getAttribute('data-type');
                    if (dt === 'a') {
                        const dh = node.getAttribute('data-href') || '';
                        if (dh) {
                            dataHrefEl = node;
                            candidateUrl = dh;
                            // 不 break，让上层如存在 <a> 优先
                        }
                    }
                }
            }
            if (!anchor) {
                // 兼容性退路：从事件目标向上查找
                let el = e.target as HTMLElement | null;
                while (el) {
                    if (el instanceof HTMLAnchorElement) { anchor = el; break; }
                    if (!dataHrefEl && el.getAttribute) {
                        const dt = el.getAttribute('data-type');
                        if (dt === 'a') {
                            const dh = el.getAttribute('data-href') || '';
                            if (dh) {
                                dataHrefEl = el;
                                candidateUrl = dh;
                            }
                        }
                    }
                    el = el.parentElement;
                }
            }
            // 先取 <a href>，如无则取 data-href
            let href = anchor ? (anchor.getAttribute('href') || '') : '';
            if (!href && candidateUrl) href = candidateUrl;
            if (!href) return;

            // 只拦截目标前缀，避免影响其他链接
            if (href.startsWith('https://plugins/siyuan-steve-tools/')) {
                e.preventDefault();
                e.stopPropagation();
                try {
                    // 同样对 &amp; 进行解码，避免参数丢失
                    let toHandle = href;
                    if (toHandle.includes('&amp;')) {
                        while (toHandle.includes('&amp;')) {
                            toHandle = toHandle.replace(/&amp;/g, '&');
                        }
                    }
                    await handlePluginUrl(toHandle);
                } catch (err) {
                    console.error('处理插件 https 链接失败:', err);
                }
            }
        };
        document.addEventListener('click', this.clickHandler, true);


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

    async onLayoutReady(_settingdata) {
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

        await openTab({
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

        // 移除链接点击拦截器
        if (this.clickHandler) {
            document.removeEventListener('click', this.clickHandler, true);
            this.clickHandler = undefined;
        }
    }
}