import steveTools from "@/index";
import { VisualSqlUI } from "./sql/visual-sql-ui";
import { Dialog } from "siyuan";

// Aggregate 模块
export class M_Aggregate {
    private plugin: steveTools;
    private _ui?: VisualSqlUI; // 嵌入式 UI 引用（仅生命周期持有）

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(_settingdata: any) {
        console.log("Aggregate 模块初始化");
        // 你可在外部把一个容器元素传进来，然后调用 mountUI(container)
        // 或者在此处由插件自身创建挂载点并注入到面板中
        this.plugin.addTopBar({
            icon: "iconSTwps_data2",
            title: "ces1",
            position: "right",
            callback: async () => {
                new Dialog({
                    title: "SQL 可视化生成器",
                    content: `<div id="visual-sql-container" style="width:100%;max-height:80vh;overflow:auto;"></div>`,
                    width: '70%',
                    height: 'auto',
                    disableClose: false,
                    hideCloseIcon: true,
                    resizeCallback: () => {
                        this._ui?.resize();
                    },
                });
                this.mountUI(document.getElementById('visual-sql-container')!);
                // 初次渲染后按当前视口计算布局
                requestAnimationFrame(() => this._ui?.resize());
            }
        });
    }



    mountUI(container: HTMLElement) {
        this._ui = new VisualSqlUI(container, {
            onSqlChange: (_sql) => {
                // 可同步 SQL 或发起查询
                console.log("生成的 SQL:", _sql);
            }
        });
    }

    onunload() {
        console.log("M_Aggregate unloaded");
        // 如需销毁 UI，可在此处清理，并读取 _ui 以满足 noUnusedLocals
        if (this._ui) {
            // 例如：清空容器（如有需要）
            // this._ui.destroy?.(); // 若未来加入销毁方法
            this._ui = undefined;
        }
    }
}