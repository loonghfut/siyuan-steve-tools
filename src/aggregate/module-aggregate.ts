import steveTools from "@/index";
import { VisualSqlUI } from "./sql/visual-sql-ui";
import { VisualEchartsUI } from "./echarts/visual-echarts-ui";
import { Dialog, Menu, openTab } from "siyuan";
import { updateBlock, insertBlock } from "@/api/api";
import { PluginConfig } from "@/savedata";

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
                    // 使用插件级配置存储筛选预设
                    const conf = new PluginConfig(aggregate.plugin.name, 'aggregate-sql');
                    await conf.load();
                    const ui = new VisualSqlUI(container, {
                        previewColumns: previewCols,
                        previewColMaxWidth: Number(_settingdata["aggregate-sql-preview-col-max-width"]) || 480,
                        noPreviewHeightLimit: true,
                        showPresetControls: true,
                        segmentEmbed: {
                            start: String(_settingdata["aggregate-segment-embed-start"] || ""),
                            end: String(_settingdata["aggregate-segment-embed-end"] || ""),
                            intervalDays: Number(_settingdata["aggregate-segment-embed-interval-days"]) || 7,
                        },
                        buttons: [
                            {
                                label: '转到 ECharts',
                                title: '用当前 SQL 打开 ECharts 配置',
                                placement: 'before-reset',
                                onClick: async ({ getSQL }) => {
                                    const sql = (getSQL() || '').trim();
                                    new Dialog({
                                        title: 'ECharts 可视化生成器',
                                        content: `<div id="visual-echarts-from-sql-tab-${id}" style="width:100%;height:100%;max-height:80vh;overflow:auto;"></div>`,
                                        width: '70%',
                                        height: 'auto',
                                        disableClose: false,
                                        hideCloseIcon: true,
                                    });
                                    const c2 = document.getElementById(`visual-echarts-from-sql-tab-${id}`)! as HTMLElement;
                                    const eui = new VisualEchartsUI(c2, {
                                        persistKey: `visual-echarts-from-sql-tab:${id}`,
                                        initialSQL: sql,
                                        loadSqlPresets: () => (conf.get('presets') || {}),
                                        onGotoSQL: () => {
                                            // 打开弹窗版 SQL 生成器（共享同一套 PluginConfig 预设）
                                            new Dialog({
                                                title: 'SQL 可视化生成器',
                                                content: `<div id="visual-sql-from-echarts-tab-${id}" style="width:100%;max-height:80vh;overflow:auto;"></div>`,
                                                width: '70%', height: 'auto', disableClose: false, hideCloseIcon: true,
                                            });
                                            const cont = document.getElementById(`visual-sql-from-echarts-tab-${id}`)!;
                                            new VisualSqlUI(cont, {
                                                previewColumns: (_settingdata["aggregate-sql-preview-columns"] || '').trim(),
                                                previewColMaxWidth: Number(_settingdata["aggregate-sql-preview-col-max-width"]) || 480,
                                                loadPresets: () => (conf.get('presets') || {}),
                                                savePresets: async (obj) => { conf.set('presets', obj); await conf.save(); },
                                                showPresetControls: true,
                                            });
                                        }
                                    });
                                    requestAnimationFrame(() => eui.resize());
                                }
                            }
                        ],
                        // 使用持久化配置替代 localStorage
                        loadPresets: () => (conf.get('presets') || {}),
                        savePresets: async (obj) => { conf.set('presets', obj); await conf.save(); },
                        presetsKey: 'siyuan-steve-tools:visual-sql-presets',
                        persistKey: `visual-sql-tab`,
                        onSqlChange: (_sql) => {
                            // 可在此触发查询/日志
                            // console.log("[Tab] 生成的 SQL:", _sql);
                        },
                    });
                    this.data.id = id;
                    aggregate._tabInstances.set(id, ui);
                    // 顶部 Tabbar 按钮已移除，统一在 actions 区提供“转到 ECharts”
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
            this.plugin.addTab({
                type: "visual-echarts",
                async init() {
                    const id = new Date().getTime().toString();
                    this.element.innerHTML = `<div id="visual-echarts-tab-${id}" style="width:100%;height:100%;overflow:auto;"></div>`;
                    const container = document.getElementById(`visual-echarts-tab-${id}`)! as HTMLElement;
                    const conf = new PluginConfig(aggregate.plugin.name, 'aggregate-sql');
                    await conf.load();
                    const ui = new VisualEchartsUI(container, {
                        persistKey: `visual-echarts-tab`,
                        loadSqlPresets: () => (conf.get('presets') || {}),
                        onGotoSQL: () => {
                            // 打开弹窗版 SQL 生成器
                            new Dialog({
                                title: 'SQL 可视化生成器',
                                content: `<div id="visual-sql-from-echarts-tab-open-${id}" style="width:100%;max-height:80vh;overflow:auto;"></div>`,
                                width: '70%', height: 'auto', disableClose: false, hideCloseIcon: true,
                            });
                            const cont = document.getElementById(`visual-sql-from-echarts-tab-open-${id}`)!;
                            new VisualSqlUI(cont, {
                                previewColumns: (_settingdata["aggregate-sql-preview-columns"] || '').trim(),
                                previewColMaxWidth: Number(_settingdata["aggregate-sql-preview-col-max-width"]) || 480,
                                loadPresets: () => (conf.get('presets') || {}),
                                savePresets: async (obj) => { conf.set('presets', obj); await conf.save(); },
                                showPresetControls: true,
                            });
                        }
                    });
                },
                async destroy() {
                    // 目前无显式销毁
                },
            });
        }
        this.plugin.protyleSlash = [
            {
                filter: ["SQL", "sql", "查询", "query", "stsql"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">ST_SQL</span><span class="b3-list-item__meta"></span></div>`,
                id: "insertCardLink",
                callback: async (_protyle, nodeElement) => {
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
                        previewColMaxWidth: Number(_settingdata["aggregate-sql-preview-col-max-width"]) || 480,
                        segmentEmbed: {
                            start: String(_settingdata["aggregate-segment-embed-start"] || ""),
                            end: String(_settingdata["aggregate-segment-embed-end"] || ""),
                            intervalDays: Number(_settingdata["aggregate-segment-embed-interval-days"]) || 7,
                        },
                        buttons: [
                            {
                                label: '插入SQL',
                                title: '插入生成的 SQL',
                                variant: 'primary',
                                onClick: async ({ getSQL }) => {
                                    const sql = (getSQL() || '').trim();
                                    if (!sql) { return; }
                                    try {
                                        console.log("nodeElement", nodeElement);
                                        const blockID = nodeElement.getAttribute('data-node-id');
                                        updateBlock("markdown", `{{${sql}}}`, blockID);
                                    } finally {
                                        dlg.destroy();
                                    }
                                }
                            },
                            {
                                label: '转到 ECharts',
                                title: '用当前 SQL 打开 ECharts 配置',
                                placement: 'before-reset',
                                onClick: async ({ getSQL }) => {
                                    const sql = (getSQL() || '').trim();
                                    new Dialog({
                                        title: 'ECharts 可视化生成器',
                                        content: `<div id="visual-echarts-from-sql" style="width:100%;max-height:70vh;overflow:auto;"></div>`,
                                        width: '70%',
                                        height: 'auto',
                                        disableClose: false,
                                        hideCloseIcon: false,
                                    });
                                    const c2 = document.getElementById('visual-echarts-from-sql')! as HTMLElement;
                                    const conf2 = new PluginConfig(this.plugin.name, 'aggregate-sql');
                                    await conf2.load();
                                    const eui = new VisualEchartsUI(c2, {
                                        persistKey: 'siyuan-steve-tools:visual-echarts-from-sql',
                                        initialSQL: sql,
                                        loadSqlPresets: () => (conf2.get('presets') || {}),
                                        onGotoSQL: () => {
                                            // 在 Slash 场景下，直接弹 SQL 生成器
                                            new Dialog({
                                                title: 'SQL 可视化生成器',
                                                content: `<div id="visual-sql-from-echarts" style="width:100%;max-height:70vh;overflow:auto;"></div>`,
                                                width: '70%', height: 'auto', disableClose: false, hideCloseIcon: false,
                                            });
                                            const cont = document.getElementById('visual-sql-from-echarts')!;
                                            const conf = new PluginConfig(this.plugin.name, 'aggregate-sql');
                                            conf.load().then(() => {
                                                new VisualSqlUI(cont, {
                                                    previewColumns: (_settingdata["aggregate-sql-preview-columns"] || '').trim(),
                                                    previewColMaxWidth: Number(_settingdata["aggregate-sql-preview-col-max-width"]) || 480,
                                                    loadPresets: () => (conf.get('presets') || {}),
                                                    savePresets: async (obj) => { conf.set('presets', obj); await conf.save(); },
                                                    showPresetControls: true,
                                                });
                                            });
                                        }
                                    });
                                    requestAnimationFrame(() => eui.resize());
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
            // ECharts 可视化代码生成器（Slash 入口）
            {
                filter: ["ECharts", "echarts", "图表", "chart", "stcharts"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">ST_Charts</span><span class="b3-list-item__meta"></span></div>`,
                id: "insertEchartsCode",
                callback: async (_protyle, nodeElement) => {
                    const dlg = new Dialog({
                        title: "ECharts 可视化生成器",
                        content: `<div id="visual-echarts-container-slash" style="width:100%;max-height:70vh;overflow:auto;"></div>`,
                        width: '70%',
                        height: 'auto',
                        disableClose: false,
                        hideCloseIcon: false,
                        resizeCallback: () => { ui?.resize(); },
                    });
                    const container = document.getElementById('visual-echarts-container-slash')!;
                    const conf3 = new PluginConfig(this.plugin.name, 'aggregate-sql');
                    await conf3.load();
                    const ui = new VisualEchartsUI(container, {
                        persistKey: 'siyuan-steve-tools:visual-echarts-slash',
                        loadSqlPresets: () => (conf3.get('presets') || {})
                    });
                    // 追加“插入代码块”按钮
                    const bar = document.createElement('div');
                    bar.style.cssText = 'display:flex; gap:8px; padding:6px 0;';
                    const btn = document.createElement('button');
                    btn.className = 'b3-button';
                    btn.textContent = '插入ECharts IIFE';
                    btn.addEventListener('click', async () => {
                        const code = (container.querySelector('[data-output]') as HTMLElement)?.textContent || '';
                        const curId = nodeElement.getAttribute('data-node-id');
                        const fenced = '```echarts\n' + code + '\n```';
                        await updateBlock('markdown', fenced, curId);
                        dlg.destroy();
                    });
                    bar.appendChild(btn);
                    container.parentElement?.insertBefore(bar, container);
                    requestAnimationFrame(() => ui?.resize());
                }
            }
        ];

    }



    mountUI(container: HTMLElement, previewColumns?: string, settings?: any) {
        this._ui = new VisualSqlUI(container, {
            previewColumns,
            previewColMaxWidth: Number(settings?.["aggregate-sql-preview-col-max-width"]) || 480,
            segmentEmbed: {
                start: String(settings?.["aggregate-segment-embed-start"] || ""),
                end: String(settings?.["aggregate-segment-embed-end"] || ""),
                intervalDays: Number(settings?.["aggregate-segment-embed-interval-days"]) || 7,
            },
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
        const menu = new Menu("topBarSQL", () => { });
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
                const container = document.getElementById('visual-sql-container')!;
                const ui = new VisualSqlUI(container, {
                    previewColumns: previewCols,
                    previewColMaxWidth: Number(_settingdata["aggregate-sql-preview-col-max-width"]) || 480,
                    segmentEmbed: {
                        start: String(_settingdata["aggregate-segment-embed-start"] || ""),
                        end: String(_settingdata["aggregate-segment-embed-end"] || ""),
                        intervalDays: Number(_settingdata["aggregate-segment-embed-interval-days"]) || 7,
                    },
                    buttons: [
                        {
                            label: '转到 ECharts',
                            title: '用当前 SQL 打开 ECharts 配置',
                            placement: 'before-reset',
                            onClick: async ({ getSQL }) => {
                                const sql = (getSQL() || '').trim();
                                new Dialog({
                                    title: 'ECharts 可视化生成器',
                                    content: `<div id="visual-echarts-from-sql-modal" style="width:100%;max-height:80vh;overflow:auto;"></div>`,
                                    width: '70%',
                                    height: 'auto',
                                    disableClose: false,
                                    hideCloseIcon: true,
                                });
                                const c2 = document.getElementById('visual-echarts-from-sql-modal')! as HTMLElement;
                                const conf = new PluginConfig(this.plugin.name, 'aggregate-sql');
                                await conf.load();
                                const eui = new VisualEchartsUI(c2, {
                                    persistKey: 'siyuan-steve-tools:visual-echarts-from-sql-modal',
                                    initialSQL: sql,
                                    loadSqlPresets: () => (conf.get('presets') || {}),
                                    onGotoSQL: () => {
                                        new Dialog({
                                            title: 'SQL 可视化生成器',
                                            content: `<div id="visual-sql-from-echarts-modal" style="width:100%;max-height:80vh;overflow:auto;"></div>`,
                                            width: '70%', height: 'auto', disableClose: false, hideCloseIcon: true,
                                        });
                                        const cont = document.getElementById('visual-sql-from-echarts-modal')!;
                                        const conf4 = new PluginConfig(this.plugin.name, 'aggregate-sql');
                                        conf4.load().then(() => {
                                            new VisualSqlUI(cont, {
                                                previewColumns: (_settingdata["aggregate-sql-preview-columns"] || '').trim(),
                                                previewColMaxWidth: Number(_settingdata["aggregate-sql-preview-col-max-width"]) || 480,
                                                loadPresets: () => (conf4.get('presets') || {}),
                                                savePresets: async (obj) => { conf4.set('presets', obj); await conf4.save(); },
                                                showPresetControls: true,
                                            });
                                        });
                                    }
                                });
                                requestAnimationFrame(() => eui.resize());
                            }
                        }
                    ]
                });
                this._ui = ui;
                requestAnimationFrame(() => this._ui?.resize());
            }
        });
        // 若启用图表功能，额外提供 ECharts 按钮与 Tab
        if (_settingdata["chart-enable"]) {
            menu.addSeparator();
            menu.addItem({
                icon: "iconLayoutBottom", // 使用现有图标名或后续替换
                label: "图表页签",
                click: async () => {
                    await openTab({
                        app: (window as any).siyuan.ws.app,
                        custom: { icon: "iconLayoutBottom", title: "ECharts 视图", id: this.plugin.name + "visual-echarts", data: { id: null } },
                        keepCursor: false,
                    });
                }
            });
            menu.addItem({
                icon: "iconLayoutBottom",
                label: "图表弹窗",
                click: async () => {
                    new Dialog({
                        title: "ECharts 可视化生成器",
                        content: `<div id="visual-echarts-container" style="width:100%;max-height:80vh;overflow:auto;"></div>`,
                        width: '70%',
                        height: 'auto',
                        disableClose: false,
                        hideCloseIcon: true,
                        resizeCallback: () => { },
                    });
                    const container = document.getElementById('visual-echarts-container')!;
                    const conf = new PluginConfig(this.plugin.name, 'aggregate-sql');
                    await conf.load();
                    const ui = new VisualEchartsUI(container, {
                        persistKey: 'siyuan-steve-tools:visual-echarts-modal',
                        loadSqlPresets: () => (conf.get('presets') || {}),
                        onGotoSQL: () => {
                            new Dialog({
                                title: 'SQL 可视化生成器',
                                content: `<div id="visual-sql-from-echarts-standalone" style="width:100%;max-height:80vh;overflow:auto;"></div>`,
                                width: '70%', height: 'auto', disableClose: false, hideCloseIcon: true,
                            });
                            const cont = document.getElementById('visual-sql-from-echarts-standalone')!;
                            const conf5 = new PluginConfig(this.plugin.name, 'aggregate-sql');
                            conf5.load().then(() => {
                                new VisualSqlUI(cont, {
                                    previewColumns: (_settingdata["aggregate-sql-preview-columns"] || '').trim(),
                                    previewColMaxWidth: Number(_settingdata["aggregate-sql-preview-col-max-width"]) || 480,
                                    loadPresets: () => (conf5.get('presets') || {}),
                                    savePresets: async (obj) => { conf5.set('presets', obj); await conf5.save(); },
                                    showPresetControls: true,
                                });
                            });
                        }
                    });
                    requestAnimationFrame(() => ui.resize());
                }
            });
        }
        menu.open({ x: rect.right, y: rect.bottom, isLeft: true });
    }
}