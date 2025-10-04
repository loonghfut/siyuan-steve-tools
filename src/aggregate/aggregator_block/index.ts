import steveTools from "@/index";
import { sql as runSql } from '@/api/api';
import { PluginConfig } from '@/savedata';

export class aggregatorBlock {
    private _settingdata: any;
    private _plugin: steveTools;

    // 可选的 PluginConfig 实例（若宿主模块提供）
    private pluginConfig?: PluginConfig;

    constructor(plugin: steveTools, pluginConfig?: PluginConfig) {
        this._plugin = plugin;
        this.pluginConfig = pluginConfig;
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
            const p = this.pluginConfig.get('presets') || {};
            return p;
        } catch (e) {
            console.debug('[aggregatorBlock] getSqlPresets failed', e);
            return {};
        }
    }

    // 添加单个预设（不覆盖其它预设）
    async addSqlPreset(name: string, preset: any): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot add preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            current[name] = preset;
            this.pluginConfig.set('presets', current);
            await this.pluginConfig.save();
        } catch (e) {
            console.error('[aggregatorBlock] addSqlPreset error', e);
        }
    }

    // 删除指定名称的预设
    async removeSqlPreset(name: string): Promise<void> {
        try {
            if (!this.pluginConfig) {
                console.error('[aggregatorBlock] cannot remove preset: pluginConfig not provided');
                return;
            }
            const current = this.pluginConfig.get('presets') || {};
            if (current && Object.prototype.hasOwnProperty.call(current, name)) {
                delete current[name];
                this.pluginConfig.set('presets', current);
                await this.pluginConfig.save();
            } else {
                console.warn('[aggregatorBlock] removeSqlPreset: preset not found', name);
            }
        } catch (e) {
            console.error('[aggregatorBlock] removeSqlPreset error', e);
        }
    }

    // 2. 生成预设选择面板（简化版）：在 document 上弹出一个选择框，返回所选预设名或 null
    // 该函数会渲染一个简单 modal 列表，用户点击项后关闭并 resolve 名称
    async showPresetSelector(): Promise<{ name: string; preset: any } | null> {
        const presets = await this.getSqlPresets();
        const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:99999';
            const dialog = document.createElement('div');
            dialog.style.cssText = 'width:min(600px,90vw);max-height:80vh;overflow:auto;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;padding:12px;';
            const title = document.createElement('div');
            title.textContent = '选择 SQL 预设';
            title.style.fontWeight = '600';
            title.style.marginBottom = '8px';
            dialog.appendChild(title);
            const list = document.createElement('div');
            if (!names.length) {
                const empty = document.createElement('div');
                empty.textContent = '暂无预设';
                empty.style.color = 'var(--vsb-muted, #9ca3af)';
                list.appendChild(empty);
            } else {
                for (const n of names) {
                    const it = document.createElement('div');
                    it.textContent = n;
                    it.style.padding = '8px';
                    it.style.borderBottom = '1px solid var(--b3-border-color)';
                    it.style.cursor = 'pointer';
                    it.addEventListener('click', () => {
                        overlay.remove();
                        resolve({ name: n, preset: presets[n] });
                    });
                    list.appendChild(it);
                }
            }
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '关闭';
            closeBtn.className = 'vsb-btn vsb-ghost';
            closeBtn.style.marginTop = '8px';
            closeBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });
            dialog.appendChild(list);
            dialog.appendChild(closeBtn);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
        });
    }

    // 3. 根据用户选择的 SQL 代码，进行 SQL 查询。获取块ID
    // 执行 SQL 并返回行数据（数组）
    async executeSqlAndGetRows(sqlText: string): Promise<any[]> {
        try {
            if (!sqlText || !sqlText.trim()) return [];
            const stmt = sqlText.trim();
            const res = await runSql(stmt);
            if (!Array.isArray(res)) return [];
            return res;
        } catch (e) {
            console.error('[aggregatorBlock] executeSqlAndGetRows error', e);
            return [];
        }
    }

    // 将 SQL 返回的行转换为 preview 对象数组
    // 约定 preview: { id?: string, kramdown?: string, summary: string }
    rowsToPreviews(rows: any[]): Array<{ id?: string; kramdown?: string; summary: string }> {
        const previews: Array<{ id?: string; kramdown?: string; summary: string }> = [];
        for (const row of rows) {
            if (!row) continue;
            // 优先字段：kramdown/content/text/body/summary
            const candidates = ['kramdown', 'content', 'text', 'body', 'summary'];
            let kramdown;
            let summary = '';
            for (const c of candidates) {
                if (row[c]) {
                    if (c === 'kramdown') kramdown = row[c];
                    else summary = String(row[c]);
                    break;
                }
            }
            // 如果没有候选字段，尝试把整行序列化为 summary
            if (!kramdown && !summary) {
                try {
                    summary = JSON.stringify(row);
                } catch (e) {
                    summary = String(row);
                }
            }
            // 尝试提取 id 字段
            const idCandidates = ['id', 'block_id', 'blockid', 'blockId'];
            let id: string | undefined;
            for (const ic of idCandidates) {
                if (row[ic]) {
                    id = String(row[ic]);
                    break;
                }
            }
            previews.push({ id, kramdown, summary: String(summary).slice(0, 2000) });
        }
        return previews;
    }

    // 高阶：整合流程：选择预设 -> 执行预设内 sql（或 compiled sql） -> 获取块预览集合
    // 返回 { presetName, preset, blockIds, previews }
    async runPresetPreviewFlow(): Promise<{ presetName: string | null; preset: any | null; blockIds: string[]; previews: Array<any> }> {
        // 1. 弹出选择
        const sel = await this.showPresetSelector();
        if (!sel) return { presetName: null, preset: null, blockIds: [], previews: [] };
        const preset = sel.preset;
        // 2. 尝试从 preset 中取 sql 字段，否则尝试用 safeCompileSqlFromSnapshot 等外部逻辑不可得时，直接 alert
        const sqlText = (preset && preset.sql) ? preset.sql : (preset && preset.advSqlFragment ? preset.advSqlFragment : '');
        if (!sqlText) {
            // 尝试从 preset 的快照生成 SQL 的能力在此模块中不实现（依赖 VisualSqlBuilder）；因此提示用户
            console.warn('[aggregatorBlock] preset 无直接 sql 字段，无法执行');
            return { presetName: sel.name, preset, blockIds: [], previews: [] };
        }

        // 3. 执行 SQL 并直接使用返回的行构建 preview
        const rows = await this.executeSqlAndGetRows(sqlText);
        const previews = this.rowsToPreviews(rows);

    // 从 previews 中提取可能的 id 列表（若有）
    const blockIds = previews.map(p => (p.id || '')).filter(Boolean);
    const result = { presetName: sel.name, preset, blockIds, previews };
        // 弹出预览界面
        try {
            this.showBlockPreviews(previews);
        } catch (e) {
            console.warn('[aggregatorBlock] showBlockPreviews failed', e);
        }
        return result;
    }

    // 弹出一个 modal，显示块预览内容（每项展示 kramdown 或 summary）
    showBlockPreviews(previews: Array<{ id?: string; kramdown?: string; summary: string }>) {
        try {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:100000';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'width:min(900px,95vw);max-height:85vh;overflow:auto;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;padding:12px;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
            const title = document.createElement('div');
            title.textContent = `块预览 (${previews.length})`;
            title.style.fontWeight = '600';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'vsb-btn vsb-ghost';
            closeBtn.textContent = '关闭';
            closeBtn.addEventListener('click', () => overlay.remove());
            header.appendChild(title);
            header.appendChild(closeBtn);
            dialog.appendChild(header);

            const list = document.createElement('div');
            list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

            for (const p of previews) {
                const card = document.createElement('div');
                card.style.cssText = 'padding:10px;border:1px solid var(--b3-border-color);border-radius:6px;background:var(--b3-theme-surface-2);';
                const h = document.createElement('div');
                h.style.fontWeight = '600';
                h.textContent = `ID: ${p.id || '(无 id)'}`;
                card.appendChild(h);

                const content = document.createElement('div');
                content.style.cssText = 'margin-top:6px;white-space:pre-wrap;max-height:240px;overflow:auto;';
                if (p.kramdown) {
                    // 简单显示 kramdown 文本；若需要渲染 markdown，可以在宿主环境使用现有渲染器
                    content.textContent = String(p.kramdown).slice(0, 2000);
                } else {
                    content.textContent = p.summary || '';
                }
                card.appendChild(content);
                list.appendChild(card);
            }

            dialog.appendChild(list);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
        } catch (e) {
            console.error('[aggregatorBlock] showBlockPreviews error', e);
        }
    }
}
