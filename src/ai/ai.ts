import steveTools from "@/index";
// import * as api from "@/api"
import { showMessage } from "siyuan";
import * as ic from "@/icon"
declare const siyuan: any;
let resizeObserver: ResizeObserver | null = null;
let resizeTimeout: number = 0;
let settingdata
let M_plugin
export class M_ai {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
        M_plugin = plugin;
    }

    async init(settingdata) {
        this.plugin.addIcons(`
            <symbol id="iconSTai" viewBox="0 0 900 900">
               ${ic.steveTools_ai}
            </symbol>  
                `);
        settingdata = settingdata;
        console.log("ai模块初始化");
        // console.log(this.plugin);
        this.plugin.addDock({
            config: {
                position: "RightTop",
                size: { width: 250, height: 0 },
                icon: "iconSTai",
                title: "ai",
            },
            data: null,
            type: "ai-dock",
            update() {
                this.element.innerHTML = `
                <div id="ai-dock" class="alist-dock-container"  >
                <iframe 
                allow="clipboard-read; clipboard-write"
                sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals allow-popups" 
                src="${settingdata["ai-url"]}" 
                data-src="" 
                border="1" 
                frameborder="no" 
                framespacing="0" 
                allowfullscreen="true" 
                style="height: 100% ; width: 100%;  pointer-events: auto;"
                >
                </iframe>
                </div>
                `;
                const targetElement = this.element.querySelector('#ai-dock iframe');


                if (targetElement) {
                    resizeObserver = new ResizeObserver(() => {
                        (targetElement as HTMLElement).style.pointerEvents = 'none';

                        clearTimeout(resizeTimeout);
                        resizeTimeout = window.setTimeout(() => {
                            (targetElement as HTMLElement).style.pointerEvents = 'auto';
                        }, 300); // 300毫秒后恢复
                    });

                    resizeObserver.observe(targetElement);
                }

            },
            init: (dock) => {
                // this.aidock = dock;//将dock赋值给全局变量，以便在其它地方进行后续操作

                if (settingdata["ai-url"] == "") {
                    showMessage("请先配置ai网址...", -1, "error");
                }
                dock.element.innerHTML = `
                <div id="ai-dock" class="ai-dock-container"  >
                <iframe 
                allow="clipboard-read; clipboard-write"
                sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals allow-popups" 
                src="${settingdata["ai-url"]}" 
                data-src="" 
                border="1" 
                frameborder="no" 
                framespacing="0" 
                allowfullscreen="true" 
                style="height: 99vh ; width: 100%;  pointer-events: auto;"
                >
                </iframe>
                </div>
                `;
                const targetElement = dock.element.querySelector('#ai-dock iframe');


                if (targetElement) {
                    resizeObserver = new ResizeObserver(() => {
                        (targetElement as HTMLElement).style.pointerEvents = 'none';

                        clearTimeout(resizeTimeout);
                        resizeTimeout = window.setTimeout(() => {
                            (targetElement as HTMLElement).style.pointerEvents = 'auto';
                        }, 300); // 300毫秒后恢复
                    });

                    resizeObserver.observe(targetElement);
                }

            },
            destroy() {
                console.log("destroy dock:", "ai-dock");
                // 断开 ResizeObserver
                if (resizeObserver) {
                    resizeObserver.disconnect();
                    resizeObserver = null;
                }
                // 清除定时器
                clearTimeout(resizeTimeout);
            }
        });

        console.log("ai模块初始化完成");

    }
}

