import * as ic from "@/icon"
import { openTab, Plugin, showMessage } from "siyuan";
// import './handwriting.css';
import { TldrawManager } from './tldraw/tldraw-manager';
// 替换为新的卡片视图组件
import TldrawWhiteboardCards from './tldraw/ui/tldraw-whiteboard-cards.svelte';
import TldrawWhiteboardManager from './tldraw/ui/tldraw-whiteboard-manager.svelte';
import { addWhiteboardButton, setupFileTreeObserver } from "./function/assist";
import * as api from "@/api/api";
import { TLShapeId } from "@tldraw/tldraw";
import { registerTab, unregisterTab } from './tldraw/tldraw-instance-manager';
import { settingdata } from "@/index";
export class M_handwriting {
    private plugin: Plugin;
    // 存储画布实例的映射表

    private currentid: string = "";
    // svelte dock component instance
    private dockComponent: any | null = null;
    // 记录点击拦截器以便卸载时移除
    private clickHandler?: (e: MouseEvent) => void;
    // 委托的 icon 点击处理，用于单点管理所有注入的 icon
    private delegatedIconClickHandler?: (e: MouseEvent) => void;
    // 复用的插件 URL 处理函数
    private handlePluginUrl?: (url: string) => Promise<void>;
    // 监听带 custom-tldraw-link 元素的观察器
    private tldrawLinkObserver?: MutationObserver;
    private pendingTldrawNodes?: Set<HTMLElement>;
    private mutationFlushHandle?: number;
    private mutationFlushHandleIsTimeout?: boolean;
    // 文档树观察器实例
    private fileTreeObserver?: MutationObserver;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    // 公开访问 plugin 的 getter
    get pluginInstance() {
        return this.plugin;
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
                const normalizedUrl = this.decodeAmpEntities(url);

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
                        // position: "right",
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

        // 暴露给实例，供其他处理复用
        this.handlePluginUrl = handlePluginUrl;

        // 监听来自思源的自定义事件（原有逻辑）
        this.plugin.eventBus.on('open-siyuan-url-plugin', async (e) => {
            const url = e.detail.url as string;
            await handlePluginUrl(url);
        });

        // 拦截以 https://plugins/siyuan-steve-tools/ 开头的链接点击并交给 handlePluginUrl 处理
        this.clickHandler = async (e: MouseEvent) => {
            // 仅处理左键点击且未被修饰键干预的常规点击
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

            const target = e.target as HTMLElement | null;
            if (!target) return;

            // 优先：如果点击的是注入的图标（或其子元素），直接从图标属性读取链接
            const iconEl = (target.closest && target.closest('.st-tldraw-link-icon')) as HTMLElement | null;
            if (iconEl) {
                const link = iconEl.getAttribute('data-tldraw-link') || '';
                if (!link) return;
                e.preventDefault();
                e.stopPropagation();
                try {
                    const toHandle = this.decodeAmpEntities(link);
                    await handlePluginUrl(toHandle);
                } catch (err) {
                    console.error('处理图标链接失败:', err);
                }
                return;
            }

            // 其次快速尝试找到最近的 <a> 元素（避免遍历完整的 composedPath）
            let anchor = (target.closest && target.closest('a')) as HTMLAnchorElement | null;
            let candidateUrl: string | null = null;
            if (!anchor) {
                // 回退：向上查找可能的 data-type="a" 节点
                let el = target;
                while (el) {
                    if (el instanceof HTMLAnchorElement) { anchor = el; break; }
                    if (el.getAttribute) {
                        const dt = el.getAttribute('data-type');
                        if (dt === 'a') {
                            const dh = el.getAttribute('data-href') || '';
                            if (dh) {
                                candidateUrl = dh;
                                break;
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
                    const toHandle = this.decodeAmpEntities(href);
                    await handlePluginUrl(toHandle);
                } catch (err) {
                    console.error('处理插件 https 链接失败:', err);
                }
            }
        };
        document.addEventListener('click', this.clickHandler, true);

        // 委托：统一处理注入的图标点击，减少每个图标绑定事件的开销
        this.delegatedIconClickHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const icon = (target.closest && target.closest('.st-tldraw-link-icon')) as HTMLElement | null;
            if (!icon) return;
            // 阻止默认并使用图标上的链接属性
            e.preventDefault();
            e.stopPropagation();
            const link = icon.getAttribute('data-tldraw-link') || '';
            if (link && this.handlePluginUrl) {
                const normalized = this.decodeAmpEntities(link);
                // 不等待，交由处理器异步执行
                void this.handlePluginUrl(normalized);
            }
        };
        document.addEventListener('click', this.delegatedIconClickHandler, true);


        this.plugin.addTab({
            type: "steveTool-whiteboard",
            async init() {
                console.debug("初始化画板选项卡", this.tab.title);
                const panelElement = this.element;
                const tldrawContainer = document.createElement('div');
                tldrawContainer.id = `tldraw-container-${this.data.rootid}`;
                tldrawContainer.style.width = '100%';
                tldrawContainer.style.height = '100%';
                panelElement.appendChild(tldrawContainer);
                const tl = new TldrawManager(this.data.rootid, tldrawContainer, [this.data.rootid], this.tab.title);
                (panelElement as any).tldrawManager = tl;
                
                // 注册 Tab 实例
                registerTab(this.data.rootid, this.tab);
            },
            async destroy() {
                console.debug("销毁画板选项卡", this);
                const rootid = this.data.rootid;
                const tldrawManager = (this.element as any).tldrawManager;
                if (tldrawManager) {
                    tldrawManager.destroy();
                }
                // 注销 Tab 实例
                if (rootid) {
                    unregisterTab(rootid);
                }
            }
        })

        // 注册白板管理 Tab
        const managerPlugin = this.plugin;
        this.plugin.addTab({
            type: "steveTool-whiteboard-manager",
            async init() {
                console.debug("初始化白板管理选项卡");
                try {
                    this.element.innerHTML = '';
                    const root = document.createElement('div');
                    root.className = 'steve-handwriting-manager-root';
                    root.style.width = '100%';
                    root.style.height = '100%';
                    this.element.appendChild(root);
                    // @ts-ignore
                    (this.element as any).__svelteComponent = new TldrawWhiteboardManager({ 
                        target: root, 
                        props: { plugin: managerPlugin } 
                    });
                } catch (err) {
                    console.error('挂载白板管理组件失败:', err);
                }
            },
            async destroy() {
                console.debug("销毁白板管理选项卡");
                try {
                    const component = (this.element as any).__svelteComponent;
                    if (component && typeof component.$destroy === 'function') {
                        component.$destroy();
                    }
                } catch (e) {
                    console.warn('销毁白板管理组件时出错:', e);
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
        const self = this;
        this.plugin.addDock({
            config: {
                position: "RightTop",
                size: { width: 250, height: 0 },
                icon: "iconSTWhiteboard",
                title: "白板列表",
            },
            data: null,
            type: "steveTool-whiteboard",
            resize: async () => {

            },
            update() {
                try {
                    const existing = (this as any).__svelteComponent;
                    if (!existing) {
                        // Ensure a clean container
                        this.element.innerHTML = '';
                        const root = document.createElement('div');
                        root.className = 'steve-handwriting-dock-root';
                        root.style.width = '100%';
                        root.style.height = '100%';
                        this.element.appendChild(root);
                        // @ts-ignore
                        self.dockComponent = new TldrawWhiteboardCards({ target: root, props: { plugin: self.plugin } });
                        (this as any).__svelteComponent = self.dockComponent;
                    }
                } catch (err) {
                    console.error('更新白板列表 dock 时出错:', err);
                }
            },
            init: async (dock) => {
                try {
                    // 清理旧内容并挂载组件
                    dock.element.innerHTML = '';
                    const root = document.createElement('div');
                    root.className = 'steve-handwriting-dock-root';
                    root.style.width = '100%';
                    root.style.height = '100%';
                    dock.element.appendChild(root);
                    // @ts-ignore
                    self.dockComponent = new TldrawWhiteboardCards({ target: root, props: { plugin: self.plugin } });
                    (dock as any).__svelteComponent = self.dockComponent;
                } catch (err) {
                    console.error('挂载白板列表组件到 dock 出错:', err);
                }
            },
            destroy() {
                try {
                    const s = self.dockComponent || (this as any).__svelteComponent;
                    if (s && typeof s.$destroy === 'function') {
                        s.$destroy();
                    }
                } catch (e) { /* ignore */ }
                try {
                    // 清除 dock DOM
                    if (this.element) {
                        try { this.element.innerHTML = ''; } catch (e) { /* ignore */ }
                    }
                } catch (e) { /* ignore */ }
            },
        });

    }

    async onLayoutReady(_settingdata) {
        // 可以在这里初始化任何需要DOM加载完成后的逻辑
        this.plugin.eventBus.on('switch-protyle', (e) => {
            // console.debug("切换思源块:", e);
            this.currentid = e.detail.protyle.block.rootID;
            // console.debug(this.currentid);

            addWhiteboardButton(e);
            const protyleEl = e.detail?.protyle?.element as HTMLElement | undefined;
            if (protyleEl) {
                this.startTldrawLinkWatcher(protyleEl);
            }
        });

        // 设置文档树白板按钮观察器（根据设置决定是否启用）
        if (settingdata['tldraw-show-in-file-tree'] !== false) {
            this.fileTreeObserver = setupFileTreeObserver();
        }
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
    }

    private injectTldrawLinkIcons(container: HTMLElement) {
        if (!container || !this.handlePluginUrl) return;
        const nodes = container.querySelectorAll<HTMLElement>('[custom-tldraw-link]');
        nodes.forEach((node) => {
            this.injectTldrawIconForNode(node);
        });
    }

    private injectTldrawIconForNode(node: HTMLElement) {
        if (!node || !this.handlePluginUrl) return;
        const linkAttr = node.getAttribute('custom-tldraw-link');
        if (!linkAttr) return;

        const attrEl = Array.from(node.children).find((child) => (child as HTMLElement).classList?.contains('protyle-attr')) as HTMLElement | undefined;
        if (!attrEl) return;

        if (attrEl.querySelector('.st-tldraw-link-icon')) return;

        const icon = document.createElement('span');
        icon.className = 'st-tldraw-link-icon block__icon fn__flex-center';
        icon.setAttribute('aria-label', '打开白板');
        icon.title = '打开白板';
        //加opacity: 1
        icon.style.opacity = '1';
        icon.innerHTML = '<svg class="item__graphic"><use xlink:href="#iconSTWhiteboard">🔗</use></svg>';
        // 把链接存到 icon 的属性上，供委托处理器使用
        icon.setAttribute('data-tldraw-link', linkAttr);

        attrEl.appendChild(icon);
    }

    private startTldrawLinkWatcher(protyleEl: HTMLElement) {
        if (!protyleEl) return;
        // 先停止上一个观察器
        this.stopTldrawLinkWatcher();

        // 先对现有内容做一次注入
        this.injectTldrawLinkIcons(protyleEl);

        // 监听新增节点或属性变化
        this.tldrawLinkObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach((n) => {
                        if (n instanceof HTMLElement) {
                            if (n.hasAttribute('custom-tldraw-link')) {
                                this.scheduleTldrawNodeInjection(n);
                            }
                            n.querySelectorAll<HTMLElement>('[custom-tldraw-link]').forEach((child) => {
                                this.scheduleTldrawNodeInjection(child);
                            });
                        }
                    });
                } else if (m.type === 'attributes') {
                    const target = m.target as HTMLElement;
                    if (m.attributeName === 'custom-tldraw-link') {
                        this.scheduleTldrawNodeInjection(target);
                    }
                }
            }
        });

        this.tldrawLinkObserver.observe(protyleEl, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['custom-tldraw-link'],
        });
    }

    private stopTldrawLinkWatcher() {
        if (this.tldrawLinkObserver) {
            this.tldrawLinkObserver.disconnect();
            this.tldrawLinkObserver = undefined;
        }
        this.clearScheduledTldrawNodes();
        // 注意：不要在这里移除 `delegatedIconClickHandler`，它应当在插件卸载时统一清理。
    }

    /**
     * 插件卸载时的清理工作
     */
    async onunload() {
        // 移除链接点击拦截器
        if (this.clickHandler) {
            document.removeEventListener('click', this.clickHandler, true);
            this.clickHandler = undefined;
        }
        if (this.delegatedIconClickHandler) {
            document.removeEventListener('click', this.delegatedIconClickHandler, true);
            this.delegatedIconClickHandler = undefined;
        }
        // 停止观察器
        this.stopTldrawLinkWatcher();
        // 停止文档树观察器
        if (this.fileTreeObserver) {
            this.fileTreeObserver.disconnect();
            this.fileTreeObserver = undefined;
        }
        // 销毁 dock 上的 svelte 组件（如果存在）
        try {
            if (this.dockComponent && typeof this.dockComponent.$destroy === 'function') {
                this.dockComponent.$destroy();
                this.dockComponent = null;
            }
        } catch (e) { /* ignore */ }
    }

    private decodeAmpEntities(value: string): string {
        if (!value || value.indexOf('&amp;') === -1) {
            return value;
        }
        let result = value;
        for (let i = 0; i < 5; i++) {
            const replaced = result.replace(/&amp;/g, '&');
            if (replaced === result) {
                break;
            }
            result = replaced;
        }
        return result;
    }

    private scheduleTldrawNodeInjection(node: HTMLElement) {
        if (!node) return;
        if (!this.pendingTldrawNodes) {
            this.pendingTldrawNodes = new Set();
        }
        this.pendingTldrawNodes.add(node);
        if (this.mutationFlushHandle !== undefined) {
            return;
        }

        const flush = () => {
            if (this.pendingTldrawNodes) {
                this.pendingTldrawNodes.forEach((pendingNode) => {
                    if (pendingNode.isConnected) {
                        this.injectTldrawIconForNode(pendingNode);
                    }
                });
                this.pendingTldrawNodes.clear();
                this.pendingTldrawNodes = undefined;
            }
            this.mutationFlushHandle = undefined;
            this.mutationFlushHandleIsTimeout = undefined;
        };

        if (typeof requestAnimationFrame === 'function') {
            this.mutationFlushHandle = requestAnimationFrame(flush);
            this.mutationFlushHandleIsTimeout = false;
        } else {
            this.mutationFlushHandle = window.setTimeout(flush, 16);
            this.mutationFlushHandleIsTimeout = true;
        }
    }

    private clearScheduledTldrawNodes() {
        if (this.mutationFlushHandle !== undefined) {
            if (this.mutationFlushHandleIsTimeout) {
                clearTimeout(this.mutationFlushHandle);
            } else {
                cancelAnimationFrame(this.mutationFlushHandle);
            }
        }
        if (this.pendingTldrawNodes) {
            this.pendingTldrawNodes.clear();
            this.pendingTldrawNodes = undefined;
        }
        this.mutationFlushHandle = undefined;
        this.mutationFlushHandleIsTimeout = undefined;
    }
}