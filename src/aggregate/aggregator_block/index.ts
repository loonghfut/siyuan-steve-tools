import steveTools from "@/index";
import { getBlockByID, sql as runSql, lsNotebooks, createDailyNote, appendBlock, prependBlock } from '@/api/api';
import { AVManager } from "@/api/db_pro";
import { PluginConfig } from '@/savedata';
import { showMessage, openTab } from "siyuan";
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

    // 对外公开的解析方法：将“文档ID或笔记本ID”解析为当前可插入的文档ID
    // 若是笔记本ID则解析为当日日记的文档ID；若是文档ID则原样返回。
    // 返回 null 表示解析失败或无效 ID。
    public async resolveTargetDocId(targetId: string): Promise<{ docId: string; type: 'doc' | 'notebook' } | null> {
        try {
            return await this.resolveInsertDocId(targetId);
        } catch (e) {
            console.warn('[aggregatorBlock] 解析目标文档ID失败:', e);
            return null;
        }
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
    /**
     * @deprecated 弹窗形式已删除。此方法现已弃用，仅保留以避免破坏向后兼容性。
     * 表格渲染现在仅在页签 UI (ContentAggregatorTabUI) 中使用。
     */
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

        // 获取列名（最多24列），可由设置项 `aggregate-sql-preview-columns` 控制
        const configuredCols = this._settingdata?.['aggregate-sql-preview-columns'];
        let cols: string[] = [];
        if (Array.isArray(configuredCols)) {
            cols = configuredCols.map((s: any) => String(s).trim()).filter((s: string) => !!s);
        } else if (typeof configuredCols === 'string') {
            // 支持逗号分隔、空格分隔，或二者混合
            cols = configuredCols
                .split(/[\,\s]+/)
                .map(s => s.trim())
                .filter(s => !!s);
        }

        if (!cols.length) {
            // 未配置则自动推断并按常见字段优先级排序
            const colSet = new Set<string>();
            for (const r of rows) {
                if (r && typeof r === 'object') {
                    Object.keys(r).forEach(k => colSet.add(k));
                }
                if (colSet.size > 48) break;
            }
            const preferred = ['alias','box','content','created','fcontent','hash','hpath','ial','id','length','markdown','memo'];
            const ordered: string[] = [];
            preferred.forEach(k => { if (colSet.has(k)) ordered.push(k); });
            // 追加剩余未包含的列
            colSet.forEach(k => { if (!ordered.includes(k)) ordered.push(k); });
            cols = ordered;
        }

        // 限制最多 24 列，避免 UI 过挤
        cols = cols.slice(0, 24);

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

    /**
     * 根据数据库 avID（属性视图 ID，而非块 ID）解析其所在块的 blockId。
     * 通过查询 blocks 表中包含该 avID 的 NodeAttributeView 块来定位。
     * 返回首个匹配的块 ID，未找到则返回 null。
     */
    public async resolveAttributeViewBlockId(avID: string): Promise<string | null> {
        if (!avID) return null;
        try {
            const safe = avID.replace(/'/g, "''");
            // 更精确：要求同时包含 NodeAttributeView 标记与 data-av-id，以及具体 avID
            const sql = `
                SELECT id, markdown FROM blocks
                WHERE type = 'av'
                  AND markdown LIKE '%NodeAttributeView%data-av-id%'
                  AND markdown LIKE '%${safe}%'
                ORDER BY updated DESC
                LIMIT 1;
            `;
            const rows = await runSql(sql);
            if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) {
                return rows[0].id as string;
            }
        } catch (e) {
            console.warn('[aggregatorBlock] resolveAttributeViewBlockId failed', e);
        }
        return null;
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
                const preset = presets[name] as PresetItem;
                if (!preset?.timerEnabled) continue;
                const mode = preset.timerMode || 'interval';
                const dailyValid = (mode === 'daily') && Number.isFinite(preset.dailyHour) && Number.isFinite(preset.dailyMinute);
                const intervalValid = (mode === 'interval') && !!preset.timerInterval;
                if (dailyValid || intervalValid) {
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
    /**
     * showPresetSelector 已移除 - 该方法使用弹窗形式，现在预设选择通过页签(ContentAggregatorTabUI)完成
     */

    /**
     * 在指定容器内渲染“预设列表”的非模态版
     * 返回控制器可用于刷新或卸载
     */
    // public mountPresetList(container: HTMLElement, options?: {
    //     onUse?: (payload: { name: string; preset: PresetItem }) => void;
    // }): { refresh: () => Promise<void>; unmount: () => void } {
    //     let disposed = false;

    //     const searchId = `st-preset-inline-search-${Date.now()}`;
    //     const listId = `st-preset-inline-list-${Date.now()}`;
    //     container.innerHTML = `
    //         <div style="padding: 8px; display: flex; flex-direction: column; gap: 8px;">
    //             <input id="${searchId}" class="b3-text-field" placeholder="搜索预设名称或 SQL..." style="
    //                 width: 100%; padding: 8px 12px; border: 1px solid var(--b3-border-color); border-radius: var(--b3-border-radius);
    //                 background: var(--b3-theme-surface); color: var(--b3-theme-on-background); font-size: 14px;" />
    //             <div id="${listId}" style="max-height: calc(100% - 40px); overflow-y: auto; display: flex; flex-direction: column; gap: 8px;"></div>
    //         </div>
    //     `;

    //     const searchInput = container.querySelector(`#${searchId}`) as HTMLInputElement | null;
    //     const listEl = container.querySelector(`#${listId}`) as HTMLElement | null;

    //     const renderPresets = async (filterText: string = '') => {
    //         if (disposed) return;
    //         if (!listEl) return;
    //         listEl.innerHTML = '';
    //         try {
    //             const presets = await this.getSqlPresets();
    //             const sortedEntries = Object.entries(presets).sort((a, b) => {
    //                 const pa = a[1] as PresetItem; const pb = b[1] as PresetItem;
    //                 const aTime = (pa.updatedAt || pa.lastExecuteTime || 0) as number;
    //                 const bTime = (pb.updatedAt || pb.lastExecuteTime || 0) as number;
    //                 if (aTime !== bTime) return bTime - aTime;
    //                 return a[0].localeCompare(b[0], 'zh-CN');
    //             });
    //             const names = sortedEntries.map(([n]) => n);
    //             const filter = filterText.toLowerCase().trim();
    //             const filtered = filter ? names.filter(n => n.toLowerCase().includes(filter) || String(presets[n].sql || '').toLowerCase().includes(filter)) : names;

    //             if (!filtered.length) {
    //                 listEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--b3-theme-on-surface-light);">${filter ? '未找到匹配的预设' : '暂无预设'}</div>`;
    //                 return;
    //             }

    //             // 校验绑定有效性
    //             const validityChecks = await Promise.all(
    //                 filtered.map(async n => {
    //                     const preset = presets[n];
    //                     let docValid = true; let docType: 'doc' | 'notebook' | undefined;
    //                     if (preset.targetDocId) {
    //                         const isDoc = await this.checkDocValidity(preset.targetDocId);
    //                         if (isDoc) { docValid = true; docType = 'doc'; }
    //                         else {
    //                             const isNb = await this.isNotebookId(preset.targetDocId);
    //                             docValid = !!isNb; docType = isNb ? 'notebook' : undefined;
    //                         }
    //                     }
    //                     let databaseValid = true;
    //                     if (preset.targetDatabaseId) {
    //                         try { await this.avManager.getAttributeView(preset.targetDatabaseId); }
    //                         catch { databaseValid = false; }
    //                     }
    //                     return { name: n, docValid, docType, databaseValid };
    //                 })
    //             );
    //             const validityMap = new Map(validityChecks.map(v => [v.name, v]));

    //             for (const n of filtered) {
    //                 const preset = presets[n] as PresetItem;
    //                 const validity = validityMap.get(n);
    //                 const item = document.createElement('div');
    //                 item.style.cssText = 'padding:12px; background: var(--b3-theme-surface); border:1px solid var(--b3-border-color); border-radius: var(--b3-border-radius);';
    //                 item.innerHTML = `
    //                     <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
    //                         <div style="flex:1; min-width:0;">
    //                             <div style="font-weight:500; color: var(--b3-theme-on-background); margin-bottom:6px; display:flex; gap:6px; align-items:center;">
    //                                 <svg style="width: 16px; height: 16px; fill: var(--b3-theme-primary);"><use xlink:href="#iconSQL"></use></svg>
    //                                 ${n}
    //                                 ${validity ? (((preset as any).pinned || (preset as any).starred || (preset as any).favorite || (preset as any).top || /^(?:[!*★☆]|🔖|pin:|star:)/i.test(n)) ? '<span style=\"font-size:11px;padding:2px 6px;background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);border-radius:var(--b3-border-radius-s);\">置顶</span>' : '') : ''}
    //                             </div>
    //                             <div style="font-size:12px; color: var(--b3-theme-on-surface); font-family: var(--b3-font-family-code); background: var(--b3-protyle-code-background); padding:6px 8px; border-radius: var(--b3-border-radius-s); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${preset.sql}</div>
    //                             <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
    //                                 ${preset.template ? `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-theme-primary-lightest); color: var(--b3-theme-primary); border-radius: var(--b3-border-radius-s);\">自定义模板</span>` : ''}
    //                                 ${preset.updatedAt ? (() => {
    //                                     const short = new Date(preset.updatedAt as number).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    //                                     return `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-theme-surface-light); color: var(--b3-theme-on-surface); border-radius: var(--b3-border-radius-s);\">最近修改: ${short}</span>`;
    //                                 })() : ''}
    //                                 ${preset.targetDocId ? (validity?.docValid ? `<span style=\"font-size:11px;padding:2px 8px;background: rgba(101,184,77,0.12); color: var(--b3-theme-success); border-radius: var(--b3-border-radius-s);\">${validity?.docType === 'notebook' ? '笔记本日记' : '已绑定文档'}</span>` : `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-card-error-background); color: var(--b3-card-error-color); border-radius: var(--b3-border-radius-s);\">无效文档绑定</span>`) : ''}
    //                                 ${preset.targetDatabaseId ? (validity?.databaseValid ? `<span style=\"font-size:11px;padding:2px 8px;background: rgba(70,130,180,0.12); color:#1976d2; border-radius: var(--b3-border-radius-s);\">已绑定数据库</span>` : `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-card-error-background); color: var(--b3-card-error-color); border-radius: var(--b3-border-radius-s);\">无效数据库绑定</span>`) : ''}
    //                             </div>
    //                         </div>
    //                         <div style="display:flex; gap:8px; flex-shrink:0;">
    //                             <button class="b3-button b3-button--outline inline-pin" style="padding:6px 12px; font-size:13px; ${((preset as any).pinned ? 'background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary); color: var(--b3-theme-primary);' : '')}" title="${((preset as any).pinned ? '取消置顶' : '设为置顶')}">${((preset as any).pinned ? '取消置顶' : '置顶')}</button>
    //                             <button class="b3-button b3-button--outline inline-edit" style="padding:6px 12px; font-size:13px;">编辑1</button>
    //                             <button class="b3-button b3-button--outline inline-timer" style="padding:6px 12px; font-size:13px; ${preset.timerEnabled ? 'background: rgba(255, 193, 7, 0.12); border-color: #f57c00; color: #f57c00;' : ''}" title="${preset.timerEnabled ? '定时已启用' : '设置定时更新'}">定时</button>
    //                             <button class="b3-button b3-button--primary inline-use" style="padding:6px 12px; font-size:13px;">使用</button>
    //                         </div>
    //                     </div>
    //                 `;

    //                 // 绑定事件
    //                 const editBtn = item.querySelector('.inline-edit');
    //                 editBtn?.addEventListener('click', (e) => {
    //                     e.stopPropagation();
    //                     // 打开内容聚合器页签（编辑在其中进行）
    //                     try {
    //                         openTab({
    //                             app: (window as any).siyuan.ws.app,
    //                             custom: {
    //                                 icon: 'iconDatabase',
    //                                 title: '内容聚合器',
    //                                 id: this._plugin.name + 'content-aggregator',
    //                                 data: { id: null }
    //                             },
    //                             keepCursor: false,
    //                         });
    //                     } catch (err) {
    //                         console.warn('打开内容聚合页签失败:', err);
    //                     }
    //                 });

    //                 // 置顶按钮
    //                 const pinBtn = item.querySelector('.inline-pin');
    //                 pinBtn?.addEventListener('click', async (e) => {
    //                     e.stopPropagation();
    //                     try {
    //                         const newPinned = !((preset as any).pinned);
    //                         await this.updatePresetPinned(n, newPinned);
    //                         // 本地对象更新后刷新列表
    //                         await renderPresets(searchInput?.value || '');
    //                         showMessage(newPinned ? '已置顶该预设' : '已取消置顶', 2500, 'info');
    //                     } catch (err) {
    //                         console.warn('更新置顶状态失败', err);
    //                         showMessage('更新置顶状态失败', 3000, 'error');
    //                     }
    //                 });

    //                 const timerBtn = item.querySelector('.inline-timer');
    //                 timerBtn?.addEventListener('click', (e) => {
    //                     e.stopPropagation();
    //                     // 打开内容聚合器页签（定时设置在其中进行）
    //                     try {
    //                         openTab({
    //                             app: (window as any).siyuan.ws.app,
    //                             custom: {
    //                                 icon: 'iconDatabase',
    //                                 title: '内容聚合器',
    //                                 id: this._plugin.name + 'content-aggregator',
    //                                 data: { id: null }
    //                             },
    //                             keepCursor: false,
    //                         });
    //                     } catch (err) {
    //                         console.warn('打开内容聚合页签失败:', err);
    //                     }
    //                 });

    //                 const useBtn = item.querySelector('.inline-use');
    //                 useBtn?.addEventListener('click', async (e) => {
    //                     e.stopPropagation();
    //                     if (options?.onUse) options.onUse({ name: n, preset });
    //                     else await this.runPresetByName(n);
    //                 });

    //                 listEl.appendChild(item);
    //             }
    //         } catch (e) {
    //             listEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--b3-theme-error);">加载失败: ${e?.message || String(e)}</div>`;
    //         }
    //     };

    //     const onInput = () => renderPresets(searchInput?.value || '');
    //     searchInput?.addEventListener('input', onInput);

    //     // 首次渲染
    //     renderPresets();

    //     return {
    //         refresh: () => renderPresets(searchInput?.value || ''),
    //         unmount: () => {
    //             disposed = true;
    //             searchInput?.removeEventListener('input', onInput);
    //             container.innerHTML = '';
    //         }
    //     };
    // }

    /**
     * showPresetEditor 已移除（弹窗形式已删除）
     * 编辑功能现在通过 ContentAggregatorTabUI（页签）完成
     */

    /**
     * 显示定时设置对话框
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
                            <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
                                <label for="edit-doc-insert-mode" style="font-size: 12px; color: var(--b3-theme-on-surface);">文档插入位置:</label>
                                <select id="edit-doc-insert-mode" class="b3-select">
                                    <option value="append" ${((preset as any).docInsertMode === 'append') || (!('docInsertMode' in preset) && (this._settingdata?.['aggregate-insert-mode'] !== 'prepend')) ? 'selected' : ''}>末尾 (append)</option>
                                    <option value="prepend" ${((preset as any).docInsertMode === 'prepend') || (!('docInsertMode' in preset) && (this._settingdata?.['aggregate-insert-mode'] === 'prepend')) ? 'selected' : ''}>开头 (prepend)</option>
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
                                这里设置仅影响该预设；留空则使用全局设置（默认：末尾）。
                            </div>
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
                const docInsertModeSelect = element.querySelector('#edit-doc-insert-mode') as HTMLSelectElement;

                const newTemplate = templateTextarea?.value.trim() || '';
                const newTargetDocId = targetDocInput?.value.trim() || '';
                const newTargetDatabaseId = targetDatabaseInput?.value.trim() || '';
                const newLastInsertTime = lastInsertTimeInput?.value.trim() || '';
                const newDatabaseIdField = (dbIdFieldSelect?.value === 'parent_id' ? 'parent_id' : 'id') as 'id' | 'parent_id';
                const newDocInsertMode = (docInsertModeSelect?.value === 'prepend' ? 'prepend' : 'append') as 'append' | 'prepend';

                // 更新预设
                preset.template = newTemplate || undefined;
                preset.targetDocId = newTargetDocId || undefined;
                preset.targetDatabaseId = newTargetDatabaseId || undefined;
                preset.lastInsertTime = newLastInsertTime || undefined;
                preset.databaseIdField = newTargetDatabaseId ? newDatabaseIdField : undefined; // 仅在设置了数据库ID时生效
                (preset as any).docInsertMode = newDocInsertMode || undefined;
                allPresets[name] = preset;

                // 保存到配置
                await this.updatePresetTemplate(name, newTemplate);
                await this.updatePresetTargetDocId(name, newTargetDocId);
                await this.updatePresetTargetDatabaseId(name, newTargetDatabaseId);
                await this.updatePresetLastInsertTime(name, newLastInsertTime);
                await this.updatePresetDatabaseIdField(name, preset.databaseIdField || '');
                await this.updatePresetDocInsertMode(name, newDocInsertMode);

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
    /**
     * @deprecated 弹窗形式已删除。此方法现已弃用。
     * 定时设置现在通过页签 UI (ContentAggregatorTabUI) 完成。
     */
    private async showTimerSettings(name: string, preset: PresetItem, allPresets: Record<string, PresetItem>): Promise<boolean> {
        return new Promise((resolve) => {
            const currentEnabled = preset.timerEnabled || false;
            const currentMode = (preset.timerMode || 'interval') as ('interval'|'daily');
            const currentUnit = preset.timerUnit || 'hours';
            const currentValue = preset.timerValue || 1;
            const currentDailyHour = Number.isFinite(preset.dailyHour) ? (preset.dailyHour as number) : 9;
            const currentDailyMinute = Number.isFinite(preset.dailyMinute) ? (preset.dailyMinute as number) : 0;

            const { element, destroy } = this.createNativeDialog({
                title: `定时设置: ${name}`,
                content: `
                    <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px;">
                        <!-- 模式切换 -->
                        <div id="timer-mode-wrap" style="
                            display: ${currentEnabled ? 'block' : 'none'};
                            align-items: center;
                            justify-content: space-between;
                            padding: 16px;
                            background: var(--b3-theme-surface);
                            border-radius: var(--b3-border-radius);
                            <label style="
                                display: block;
                                margin-bottom: 12px;
                                font-weight: 500;
                                color: var(--b3-theme-on-background);
                                font-size: 14px;
                            ">
                                <svg style="width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px;"><use xlink:href="#iconSetting"></use></svg>
                                定时模式
                            </label>
                            <div style="display:flex; gap: 8px; align-items:center; margin-bottom: 12px;">
                                <select id="timer-mode" class="b3-select">
                                    <option value="interval" ${currentMode === 'interval' ? 'selected' : ''}>按间隔</option>
                                    <option value="daily" ${currentMode === 'daily' ? 'selected' : ''}>每日固定时间</option>
                                </select>
                            </div>
                            <!-- 定时间隔设置 -->
                            <div id="timer-interval-settings" style="display: ${currentMode === 'interval' ? 'block' : 'none'};">
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
                            </div>

                            <!-- 每日固定时间设置 -->
                            <div id="timer-daily-settings" style="display: ${currentMode === 'daily' ? 'block' : 'none'}; margin-top: 12px;">
                                <label style="
                                    display: block;
                                    margin-bottom: 12px;
                                    font-weight: 500;
                                    color: var(--b3-theme-on-background);
                                    font-size: 14px;
                                ">
                                    <svg style="width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px;"><use xlink:href="#iconCalendar"></use></svg>
                                    每日执行时间
                                </label>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input id="daily-hour" type="number" min="0" max="23" value="${currentDailyHour}" class="b3-text-field" style="width: 80px;" />
                                    <span style="color: var(--b3-theme-on-surface);">:</span>
                                    <input id="daily-minute" type="number" min="0" max="59" value="${currentDailyMinute}" class="b3-text-field" style="width: 80px;" />
                                    <span style="font-size:12px; color: var(--b3-theme-on-surface-light);">24小时制</span>
                                </div>
                            </div>

                            border: 1px solid var(--b3-border-color);
                        ">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <svg style="width: 20px; height: 20px; fill: var(--b3-theme-primary);"><use xlink:href="#iconClock"></use></svg>
                                <div>
                                    <div style="font-weight: 500; color: var(--b3-theme-on-background);">启用定时更新</div>
                                    <div style="font-size: 12px; color: var(--b3-theme-on-surface-light); margin-top: 2px;">
                                        自动执行聚合并插入到目标文档
                                    </div>
                                定时器将在保存后立即生效
                            </div>
                        </div>
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
            const modeWrap = element.querySelector('#timer-mode-wrap') as HTMLElement;
            const modeSelect = element.querySelector('#timer-mode') as HTMLSelectElement;
            const intervalSettings = element.querySelector('#timer-interval-settings') as HTMLElement;
            const dailySettings = element.querySelector('#timer-daily-settings') as HTMLElement;
            const valueInput = element.querySelector('#timer-value') as HTMLInputElement;
            const unitSelect = element.querySelector('#timer-unit') as HTMLSelectElement;
            const dailyHourInput = element.querySelector('#daily-hour') as HTMLInputElement;
            const dailyMinuteInput = element.querySelector('#daily-minute') as HTMLInputElement;
            const cancelBtn = element.querySelector('.b3-button--cancel');
            const confirmBtn = element.querySelector('.b3-button--primary');

            // 切换显示/隐藏间隔设置
            const refreshModeVisibility = () => {
                if (!modeWrap) return;
                modeWrap.style.display = enabledSwitch.checked ? 'block' : 'none';
                const mode = (modeSelect?.value || 'interval');
                if (intervalSettings) intervalSettings.style.display = mode === 'interval' ? 'block' : 'none';
                if (dailySettings) dailySettings.style.display = mode === 'daily' ? 'block' : 'none';
            };
            enabledSwitch?.addEventListener('change', refreshModeVisibility);
            modeSelect?.addEventListener('change', refreshModeVisibility);
            // 初始化一次
            refreshModeVisibility();

            // 取消按钮
            cancelBtn?.addEventListener('click', () => {
                resolve(false);
                destroy();
            });

            // 保存按钮
            confirmBtn?.addEventListener('click', async () => {
                const enabled = enabledSwitch?.checked || false;
                const modeVal = (modeSelect?.value || 'interval') as ('interval'|'daily');
                // 更新预设共通
                preset.timerEnabled = enabled;
                preset.timerMode = modeVal;

                if (!enabled) {
                    preset.nextExecuteTime = undefined;
                    preset.lastExecuteTime = undefined;
                    // 清理与模式相关的参数但保留之前配置以便再次启用时回填
                    // 不做强制清理，减少意外丢失；仅不计算 next
                } else if (modeVal === 'interval') {
                    const value = parseInt(valueInput?.value || '1');
                    const unit = unitSelect?.value as 'minutes' | 'hours' | 'days';
                    if (!value || value < 1) {
                        showMessage('请输入有效的时间间隔', 3000, 'error');
                        return;
                    }
                    let intervalMs = 0;
                    switch (unit) {
                        case 'minutes': intervalMs = value * 60 * 1000; break;
                        case 'hours': intervalMs = value * 60 * 60 * 1000; break;
                        case 'days': intervalMs = value * 24 * 60 * 60 * 1000; break;
                    }
                    preset.timerInterval = intervalMs;
                    preset.timerUnit = unit;
                    preset.timerValue = value;
                    // 立即安排下一次
                    const now = Date.now();
                    preset.nextExecuteTime = now + intervalMs;
                    // 清理 daily 字段
                    preset.dailyHour = undefined;
                    preset.dailyMinute = undefined;
                } else {
                    // daily
                    const h = Math.max(0, Math.min(23, parseInt(dailyHourInput?.value || '0')));
                    const mm = Math.max(0, Math.min(59, parseInt(dailyMinuteInput?.value || '0')));
                    preset.dailyHour = h;
                    preset.dailyMinute = mm;
                    // 清理 interval 字段（互斥）
                    preset.timerInterval = undefined;
                    // nextExecuteTime: 如果未来还有今日时点，则为今日，否则为明日
                    const now = new Date();
                    const today = new Date();
                    today.setHours(h, mm, 0, 0);
                    if (now.getTime() < today.getTime()) {
                        preset.nextExecuteTime = today.getTime();
                    } else {
                        const tmr = new Date();
                        tmr.setDate(tmr.getDate() + 1);
                        tmr.setHours(h, mm, 0, 0);
                        preset.nextExecuteTime = tmr.getTime();
                    }
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
    async updatePresetTimerSettings(presetName: string, preset: PresetItem, options?: { skipUpdatedAt?: boolean }): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].timerEnabled = preset.timerEnabled;
                current[presetName].timerMode = preset.timerMode;
                current[presetName].timerInterval = preset.timerInterval;
                current[presetName].timerUnit = preset.timerUnit;
                current[presetName].timerValue = preset.timerValue;
                current[presetName].dailyHour = preset.dailyHour;
                current[presetName].dailyMinute = preset.dailyMinute;
                current[presetName].lastExecuteTime = preset.lastExecuteTime;
                current[presetName].nextExecuteTime = preset.nextExecuteTime;
                // 仅在手动修改定时设置时更新最近修改时间
                if (!options?.skipUpdatedAt) {
                    current[presetName].updatedAt = Date.now();
                }
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
    /**
     * runPresetPreviewFlow 已移除 - 该方法依赖于弹窗选择器(showPresetSelector)
     * 相关流程现通过 ContentAggregatorTabUI（页签）完成
     */

    /**
     * promptForDocId 已移除 - 仅用于弹窗流程，页签中有自己的处理方式
     */

    // 直接按名称执行预设（无选择器）
    public async runPresetByName(name: string): Promise<void> {
        try {
            const all = await this.getSqlPresets();
            const preset = all[name];
            if (!preset) {
                showMessage(`未找到预设: ${name}`, 4000, 'info');
                return;
            }

            let targetDocId = preset.targetDocId;
            const targetDatabaseId = preset.targetDatabaseId;
            if (!targetDocId && !targetDatabaseId) {
                showMessage('请先在预设中配置目标文档或数据库', 4000, 'info');
                return;
            }
            const lastInsertTime = preset.lastInsertTime || '';

            let resolvedDoc: { docId: string; type: 'doc' | 'notebook' } | null = null;
            if (targetDocId) {
                const resolved = await this.resolveInsertDocId(targetDocId);
                if (resolved) { resolvedDoc = resolved; targetDocId = resolved.docId; }
            }

            const sqlResult = await this.executeSql(preset.sql, resolvedDoc?.docId, lastInsertTime);
            if (!sqlResult || sqlResult.length === 0) {
                showMessage('没有新数据可插入', 3000, 'info');
                return;
            }

            const operations: string[] = [];
            const errors: string[] = [];

            if (resolvedDoc?.docId) {
                try {
                    const renderedMd = this.renderTemplate(preset, sqlResult);
                    await this.insertMarkdownToDoc(resolvedDoc.docId, renderedMd, name);
                    operations.push(`文档 ${sqlResult.length} 条`);
                } catch (e: any) {
                    errors.push(`文档: ${e?.message || String(e)}`);
                }
            }

            if (targetDatabaseId) {
                try {
                    const insertedCount = await this.insertBlocksToDatabase(targetDatabaseId, sqlResult, name);
                    operations.push(`数据库 ${insertedCount} 块`);
                } catch (e: any) {
                    errors.push(`数据库: ${e?.message || String(e)}`);
                }
            }

            if (operations.length) {
                showMessage(`执行完成：${operations.join('，')}`, 3000, 'info');
            }
            if (errors.length) {
                showMessage(`部分失败：${errors.join('；')}`, 5000, 'error');
            }
            if (!operations.length && !errors.length) {
                showMessage('未执行任何插入操作，请检查预设配置', 4000, 'info');
            }

            // 手动执行后更新 lastExecuteTime 以供右键菜单显示最近执行时间
            try {
                if (this.pluginConfig) {
                    await this.pluginConfig.load();
                    const current = this.pluginConfig.get('presets') || {};
                    if (current[name]) {
                        current[name].lastExecuteTime = Date.now();
                        this.pluginConfig.set('presets', current);
                        await this.pluginConfig.save();
                    }
                }
            } catch (err) {
                console.warn('[aggregatorBlock] 更新 lastExecuteTime 失败', err);
            }
        } catch (e: any) {
            console.error('[aggregatorBlock] runPresetByName error', e);
            showMessage(`执行失败: ${e?.message || String(e)}`, 5000, 'error');
        }
    }

    /**
     * 获取置顶/收藏的预设列表
     * 置顶识别规则（任意命中即视为置顶）：
     *  1. 预设对象存在 pinned/starred/favorite/top 字段且为 true
     *  2. 预设名称以特殊前缀开头: ! * ★ ☆ 🔖 pin: star:
     */
    public async getPinnedPresets(): Promise<Array<{ name: string; preset: PresetItem }>> {
        const all = await this.getSqlPresets();
        const result: Array<{ name: string; preset: PresetItem }> = [];
        const pinNameReg = /^(?:[!*★☆]|🔖|pin:|star:)/i;
        for (const [name, preset] of Object.entries(all)) {
            const p: any = preset;
            const flagged = !!(p.pinned || p.starred || p.favorite || p.top || pinNameReg.test(name));
            if (flagged) {
                result.push({ name, preset: preset as PresetItem });
            }
        }
        // 最近手动或定时执行的排在前面
        result.sort((a, b) => {
            const ta = (a.preset as any).lastExecuteTime || (a.preset as any).updatedAt || 0;
            const tb = (b.preset as any).lastExecuteTime || (b.preset as any).updatedAt || 0;
            if (ta !== tb) return tb - ta;
            return a.name.localeCompare(b.name, 'zh-CN');
        });
        return result;
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

    // 插入 Markdown 到指定文档（支持开头/末尾两种模式）
    async insertMarkdownToDoc(docId: string, markdown: string, presetName?: string): Promise<void> {
        try {
            if (!docId || !docId.trim()) {
                throw new Error('无效的文档 ID');
            }
            const data = await getBlockByID(docId);
            if (!data) {
                throw new Error('未找到指定的文档块');
            }
            // 读取插入模式：优先预设项，其次全局设置，默认 append
            let insertMode: 'append' | 'prepend' = 'append';
            if (presetName) {
                try {
                    const presets = await this.getSqlPresets();
                    const preset = presets[presetName] as PresetItem | undefined;
                    if (preset && (preset as any).docInsertMode && (preset as any).docInsertMode !== '') {
                        const m = String((preset as any).docInsertMode);
                        if (m === 'prepend' || m === 'append') insertMode = m;
                    }
                } catch {}
            }
            if (!presetName || insertMode === 'append') {
                // 如果全局设置覆盖
                const globalMode = String(this._settingdata?.['aggregate-insert-mode'] || '').trim();
                if (globalMode === 'prepend') insertMode = 'prepend';
            }

            if (insertMode === 'prepend') {
                await prependBlock('markdown', markdown, docId);
            } else {
                await appendBlock('markdown', markdown, docId);
            }
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
                current[presetName].updatedAt = Date.now();
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
                current[presetName].updatedAt = Date.now();
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
                current[presetName].updatedAt = Date.now();
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
                current[presetName].updatedAt = Date.now();
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

    // 更新预设的文档插入位置（append 或 prepend）
    async updatePresetDocInsertMode(presetName: string, mode: '' | 'append' | 'prepend'): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].docInsertMode = mode || undefined; // 空字符串存为 undefined
                current[presetName].updatedAt = Date.now();
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
                console.log(`[aggregatorBlock] 更新预设 "${presetName}" 的文档插入位置: ${mode || '默认(跟随全局)'}`);
            } else {
                console.warn('[aggregatorBlock] preset not found:', presetName);
            }
        } catch (e) {
            console.error('[aggregatorBlock] updatePresetDocInsertMode error', e);
        }
    }

    // 更新预设的置顶状态（pinned）
    async updatePresetPinned(presetName: string, pinned: boolean): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot update preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current[presetName]) {
                current[presetName].pinned = pinned;
                current[presetName].updatedAt = Date.now();
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
                console.log(`[aggregatorBlock] 更新预设 "${presetName}" 的置顶状态: ${pinned}`);
            } else {
                console.warn('[aggregatorBlock] preset not found:', presetName);
            }
        } catch (e) {
            console.error('[aggregatorBlock] updatePresetPinned error', e);
        }
    }
}
