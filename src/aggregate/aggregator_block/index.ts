import steveTools from "@/index";
import { getBlockByID, insertBlock, sql as runSql, lsNotebooks, createDailyNote } from '@/api/api';
import { AVManager } from "@/api/db_pro";
import { PluginConfig } from '@/savedata';
import { showMessage } from "siyuan";
import { PresetItem, SQLRawRow } from "../echarts/types/types";
import { TimerManager } from "./TimerManager";

export class aggregatorBlock {
    private _settingdata: any;
    private _plugin: steveTools;

    // 可选的 PluginConfig 实例（若宿主模块提供）
    private pluginConfig?: PluginConfig;

    // AV 管理器实例，用于数据库操作
    private avManager: AVManager = new AVManager('');

    // 定时任务管理器
    private timerManager?: TimerManager;

    constructor(plugin: steveTools, pluginConfig?: PluginConfig) {
        this._plugin = plugin;
        this.pluginConfig = pluginConfig;
    }

    // 获取思源格式的时间戳(14位: YYYYMMDDHHmmss)
    private getSiyuanTimestamp(date: Date = new Date()): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}${second}`;
    }

    // 检查文档是否有效
    private async checkDocValidity(docId: string): Promise<boolean> {
        if (!docId || !docId.trim()) return false;
        try {
            const data = await getBlockByID(docId);
            return !!data;
        } catch (e) {
            return false;
        }
    }

    // HTML转义
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 判断是否为有效的笔记本 ID
    private async isNotebookId(id: string): Promise<boolean> {
        try {
            if (!id) return false;
            const nbs = await lsNotebooks();
            if (!Array.isArray(nbs?.notebooks)) return false;
            return nbs.notebooks.some((nb: any) => nb?.id === id);
        } catch {
            return false;
        }
    }

    // 将“文档ID或笔记本ID”解析为今日可插入的文档ID
    private async resolveInsertDocId(targetId: string): Promise<{ docId: string; type: 'doc' | 'notebook' } | null> {
        if (!targetId) return null;
        // 先当成块/文档ID
        const blk = await this.safeGetBlock(targetId);
        if (blk) return { docId: targetId, type: 'doc' };
        // 再判断是否是笔记本ID，若是则创建/获取今日日记
        if (await this.isNotebookId(targetId)) {
            // @ts-ignore - 运行时存在
            const appId: string = (window as any)?.siyuan?.ws?.app?.appId || '';
            const dailyId = await createDailyNote(appId, targetId);
            if (typeof dailyId === 'string' && dailyId) {
                return { docId: dailyId, type: 'notebook' };
            }
            // 某些内核版本可能返回对象，尝试读取常见字段
            if (dailyId && typeof dailyId === 'object') {
                const maybeId = (dailyId.id || dailyId.docId || dailyId.data || '').toString();
                if (maybeId) return { docId: maybeId, type: 'notebook' };
            }
        }
        return null;
    }

    private async safeGetBlock(id: string) {
        try { return await getBlockByID(id); } catch { return null; }
    }

    // 格式化单元格值
    private formatCell(value: any): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
    }

    // 渲染查询结果表格
    private renderResultTable(rows: any[], container: HTMLElement): void {
        const total = rows.length;
        if (!total) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--b3-theme-on-surface-light);">
                    无结果
                </div>
            `;
            return;
        }

        // 获取列名（最多12列）
        const colSet = new Set<string>();
        for (const r of rows) {
            if (r && typeof r === 'object') {
                Object.keys(r).forEach(k => colSet.add(k));
            }
            if (colSet.size > 24) break;
        }
        const cols = Array.from(colSet).slice(0, 12);

        // 创建表头
        const thead = `<thead><tr><th style="
            padding: 8px 12px;
            border-bottom: 1px solid var(--b3-border-color);
            background: var(--b3-theme-surface);
            font-weight: 500;
            font-size: 12px;
            color: var(--b3-theme-on-background);
            text-align: left;
            position: sticky;
            top: 0;
            z-index: 1;
        ">#</th>${cols.map(c => `<th style="
            padding: 8px 12px;
            border-bottom: 1px solid var(--b3-border-color);
            background: var(--b3-theme-surface);
            font-weight: 500;
            font-size: 12px;
            color: var(--b3-theme-on-background);
            text-align: left;
            position: sticky;
            top: 0;
            z-index: 1;
        ">${this.escapeHtml(c)}</th>`).join('')}</tr></thead>`;

        // 创建表体
        const tbody = `<tbody>${rows.map((r, idx) => {
            const rowNo = `<td style="
                padding: 6px 12px;
                border-bottom: 1px solid var(--b3-border-color);
                font-size: 12px;
                color: var(--b3-theme-on-surface-light);
                background: var(--b3-theme-surface);
            ">${idx + 1}</td>`;

            if (!r || typeof r !== 'object') {
                const txt = this.escapeHtml(String(r));
                return `<tr>${rowNo}<td colspan="${Math.max(1, cols.length)}" style="
                    padding: 6px 12px;
                    border-bottom: 1px solid var(--b3-border-color);
                    font-size: 12px;
                    color: var(--b3-theme-on-background);
                    font-family: var(--b3-font-family-code);
                ">${txt}</td></tr>`;
            }

            const cells = cols.map(c => `<td style="
                padding: 6px 12px;
                border-bottom: 1px solid var(--b3-border-color);
                font-size: 12px;
                color: var(--b3-theme-on-background);
                font-family: var(--b3-font-family-code);
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            " title="${this.escapeHtml(this.formatCell(r[c]))}">${this.escapeHtml(this.formatCell(r[c]))}</td>`).join('');

            return `<tr class="preview-table-row" style="hover: background: var(--b3-list-hover);">${rowNo}${cells}</tr>`;
        }).join('')}</tbody>`;

        // 设置容器内容
        container.innerHTML = `
            <div style="
                border: 1px solid var(--b3-border-color);
                border-radius: var(--b3-border-radius);
                overflow: hidden;
                background: var(--b3-theme-background);
            ">
                <div style="
                    padding: 8px 12px;
                    background: var(--b3-theme-surface);
                    border-bottom: 1px solid var(--b3-border-color);
                    font-size: 12px;
                    color: var(--b3-theme-on-surface);
                ">
                    ${total} 条结果${total >= 5 ? ' (已限制显示)' : ''}
                </div>
                <div style="
                    max-height: 300px;
                    overflow-y: auto;
                ">
                    <table style="
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    ">${thead}${tbody}</table>
                </div>
            </div>
        `;
    }

    // 创建原生弹窗
    private createNativeDialog(options: {
        title: string;
        content: string;
        width?: string;
        onClose?: () => void;
    }): { element: HTMLElement; destroy: () => void } {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--b3-mask-background);
            z-index: 200;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(2px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--b3-theme-background);
            border-radius: var(--b3-border-radius-b);
            box-shadow: var(--b3-dialog-shadow);
            max-height: 80vh;
            max-width: ${options.width || '600px'};
            width: 95%;
            display: flex;
            flex-direction: column;
            animation: dialogFadeIn 0.2s ease-out;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid var(--b3-border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 500;
            font-size: 15px;
            color: var(--b3-theme-on-background);
        `;
        header.innerHTML = `
            <span>${options.title}</span>
            <button class="b3-button b3-button--text dialog-close-btn" style="padding: 4px;">
                <svg style="width: 16px; height: 16px;"><use xlink:href="#iconClose"></use></svg>
            </button>
        `;

        const body = document.createElement('div');
        body.style.cssText = `
            overflow-y: auto;
            flex: 1;
        `;
        body.innerHTML = options.content;

        dialog.appendChild(header);
        dialog.appendChild(body);
        overlay.appendChild(dialog);

        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes dialogFadeIn {
                from {
                    opacity: 0;
                    transform: scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .spin {
                animation: spin 1s linear infinite;
            }
            .preview-table-row:hover {
                background: var(--b3-list-hover) !important;
            }
        `;
        document.head.appendChild(style);

        const destroy = () => {
            overlay.remove();
            style.remove();
            if (options.onClose) {
                options.onClose();
            }
        };

        // 关闭按钮事件
        const closeBtn = header.querySelector('.dialog-close-btn');
        closeBtn?.addEventListener('click', destroy);

        document.body.appendChild(overlay);

        return { element: dialog, destroy };
    }

    async init(settingdata: any) {
        this._settingdata = settingdata;

        // 使用字段以避免未使用的编译/lint 警告
        void this._plugin;
        void this._settingdata;
        console.log("aggregatorBlock 模块初始化");

        // 初始化定时任务管理器
        this.timerManager = new TimerManager(this);

        // 加载已有的定时任务
        await this.loadTimerTasks();
    }

    /**
     * 返回用于判断“最近更新”的阈值（单位：分钟），由用户通过插件设置 `aggregate-recent-update-minutes` 配置。
     * 如果未配置或值无效，默认返回 5 分钟。
     */
    public getRecentUpdateThresholdMinutes(): number {
        try {
            const v = this._settingdata?.['aggregate-recent-update-minutes'];
            const n = parseInt(String(v ?? ''), 10);
            if (!isFinite(n) || n <= 0) return 5;
            return n;
        } catch (e) {
            return 5;
        }
    }

    /**
     * 加载所有启用了定时的预设任务
     */
    private async loadTimerTasks(): Promise<void> {
        try {
            const presets = await this.getSqlPresets();
            const names = Object.keys(presets);

            console.log(`[aggregatorBlock] 加载定时任务，共 ${names.length} 个预设`);

            for (const name of names) {
                const preset = presets[name];
                if (preset.timerEnabled && preset.timerInterval) {
                    console.log(`[aggregatorBlock] 启动定时任务: ${name}`);
                    await this.timerManager?.startTimer(name, preset);
                }
            }

            const activeTimers = this.timerManager?.getActiveTimers() || [];
            console.log(`[aggregatorBlock] 已启动 ${activeTimers.length} 个定时任务:`, activeTimers);
        } catch (error) {
            console.error('[aggregatorBlock] 加载定时任务失败:', error);
        }
    }

    /**
     * 销毁方法，停止所有定时器
     */
    destroy(): void {
        console.log("[aggregatorBlock] 销毁模块，停止所有定时任务");
        this.timerManager?.stopAll();
    }

    // 1. 获取 SQL 可视化面板中保存的预设筛选
    // 返回一个键->预设对象映射
    async getSqlPresets(): Promise<Record<string, any>> {
        try {
            // 强制使用 PluginConfig（持久化到 /data/storage），不再使用 localStorage 回退
            if (!this.pluginConfig) {
                console.warn('[aggregatorBlock] no pluginConfig provided, presets unavailable');
                return {};
            }
            await this.pluginConfig.load();
            const p = this.pluginConfig.get('presets') || {};
            return p;
        } catch (e) {
            console.debug('[aggregatorBlock] getSqlPresets failed', e);
            return {};
        }
    }


    // 2. 生成预设选择面板（支持模板编辑）
    async showPresetSelector(): Promise<{ name: string; preset: PresetItem } | null> {
        const presets = await this.getSqlPresets();
        const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        return new Promise(resolve => {
            let settled = false;
            const containerId = `st-preset-container-${Date.now()}`;
            const searchId = `st-preset-search-${Date.now()}`;

            const { element, destroy } = this.createNativeDialog({
                title: '选择 SQL 预设',
                content: `
                    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                        <!-- 搜索框 -->
                        <div style="position: sticky; top: 0; background: var(--b3-theme-background); z-index: 1;">
                            <input 
                                id="${searchId}" 
                                class="b3-text-field" 
                                placeholder="🔍 搜索预设名称或 SQL..." 
                                style="
                                    width: 100%; 
                                    padding: 8px 12px;
                                    border: 1px solid var(--b3-border-color);
                                    border-radius: var(--b3-border-radius);
                                    background: var(--b3-theme-surface);
                                    color: var(--b3-theme-on-background);
                                    transition: var(--b3-transition);
                                    font-size: 14px;
                                "
                            />
                        </div>
                        <!-- 预设列表 -->
                        <div id="${containerId}" style="
                            max-height: 450px; 
                            overflow-y: auto;
                            display: flex;
                            flex-direction: column;
                            gap: 8px;
                        "></div>
                    </div>
                `,
                width: 'min(720px, 95vw)',
                onClose: () => {
                    if (settled) return;
                    settled = true;
                    resolve(null);
                }
            });

            const container = element.querySelector(`#${containerId}`) as HTMLElement | null;
            const searchInput = element.querySelector(`#${searchId}`) as HTMLInputElement | null;

            if (!container || !searchInput) {
                try { destroy(); } catch (e) { /* ignore */ }
                if (!settled) {
                    settled = true;
                    resolve(null);
                }
                return;
            }

            // 搜索输入效果
            searchInput.addEventListener('focus', () => {
                searchInput.style.borderColor = 'var(--b3-theme-primary)';
                searchInput.style.boxShadow = '0 0 0 2px var(--b3-theme-primary-lightest)';
            });
            searchInput.addEventListener('blur', () => {
                searchInput.style.borderColor = 'var(--b3-border-color)';
                searchInput.style.boxShadow = 'none';
            });

            // 渲染预设列表
            const renderPresets = async (filterText: string = '') => {
                container.innerHTML = '';
                const filter = filterText.toLowerCase().trim();
                const filteredNames = filter
                    ? names.filter(n =>
                        n.toLowerCase().includes(filter) ||
                        presets[n].sql.toLowerCase().includes(filter)
                    )
                    : names;

                if (!filteredNames.length) {
                    const empty = document.createElement('div');
                    empty.innerHTML = `
                        <div style="
                            text-align: center; 
                            padding: 40px 20px;
                            color: var(--b3-theme-on-surface-light);
                        ">
                            <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                            <div style="font-size: 14px;">${filter ? '未找到匹配的预设' : '暂无预设'}</div>
                        </div>
                    `;
                    container.appendChild(empty);
                    return;
                }

                // 并行检查所有文档的有效性
                const validityChecks = await Promise.all(
                    filteredNames.map(async n => {
                        const preset = presets[n];
                        let docValid = true;
                        let docType: 'doc' | 'notebook' | undefined;
                        if (preset.targetDocId) {
                            const isDoc = await this.checkDocValidity(preset.targetDocId);
                            if (isDoc) {
                                docValid = true; docType = 'doc';
                            } else {
                                const isNb = await this.isNotebookId(preset.targetDocId);
                                docValid = !!isNb; docType = isNb ? 'notebook' : undefined;
                            }
                        }
                        let databaseValid = true;
                        if (preset.targetDatabaseId) {
                            try {
                                await this.avManager.getAttributeView(preset.targetDatabaseId);
                            } catch (error) {
                                console.debug('[aggregatorBlock] 数据库校验失败', preset.targetDatabaseId, error);
                                databaseValid = false;
                            }
                        }
                        return { name: n, docValid, databaseValid, docType };
                    })
                );
                const validityMap = new Map(validityChecks.map(v => [v.name, { docValid: v.docValid, databaseValid: v.databaseValid, docType: v.docType }]));

                filteredNames.forEach(n => {
                    const preset = presets[n];
                    const validity = validityMap.get(n);
                    const item = document.createElement('div');
                    item.className = 'preset-item';
                    item.style.cssText = `
                        padding: 14px 16px;
                        background: var(--b3-theme-surface);
                        border: 1px solid var(--b3-border-color);
                        border-radius: var(--b3-border-radius);
                        cursor: pointer;
                        transition: var(--b3-transition);
                    `;

                    item.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                            <div style="flex: 1; min-width: 0;">
                                <!-- 预设名称 -->
                                <div style="
                                    font-weight: 500;
                                    font-size: 15px;
                                    color: var(--b3-theme-on-background);
                                    margin-bottom: 6px;
                                    display: flex;
                                    align-items: center;
                                    gap: 6px;
                                ">
                                    <svg style="width: 16px; height: 16px; fill: var(--b3-theme-primary);"><use xlink:href="#iconSQL"></use></svg>
                                    ${n}
                                </div>
                                
                                <!-- SQL 预览 -->
                                <div style="
                                    font-size: 12px;
                                    color: var(--b3-theme-on-surface);
                                    font-family: var(--b3-font-family-code);
                                    background: var(--b3-protyle-code-background);
                                    padding: 6px 8px;
                                    border-radius: var(--b3-border-radius-s);
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    white-space: nowrap;
                                    margin-bottom: 8px;
                                    line-height: 1.4;
                                ">
                                    ${preset.sql}
                                </div>
                                
                                <!-- 标签区 -->
                                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                    ${preset.template ? `
                                        <span style="
                                            font-size: 11px;
                                            padding: 2px 8px;
                                            background: var(--b3-theme-primary-lightest);
                                            color: var(--b3-theme-primary);
                                            border-radius: var(--b3-border-radius-s);
                                            display: inline-flex;
                                            align-items: center;
                                            gap: 4px;
                                        ">
                                            <svg style="width: 12px; height: 12px;"><use xlink:href="#iconEdit"></use></svg>
                                            自定义模板
                                        </span>
                                    ` : ''}
                                    ${preset.targetDocId ? (validity?.docValid ? `
                                        <span style="
                                            font-size: 11px;
                                            padding: 2px 8px;
                                            background: rgba(101, 184, 77, 0.12);
                                            color: var(--b3-theme-success);
                                            border-radius: var(--b3-border-radius-s);
                                            display: inline-flex;
                                            align-items: center;
                                            gap: 4px;
                                        ">
                                            <svg style="width: 12px; height: 12px;"><use xlink:href="#iconLink"></use></svg>
                                            ${validity?.docType === 'notebook' ? '笔记本日记' : '已绑定文档'}
                                        </span>
                                    ` : `
                                        <span style="
                                            font-size: 11px;
                                            padding: 2px 8px;
                                            background: var(--b3-card-error-background);
                                            color: var(--b3-card-error-color);
                                            border-radius: var(--b3-border-radius-s);
                                            display: inline-flex;
                                            align-items: center;
                                            gap: 4px;
                                        ">
                                            <svg style="width: 12px; height: 12px;"><use xlink:href="#iconCloseRound"></use></svg>
                                            无效文档绑定
                                        </span>
                                    `) : ''}
                                    ${preset.targetDatabaseId ? (validity?.databaseValid ? `
                                        <span style="
                                            font-size: 11px;
                                            padding: 2px 8px;
                                            background: rgba(70, 130, 180, 0.12);
                                            color: #1976d2;
                                            border-radius: var(--b3-border-radius-s);
                                            display: inline-flex;
                                            align-items: center;
                                            gap: 4px;
                                        ">
                                            <svg style="width: 12px; height: 12px;"><use xlink:href="#iconDatabase"></use></svg>
                                            已绑定数据库
                                        </span>
                                    ` : `
                                        <span style="
                                            font-size: 11px;
                                            padding: 2px 8px;
                                            background: var(--b3-card-error-background);
                                            color: var(--b3-card-error-color);
                                            border-radius: var(--b3-border-radius-s);
                                            display: inline-flex;
                                            align-items: center;
                                            gap: 4px;
                                        ">
                                            <svg style="width: 12px; height: 12px;"><use xlink:href="#iconCloseRound"></use></svg>
                                            无效数据库绑定
                                        </span>
                                    `) : ''}
                                    ${preset.timerEnabled ? (() => {
                                        const nextTime = preset.nextExecuteTime ? new Date(preset.nextExecuteTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未知';
                                        const intervalText = preset.timerUnit && preset.timerValue 
                                            ? `${preset.timerValue}${preset.timerUnit === 'minutes' ? '分钟' : preset.timerUnit === 'hours' ? '小时' : '天'}`
                                            : '未设置';
                                        return `
                                        <span style="
                                            font-size: 11px;
                                            padding: 2px 8px;
                                            background: rgba(255, 193, 7, 0.12);
                                            color: #f57c00;
                                            border-radius: var(--b3-border-radius-s);
                                            display: inline-flex;
                                            align-items: center;
                                            gap: 4px;
                                        " title="下次执行: ${nextTime}">
                                            <svg style="width: 12px; height: 12px;"><use xlink:href="#iconTimer"></use></svg>
                                            定时: ${intervalText} | 下次: ${nextTime}
                                        </span>
                                        `;
                                    })() : ''}
                                </div>
                            </div>
                            
                            <!-- 操作按钮 -->
                            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                                <button class="b3-button b3-button--outline edit-preset-btn" style="
                                    padding: 6px 12px;
                                    font-size: 13px;
                                    display: flex;
                                    align-items: center;
                                    gap: 4px;
                                ">
                                    <svg style="width: 14px; height: 14px; margin-right: 0px;"><use xlink:href="#iconEdit"></use></svg>
                                    
                                </button>
                                <button class="b3-button b3-button--outline timer-preset-btn" style="
                                    padding: 6px 12px;
                                    font-size: 13px;
                                    display: flex;
                                    align-items: center;
                                    gap: 4px;
                                    ${preset.timerEnabled ? 'background: rgba(255, 193, 7, 0.12); border-color: #f57c00; color: #f57c00;' : ''}
                                " title="${preset.timerEnabled ? '定时已启用' : '设置定时更新'}">
                                    <svg style="width: 14px; height: 14px; margin-right: 0px;"><use xlink:href="#iconClock"></use></svg>
                                    
                                </button>
                                <button class="b3-button b3-button--primary use-preset-btn" style="
                                    padding: 6px 12px;
                                    font-size: 13px;
                                    display: flex;
                                    align-items: center;
                                    gap: 4px;
                                ">
                                    <svg style="width: 14px; height: 14px; margin-right: 0px;"><use xlink:href="#iconSelect"></use></svg>
                                    
                                </button>
                            </div>
                        </div>
                    `;

                    // 悬停效果
                    item.addEventListener('mouseenter', () => {
                        item.style.background = 'var(--b3-list-hover)';
                        item.style.borderColor = 'var(--b3-theme-primary-lighter)';
                        item.style.transform = 'translateY(-1px)';
                        item.style.boxShadow = 'var(--b3-point-shadow)';
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.background = 'var(--b3-theme-surface)';
                        item.style.borderColor = 'var(--b3-border-color)';
                        item.style.transform = 'translateY(0)';
                        item.style.boxShadow = 'none';
                    });

                    // 使用按钮
                    const useBtn = item.querySelector('.use-preset-btn');
                    useBtn?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (settled) return;
                        settled = true;
                        try { destroy(); } catch (e) { /* ignore */ }
                        resolve({ name: n, preset });
                    });

                    // 编辑按钮
                    const editBtn = item.querySelector('.edit-preset-btn');
                    editBtn?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const updated = await this.showPresetEditor(n, preset, presets);
                        if (updated) {
                            // 重新渲染列表以更新标签
                            await renderPresets(searchInput.value);
                        }
                    });

                    // 定时按钮
                    const timerBtn = item.querySelector('.timer-preset-btn');
                    timerBtn?.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const updated = await this.showTimerSettings(n, preset, presets);
                        if (updated) {
                            // 重新渲染列表以更新定时状态显示
                            await renderPresets(searchInput.value);
                        }
                    });

                    container.appendChild(item);
                });
            };

            // 搜索事件
            searchInput.addEventListener('input', () => {
                renderPresets(searchInput.value);
            });

            // 初始渲染
            renderPresets();
        });
    }

    /**
     * 显示预设编辑器（二级界面）
     * @returns 返回是否有更新
     */
    private async showPresetEditor(name: string, preset: PresetItem, allPresets: Record<string, PresetItem>): Promise<boolean> {
        return new Promise((resolve) => {
            const { element, destroy } = this.createNativeDialog({
                title: `编辑预设: ${name}`,
                content: `
                    <div style="padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                        <!-- SQL 查询 -->
                        <div>
                            <label style="
                                display: block; 
                                margin-bottom: 6px; 
                                font-weight: 500;
                                color: var(--b3-theme-on-background);
                                font-size: 14px;
                            ">
                                <svg style="width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px;"><use xlink:href="#iconSQL"></use></svg>
                                SQL 查询
                            </label>
                            <textarea 
                                id="edit-sql" 
                                class="b3-text-field" 
                                readonly
                                style="
                                    width: 100%; 
                                    height: 35px; 
                                    resize: vertical;
                                    font-family: var(--b3-font-family-code);
                                    font-size: 13px;
                                    background: var(--b3-theme-surface-light);
                                    border: 1px solid var(--b3-border-color);
                                    border-radius: var(--b3-border-radius);
                                    padding: 8px;
                                "
                            >${preset.sql}</textarea>
                            <div style="
                                font-size: 12px; 
                                color: var(--b3-theme-on-surface-light); 
                                margin-top: 4px;
                            ">
                                SQL 查询不可在此编辑,请在插件设置中修改
                            </div>
                            <!-- 查询预览 -->
                            <div style="margin-top: 8px;">
                                <button id="preview-sql-btn" class="b3-button b3-button--outline" style="
                                    font-size: 12px;
                                    padding: 4px 8px;
                                    display: flex;
                                    align-items: center;
                                    gap: 4px;
                                ">
                                    <svg style="width: 12px; height: 12px;"><use xlink:href="#iconEye"></use></svg>
                                    预览查询结果
                                </button>
                                <div id="sql-preview-container" style="
                                    margin-top: 8px;
                                    max-height: 350px;
                                    overflow-y: auto;
                                    display: none;
                                "></div>
                            </div>
                        </div>
                        
                        <!-- 自定义模板 -->
                        <div>
                            <label style="
                                display: block; 
                                margin-bottom: 6px; 
                                font-weight: 500;
                                color: var(--b3-theme-on-background);
                                font-size: 14px;
                            ">
                                <svg style="width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px;"><use xlink:href="#iconEdit"></use></svg>
                                自定义模板
                            </label>
                            <textarea 
                                id="edit-template" 
                                class="b3-text-field" 
                                placeholder="留空则使用插件设置的默认模板&#10;&#10;支持占位符:&#10;{{字段名}} - 插入字段值&#10;例如: ## {{title}}&#10;{{content}}"
                                style="
                                    width: 100%; 
                                    height: 180px; 
                                    resize: vertical;
                                    font-family: var(--b3-font-family-code);
                                    font-size: 13px;
                                    border: 1px solid var(--b3-border-color);
                                    border-radius: var(--b3-border-radius);
                                    padding: 8px;
                                    line-height: 1.5;
                                "
                            >${preset.template || ''}</textarea>
                            <div style="
                                font-size: 12px; 
                                color: var(--b3-theme-on-surface-light); 
                                margin-top: 4px;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                            ">
                                <svg style="width: 12px; height: 12px;"><use xlink:href="#iconInfo"></use></svg>
                                优先级: 预设模板 > 插件全局模板
                            </div>
                        </div>
                        
                        <!-- 目标文档 ID -->
                        <div>
                            <label style="
                                display: block; 
                                margin-bottom: 6px; 
                                font-weight: 500;
                                color: var(--b3-theme-on-background);
                                font-size: 14px;
                            ">
                                <svg style="width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px;"><use xlink:href="#iconLink"></use></svg>
                                目标文档/笔记本 ID (可选)
                            </label>
                            <input 
                                id="edit-target-doc" 
                                class="b3-text-field" 
                                value="${preset.targetDocId || ''}"
                                placeholder="输入文档ID，或输入笔记本ID以插入到该笔记本的【日记】"
                                style="
                                    width: 100%;
                                    padding: 8px;
                                    border: 1px solid var(--b3-border-color);
                                    border-radius: var(--b3-border-radius);
                                    font-size: 13px;
                                "
                            />
                        </div>

                        <!-- 目标数据库 ID -->
                        <div>
                            <label style="
                                display: block; 
                                margin-bottom: 6px; 
                                font-weight: 500;
                                color: var(--b3-theme-on-background);
                                font-size: 14px;
                            ">
                                <svg style="width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px;"><use xlink:href="#iconDatabase"></use></svg>
                                目标数据库 ID (可选)
                            </label>
                            <input 
                                id="edit-target-db" 
                                class="b3-text-field" 
                                value="${preset.targetDatabaseId || ''}"
                                placeholder="输入属性视图 (数据库) ID, 用于插入查询到的块"
                                style="
                                    width: 100%;
                                    padding: 8px;
                                    border: 1px solid var(--b3-border-color);
                                    border-radius: var(--b3-border-radius);
                                    font-size: 13px;
                                "
                            />
                            <div style="
                                margin-top: 8px;
                                display: flex;
                                gap: 8px;
                                align-items: center;
                            ">
                                <label for="edit-db-id-field" style="font-size: 12px; color: var(--b3-theme-on-surface);">加入数据库时使用的 ID 字段:</label>
                                <select id="edit-db-id-field" class="b3-select">
                                    <option value="id" ${preset.databaseIdField !== 'parent_id' ? 'selected' : ''}>块 id (id)</option>
                                    <option value="parent_id" ${preset.databaseIdField === 'parent_id' ? 'selected' : ''}>父块 id (parent_id)</option>
                                </select>
                            </div>
                            <div style="
                                font-size: 12px; 
                                color: var(--b3-theme-on-surface-light); 
                                margin-top: 4px;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                            ">
                                <svg style="width: 12px; height: 12px;"><use xlink:href="#iconInfo"></use></svg>
                                SQL 结果中需包含对应的字段；若缺失将自动回退到其它可用字段。
                            </div>
                        </div>
                        
                        <!-- 上次插入时间戳 -->
                        <div>
                            <label style="
                                display: block; 
                                margin-bottom: 6px; 
                                font-weight: 500;
                                color: var(--b3-theme-on-background);
                                font-size: 14px;
                            ">
                                <svg style="width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px;"><use xlink:href="#iconHistory"></use></svg>
                                上次插入时间戳 (可选)
                            </label>
                            <input 
                                id="edit-last-insert-time" 
                                class="b3-text-field" 
                                value="${preset.lastInsertTime || ''}"
                                placeholder="思源时间戳格式 (YYYYMMDDHHmmss), 留空则重置"
                                style="
                                    width: 100%;
                                    padding: 8px;
                                    border: 1px solid var(--b3-border-color);
                                    border-radius: var(--b3-border-radius);
                                    font-size: 13px;
                                    font-family: var(--b3-font-family-code);
                                "
                            />
                            <div style="
                                font-size: 12px; 
                                color: var(--b3-theme-on-surface-light); 
                                margin-top: 4px;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                            ">
                                <svg style="width: 12px; height: 12px;"><use xlink:href="#iconInfo"></use></svg>
                                用于过滤已插入的内容。留空可重置为不进行时间过滤。
                            </div>
                        </div>
                        
                        <!-- 操作按钮 -->
                        <div style="
                            display: flex;
                            justify-content: flex-end;
                            gap: 8px;
                            padding-top: 12px;
                            border-top: 1px solid var(--b3-border-color);
                        ">
                            <button class="b3-button b3-button--cancel">取消</button>
                            <button class="b3-button b3-button--primary">保存</button>
                        </div>
                    </div>
                `,
                width: 'min(680px, 95vw)',
                onClose: () => {
                    resolve(false);
                }
            });

            // 按钮事件
            const cancelBtn = element.querySelector('.b3-button--cancel');
            const confirmBtn = element.querySelector('.b3-button--primary');
            const previewBtn = element.querySelector('#preview-sql-btn') as HTMLButtonElement;
            const previewContainer = element.querySelector('#sql-preview-container') as HTMLElement;

            cancelBtn?.addEventListener('click', () => {
                resolve(false);
                destroy();
            });

            confirmBtn?.addEventListener('click', async () => {
                const templateTextarea = element.querySelector('#edit-template') as HTMLTextAreaElement;
                const targetDocInput = element.querySelector('#edit-target-doc') as HTMLInputElement;
                const targetDatabaseInput = element.querySelector('#edit-target-db') as HTMLInputElement;
                const lastInsertTimeInput = element.querySelector('#edit-last-insert-time') as HTMLInputElement;
                const dbIdFieldSelect = element.querySelector('#edit-db-id-field') as HTMLSelectElement;

                const newTemplate = templateTextarea?.value.trim() || '';
                const newTargetDocId = targetDocInput?.value.trim() || '';
                const newTargetDatabaseId = targetDatabaseInput?.value.trim() || '';
                const newLastInsertTime = lastInsertTimeInput?.value.trim() || '';
                const newDatabaseIdField = (dbIdFieldSelect?.value === 'parent_id' ? 'parent_id' : 'id') as 'id' | 'parent_id';

                // 更新预设
                preset.template = newTemplate || undefined;
                preset.targetDocId = newTargetDocId || undefined;
                preset.targetDatabaseId = newTargetDatabaseId || undefined;
                preset.lastInsertTime = newLastInsertTime || undefined;
                preset.databaseIdField = newTargetDatabaseId ? newDatabaseIdField : undefined; // 仅在设置了数据库ID时生效
                allPresets[name] = preset;

                // 保存到配置
                await this.updatePresetTemplate(name, newTemplate);
                await this.updatePresetTargetDocId(name, newTargetDocId);
                await this.updatePresetTargetDatabaseId(name, newTargetDatabaseId);
                await this.updatePresetLastInsertTime(name, newLastInsertTime);
                await this.updatePresetDatabaseIdField(name, preset.databaseIdField || '');

                showMessage('预设已更新', 3000, 'info');
                resolve(true);
                destroy();
            });

            // 预览按钮事件
            previewBtn?.addEventListener('click', async () => {
                const isExpanded = previewContainer.style.display === 'block';

                if (isExpanded) {
                    // 收起预览
                    previewContainer.style.display = 'none';
                    previewBtn.innerHTML = `
                        <svg style="width: 12px; height: 12px;"><use xlink:href="#iconEye"></use></svg>
                        预览查询结果
                    `;
                    return;
                }

                // 展开预览并执行查询
                previewBtn.disabled = true;
                previewBtn.innerHTML = `
                    <svg style="width: 12px; height: 12px;" class="spin">
                        <use xlink:href="#iconRefresh"></use>
                    </svg>
                    查询中...
                `;

                try {
                    // 获取当前编辑的值
                    const targetDocInput = element.querySelector('#edit-target-doc') as HTMLInputElement;
                    const lastInsertTimeInput = element.querySelector('#edit-last-insert-time') as HTMLInputElement;

                    const currentTargetDocId = targetDocInput?.value.trim() || '';
                    const currentLastInsertTime = lastInsertTimeInput?.value.trim() || '';

                    // 执行SQL查询（限制结果数量，避免预览过多数据）
                    let previewSql = preset.sql;
                    const upperSql = previewSql.toUpperCase();

                    // 如果没有LIMIT子句，添加LIMIT 5来限制预览结果
                    if (!upperSql.includes(' LIMIT ')) {
                        previewSql += ' LIMIT 5';
                    }

                    // 使用和实际执行相同的参数：排除目标（文档或日记文档）和时间过滤
                    let excludeId: string | undefined;
                    if (currentTargetDocId) {
                        const resolved = await this.resolveInsertDocId(currentTargetDocId);
                        excludeId = resolved?.docId || undefined;
                    }
                    const results = await this.executeSql(previewSql, excludeId, currentLastInsertTime || undefined);

                    // 使用表格形式渲染结果
                    this.renderResultTable(results, previewContainer);

                    previewContainer.style.display = 'block';
                    previewBtn.innerHTML = `
                        <svg style="width: 12px; height: 12px;"><use xlink:href="#iconEye"></use></svg>
                        收起预览
                    `;

                } catch (error) {
                    console.error('SQL预览失败:', error);
                    previewContainer.innerHTML = `
                        <div style="
                            padding: 20px;
                            text-align: center;
                            color: var(--b3-theme-error);
                            background: var(--b3-card-error-background);
                            border: 1px solid var(--b3-card-error-color);
                            border-radius: var(--b3-border-radius);
                        ">
                            <div style="margin-bottom: 8px;">❌ 查询失败</div>
                            <div style="font-size: 12px;">${error.message || '未知错误'}</div>
                        </div>
                    `;
                    previewContainer.style.display = 'block';
                    previewBtn.innerHTML = `
                        <svg style="width: 12px; height: 12px;"><use xlink:href="#iconEye"></use></svg>
                        收起预览
                    `;
                } finally {
                    previewBtn.disabled = false;
                }
            });
        });
    }

    /**
     * 显示定时设置对话框
     * @returns 返回是否有更新
     */
    private async showTimerSettings(name: string, preset: PresetItem, allPresets: Record<string, PresetItem>): Promise<boolean> {
        return new Promise((resolve) => {
            const currentEnabled = preset.timerEnabled || false;
            const currentUnit = preset.timerUnit || 'hours';
            const currentValue = preset.timerValue || 1;

            const { element, destroy } = this.createNativeDialog({
                title: `定时设置: ${name}`,
                content: `
                    <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px;">
                        <!-- 启用开关 -->
                        <div style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 16px;
                            background: var(--b3-theme-surface);
                            border-radius: var(--b3-border-radius);
                            border: 1px solid var(--b3-border-color);
                        ">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <svg style="width: 20px; height: 20px; fill: var(--b3-theme-primary);"><use xlink:href="#iconClock"></use></svg>
                                <div>
                                    <div style="font-weight: 500; color: var(--b3-theme-on-background);">启用定时更新</div>
                                    <div style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-top: 2px;">
                                        自动执行聚合并插入到目标文档
                                    </div>
                                </div>
                            </div>
                            <label class="veq-switch" style="margin: 0;">
                                <input id="timer-enabled-switch" type="checkbox" ${currentEnabled ? 'checked' : ''}>
                                <i></i>
                            </label>
                        </div>

                        <!-- 定时间隔设置 -->
                        <div id="timer-interval-settings" style="
                            display: ${currentEnabled ? 'block' : 'none'};
                            padding: 16px;
                            background: var(--b3-theme-surface);
                            border-radius: var(--b3-border-radius);
                            border: 1px solid var(--b3-border-color);
                        ">
                            <label style="
                                display: block;
                                margin-bottom: 12px;
                                font-weight: 500;
                                color: var(--b3-theme-on-background);
                                font-size: 14px;
                            ">
                                <svg style="width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px;"><use xlink:href="#iconClock"></use></svg>
                                执行间隔
                            </label>
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <input 
                                    id="timer-value" 
                                    type="number" 
                                    min="1" 
                                    value="${currentValue}"
                                    class="b3-text-field"
                                    style="
                                        flex: 1;
                                        padding: 8px 12px;
                                        border: 1px solid var(--b3-border-color);
                                        border-radius: var(--b3-border-radius);
                                        font-size: 14px;
                                    "
                                />
                                <select 
                                    id="timer-unit" 
                                    class="b3-select"
                                >
                                    <option value="minutes" ${currentUnit === 'minutes' ? 'selected' : ''}>分钟</option>
                                    <option value="hours" ${currentUnit === 'hours' ? 'selected' : ''}>小时</option>
                                    <option value="days" ${currentUnit === 'days' ? 'selected' : ''}>天</option>
                                </select>
                            </div>
                            <div style="
                                font-size: 12px;
                                color: var(--b3-theme-on-surface-light);
                                margin-top: 8px;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                            ">
                                <svg style="width: 12px; height: 12px;"><use xlink:href="#iconInfo"></use></svg>
                                定时器将在保存后立即生效
                            </div>
                        </div>

                        <!-- 执行信息 -->
                        ${currentEnabled && preset.lastExecuteTime ? `
                        <div style="
                            padding: 12px;
                            background: var(--b3-theme-surface-light);
                            border-radius: var(--b3-border-radius);
                            font-size: 12px;
                            color: var(--b3-theme-on-surface);
                        ">
                            <div style="margin-bottom: 4px;">
                                <strong>上次执行:</strong> ${new Date(preset.lastExecuteTime).toLocaleString('zh-CN')}
                            </div>
                            ${preset.nextExecuteTime ? `
                            <div>
                                <strong>下次执行:</strong> ${new Date(preset.nextExecuteTime).toLocaleString('zh-CN')}
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}

                        <!-- 操作按钮 -->
                        <div style="
                            display: flex;
                            justify-content: flex-end;
                            gap: 8px;
                            padding-top: 12px;
                            border-top: 1px solid var(--b3-border-color);
                        ">
                            <button class="b3-button b3-button--cancel">取消</button>
                            <button class="b3-button b3-button--primary">保存</button>
                        </div>
                    </div>
                `,
                width: 'min(500px, 95vw)',
                onClose: () => {
                    resolve(false);
                }
            });

            // 获取元素
            const enabledSwitch = element.querySelector('#timer-enabled-switch') as HTMLInputElement;
            const intervalSettings = element.querySelector('#timer-interval-settings') as HTMLElement;
            const valueInput = element.querySelector('#timer-value') as HTMLInputElement;
            const unitSelect = element.querySelector('#timer-unit') as HTMLSelectElement;
            const cancelBtn = element.querySelector('.b3-button--cancel');
            const confirmBtn = element.querySelector('.b3-button--primary');

            // 切换显示/隐藏间隔设置
            enabledSwitch?.addEventListener('change', () => {
                if (intervalSettings) {
                    intervalSettings.style.display = enabledSwitch.checked ? 'block' : 'none';
                }
            });

            // 取消按钮
            cancelBtn?.addEventListener('click', () => {
                resolve(false);
                destroy();
            });

            // 保存按钮
            confirmBtn?.addEventListener('click', async () => {
                const enabled = enabledSwitch?.checked || false;
                const value = parseInt(valueInput?.value || '1');
                const unit = unitSelect?.value as 'minutes' | 'hours' | 'days';

                if (enabled && (!value || value < 1)) {
                    showMessage('请输入有效的时间间隔', 3000, 'error');
                    return;
                }

                // 计算间隔毫秒数
                let intervalMs = 0;
                if (enabled) {
                    switch (unit) {
                        case 'minutes':
                            intervalMs = value * 60 * 1000;
                            break;
                        case 'hours':
                            intervalMs = value * 60 * 60 * 1000;
                            break;
                        case 'days':
                            intervalMs = value * 24 * 60 * 60 * 1000;
                            break;
                    }
                }

                // 更新预设
                preset.timerEnabled = enabled;
                preset.timerInterval = intervalMs;
                preset.timerUnit = unit;
                preset.timerValue = value;

                // 如果启用定时，设置下次执行时间
                if (enabled) {
                    const now = Date.now();
                    preset.nextExecuteTime = now + intervalMs;
                } else {
                    preset.nextExecuteTime = undefined;
                    preset.lastExecuteTime = undefined;
                }

                allPresets[name] = preset;

                // 保存到配置
                await this.updatePresetTimerSettings(name, preset);

                // 通知定时管理器更新
                if (this.timerManager) {
                    if (enabled) {
                        await this.timerManager.startTimer(name, preset);
                    } else {
                        this.timerManager.stopTimer(name);
                    }
                }

                showMessage(enabled ? '定时已启用' : '定时已禁用', 3000, 'info');
                resolve(true);
                destroy();
            });
        });
    }

    // 更新预设的定时设置
    async updatePresetTimerSettings(presetName: string, preset: PresetItem): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].timerEnabled = preset.timerEnabled;
                current[presetName].timerInterval = preset.timerInterval;
                current[presetName].timerUnit = preset.timerUnit;
                current[presetName].timerValue = preset.timerValue;
                current[presetName].lastExecuteTime = preset.lastExecuteTime;
                current[presetName].nextExecuteTime = preset.nextExecuteTime;
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
                console.log(`[aggregatorBlock] 更新预设 "${presetName}" 的定时设置`);
            } else {
                console.warn('[aggregatorBlock] preset not found:', presetName);
            }
        } catch (e) {
            console.error('[aggregatorBlock] updatePresetTimerSettings error', e);
        }
    }

    // 3. 根据用户选择的 SQL 代码，进行 SQL 查询。
    // 执行 SQL 并返回行数据（数组）
    async executeSql(sqlText: string, excludeDocId?: string, lastInsertTime?: string): Promise<SQLRawRow[]> {
        try {
            if (!sqlText || !sqlText.trim()) return [];
            let stmt = sqlText.trim();

            // 如果提供了排除的文档ID，自动添加过滤条件
            if (excludeDocId) {
                // 检查SQL是否已经有WHERE子句
                const upperStmt = stmt.toUpperCase();
                const hasWhere = upperStmt.includes(' WHERE ');

                // 构建过滤条件：排除指定的文档ID
                const excludeCondition = `root_id != '${excludeDocId}'`;

                if (hasWhere) {
                    // 如果已经有WHERE子句，在其后添加AND条件
                    stmt = stmt.replace(/(\s+where\s+)/i, `$1${excludeCondition} AND `);
                } else {
                    // 如果没有WHERE子句，添加WHERE条件
                    stmt += ` WHERE ${excludeCondition}`;
                }

                console.log('[aggregatorBlock] Modified SQL with exclude condition:', stmt);
            }

            // 如果提供了 lastInsertTime，添加时间过滤条件
            if (lastInsertTime && lastInsertTime.length === 14) {
                // 获取用户设置的时间字段（created 或 updated）
                const timeField = this._settingdata['aggregate-time-field'] || 'created';

                // 思源的时间戳格式是秒，与 lastInsertTime 一致
                const upperStmt = stmt.toUpperCase();
                const hasWhere = upperStmt.includes(' WHERE ');

                // 构建时间过滤条件：只查询在 lastInsertTime 之后创建/更新的内容
                const timeCondition = `${timeField} > '${lastInsertTime}'`;

                if (hasWhere) {
                    // 如果已经有WHERE子句，在其后添加AND条件
                    stmt = stmt.replace(/(\s+where\s+)/i, `$1${timeCondition} AND `);
                } else {
                    // 如果没有WHERE子句，添加WHERE条件
                    stmt += ` WHERE ${timeCondition}`;
                }

                console.log(`[aggregatorBlock] Modified SQL with time filter (${timeField} > ${lastInsertTime}):`, stmt);
            }

            const res = await runSql(stmt);
            if (!Array.isArray(res)) return [];
            return res;
        } catch (e) {
            console.error('[aggregatorBlock] executeSql error', e);
            return [];
        }
    }


    // 高阶：整合流程：选择预设 -> 执行预设内 sql（或 compiled sql） -> 获取块预览集合
    // 返回 { presetName, preset, blockIds, previews }
    async runPresetPreviewFlow() {
        const preset = await this.showPresetSelector();
        if (!preset) return;
        console.log(preset);

    let targetDocId = preset.preset.targetDocId;
        const targetDatabaseId = preset.preset.targetDatabaseId;

        // 至少需要配置一个目标（文档或数据库）
        if (!targetDocId && !targetDatabaseId) {
            targetDocId = await this.promptForDocId(preset.name);
            console.log('用户输入的目标文档 ID:', targetDocId);
            if (!targetDocId) {
                console.warn(`[aggregatorBlock] 预设 "${preset.name}" 未配置目标文档或数据库`);
                showMessage('请先在预设中设置目标文档或数据库 ID', 4000, 'info');
                return;
            }
            console.log('保存目标文档 ID:', targetDocId);
            await this.updatePresetTargetDocId(preset.name, targetDocId);
            preset.preset.targetDocId = targetDocId;
        }

        // 获取上次插入时间，用于过滤已处理的内容
        const lastInsertTime = preset.preset.lastInsertTime || '';
        console.log(`[aggregatorBlock] 上次插入时间: ${lastInsertTime}`);

        // 解析目标：若为笔记本ID，则获取当日日记文档ID，以便用于 SQL 排除和插入
        let resolvedDoc: { docId: string; type: 'doc' | 'notebook' } | null = null;
        if (targetDocId) {
            resolvedDoc = await this.resolveInsertDocId(targetDocId);
            if (!resolvedDoc) {
                showMessage('目标文档/笔记本无效，请检查预设配置', 4000, 'error');
                return;
            }
        }

        const sqlResult = await this.executeSql(preset.preset.sql, resolvedDoc?.docId, lastInsertTime);
        console.log(sqlResult);

        // 如果没有新数据，提示用户
        if (!sqlResult || sqlResult.length === 0) {
            showMessage('没有新的数据需要插入', 3000, 'info');
            return;
        }

        const operations: string[] = [];
        const errors: string[] = [];

        if (resolvedDoc?.docId) {
            const renderedMd = this.renderTemplate(preset.preset, sqlResult);
            try {
                await this.insertMarkdownToDoc(resolvedDoc.docId, renderedMd, preset.name);
                console.log('成功插入到文档:', resolvedDoc.docId);
                operations.push(`文档 ${sqlResult.length} 条`);
            } catch (error: any) {
                console.error('[aggregatorBlock] 插入文档失败:', error);
                const msg = error?.message || String(error);
                errors.push(`文档: ${msg}`);
            }
        }

        if (targetDatabaseId) {
            try {
                const insertedCount = await this.insertBlocksToDatabase(targetDatabaseId, sqlResult, preset.name);
                if (insertedCount > 0) {
                    console.log('成功插入到数据库:', targetDatabaseId, '数量:', insertedCount);
                    operations.push(`数据库 ${insertedCount} 块`);
                } else {
                    console.log(`[aggregatorBlock] 预设 "${preset.name}" 未找到可插入的块 ID`);
                }
            } catch (error: any) {
                console.error('[aggregatorBlock] 插入数据库失败:', error);
                const msg = error?.message || String(error);
                errors.push(`数据库: ${msg}`);
            }
        }

        if (operations.length) {
            showMessage(`成功插入 ${operations.join('，')}`, 3000, 'info');
        }

        if (errors.length) {
            showMessage(`部分操作失败: ${errors.join('；')}`, 5000, 'error');
        }

        if (!operations.length && errors.length === 0) {
            showMessage('未执行任何插入操作，请检查预设配置', 4000, 'info');
        }
    }

    // 模板渲染函数：将 SQL 结果按模板渲染为 Markdown
    // preset: 预设对象，包含可选的独立模板
    // rows: SQL 查询结果数组
    // 返回渲染后的 Markdown 字符串
    renderTemplate(preset: PresetItem | null, rows: SQLRawRow[]): string {
        if (!rows || !rows.length) return '暂无数据';

        // 优先使用预设中的模板，如果没有则使用全局设置的模板
        const globalTemplate = this._settingdata['aggregate-sql-preview-template'] || '';
        const template = preset?.template?.trim() || globalTemplate?.trim();

        // 如果模板为空，使用默认模板：为每个 row 生成字段列表
        let effectiveTemplate = template;
        if (!effectiveTemplate) {
            // 默认模板：每个字段一行，格式 **字段名**: 值
            const sampleRow = rows[0];
            const fields = Object.keys(sampleRow).sort();
            effectiveTemplate = fields.map(field => `**${field}**: {{${field}}}`).join('\n');
        }

        // 渲染每个 row
        const renderedRows = rows.map(row => {
            return effectiveTemplate.replace(/\{\{(\w+)\}\}/g, (_, field) => {
                const value = row[field];
                return value !== undefined && value !== null ? String(value) : '';
            });
        });

        // 用分隔符连接所有 row 的渲染结果
        // const separator = this._settingdata['aggregate-row-separator'] || '';
        // return renderedRows.join(`\n\n${separator}\n\n`);
        return renderedRows.join(`\n\n \n\n`);
    }

    // 插入 Markdown 到指定文档
    async insertMarkdownToDoc(docId: string, markdown: string, presetName?: string): Promise<void> {
        try {
            if (!docId || !docId.trim()) {
                throw new Error('无效的文档 ID');
            }
            const data = await getBlockByID(docId);
            if (!data) {
                throw new Error('未找到指定的文档块');
            }
            await insertBlock("markdown", markdown, "", "", docId);
            // 插入成功后更新预设的 lastInsertTime
            if (presetName) {
                const currentTime = this.getSiyuanTimestamp(); // 当前时间戳(思源格式)
                await this.updatePresetLastInsertTime(presetName, currentTime);
            }
        } catch (e) {
            console.error('[aggregatorBlock] insertMarkdownToDoc error', e);
            throw e;
        }
    }

    // 将查询到的块绑定到指定的数据库（属性视图）
    async insertBlocksToDatabase(databaseId: string, rows: SQLRawRow[], presetName?: string): Promise<number> {
        if (!databaseId || !databaseId.trim()) {
            throw new Error('无效的数据库 ID');
        }
        if (!Array.isArray(rows) || rows.length === 0) {
            return 0;
        }

        // 构建候选字段顺序：若预设指定使用 parent_id，则优先 parent_id；否则优先 id
        const configuredField: ('id' | 'parent_id') | undefined = (presetName
            ? (await this.getSqlPresets())[presetName]?.databaseIdField
            : undefined) as ('id' | 'parent_id') | undefined;
        const candidateKeys = configuredField === 'parent_id'
            ? ['parent_id', 'block_parent_id', 'id', 'block_id', 'blockId']
            : ['id', 'block_id', 'blockId', 'parent_id', 'block_parent_id'];
        const blockIds: string[] = [];

        for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            let foundId: string | undefined;
            for (const key of candidateKeys) {
                const value = row[key];
                if (typeof value === 'string' && value.trim()) {
                    foundId = value.trim();
                    break;
                }
            }
            if (foundId) {
                blockIds.push(foundId);
            }
        }

        const uniqueIds = Array.from(new Set(blockIds));
        if (!uniqueIds.length) {
            throw new Error('SQL 结果中缺少可用的块 ID 字段，请在 SQL 中包含 id 或 parent_id (或 block_id)');
        }

        try {
            const sources = uniqueIds.map(id => ({
                id,
                isDetached: false,
                itemID: this.avManager.generateId()
            }));
            await this.avManager.batchAddBlocks(databaseId, sources);
            if (presetName) {
                const currentTime = this.getSiyuanTimestamp();
                await this.updatePresetLastInsertTime(presetName, currentTime);
            }
            return uniqueIds.length;
        } catch (error) {
            console.error('[aggregatorBlock] insertBlocksToDatabase error', error);
            throw error;
        }
    }

    // 提示用户输入文档 ID
    async promptForDocId(presetName: string): Promise<string | null> {
        return new Promise(resolve => {
            const { element, destroy } = this.createNativeDialog({
                title: `设置预设 "${presetName}" 的目标文档 ID`,
                content: `
                    <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
                        <div>
                            <label for="docIdInput" style="
                                display: block; 
                                margin-bottom: 8px;
                                font-weight: 500;
                                color: var(--b3-theme-on-background);
                            ">
                                请输入文档块 ID（例如 20250101120000-abc123）:
                            </label>
                            <input 
                                type="text" 
                                id="docIdInput" 
                                placeholder="文档 ID" 
                                class="b3-text-field"
                                style="
                                    width: 100%; 
                                    padding: 8px 12px;
                                    border: 1px solid var(--b3-border-color);
                                    border-radius: var(--b3-border-radius);
                                    font-size: 14px;
                                "
                            >
                        </div>
                        
                        <!-- 操作按钮 -->
                        <div style="
                            display: flex;
                            justify-content: flex-end;
                            gap: 8px;
                            padding-top: 8px;
                            border-top: 1px solid var(--b3-border-color);
                        ">
                            <button class="b3-button b3-button--cancel">取消</button>
                            <button class="b3-button b3-button--primary">确定</button>
                        </div>
                    </div>
                `,
                width: '500px',
                onClose: () => {
                    resolve(input?.value.trim() || null);
                }
            });

            const input = element.querySelector('#docIdInput') as HTMLInputElement;
            const cancelBtn = element.querySelector('.b3-button--cancel');
            const confirmBtn = element.querySelector('.b3-button--primary');

            if (input) {
                input.focus();
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const value = input.value.trim();
                        resolve(value || null);
                        destroy();
                    }
                });
            }

            cancelBtn?.addEventListener('click', () => {
                resolve(null);
                destroy();
            });

            confirmBtn?.addEventListener('click', () => {
                const value = input?.value.trim();
                resolve(value || null);
                destroy();
            });
        });
    }

    // 更新预设的目标文档 ID
    async updatePresetTargetDocId(presetName: string, targetDocId: string): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].targetDocId = targetDocId;
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
            } else {
                console.warn('[aggregatorBlock] preset not found:', presetName);
            }
        } catch (e) {
            console.error('[aggregatorBlock] updatePresetTargetDocId error', e);
        }
    }

    // 更新预设的目标数据库 ID
    async updatePresetTargetDatabaseId(presetName: string, targetDatabaseId: string): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].targetDatabaseId = targetDatabaseId || undefined;
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
            } else {
                console.warn('[aggregatorBlock] preset not found:', presetName);
            }
        } catch (e) {
            console.error('[aggregatorBlock] updatePresetTargetDatabaseId error', e);
        }
    }

    // 更新预设的模板
    async updatePresetTemplate(presetName: string, template: string): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].template = template || undefined; // 空字符串存为 undefined
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
            } else {
                console.warn('[aggregatorBlock] preset not found:', presetName);
            }
        } catch (e) {
            console.error('[aggregatorBlock] updatePresetTemplate error', e);
        }
    }

    // 更新预设的 databaseIdField（id 或 parent_id）
    async updatePresetDatabaseIdField(presetName: string, field: '' | 'id' | 'parent_id'): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].databaseIdField = field || undefined;
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
                console.log(`[aggregatorBlock] 更新预设 "${presetName}" 的 databaseIdField: ${field || '默认(id)'}`);
            } else {
                console.warn('[aggregatorBlock] preset not found:', presetName);
            }
        } catch (e) {
            console.error('[aggregatorBlock] updatePresetDatabaseIdField error', e);
        }
    }

    // 更新预设的 lastInsertTime
    async updatePresetLastInsertTime(presetName: string, timestamp: string): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].lastInsertTime = timestamp || undefined; // 空字符串存为 undefined
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
                console.log(`[aggregatorBlock] 更新预设 "${presetName}" 的 lastInsertTime: ${timestamp || '已清除'}`);
            } else {
                console.warn('[aggregatorBlock] preset not found:', presetName);
            }
        } catch (e) {
            console.error('[aggregatorBlock] updatePresetLastInsertTime error', e);
        }
    }
}
