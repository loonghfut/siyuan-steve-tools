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
        pointerEventsDelay = 300
    } = options;

    const createIframeHTML = (containerClass: string, url: string, style: string) => {
        return `
        <div id="ai-dock" class="${containerClass}">
        <iframe 
        allow="clipboard-read; clipboard-write"
        sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals allow-popups" 
        src="${url}" 
        data-src="" 
        border="1" 
        frameborder="no" 
        framespacing="0" 
        allowfullscreen="true" 
        style="${style}"
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
                "height: 100% ; width: 100%;  pointer-events: auto;"
            );
            const targetElement = this.element.querySelector('#ai-dock iframe');
            setupResizeObserver(targetElement);
        },
        init: (dock) => {
            if (url === "") {
                showMessage(emptyUrlMessage, -1, "error");
            }
            dock.element.innerHTML = createIframeHTML(containerClass, url, iframeStyle);
            const targetElement = dock.element.querySelector('#ai-dock iframe');
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