import steveTools from "@/index";
import { VisualSqlUI } from "./sql/visual-sql-ui";
import { Dialog, Menu, openTab } from "siyuan";
import { updateBlock } from "@/api/api";

// Aggregate 模块
export class M_Aggregate {
    private plugin: steveTools;
    private _ui?: VisualSqlUI; // 嵌入式 UI 引用（仅生命周期持有）
    private _tabInstances = new Map<string, VisualSqlUI>(); // Tab 实例映射

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(_settingdata: any) {
        console.log("Aggregate 模块初始化");

        if (_settingdata["aggregate-enable-sql-visualizer"]) {
            const topBarElement = this.plugin.addTopBar({
                icon: "iconSQL",
                title: "SQL 可视化生成器",
                position: "right",
                callback: async () => {
                    const rect = topBarElement.getBoundingClientRect();
                    this.addMenu(rect, _settingdata);
                }
            });

            // 注册 SQL 可视化生成器为思源选项卡
            const aggregate = this;
            this.plugin.addTab({
                type: "visual-sql",
                async init() {
                    const id = new Date().getTime().toString();
                    this.element.innerHTML = `<div id="visual-sql-tab-${id}" style="width:100%;height:100%;overflow:auto;"></div>`;
                    const container = document.getElementById(`visual-sql-tab-${id}`)! as HTMLElement;
                    const previewCols = (_settingdata["aggregate-sql-preview-columns"] || "").trim();
                    const ui = new VisualSqlUI(container, {
                        previewColumns: previewCols,
                        noPreviewHeightLimit: true,
                        persistKey: `visual-sql-tab:${id}`,
                        onSqlChange: (_sql) => {
                            // 可在此触发查询/日志
                            // console.log("[Tab] 生成的 SQL:", _sql);
                        },
                    });
                    this.data.id = id;
                    aggregate._tabInstances.set(id, ui);
                    // 初次渲染后按当前视口计算布局
                    requestAnimationFrame(() => ui?.resize());
                },
                async destroy() {
                    const id = this.data.id as string;
                    // console.log("销毁 SQL 选项卡", id);
                    const ui = aggregate._tabInstances.get(id);
                    if (ui) {
                        (ui as any).destroy?.();
                        aggregate._tabInstances.delete(id);
                    }
                },
                resize() {
                    const id = this.data.id as string;
                    const ui = aggregate._tabInstances.get(id);
                    if (ui) {
                        ui.resize();
                    }
                },
            });
        }
        this.plugin.protyleSlash = [
            {
                filter: ["SQL", "sql", "查询", "query"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">SQL</span><span class="b3-list-item__meta"></span></div>`,
                id: "insertCardLink",
                callback: async (_protyle,nodeElement) => {
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
                    const previewCols = (_settingdata["aggregate-sql-preview-columns"] || "").trim();
                    // 在 Slash 面板中挂载 UI，并增加“插入代码块”按钮
                    const ui = new VisualSqlUI(container, {
                        previewColumns: previewCols,
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
                            /* noop: slash 模式无需回写 */
                        },
                        persistKey: "visual-sql-slash",
                    });
                    // 初次渲染后按当前视口计算布局
                    requestAnimationFrame(() => ui?.resize());
                },
            },
        ];
        
    }



    mountUI(container: HTMLElement, previewColumns?: string) {
        this._ui = new VisualSqlUI(container, {
            previewColumns,
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
        // 清理选项卡持有的实例
        if (this._tabInstances.size) {
            this._tabInstances.forEach((ui) => (ui as any).destroy?.());
            this._tabInstances.clear();
        }
    }

    private addMenu(rect: DOMRect, _settingdata: any) {
        const menu = new Menu("topBarSQL", () => {});
        menu.addItem({
            icon: "iconSQL",
            label: "页签模式",
            click: async () => {
                await openTab({
                    app: (window as any).siyuan.ws.app,
                    custom: { icon: "iconSQL", title: "SQL 视图", id: this.plugin.name + "visual-sql", data: { id: null } },
                    keepCursor: false,
                });
            }
        });
        menu.addItem({
            icon: "iconSQL",
            label: "弹窗模式",
            click: async () => {
                const previewCols = (_settingdata["aggregate-sql-preview-columns"] || "").trim();
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
                this.mountUI(document.getElementById('visual-sql-container')!, previewCols);
                requestAnimationFrame(() => this._ui?.resize());
            }
        });
        menu.open({ x: rect.right, y: rect.bottom, isLeft: true });
    }
}