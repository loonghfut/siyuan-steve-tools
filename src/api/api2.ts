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


interface WebviewExtraOptions {
    enableButtons?: boolean;               // 是否启用顶部悬浮按钮 (默认 true)
    buttonTexts?: {                        // 按钮文字自定义
        copy?: string;                     // 复制(插入)按钮文字
        refresh?: string;                  // 刷新按钮文字
        dev?: string;                      // 开发者工具按钮文字 (仅当 showDevButton=true 时显示)
    };
    showDevButton?: boolean;              // 是否显示打开 DevTools 按钮 (默认 false)
    hoverThreshold?: number;               // 显示按钮时的顶部阈值 (默认 60)
    hoverHideDelay?: number;               // 鼠标离开后隐藏延迟 (默认 500ms)
    hideCSS?: string | string[];           // 需要默认注入用于隐藏的 CSS (默认 .open-wps-button 隐藏)
    injectCSS?: string | string[];         // 额外注入的 CSS 片段
    injectJS?: string | string[];          // 额外注入的 JS 片段 (字符串形式，会直接 executeJavaScript)
    disableDefaultHideCSS?: boolean;       // 是否禁用默认 hideCSS (默认 false)
    userAgent?: string;                    // 覆盖 userAgent (默认移动 UA)
    onCopy?: (ctx: { webview: any; url: string }) => Promise<void> | void;       // 自定义复制逻辑
    onRefresh?: (ctx: { webview: any }) => Promise<void> | void;                 // 自定义刷新逻辑
    onDevTools?: (ctx: { webview: any }) => Promise<void> | void;                // 自定义打开 DevTools 逻辑
    buttons?: WebviewButtonConfig[];       // 自定义按钮集合（完全自定义覆盖默认按钮）
    onRoamingIntercept?: (data: { kind: string; url: string; body: string }) => void; // 监听 /api/v3/roaming 拦截数据回调
    roamingTransportMode?: 'console' | 'poll'; // webview 与宿主数据传输模式，默认 console
    initRun?: () => void;                 // 初始化运行函数
}
interface WebviewButtonConfig {
    id?: string;                           // 按钮 id，不含容器前缀；最终实际 id = `${containerClass}-btn-${id}`
    text: string;                          // 按钮显示文本（可含 HTML，注意安全）
    title?: string;                        // 鼠标悬浮标题
    builtInAction?: 'copy' | 'refresh' | 'dev';  // 复用内置逻辑
    onClick?: (ctx: { webview: any; getCurrentUrl: () => string }) => Promise<void> | void; // 自定义回调
    style?: string;                        // 行内样式
    className?: string;                    // 自定义类名
    show?: boolean;                        // 是否显示 (默认 true)
    order?: number;                        // 排序 (默认 0)
}
/**
 * 创建一个带有webview的dock
 * @param options dock配置选项
 */
export function createWebviewDock_for_wps(options: IframeDockOptions & WebviewExtraOptions) {
    // 扩展可选参数接口：按钮 / 注入逻辑配置
    // 合并 options 为扩展对象（保持向后兼容）
    const {
        plugin,
        config,
        type,
        url,
        emptyUrlMessage = "请先配置网址...",
        containerClass = "",
        iframeStyle = "height: 99vh ; width: 100%;  pointer-events: auto;",
        pointerEventsDelay = 300,
        zoom = 1, // 新增缩放比例，默认1
        // 新增参数（全部可选）
        enableButtons = true,
        buttonTexts = {},
        showDevButton = false,
        hoverThreshold = 60,
        hoverHideDelay = 500,
        hideCSS,
        injectCSS,
        injectJS,
        disableDefaultHideCSS = false,
        userAgent,
        onCopy,
        onRefresh,
        onDevTools,
        buttons,
        onRoamingIntercept,
        roamingTransportMode = 'console',
    } = options as IframeDockOptions & WebviewExtraOptions;

    const mobileUA = userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1";

    const finalButtonText = {
        copy: buttonTexts.copy ?? "复制",
        refresh: buttonTexts.refresh ?? "刷新",
        dev: buttonTexts.dev ?? "调试",
    };

    const createWebviewHTML = (containerClass: string, url: string, style: string, zoom: number) => {
        if (!enableButtons) {
            return `
            <div id="${containerClass}" class="${containerClass}" style="position: relative; height: 100%; width: 100%; overflow: hidden;">
                <webview 
                    src="${url}" 
                    style="${style}; zoom: ${zoom}; position: absolute; inset: 0; width: 100%; height: 100%;"
                    allowpopups
                    webpreferences="contextIsolation, nativeWindowOpen, javascript=yes"
                    useragent="${mobileUA}"
                ></webview>
            </div>`;
        }

        // 若用户未提供自定义按钮，则生成兼容旧逻辑的默认按钮
        let btnConfigs: WebviewButtonConfig[] = [];
        if (Array.isArray(buttons) && buttons.length > 0) {
            btnConfigs = buttons.filter(b => b.show !== false).slice();
        } else {
            btnConfigs.push({ id: 'copy', text: finalButtonText.copy, title: '复制当前页面链接', builtInAction: 'copy', order: 0 });
            btnConfigs.push({ id: 'refresh', text: finalButtonText.refresh, title: '刷新页面', builtInAction: 'refresh', order: 1 });
            if (showDevButton) {
                btnConfigs.push({ id: 'dev', text: finalButtonText.dev, title: '打开开发者工具', builtInAction: 'dev', order: 2 });
            }
        }
        btnConfigs.sort((a, b) => (a.order || 0) - (b.order || 0));

        const buttonBaseStyle = `padding: 6px 10px; background: rgba(255,255,255,0.95); border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; cursor: pointer; font-size: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.12);`;
        const buttonsHTML = btnConfigs.map(cfg => {
            const id = `${containerClass}-btn-${cfg.id || cfg.builtInAction || Math.random().toString(36).slice(2)}`;
            const styleAttr = (cfg.style ? buttonBaseStyle + cfg.style : buttonBaseStyle).replace(/"/g, '&quot;');
            return `<button id="${id}" data-built-in="${cfg.builtInAction || ''}" class="${cfg.className || ''}" title="${cfg.title || ''}" style="${styleAttr}">${cfg.text}</button>`;
        }).join('\n');

        return `
        <div id="${containerClass}" class="${containerClass}" style="position: relative; height: 100%; width: 100%; overflow: hidden;">
            <webview 
                src="${url}" 
                style="${style}; zoom: ${zoom}; position: absolute; inset: 0; width: 100%; height: 100%;"
                allowpopups
                webpreferences="contextIsolation, nativeWindowOpen, javascript=yes"
                useragent="${mobileUA}"
            ></webview>
            <div id="${containerClass}-btns" style="
                position: absolute; top: 8px; left: 50%; transform: translateX(-50%) translateY(-8px); z-index: 9999; display: flex; gap: 8px; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.18s ease, transform 0.18s ease;">
                ${buttonsHTML}
            </div>
        </div>`;
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
    const bindHoverButtons = (rootEl: HTMLElement | null, containerClass: string, threshold = hoverThreshold, hideDelay = hoverHideDelay) => {
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

        // 仅在 webview 上监听鼠标移动；若未找到 webview 则回退到全局监听（兼容）
        const webviewEl = rootEl.querySelector('webview') as HTMLElement | null;
        if (webviewEl) {
            webviewEl.addEventListener('mousemove', onWindowMove);
        } else {
            window.addEventListener('mousemove', onWindowMove);
        }
        // 按钮本身仍需监听 hover 以防鼠标移入按钮区域
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
        if (!enableButtons) return; // 直接跳过按钮逻辑
        if (!rootEl) return;
        // 在绑定前先清理旧的按钮监听（如果存在）
        if ((rootEl as any).__btnCleanup) {
            try { (rootEl as any).__btnCleanup(); } catch (e) { /* ignore */ }
            try { delete (rootEl as any).__btnCleanup; } catch (e) { /* ignore */ }
        }
        const webviewEl = rootEl.querySelector(`webview`) as any | null;
        const allBtnContainer = rootEl.querySelector(`#${containerClass}-btns`);
        if (!allBtnContainer) return;
        const allButtons = Array.from(allBtnContainer.querySelectorAll('button')) as HTMLButtonElement[];
        if (!allButtons.length) return;

        // 注入用的 CSS
        const defaultHideCss = `.open-wps-button { display: none !important; }`;
        const hideCssArray: string[] = [];
        if (!disableDefaultHideCSS) hideCssArray.push(defaultHideCss);
        if (hideCSS) hideCssArray.push(...(Array.isArray(hideCSS) ? hideCSS : [hideCSS]));
        const extraCssArray: string[] = injectCSS ? (Array.isArray(injectCSS) ? injectCSS : [injectCSS]) : [];
        const jsArray: string[] = injectJS ? (Array.isArray(injectJS) ? injectJS : [injectJS]) : [];

        // 注入函数：优先使用 webview.insertCSS，退回到 executeJavaScript 插入 <style>
        const performInjection = async () => {
            try {
                if (!webviewEl) return;
                const injectCssSnippets = [...hideCssArray, ...extraCssArray];
                for (const cssSnippet of injectCssSnippets) {
                    try {
                        if (typeof webviewEl.insertCSS === "function") {
                            await webviewEl.insertCSS(cssSnippet);
                        } else if (typeof webviewEl.executeJavaScript === "function") {
                            const code = `(function(){try{const s=document.createElement('style');s.textContent=${JSON.stringify(cssSnippet)};document.head.appendChild(s);}catch(e){} })();`;
                            await webviewEl.executeJavaScript(code);
                        } else if (webviewEl.contentWindow && webviewEl.contentWindow.postMessage) {
                            webviewEl.contentWindow.postMessage({ type: 'inject-css', css: cssSnippet }, '*');
                        }
                    } catch (cssErr) {
                        console.error("inject css failed snippet:", cssSnippet, cssErr);
                    }
                }
                for (const jsSnippet of jsArray) {
                    try {
                        // 简单移除 TS 断言 (as any) / (window as any) / (this as any) 以避免在纯 JS 环境下语法错误
                        let sanitized = jsSnippet;
                        try {
                            sanitized = sanitized
                                .replace(/\(window\s+as\s+any\)/g, 'window')
                                .replace(/\(this\s+as\s+any\)/g, 'this')
                                .replace(/\bas\s+any\b/g, '')
                                ;
                        } catch { /* ignore sanitize errors */ }
                        if (typeof webviewEl.executeJavaScript === "function") {
                            await webviewEl.executeJavaScript(sanitized);
                        } else if (webviewEl.contentWindow && webviewEl.contentWindow.postMessage) {
                            webviewEl.contentWindow.postMessage({ type: 'inject-js', code: sanitized }, '*');
                        }
                    } catch (jsErr) {
                        console.error("inject js failed snippet:", jsSnippet, jsErr);
                    }
                }
                // 注入对包含 /api/v3/roaming 的请求响应监听，打印并通过 console 传递 JSON
                const roamingMonitor = `
(() => {
    if (window.__roamingMonitorInstalled) return;
    window.__roamingMonitorInstalled = true;
    const TARGET_KEY = '/api/v3/roaming';
    window.__WPS_RoamingQueue = window.__WPS_RoamingQueue || [];
    window.__drainWpsRoaming = function() {
        const q = window.__WPS_RoamingQueue.slice();
        window.__WPS_RoamingQueue.length = 0;
        return q;
    };
    const MODE = '${roamingTransportMode}';
    const emit = (kind, url, body) => {
        try {
            if (!url || url.indexOf(TARGET_KEY) === -1) return;
            const fullBody = typeof body === 'string' ? body : (body + '');
            const obj = { kind, url, body: fullBody };
            window.__WPS_RoamingQueue.push(obj);
            if (MODE === 'console') {
                console.log('[WPS_Roaming]' + JSON.stringify(obj));
            }
        } catch (e) { /* swallow */ }
    };
    if (window.fetch) {
        const _fetch = window.fetch;
        window.fetch = async function(...args) {
            const res = await _fetch.apply(this, args);
            try {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                const clone = res.clone();
                clone.text().then(t => emit('fetch', url, t));
            } catch (e) { /* ignore */ }
            return res;
        };
    }
    try {
        const open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this.__roaming_url = url;
            return open.call(this, method, url, ...rest);
        };
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            this.addEventListener('load', function() {
                try { emit('xhr', this.__roaming_url, this.responseText); } catch (e) { /* ignore */ }
            });
            return send.call(this, body);
        };
    } catch (e) { /* ignore */ }
})();
`.trim();
                try {
                    if (typeof webviewEl.executeJavaScript === "function") {
                        await webviewEl.executeJavaScript(roamingMonitor);
                    } else if (webviewEl.contentWindow && webviewEl.contentWindow.postMessage) {
                        webviewEl.contentWindow.postMessage({ type: 'inject-js', code: roamingMonitor }, '*');
                    }
                } catch (e) {
                    console.error('inject roaming monitor failed', e);
                }
            } catch (err) {
                console.error("performInjection failed:", err);
            }
        };

        // 如果 webview 存在，绑定 dom-ready / did-finish-load 事件以确保注入发生在页面加载后
        let onDomReady: (() => void) | null = null;
        if (webviewEl) {
            onDomReady = () => {
                performInjection();
            };
            try {
                // Electron webview 使用 addEventListener 或 on 方法都可能存在
                if (typeof webviewEl.addEventListener === "function") {
                    //注入两次
                    webviewEl.addEventListener("dom-ready", onDomReady);
                    webviewEl.addEventListener("did-finish-load", onDomReady);
                    if (roamingTransportMode === 'console') {
                        const consoleHandler = (e: any) => {
                            try {
                                if (typeof e.message === 'string' && e.message.startsWith('[WPS_Roaming]')) {
                                    const jsonStr = e.message.substring('[WPS_Roaming]'.length);
                                    const obj = JSON.parse(jsonStr);
                                    // const obj = jsonStr;
                                    if (obj && obj.url) {
                                        // 回调（可选）
                                        // try { if (onRoamingIntercept) onRoamingIntercept(obj); } catch (cbErr) { /* ignore */ }
                                        // 始终宿主打印
                                        // try { console.log('[WPS_Roaming_Host]', obj.kind, obj.url, obj.body); } catch (logErr) { /* ignore */ }
                                        // console.log('[WPS]', obj.body);
                                        // 累加到 window.wpsdoc 并基于 link_id 去重
                                        try {
                                            const newItems = pickRoamingFields(obj.body) || [];
                                            const w: any = window as any;
                                            if (!Array.isArray(w.wpsdoc)) w.wpsdoc = [];
                                            if (newItems.length) {
                                                const existingIds = new Set<string>(w.wpsdoc.map((d: any) => d && d.link_id).filter(Boolean));
                                                for (const it of newItems) {
                                                    if (it && it.link_id && !existingIds.has(it.link_id)) {
                                                        w.wpsdoc.push(it);
                                                        existingIds.add(it.link_id);
                                                    }
                                                }
                                            }
                                            console.log('[WPS_Roaming_Host]', newItems);
                                        } catch(e) { /* ignore accumulate errors */ }
                                        
                                    }
                                }
                            } catch (err) { /* ignore */ }
                        };
                        webviewEl.addEventListener('console-message', consoleHandler);
                        (webviewEl as any).__roamingConsoleHandler = consoleHandler;
                    } else if (roamingTransportMode === 'poll') {
                        const poll = async () => {
                            try {
                                const arr = await webviewEl.executeJavaScript('window.__drainWpsRoaming ? window.__drainWpsRoaming() : []');
                                if (Array.isArray(arr) && arr.length) {
                                    for (const obj of arr) {
                                        try { if (onRoamingIntercept) onRoamingIntercept(obj); } catch (e) { }
                                        try { console.log('[WPS_Roaming_Host]', obj.kind, obj.url, obj.body); } catch (e) { }
                                    }
                                }
                            } catch (e) { /* ignore */ }
                        };
                        const timer = window.setInterval(poll, 1000);
                        (webviewEl as any).__roamingPollTimer = timer;
                    }
                } else if (typeof webviewEl.on === "function") {
                    webviewEl.on("dom-ready", onDomReady);
                    webviewEl.on("did-finish-load", onDomReady);
                } else {
                    // 尝试直接注入（若已经就绪）
                    performInjection();
                }
            } catch (e) {
                // 忽略事件绑定错误，尝试直接注入
                performInjection();
            }
        }

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
                if (onCopy) {
                    await onCopy({ webview: webviewEl, url: currentUrl });
                } else {
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
                }
            } catch (err) {
                console.error("copy url failed:", err);
                showMessage("复制失败", 2000, "error");
            }
        };

        const refreshHandler = async (e: Event) => {
            e.stopPropagation();
            try {
                if (!webviewEl) {
                    showMessage("未找到 webview", 2000, "error");
                    return;
                }
                if (onRefresh) {
                    await onRefresh({ webview: webviewEl });
                } else {
                    if (typeof webviewEl.reload === "function") {
                        webviewEl.reload();
                    } else if (typeof webviewEl.reloadIgnoringCache === "function") {
                        webviewEl.reloadIgnoringCache();
                    } else if (webviewEl.getAttribute) {
                        const src = webviewEl.getAttribute('src') || webviewEl.src || "";
                        if (src) webviewEl.setAttribute('src', src);
                    }
                    showMessage("已刷新", 1000, "info");
                }
            } catch (err) {
                console.error("refresh failed:", err);
                showMessage("刷新失败", 2000, "error");
            }
        };

        const devHandler = async (e: Event) => {
            e.stopPropagation();
            try {
                if (!webviewEl) {
                    showMessage("未找到 webview", 2000, "error");
                    return;
                }
                if (onDevTools) {
                    await onDevTools({ webview: webviewEl });
                } else {
                    // Electron webview 提供 openDevTools()
                    if (typeof webviewEl.openDevTools === "function") {
                        webviewEl.openDevTools();
                    } else if (webviewEl.getWebContents && typeof webviewEl.getWebContents === "function") {
                        try { webviewEl.getWebContents().openDevTools(); } catch (err) { throw err; }
                    } else {
                        showMessage("当前环境不支持直接打开开发者工具", 2000, "error");
                    }
                }
            } catch (err) {
                console.error("open devtools failed:", err);
                showMessage("打开开发者工具失败", 2000, "error");
            }
        };

        // 使用 onclick 覆盖绑定，避免重复 addEventListener 导致累积
        // 工具函数：获取当前 url
        const getCurrentUrl = (): string => {
            try {
                if (webviewEl) {
                    if (typeof webviewEl.getURL === 'function') return webviewEl.getURL();
                    if (webviewEl.getAttribute) return webviewEl.getAttribute('src') || '';
                    return webviewEl.src || '';
                }
            } catch { /* ignore */ }
            return '';
        };

        // 遍历按钮并根据内置动作或自定义回调绑定
        for (const button of allButtons) {
            const builtIn = button.getAttribute('data-built-in') as 'copy' | 'refresh' | 'dev' | '';
            button.onclick = null;
            if (builtIn === 'copy') {
                button.onclick = clickHandler;
            } else if (builtIn === 'refresh') {
                button.onclick = refreshHandler;
            } else if (builtIn === 'dev') {
                button.onclick = devHandler;
            } else {
                // 自定义按钮匹配用户传入配置
                const shortId = button.id.replace(`${containerClass}-btn-`, '');
                const cfg = (buttons || []).find(b => (b.id || b.builtInAction) === shortId);
                if (cfg && typeof cfg.onClick === 'function') {
                    button.onclick = async (e: Event) => {
                        e.stopPropagation();
                        try {
                            await cfg.onClick!({ webview: webviewEl, getCurrentUrl });
                        } catch (err) {
                            console.error('custom button click failed:', err);
                            showMessage('操作失败', 2000, 'error');
                        }
                    };
                }
            }
        }

        // 注册清理函数到 root，供后续替换 DOM 时调用
        (rootEl as any).__btnCleanup = () => {
            try { allButtons.forEach(b => (b.onclick = null)); } catch (e) { /* ignore */ }

            // 移除 webview 事件监听
            try {
                if (webviewEl && onDomReady) {
                    if (typeof webviewEl.removeEventListener === "function") {
                        webviewEl.removeEventListener("dom-ready", onDomReady);
                        webviewEl.removeEventListener("did-finish-load", onDomReady);
                        // 移除 roaming console 监听
                        try {
                            if ((webviewEl as any).__roamingConsoleHandler) {
                                webviewEl.removeEventListener('console-message', (webviewEl as any).__roamingConsoleHandler);
                                delete (webviewEl as any).__roamingConsoleHandler;
                            }
                            if ((webviewEl as any).__roamingPollTimer) {
                                window.clearInterval((webviewEl as any).__roamingPollTimer);
                                delete (webviewEl as any).__roamingPollTimer;
                            }
                        } catch (e) { /* ignore */ }
                    } else if (typeof webviewEl.off === "function") {
                        webviewEl.off("dom-ready", onDomReady);
                        webviewEl.off("did-finish-load", onDomReady);
                    }
                }
            } catch (e) { /* ignore */ }
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
                iframeStyle,
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
            options.initRun();
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



export function getCursorBlockId() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    let container = range.startContainer;

    // 如果 startContainer 是文本节点，则获取其父元素
    if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
    }

    // 确保 container 是一个元素节点
    if (!(container instanceof Element)) {
        return null;
    }

    const blockElement = container.closest('.protyle-wysiwyg [data-node-id]');

    if (blockElement) {
        // console.log(blockElement.getAttribute('data-node-id'));
        return blockElement.getAttribute('data-node-id');
    } else {
        return null;
    }
}




interface RoamingItem {
  link_id: string;
  link_url: string;
  name: string;
  file_type: string;
  file_src: string;
}

function normalizeToArray(input: any): any[] {
  if (Array.isArray(input)) return input;

  // 字符串：尝试 JSON 解析
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return normalizeToArray(parsed); // 递归再判
    } catch {
      return [];
    }
  }

  if (input && typeof input === 'object') {
    // 常见包裹字段
    const possibleKeys = ['data', 'list', 'items', 'records', 'result'];
    for (const k of possibleKeys) {
      if (Array.isArray((input as any)[k])) return (input as any)[k];
    }
    // 单对象当作一个元素
    return [input];
  }

  return [];
}

export function pickRoamingFields(raw: any): RoamingItem[] {
  const arr = normalizeToArray(raw);
  return arr.map(o => ({
    link_id: o?.link_id ?? '',
    link_url: o?.link_url ?? '',
    name: o?.name ?? '',
    file_type: o?.file_type ?? '',
    file_src: o?.file_src ?? '',
  }));
}
