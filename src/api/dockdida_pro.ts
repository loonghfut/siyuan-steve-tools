/**
 * Dock API - 通用的 Dock 创建和管理 API 函数
 */

export type DockPosition = "LeftTop" | "LeftBottom" | "RightTop" | "RightBottom";

export interface DockConfig {
    position: DockPosition;
    size: { width: number; height: number };
    icon: string;
    title: string;
}

export interface DockOptions {
    config: DockConfig;
    type: string;
    getInitialHtml: () => string;
    getUpdateHtml: () => string;
    validateUrl?: string;
    showMessage: (msg: string, timeout?: number, type?: string) => void;
    onDockCreated?: (dock: any) => void;
    onResize?: (dock: any) => void;
    onUpdate?: (dock: any) => void;
    onDestroy?: () => void;
    iframeSelector?: string;
    enableSmoothResize?: boolean;
    resizeDelay?: number;
}

export interface DockState {
    isExpanded: boolean;
    hasResizeObserver: boolean;
}

/**
 * 创建通用的 Dock 配置
 * @param options Dock 配置选项
 * @returns Dock 配置对象
 */
export function createDock(options: DockOptions) {
    const {
        config,
        type,
        getInitialHtml,
        getUpdateHtml,
        validateUrl,
        showMessage,
        onDockCreated,
        onResize,
        onUpdate,
        onDestroy,
        iframeSelector = 'iframe',
        enableSmoothResize = true,
        resizeDelay = 300
    } = options;

    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeout: number = 0;
    let isExpanded = true;

    /**
     * 设置 iframe 的指针事件处理
     * @param targetElement iframe 元素
     */
    const setupResizeObserver = (targetElement: Element) => {
        if (!enableSmoothResize) return;

        // 清理之前的观察器
        if (resizeObserver) {
            resizeObserver.disconnect();
        }

        resizeObserver = new ResizeObserver(() => {
            (targetElement as HTMLElement).style.pointerEvents = 'none';

            clearTimeout(resizeTimeout);
            resizeTimeout = window.setTimeout(() => {
                (targetElement as HTMLElement).style.pointerEvents = 'auto';
            }, resizeDelay);
        });

        resizeObserver.observe(targetElement);
    };

    /**
     * 清理资源
     */
    const cleanup = () => {
        // 断开 ResizeObserver
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        // 清除定时器
        clearTimeout(resizeTimeout);
    };

    return {
        config,
        data: null,
        type,

        resize() {
            if (this.element.clientWidth == 0) {
                isExpanded = false;
            } else {
                isExpanded = true;
                this.element.style.width = config.size.width + "px";
            }
            // 调用外部传入的 resize 回调
            if (onResize) {
                onResize(this);
            }
        },

        update() {
            this.element.innerHTML = getUpdateHtml();
            const targetElement = this.element.querySelector(iframeSelector);
            if (targetElement) {
                setupResizeObserver(targetElement);
            }

            // 调用外部传入的 update 回调
            if (onUpdate) {
                onUpdate(this);
            }
        },

        init: (dock: any) => {
            // 验证 URL（如果提供）
            if (validateUrl && validateUrl === "") {
                showMessage("请先配置服务地址...", -1, "error");
            }
            dock.element.innerHTML = getInitialHtml();

            // 设置平滑拖拽
            const targetElement = dock.element.querySelector(iframeSelector);
            if (targetElement) {
                setupResizeObserver(targetElement);
            }

            // 调用外部传入的 dock 创建回调
            if (onDockCreated) {
                onDockCreated(dock);
            }
        },

        destroy() {
            console.log("destroy dock:", type);
            cleanup();

            // 调用外部传入的 destroy 回调
            if (onDestroy) {
                onDestroy();
            }
        },

        // 提供访问内部状态的方法
        getState(): DockState {
            return {
                isExpanded,
                hasResizeObserver: !!resizeObserver
            };
        },

        // 提供手动清理的方法
        cleanup() {
            cleanup();
        }
    };
}

/**
 * 创建简化版本的 Dock（使用预设配置）
 * @param basicOptions 基础配置选项
 * @returns Dock 配置对象
 */
export function createSimpleDock(basicOptions: {
    config: DockConfig;
    type: string;
    getInitialHtml: () => string;
    getUpdateHtml: () => string;
    validateUrl?: string;
    showMessage: (msg: string, timeout?: number, type?: string) => void;
    onDockCreated?: (dock: any) => void;
}) {
    return createDock({
        ...basicOptions,
        onResize: undefined,
        onUpdate: undefined,
        onDestroy: undefined
    });
}

/**
 * 创建带有预设样式的 Web 应用 Dock
 * @param options Web 应用配置选项
 * @returns Dock 配置对象
 */
export function createWebAppDock(options: {
    title: string;
    icon: string;
    type: string;
    url: string;
    position?: DockPosition;
    size?: { width: number; height: number };
    showMessage: (msg: string, timeout?: number, type?: string) => void;
    onDockCreated?: (dock: any) => void;
    iframeId?: string;
    containerClass?: string;
}) {
    const {
        title,
        icon,
        type,
        url,
        position = "RightTop",
        size = { width: 250, height: 0 },
        showMessage,
        onDockCreated,
        iframeId = "web-dock",
        containerClass = "web-dock-container"
    } = options;

    const getHtml = (targetUrl: string = url) => `
        <div id="${iframeId}" class="${containerClass}">
            <iframe 
                allow="clipboard-read; clipboard-write"
                sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals allow-popups" 
                src="${targetUrl}" 
                data-src="" 
                border="1" 
                frameborder="no" 
                framespacing="0" 
                allowfullscreen="true" 
                style="height: 100%; width: 100%; pointer-events: auto;"
            ></iframe>
        </div>
    `;

    return createDock({
        config: {
            position,
            size,
            icon,
            title
        },
        type,
        getInitialHtml: () => getHtml(),
        getUpdateHtml: () => getHtml(),
        validateUrl: url,
        showMessage,
        onDockCreated,
        iframeSelector: `#${iframeId} iframe`
    });
}

/**
 * 创建滴答清单专用的 Web 应用 Dock
 * @param options 滴答清单配置选项
 * @returns Dock 配置对象
 */
export function createDidaDock(options: {
    title?: string;
    icon?: string;
    type?: string;
    position?: DockPosition;
    size?: { width: number; height: number };
    showMessage: (msg: string, timeout?: number, type?: string) => void;
    onDockCreated?: (dock: any) => void;
    iframeId?: string;
    containerClass?: string;
}) {
    const {
        title = "滴答清单",
        icon = "iconMp",
        type = "dida-dock",
        position = "RightTop",
        size = { width: 350, height: 0 },
        showMessage,
        onDockCreated,
        iframeId = "dida-dock",
        containerClass = "dida-dock-container"
    } = options;

    const defaultUrl = "https://dida365.com/webapp";
    let currentUrl = defaultUrl;

    const getHtml = (targetUrl: string = currentUrl) => `
        <div id="${iframeId}" class="${containerClass}">
            <iframe 
                allow="clipboard-read; clipboard-write"
                sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals allow-popups" 
                src="${targetUrl}" 
                data-src="" 
                border="1" 
                frameborder="no" 
                framespacing="0" 
                allowfullscreen="true" 
                style="height: 92.8vh; width: 100%; pointer-events: auto;"
            ></iframe>
        </div>
    `;

    const dockInstance = createDock({
        config: {
            position,
            size,
            icon,
            title
        },
        type,
        getInitialHtml: () => getHtml(),
        getUpdateHtml: () => getHtml(currentUrl),
        validateUrl: currentUrl,
        showMessage,
        onDockCreated: (dock) => {
            if (onDockCreated) {
                onDockCreated(dock);
            }

            // 向dock实例添加更新URL的方法
            dock.updateUrl = (newUrl: string) => {
                currentUrl = newUrl;
                dock.update();
            };
        },
        iframeSelector: `#${iframeId} iframe`
    });


    return dockInstance;
}

/**
 * 滴答清单链接拦截管理器
 */
export class DidaLinkInterceptor {
    private dock: any = null;
    private showMessage: (msg: string, timeout?: number, type?: string) => void;

    constructor(showMessage: (msg: string, timeout?: number, type?: string) => void) {
        this.showMessage = showMessage;
    }

    /**
     * 设置dock实例
     */
    setDock(dock: any) {
        this.dock = dock;
        this.setupLinkInterceptor();
    }

    private dock_more: any = null;
    setDock_more(dockInstance: any) {
        this.dock_more = dockInstance;
    }

    /**
     * 检查是否为滴答清单链接
     */
    private isDidaLink(url: string): boolean {
        return url.startsWith("https://dida365.com/webapp");
    }

    /**
     * 设置链接拦截器
     */
    private setupLinkInterceptor() {
        // 监听页面点击事件
        document.addEventListener('click', this.handleClick.bind(this), true);
    }

    /**
     * 处理点击事件
     */
    private handleClick(event: MouseEvent) {
        // 只处理左键单击（button为0），且不带Ctrl键
        if (event.button !== 0 || event.ctrlKey) {
            return;
        }

        const target = event.target as HTMLElement;

        // 检查是否是链接点击
        if (target.tagName === 'A' || target.closest('a')) {
            const linkElement = target.tagName === 'A' ? target as HTMLAnchorElement : target.closest('a') as HTMLAnchorElement;
            const href = linkElement?.href;

            if (href && this.isDidaLink(href)) {
                // 拦截滴答清单链接
                event.preventDefault();
                event.stopPropagation();

                this.openInDock(href);
                return;
            }
        }

        // 检查是否是data-href属性（思源笔记链接格式）
        if (target.dataset && target.dataset.href && this.isDidaLink(target.dataset.href)) {
            event.preventDefault();
            event.stopPropagation();

            this.openInDock(target.dataset.href);
            return;
        }

        // 检查父元素的data-href
        const parentWithHref = target.closest('[data-href]') as HTMLElement;
        if (parentWithHref && parentWithHref.dataset.href && this.isDidaLink(parentWithHref.dataset.href)) {
            event.preventDefault();
            event.stopPropagation();

            this.openInDock(parentWithHref.dataset.href);
            return;
        }
    }

    /**
     * 在dock中打开链接
     */
    private openInDock(url: string) {
        if (!this.dock) {
            this.showMessage("滴答清单dock未初始化", 3000, "error");
            return;
        }

        try {
            // 更新dock中的URL
            if (this.dock.updateUrl) {
                this.dock.updateUrl(url);
                // this.showMessage("已在侧边栏打开滴答清单", 2000, "info");
            } else {
                // 备用方案：直接更新iframe的src
                const iframe = this.dock.element?.querySelector('iframe');
                if (iframe) {
                    iframe.src = url;
                    this.showMessage("已在侧边栏打开滴答清单", 2000, "info");
                }
            }
            //TODO：判断是否模拟点击
            if (!this.dock_more) {
                this.showMessage("滴答清单dock_more未初始化", 3000, "error");
                return;
            }
            const isExpanded = this.dock_more.getState().isExpanded;
            console.log("当前dock状态:", isExpanded);
            if (!isExpanded) {
                // 模拟点击dock元素来展开
                const dockElement = document.querySelector('[data-type="siyuan-steve-toolsdida-dock"]') as HTMLElement;
                if (dockElement) {
                    console.log("找到dock元素，模拟点击展开");
                    dockElement.click();
                    // this.showMessage("已展开滴答清单侧边栏", 2000, "info");
                } else {
                    console.warn("未找到dock元素");
                    this.showMessage("无法展开滴答清单侧边栏", 3000, "warning");
                }
            }
        } catch (error) {
            console.error("更新滴答清单dock失败:", error);
            this.showMessage("打开滴答清单失败", 3000, "error");
        }
    }

    /**
     * 销毁拦截器
     */
    destroy() {
        document.removeEventListener('click', this.handleClick.bind(this), true);
    }
}
