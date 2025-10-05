import steveTools from "@/index";
import { getBlockByID, insertBlock, sql as runSql } from '@/api/api';
import { PluginConfig } from '@/savedata';
import { showMessage } from "siyuan";
import { PresetItem, SQLRawRow } from "../echarts/types/types";

export class aggregatorBlock {
    private _settingdata: any;
    private _plugin: steveTools;

    // 可选的 PluginConfig 实例（若宿主模块提供）
    private pluginConfig?: PluginConfig;

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

    // HTML转义
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

        // 点击遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                destroy();
            }
        });

        // ESC键关闭
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                destroy();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(overlay);

        return { element: dialog, destroy };
    }

    async init(settingdata: any) {
        this._settingdata = settingdata;

        // 使用字段以避免未使用的编译/lint 警告
        void this._plugin;
        void this._settingdata;
        console.log("aggregatorBlock 模块初始化");
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
            const renderPresets = (filterText: string = '') => {
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

                filteredNames.forEach(n => {
                    const preset = presets[n];
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
                                    ${preset.targetDocId ? `
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
                                            已绑定文档
                                        </span>
                                    ` : ''}
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
                                    <svg style="width: 14px; height: 14px;"><use xlink:href="#iconEdit"></use></svg>
                                    编辑
                                </button>
                                <button class="b3-button b3-button--primary use-preset-btn" style="
                                    padding: 6px 12px;
                                    font-size: 13px;
                                    display: flex;
                                    align-items: center;
                                    gap: 4px;
                                ">
                                    <svg style="width: 14px; height: 14px;"><use xlink:href="#iconSelect"></use></svg>
                                    使用
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
                        await this.showPresetEditor(n, preset, presets);
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
     */
    private async showPresetEditor(name: string, preset: PresetItem, allPresets: Record<string, PresetItem>): Promise<void> {
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
                                    height: 120px; 
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
                                目标文档 ID (可选)
                            </label>
                            <input 
                                id="edit-target-doc" 
                                class="b3-text-field" 
                                value="${preset.targetDocId || ''}"
                                placeholder="输入文档 ID,用于自动插入渲染结果"
                                style="
                                    width: 100%;
                                    padding: 8px;
                                    border: 1px solid var(--b3-border-color);
                                    border-radius: var(--b3-border-radius);
                                    font-size: 13px;
                                "
                            />
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
                    resolve();
                }
            });

            // 按钮事件
            const cancelBtn = element.querySelector('.b3-button--cancel');
            const confirmBtn = element.querySelector('.b3-button--primary');
            const previewBtn = element.querySelector('#preview-sql-btn') as HTMLButtonElement;
            const previewContainer = element.querySelector('#sql-preview-container') as HTMLElement;

            cancelBtn?.addEventListener('click', () => {
                destroy();
                resolve();
            });

            confirmBtn?.addEventListener('click', async () => {
                const templateTextarea = element.querySelector('#edit-template') as HTMLTextAreaElement;
                const targetDocInput = element.querySelector('#edit-target-doc') as HTMLInputElement;
                const lastInsertTimeInput = element.querySelector('#edit-last-insert-time') as HTMLInputElement;

                const newTemplate = templateTextarea?.value.trim() || '';
                const newTargetDocId = targetDocInput?.value.trim() || '';
                const newLastInsertTime = lastInsertTimeInput?.value.trim() || '';

                // 更新预设
                preset.template = newTemplate || undefined;
                preset.targetDocId = newTargetDocId || undefined;
                preset.lastInsertTime = newLastInsertTime || undefined;
                allPresets[name] = preset;

                // 保存到配置
                await this.updatePresetTemplate(name, newTemplate);
                await this.updatePresetTargetDocId(name, newTargetDocId);
                await this.updatePresetLastInsertTime(name, newLastInsertTime);

                showMessage('预设已更新', 3000, 'info');
                destroy();
                resolve();
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

                    // 使用和实际执行相同的参数：排除文档ID和时间过滤
                    const results = await this.executeSql(previewSql, currentTargetDocId || undefined, currentLastInsertTime || undefined);

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

        // 检查是否有目标文档 ID，如果没有，提示用户输入并保存
        let targetDocId = preset.preset.targetDocId;
        if (!targetDocId) {
            targetDocId = await this.promptForDocId(preset.name);
            if (!targetDocId) {
                console.log('用户取消输入文档 ID');
                return;
            }
            // 保存到预设
            await this.updatePresetTargetDocId(preset.name, targetDocId);
            preset.preset.targetDocId = targetDocId; // 更新本地对象
        }

        // 获取上次插入时间，用于过滤已处理的内容
        const lastInsertTime = preset.preset.lastInsertTime || '';
        console.log(`[aggregatorBlock] 上次插入时间: ${lastInsertTime}`);

        const sqlResult = await this.executeSql(preset.preset.sql, targetDocId, lastInsertTime);
        console.log(sqlResult);

        // 如果没有新数据，提示用户
        if (!sqlResult || sqlResult.length === 0) {
            showMessage('没有新的数据需要插入', 3000, 'info');
            return;
        }

        // 使用模板渲染 SQL 结果为 Markdown（优先使用预设模板）
        const renderedMd = this.renderTemplate(preset.preset, sqlResult);
        // console.log('Rendered Markdown:', renderedMd);

        // 插入到指定文档
        try {
            await this.insertMarkdownToDoc(targetDocId, renderedMd, preset.name);
            console.log('成功插入到文档:', targetDocId);
            showMessage(`成功插入 ${sqlResult.length} 条数据`, 3000, 'info');
        } catch (e) {
            console.error('插入失败:', e);
            showMessage('插入失败: ' + e.message, 3000, 'error');
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
        const separator = this._settingdata['aggregate-row-separator'] || '---';
        return renderedRows.join(`\n\n${separator}\n\n`);
    }

    // 插入 Markdown 到指定文档
    async insertMarkdownToDoc(docId: string, markdown: string, presetName?: string): Promise<void> {
        try {
            if (!docId || !docId.trim()) {
                throw new Error('无效的文档 ID');
            }
            const data = await getBlockByID(docId);
            if(!data){
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
                    resolve(null);
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
                        destroy();
                        resolve(value || null);
                    }
                });
            }

            cancelBtn?.addEventListener('click', () => {
                destroy();
                resolve(null);
            });

            confirmBtn?.addEventListener('click', () => {
                const value = input?.value.trim();
                destroy();
                resolve(value || null);
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
