import steveTools from "@/index";
import { VisualSqlUI } from "./sql/visual-sql-ui";
import { Dialog } from "siyuan";
import { insertBlock, updateBlock } from "@/api/api";

// Aggregate 模块
export class M_Aggregate {
    private plugin: steveTools;
    private _ui?: VisualSqlUI; // 嵌入式 UI 引用（仅生命周期持有）

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(_settingdata: any) {
        console.log("Aggregate 模块初始化");

        if (_settingdata["aggregate-enable-sql-visualizer"]) {
            this.plugin.addTopBar({
                icon: "iconSQL",
                title: "SQL 可视化生成器",
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
        this.plugin.protyleSlash = [
            {
                filter: ["SQL", "sql", "查询", "query"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">SQL</span><span class="b3-list-item__meta"></span></div>`,
                id: "insertCardLink",
                callback: async (protyle,nodeElement) => {
                    let openedSQL = '';
                    // 打开 SQL 可视化生成器面板
                    const dlg = new Dialog({
                        title: "SQL 可视化生成器",
                        content: `<div id="visual-sql-container-slash" style="width:100%;max-height:70vh;overflow:auto;"></div>`,
                        width: '70%',
                        height: 'auto',
                        disableClose: false,
                        hideCloseIcon: false,
                        resizeCallback: () => {
                            ui?.resize();
                        },
                        destroyCallback: () => {

                        }
                    });

                    const container = document.getElementById('visual-sql-container-slash')!;
                    // 在 Slash 面板中挂载 UI，并增加“插入代码块”按钮
                    const ui = new VisualSqlUI(container, {
                        buttons: [
                            {
                                label: '插入SQL',
                                title: '插入生成的 SQL',
                                variant: 'primary',
                                onClick: async ({ getSQL }) => {
                                    const sql = (getSQL() || '').trim();
                                    if (!sql) {return;}
                                    try {
                                        console.log("nodeElement",nodeElement);
                                        const blockID = nodeElement.getAttribute('data-node-id');
                                        updateBlock("markdown",`{{${sql}}}`,blockID);
                                    } finally {
                                        dlg.destroy();
                                    }
                                }
                            }
                        ],
                        onSqlChange: (_sql) => {
                            openedSQL = _sql;
                        },
                        persistKey: "visual-sql-slash",
                    });
                    // 初次渲染后按当前视口计算布局
                    requestAnimationFrame(() => ui?.resize());
                },
            },
        ];
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