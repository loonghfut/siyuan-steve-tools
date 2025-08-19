import { showMessage } from "siyuan";

let resizeObserver: ResizeObserver | null = null;
let resizeTimeout: number = 0;

interface DockConfig {
    position: string;
    size: { width: number; height: number };
    icon: string;
    title: string;
}

interface IframeDockOptions {
    plugin: any;
    config: DockConfig;
    type: string;
    url: string;
    emptyUrlMessage?: string;
    containerClass?: string;
    iframeStyle?: string;
    pointerEventsDelay?: number;
    zoom?: number; // 添加缩放比例
}

/**
 * 创建一个带有iframe的dock
 * @param options dock配置选项
 */
export function createIframeDock(options: IframeDockOptions) {
    const {
        plugin,
        config,
        type,
        url,
        emptyUrlMessage = "请先配置网址...",
        containerClass,
        iframeStyle = "height: 99vh ; width: 100%;  pointer-events: auto;",
        pointerEventsDelay = 300,
        zoom = 1 // 默认缩放比例为1
    } = options;

    const createIframeHTML = (containerClass: string, url: string, style: string, zoom: number) => {
        return `
        <div id="${containerClass}" class="${containerClass}">
        <iframe 
        allow="clipboard-read; clipboard-write"
        sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals allow-popups" 
        src="${url}" 
        data-src="" 
        border="1" 
        frameborder="no" 
        framespacing="0" 
        allowfullscreen="true" 
        style="${style}; zoom: ${zoom};"
        >
        </iframe>
        </div>
        `;
    };

    const setupResizeObserver = (targetElement: HTMLElement) => {
        if (targetElement) {
            resizeObserver = new ResizeObserver(() => {
                (targetElement as HTMLElement).style.pointerEvents = 'none';

                clearTimeout(resizeTimeout);
                resizeTimeout = window.setTimeout(() => {
                    (targetElement as HTMLElement).style.pointerEvents = 'auto';
                }, pointerEventsDelay);
            });

            resizeObserver.observe(targetElement);
        }
    };

    return plugin.addDock({
        config,
        data: null,
        type,
        update() {
            this.element.innerHTML = createIframeHTML(
                containerClass,
                url,
                "height: 100% ; width: 100%;  pointer-events: auto;",
                zoom
            );
            const targetElement = this.element.querySelector(`#${containerClass} iframe`);
            setupResizeObserver(targetElement);
        },
        init: (dock) => {
            if (url === "") {
                showMessage(emptyUrlMessage, -1, "error");
            }
            dock.element.innerHTML = createIframeHTML(containerClass, url, iframeStyle, zoom);
            const targetElement = dock.element.querySelector(`#${containerClass} iframe`);
            setupResizeObserver(targetElement);
        },
        destroy() {
            console.log("destroy dock:", type);
            // 断开 ResizeObserver
            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }
            // 清除定时器
            clearTimeout(resizeTimeout);
        }
    });
}



/**
 * 创建一个带有webview的dock
 * @param options dock配置选项
 */
export function createWebviewDock(options: IframeDockOptions) {
    const {
        plugin,
        config,
        type,
        url,
        emptyUrlMessage = "请先配置网址...",
        containerClass = "",
        iframeStyle = "height: 99vh ; width: 100%;  pointer-events: auto;",
        pointerEventsDelay = 300,
        zoom = 1 // 新增缩放比例，默认1
    } = options;
    const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1";

    const createWebviewHTML = (containerClass: string, url: string, style: string, zoom: number) => {
        // 容器相对定位，按钮组初始隐藏，通过 JS 在鼠标移到顶部时显示
        return `
        <div id="${containerClass}" class="${containerClass}" style="position: relative; height: 100%; width: 100%; overflow: hidden;">
            <webview 
                src="${url}" 
                style="${style}; zoom: ${zoom}; position: absolute; inset: 0; width: 100%; height: 100%;"
                allowpopups
                webpreferences="contextIsolation, nativeWindowOpen, javascript=yes"
                useragent="${mobileUA}"
            >
            </webview>

            <div id="${containerClass}-btns" style="
                position: absolute;
                top: 8px;
                left: 50%;
                transform: translateX(-50%) translateY(-8px);
                z-index: 9999;
                display: flex;
                gap: 8px;
                align-items: center;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.18s ease, transform 0.18s ease;
            ">
                <button id="${containerClass}-copy-btn" title="复制当前页面链接"
                    style="
                        padding: 6px 10px;
                        background: rgba(255,255,255,0.95);
                        border: 1px solid rgba(0,0,0,0.12);
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.12);
                    ">
                    插入
                </button>

                <button id="${containerClass}-refresh-btn" title="刷新页面"
                    style="
                        padding: 6px 10px;
                        background: rgba(255,255,255,0.95);
                        border: 1px solid rgba(0,0,0,0.12);
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.12);
                    ">
                    刷新
                </button>
            </div>
        </div>
        `;
    };

    const cleanupRoot = (rootEl: HTMLElement | null) => {
        if (!rootEl) return;
        try {
            // hover 清理
            if ((rootEl as any).__hoverCleanup) {
                try { (rootEl as any).__hoverCleanup(); } catch (e) { /* ignore */ }
                try { delete (rootEl as any).__hoverCleanup; } catch (e) { /* ignore */ }
            }
            // button 清理
            if ((rootEl as any).__btnCleanup) {
                try { (rootEl as any).__btnCleanup(); } catch (e) { /* ignore */ }
                try { delete (rootEl as any).__btnCleanup; } catch (e) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }
    };

    const setupResizeObserver = (targetElement: HTMLElement) => {
        if (!targetElement) return;
        // 先断开已有 observer，避免累积
        if (resizeObserver) {
            try { resizeObserver.disconnect(); } catch (e) { /* ignore */ }
            resizeObserver = null;
        }

        resizeObserver = new ResizeObserver(() => {
            (targetElement as HTMLElement).style.pointerEvents = 'none';

            clearTimeout(resizeTimeout);
            resizeTimeout = window.setTimeout(() => {
                (targetElement as HTMLElement).style.pointerEvents = 'auto';
            }, pointerEventsDelay);
        });

        resizeObserver.observe(targetElement);
    };

    // 当鼠标移到窗口顶部一定高度内时显示按钮（否则延迟隐藏）
    const bindHoverButtons = (rootEl: HTMLElement | null, containerClass: string, threshold = 60, hideDelay = 500) => {
        if (!rootEl) return;
        const btns = rootEl.querySelector(`#${containerClass}-btns`) as HTMLElement | null;
        if (!btns) return;

        let hideTimer: number | null = null;
        const clearHide = () => {
            if (hideTimer !== null) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
        };
        const show = () => {
            clearHide();
            btns.style.opacity = "1";
            btns.style.transform = "translateX(-50%) translateY(0)";
            btns.style.pointerEvents = "auto";
        };
        const hide = () => {
            clearHide();
            btns.style.opacity = "0";
            btns.style.transform = "translateX(-50%) translateY(-8px)";
            btns.style.pointerEvents = "none";
        };
        const scheduleHide = () => {
            clearHide();
            hideTimer = window.setTimeout(hide, hideDelay);
        };

        // 仅基于窗口顶部判断：clientY <= threshold 则显示，否则延迟隐藏
        const onWindowMove = (e: MouseEvent) => {
            if (e.clientY <= threshold) {
                show();
            } else {
                // 如果鼠标在按钮上也保持显示
                const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
                if (el && btns.contains(el)) {
                    show();
                } else {
                    scheduleHide();
                }
            }
        };

        const onBtnsEnter = () => {
            clearHide();
            show();
        };
        const onBtnsLeave = () => {
            scheduleHide();
        };

        // 监听全局鼠标移动（判断是否到达顶部）和按钮 hover
        window.addEventListener('mousemove', onWindowMove);
        btns.addEventListener('mouseenter', onBtnsEnter);
        btns.addEventListener('mouseleave', onBtnsLeave);

        // 初始隐藏
        hide();

        // 暴露清理方法，便于 destroy 时移除监听
        (rootEl as any).__hoverCleanup = () => {
            window.removeEventListener('mousemove', onWindowMove);
            try {
                btns.removeEventListener('mouseenter', onBtnsEnter);
                btns.removeEventListener('mouseleave', onBtnsLeave);
            } catch (e) { /* ignore */ }
            clearHide();
        };
    };

    const bindCopyButton = (rootEl: HTMLElement | null, containerClass: string) => {
        if (!rootEl) return;
        // 在绑定前先清理旧的按钮监听（如果存在）
        if ((rootEl as any).__btnCleanup) {
            try { (rootEl as any).__btnCleanup(); } catch (e) { /* ignore */ }
            try { delete (rootEl as any).__btnCleanup; } catch (e) { /* ignore */ }
        }

        const btn = rootEl.querySelector(`#${containerClass}-copy-btn`) as HTMLButtonElement | null;
        const refreshBtn = rootEl.querySelector(`#${containerClass}-refresh-btn`) as HTMLButtonElement | null;
        const webviewEl = rootEl.querySelector(`webview`) as any | null;
        if (!btn && !refreshBtn) return;

        const clickHandler = async (e: Event) => {
            e.stopPropagation();
            let currentUrl = "";
            try {
                if (webviewEl) {
                    if (typeof webviewEl.getURL === "function") {
                        currentUrl = webviewEl.getURL();
                    } else if (webviewEl.getAttribute) {
                        currentUrl = webviewEl.getAttribute("src") || "";
                    } else {
                        currentUrl = webviewEl.src || "";
                    }
                }
                if (!currentUrl) {
                    showMessage("无法获取当前链接", 2000, "error");
                    return;
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(currentUrl);
                } else {
                    const ta = document.createElement("textarea");
                    ta.value = currentUrl;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                }
                showMessage("已复制链接", 2000, "info");
            } catch (err) {
                console.error("copy url failed:", err);
                showMessage("复制失败", 2000, "error");
            }
        };

        const refreshHandler = (e: Event) => {
            e.stopPropagation();
            try {
                if (webviewEl) {
                    if (typeof webviewEl.reload === "function") {
                        webviewEl.reload();
                    } else if (typeof webviewEl.reloadIgnoringCache === "function") {
                        webviewEl.reloadIgnoringCache();
                    } else if (webviewEl.getAttribute) {
                        const src = webviewEl.getAttribute('src') || webviewEl.src || "";
                        if (src) webviewEl.setAttribute('src', src);
                    }
                    showMessage("已刷新", 1000, "info");
                } else {
                    showMessage("未找到 webview", 2000, "error");
                }
            } catch (err) {
                console.error("refresh failed:", err);
                showMessage("刷新失败", 2000, "error");
            }
        };

        // 使用 onclick 覆盖绑定，避免重复 addEventListener 导致累积
        if (btn) {
            btn.onclick = null;
            btn.onclick = clickHandler;
        }
        if (refreshBtn) {
            refreshBtn.onclick = null;
            refreshBtn.onclick = refreshHandler;
        }

        // 注册清理函数到 root，供后续替换 DOM 时调用
        (rootEl as any).__btnCleanup = () => {
            try { if (btn) btn.onclick = null; } catch (e) { /* ignore */ }
            try { if (refreshBtn) refreshBtn.onclick = null; } catch (e) { /* ignore */ }
        };

        // 绑定悬浮显示/隐藏逻辑（此函数会在 root 上放 __hoverCleanup）
        bindHoverButtons(rootEl, containerClass);
    };
    return plugin.addDock({
        config,
        data: null,
        type,
        update() {
            // 在覆盖 innerHTML 前先清理旧 root 上的事件/定时器
            const existing = this.element.querySelector(`#${containerClass}`) as HTMLElement | null;
            cleanupRoot(existing);

            this.element.innerHTML = createWebviewHTML(
                containerClass,
                url,
                "height: 100% ; width: 100%;  pointer-events: auto;",
                zoom
            );
            const targetElement = this.element.querySelector(`#${containerClass} webview`);
            setupResizeObserver(targetElement as HTMLElement);
            bindCopyButton(this.element, containerClass);
        },
        init: (dock) => {
            if (url === "") {
                showMessage(emptyUrlMessage, -1, "error");
            }
            // 在覆盖 innerHTML 前先清理旧 root（防止重复绑定）
            const existing = dock.element.querySelector(`#${containerClass}`) as HTMLElement | null;
            cleanupRoot(existing);

            dock.element.innerHTML = createWebviewHTML(containerClass, url, iframeStyle, zoom);
            const targetElement = dock.element.querySelector(`#${containerClass} webview`);
            setupResizeObserver(targetElement as HTMLElement);
            bindCopyButton(dock.element, containerClass);
        },
        destroy() {
            console.log("destroy dock:", type);
            // 清除 hover / btn 监听
            try {
                const root = this.element.querySelector(`#${containerClass}`) as HTMLElement | null;
                cleanupRoot(root);
            } catch (e) { /* ignore */ }

            if (resizeObserver) {
                try { resizeObserver.disconnect(); } catch (e) { /* ignore */ }
                resizeObserver = null;
            }
            clearTimeout(resizeTimeout);
        }
    });
}