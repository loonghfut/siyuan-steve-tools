import { showMessage, openTab } from "siyuan";
import { aggregatorBlock } from "../aggregator_block";
import type { PresetItem } from "../echarts/types/types";

/**
 * 内容聚合器 页签版 UI（非模态）
 * - 与悬浮窗一致的功能；但二级弹窗（编辑/定时）在此改为同级展开面板
 */
export class ContentAggregatorTabUI {
  private container: HTMLElement;
  private aggregator: aggregatorBlock;
  // 预留：顶部区域（当前未使用，避免未读警告不声明）
  private listWrap!: HTMLElement;

  constructor(container: HTMLElement, aggregator: aggregatorBlock) {
    this.container = container;
    this.aggregator = aggregator;
    this.render();
  }

  destroy() {
    this.container.innerHTML = "";
    // 无其它资源需要释放
  }

  async refresh() {
    await this.renderList();
  }

  private render() {
    this.container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;height:100%;padding:12px;">
        <div id="ca-head" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <svg style="width:18px;height:18px;fill:var(--b3-theme-primary);"><use xlink:href="#iconDatabase"></use></svg>
            <span style="font-weight:600;color:var(--b3-theme-on-background);">内容聚合器</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button id="ca-refresh" class="b3-button b3-button--outline" title="刷新预设列表">刷新</button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--b3-theme-on-surface-light);">在页签中直接浏览、编辑、定时或执行预设；点击每条的“使用”可立即执行。二级面板会以内嵌展开的形式展示。</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input id="ca-search" class="b3-text-field" placeholder="搜索预设名称或 SQL..." style="flex:1; padding: 8px 12px; border: 1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); background: var(--b3-theme-surface); color: var(--b3-theme-on-background); font-size: 14px;" />
        </div>
        <div id="ca-list" style="flex:1; min-height:0; overflow:auto;"></div>
        <div id="ca-log" style="font-size:12px;color:var(--b3-theme-on-surface);"></div>
      </div>
    `;

    // const header = this.container.querySelector('#ca-head') as HTMLElement;
    this.listWrap = this.container.querySelector('#ca-list') as HTMLElement;

    const refreshBtn = this.container.querySelector('#ca-refresh') as HTMLButtonElement;
    const searchInput = this.container.querySelector('#ca-search') as HTMLInputElement;

    refreshBtn?.addEventListener('click', () => this.refresh());
    searchInput?.addEventListener('input', () => this.renderList(searchInput.value));

    this.renderList();
  }

  private async renderList(filterText: string = '') {
    const listEl = this.listWrap;
    if (!listEl) return;
    listEl.innerHTML = '';

    const presets = await this.aggregator.getSqlPresets();
    const sortedEntries = Object.entries(presets).sort((a, b) => {
      const pa = a[1] as PresetItem; const pb = b[1] as PresetItem;
      const aTime = (pa.updatedAt || pa.lastExecuteTime || 0) as number;
      const bTime = (pb.updatedAt || pb.lastExecuteTime || 0) as number;
      if (aTime !== bTime) return bTime - aTime;
      return a[0].localeCompare(b[0], 'zh-CN');
    });
    const names = sortedEntries.map(([n]) => n);

    const filter = filterText.toLowerCase().trim();
    const filtered = filter ? names.filter(n => n.toLowerCase().includes(filter) || String(presets[n].sql || '').toLowerCase().includes(filter)) : names;

    if (!filtered.length) {
      listEl.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--b3-theme-on-surface-light);">${filter ? '未找到匹配的预设' : '暂无预设'}</div>`;
      return;
    }

    // 校验绑定有效性
    const validityChecks = await Promise.all(
      filtered.map(async n => {
        const preset = presets[n];
        let docValid = true; let docType: 'doc' | 'notebook' | undefined;
        if (preset.targetDocId) {
          const isDoc = await this.aggregator['checkDocValidity']?.(preset.targetDocId) || false;
          if (isDoc) { docValid = true; docType = 'doc'; }
          else {
            const isNb = await (this.aggregator as any).isNotebookId(preset.targetDocId);
            docValid = !!isNb; docType = isNb ? 'notebook' : undefined;
          }
        }
        let databaseValid = true;
        if (preset.targetDatabaseId) {
          try { await (this.aggregator as any).avManager.getAttributeView(preset.targetDatabaseId); }
          catch { databaseValid = false; }
        }
        return { name: n, docValid, docType, databaseValid };
      })
    );
    const validityMap = new Map(validityChecks.map(v => [v.name, v]));

    for (const n of filtered) {
      const preset = presets[n] as PresetItem;
      const validity = validityMap.get(n);
      const item = document.createElement('div');
      item.className = 'ca-item';
      item.style.cssText = 'padding:12px; background: var(--b3-theme-surface); border:1px solid var(--b3-border-color); border-radius: var(--b3-border-radius);';
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div style="flex:1; min-width:0;">
            <div class="ca-title" style="font-weight:500; color: var(--b3-theme-on-background); margin-bottom:6px; display:flex; gap:6px; align-items:center;">
              <svg style="width: 16px; height: 16px; fill: var(--b3-theme-primary);"><use xlink:href="#iconSQL"></use></svg>
              ${n}
            </div>
            <div class="ca-sql-snippet" style="font-size:12px; color: var(--b3-theme-on-surface); font-family: var(--b3-font-family-code); background: var(--b3-protyle-code-background); padding:6px 8px; border-radius: var(--b3-border-radius-s); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;" title="点击在可视化SQL编辑器中打开以修改">${preset.sql}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
              ${preset.template ? `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-theme-primary-lightest); color: var(--b3-theme-primary); border-radius: var(--b3-border-radius-s);\">自定义模板</span>` : ''}
              ${preset.updatedAt ? (() => {
          const short = new Date(preset.updatedAt as number).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          return `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-theme-surface-light); color: var(--b3-theme-on-surface); border-radius: var(--b3-border-radius-s);\">最近修改: ${short}</span>`;
        })() : ''}
              ${preset.targetDocId ? (validity?.docValid ? `<span class=\"ca-badge-doc\" style=\"font-size:11px;padding:2px 8px;background: rgba(101,184,77,0.12); color: var(--b3-theme-success); border-radius: var(--b3-border-radius-s); cursor:pointer;\" title=\"点击打开${validity?.docType === 'notebook' ? '当日日记' : '文档'}\">${validity?.docType === 'notebook' ? '笔记本日记' : '已绑定文档'}</span>` : `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-card-error-background); color: var(--b3-card-error-color); border-radius: var(--b3-border-radius-s);\">无效文档绑定</span>`) : ''}
              ${preset.targetDatabaseId ? (validity?.databaseValid ? `<span class=\"ca-badge-db\" style=\"font-size:11px;padding:2px 8px;background: rgba(70,130,180,0.12); color:#1976d2; border-radius: var(--b3-border-radius-s); cursor:pointer;\" title=\"点击打开数据库\">已绑定数据库</span>` : `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-card-error-background); color: var(--b3-card-error-color); border-radius: var(--b3-border-radius-s);\">无效数据库绑定</span>`) : ''}
              ${(preset as any).docInsertMode ? `<span style=\"font-size:11px;padding:2px 8px;background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); border:1px dashed var(--b3-border-color); border-radius: var(--b3-border-radius-s);\">插入: ${(preset as any).docInsertMode === 'prepend' ? '开头' : '末尾'}</span>` : ''}
              ${preset.timerEnabled ? (() => {
          const nextTime = preset.nextExecuteTime ? new Date(preset.nextExecuteTime as number).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
          const mode = (preset as any).timerMode || 'interval';
          const label = mode === 'daily'
            ? `每日 ${(String((preset as any).dailyHour ?? 0)).padStart(2, '0')}:${(String((preset as any).dailyMinute ?? 0)).padStart(2, '0')}`
            : ((preset as any).timerUnit && (preset as any).timerValue
              ? `${(preset as any).timerValue}${(preset as any).timerUnit === 'minutes' ? '分钟' : (preset as any).timerUnit === 'hours' ? '小时' : '天'}`
              : '未设置');
          return `<span style=\"font-size:11px;padding:2px 8px;background: rgba(255,193,7,0.12); color:#f57c00; border-radius: var(--b3-border-radius-s);\">定时: ${label}${nextTime ? ' | 下次: ' + nextTime : ''}</span>`;
        })() : ''}
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-shrink:0;">
            <button class="b3-button b3-button--outline inline-edit" style="padding:6px 12px; font-size:13px;">编辑</button>
            <button class="b3-button b3-button--outline inline-timer" style="padding:6px 12px; font-size:13px; ${preset.timerEnabled ? 'background: rgba(255, 193, 7, 0.12); border-color: #f57c00; color: #f57c00;' : ''}" title="${preset.timerEnabled ? '定时已启用' : '设置定时更新'}">定时</button>
            <button class="b3-button b3-button--primary inline-use" style="padding:6px 12px; font-size:13px;">使用</button>
          </div>
        </div>
        <div class="ca-inline-panel" style="display:none; margin-top:10px; padding:12px; background: var(--b3-theme-surface); border:1px dashed var(--b3-border-color); border-radius: var(--b3-border-radius);"></div>
      `;

      const editBtn = item.querySelector('.inline-edit');
      const timerBtn = item.querySelector('.inline-timer');
      const useBtn = item.querySelector('.inline-use');
      const sqlSnippet = item.querySelector('.ca-sql-snippet') as HTMLElement | null;
      const panel = item.querySelector('.ca-inline-panel') as HTMLElement;

      editBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        // 切换：若当前已展开编辑面板，则收起；否则展开编辑面板
        if (panel.style.display === 'block' && panel.dataset.mode === 'editor') {
          panel.style.display = 'none';
          panel.innerHTML = '';
          delete panel.dataset.mode;
        } else {
          await this.openEditorInline(n, presets[n], panel);
        }
      });

      timerBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        // 切换：若当前已展开定时面板，则收起；否则展开定时面板
        if (panel.style.display === 'block' && panel.dataset.mode === 'timer') {
          panel.style.display = 'none';
          panel.innerHTML = '';
          delete panel.dataset.mode;
        } else {
          await this.openTimerInline(n, presets[n], panel);
        }
      });

      useBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.aggregator.runPresetByName(n);
      });

      // 点击列表中的 SQL 预览，跳转到“SQL 可视化生成器”页签并自动应用对应预设
      if (sqlSnippet) {
        sqlSnippet.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const sql = String((presets[n] as any)?.sql || '').trim();
            if (!sql) { showMessage('无有效 SQL', 2000, 'info'); return; }
            const pluginName = String(((this.aggregator as any)?._plugin?.name) || '');
            await openTab({
              app: (window as any).siyuan.ws.app,
              custom: { icon: 'iconSQL', title: 'SQL 视图', id: pluginName + 'visual-sql', data: { id: null, presetName: n } },
              keepCursor: false,
            });
            window.dispatchEvent(new CustomEvent('siyuan-steve-tools:apply-visual-sql-preset', { detail: { presetName: n } }));
          } catch (err) {
            showMessage('打开 SQL 编辑器失败', 3000, 'error');
          }
        });
      }

      // 绑定点击跳转：标题优先打开文档/当日日记，否则打开数据库
      const titleEl = item.querySelector('.ca-title') as HTMLElement | null;
      if (titleEl) {
        const clickable = (preset.targetDocId && validity?.docValid) || (preset.targetDatabaseId && validity?.databaseValid);
        if (clickable) {
          titleEl.style.cursor = 'pointer';
          titleEl.title = preset.targetDocId && validity?.docValid
            ? (validity?.docType === 'notebook' ? '打开当日日记' : '打开文档')
            : '打开数据库';
          titleEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              if (preset.targetDocId && validity?.docValid) {
                const resolved = await (this.aggregator as any).resolveInsertDocId(preset.targetDocId);
                const blockId = resolved?.docId || preset.targetDocId;
                await openTab({
                  app: (window as any).siyuan.ws.app,
                  doc: {
                    id: blockId,
                    action: ["cb-get-hl", "cb-get-focus"],
                    zoomIn: true,
                  },
                  position: "right",
                  keepCursor: false,
                });
              } else if (preset.targetDatabaseId && validity?.databaseValid) {
                const dbBlockId = await (this.aggregator as any).resolveAttributeViewBlockId(preset.targetDatabaseId);
                if (!dbBlockId) throw new Error('DB block not found');
                await openTab({
                  app: (window as any).siyuan.ws.app,
                  doc: {
                    id: dbBlockId,
                    action: ["cb-get-hl", "cb-get-focus"],
                    zoomIn: true,
                  },
                  position: "right",
                  keepCursor: false,
                });
              }
            } catch (err) {
              showMessage('打开失败，请检查目标是否存在', 3000, 'error');
            }
          });
        }
      }

      // 单独徽章跳转：文档/数据库
      const docBadge = item.querySelector('.ca-badge-doc');
      if (docBadge && preset.targetDocId && validity?.docValid) {
        (docBadge as HTMLElement).addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const resolved = await (this.aggregator as any).resolveInsertDocId(preset.targetDocId);
            const blockId = resolved?.docId || preset.targetDocId;
            await openTab({
              app: (window as any).siyuan.ws.app,
              doc: {
                id: blockId,
                action: ["cb-get-hl", "cb-get-focus"],
                zoomIn: true,
              },
              position: "right",
              keepCursor: false,
            });
          } catch {
            showMessage('打开文档失败', 3000, 'error');
          }
        });
      }

      const dbBadge = item.querySelector('.ca-badge-db');
      if (dbBadge && preset.targetDatabaseId && validity?.databaseValid) {
        (dbBadge as HTMLElement).addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const dbBlockId = await (this.aggregator as any).resolveAttributeViewBlockId(preset.targetDatabaseId);
            if (!dbBlockId) throw new Error('DB block not found');
            await openTab({
              app: (window as any).siyuan.ws.app,
              doc: {
                id: dbBlockId,
                action: ["cb-get-hl", "cb-get-focus"],
                zoomIn: true,
              },
              position: "right",
              keepCursor: false,
            });
          } catch {
            showMessage('打开数据库失败', 3000, 'error');
          }
        });
      }

      listEl.appendChild(item);
    }
  }

  private async openEditorInline(name: string, _preset: PresetItem, panel: HTMLElement) {
    const presets = await this.aggregator.getSqlPresets();
    const p = presets[name] as PresetItem;
    if (!panel) return;

    panel.style.display = 'block';
    panel.dataset.mode = 'editor';
    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap: 12px;">
        <div>
          <label style="display:block; margin-bottom:6px; font-weight:500; color: var(--b3-theme-on-background); font-size:14px;">
            <svg style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;"><use xlink:href="#iconSQL"></use></svg>
            SQL 查询
          </label>
          <textarea id="ie-sql" class="b3-text-field" readonly style="width:100%; height:35px; resize:vertical; font-family: var(--b3-font-family-code); font-size:13px; background: var(--b3-theme-surface-light); border:1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); padding:8px;">${p.sql}</textarea>
          <div style="font-size:12px;color:var(--b3-theme-on-surface-light); margin-top:4px;">SQL 查询不可在此编辑,请在插件设置中修改</div>
          <div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button id="ie-preview" class="b3-button b3-button--outline" style="font-size:12px; padding:4px 8px; display:inline-flex; align-items:center; gap:4px;">
              <svg style="width:12px;height:12px;"><use xlink:href="#iconEye"></use></svg>预览查询结果
            </button>
            <button id="ie-open-sql-editor" class="b3-button" style="font-size:12px; padding:4px 8px; display:inline-flex; align-items:center; gap:4px;">
              <svg style="width:12px;height:12px;"><use xlink:href="#iconSQL"></use></svg>在可视化SQL中编辑
            </button>
            <div id="ie-preview-container" style="margin-top:8px; max-height:350px; overflow-y:auto; display:none;"></div>
          </div>
        </div>
        <div>
          <label style="display:block; margin-bottom:6px; font-weight:500; color: var(--b3-theme-on-background); font-size:14px;">
            <svg style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;"><use xlink:href="#iconEdit"></use></svg>
            自定义模板
          </label>
          <textarea id="ie-template" class="b3-text-field" placeholder="留空则使用插件设置的默认模板" style="width:100%; height:180px; resize:vertical; font-family: var(--b3-font-family-code); font-size:13px; border:1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); padding:8px; line-height:1.5;">${p.template || ''}</textarea>
          <div style="font-size:12px;color:var(--b3-theme-on-surface-light); margin-top:4px; display:flex; align-items:center; gap:4px;">
            <svg style="width:12px;height:12px;"><use xlink:href="#iconInfo"></use></svg>优先级: 预设模板 > 插件全局模板
          </div>
        </div>
        <div>
          <label style="display:block; margin-bottom:6px; font-weight:500; color: var(--b3-theme-on-background); font-size:14px;">
            <svg style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;"><use xlink:href="#iconLink"></use></svg>
            目标文档/笔记本 ID (可选)
          </label>
          <input id="ie-target-doc" class="b3-text-field" value="${p.targetDocId || ''}" placeholder="输入文档ID，或笔记本ID以插入日记" style="width:100%; padding:8px; border:1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); font-size:13px;" />
          <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
            <label for="ie-doc-insert-mode" style="font-size:12px; color: var(--b3-theme-on-surface);">文档插入位置:</label>
            <select id="ie-doc-insert-mode" class="b3-select">
              <option value="append" ${((p as any).docInsertMode === 'append') || (!('docInsertMode' in p) && ((this.aggregator as any)._settingdata?.['aggregate-insert-mode'] !== 'prepend')) ? 'selected' : ''}>末尾 (append)</option>
              <option value="prepend" ${((p as any).docInsertMode === 'prepend') || (!('docInsertMode' in p) && ((this.aggregator as any)._settingdata?.['aggregate-insert-mode'] === 'prepend')) ? 'selected' : ''}>开头 (prepend)</option>
            </select>
          </div>
        </div>
        <div>
          <label style="display:block; margin-bottom:6px; font-weight:500; color: var(--b3-theme-on-background); font-size:14px;">
            <svg style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;"><use xlink:href="#iconDatabase"></use></svg>
            目标数据库 ID (可选)
          </label>
          <input id="ie-target-db" class="b3-text-field" value="${p.targetDatabaseId || ''}" placeholder="输入属性视图 (数据库) ID" style="width:100%; padding:8px; border:1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); font-size:13px;" />
          <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
            <label for="ie-db-id-field" style="font-size:12px; color: var(--b3-theme-on-surface);">加入数据库时使用的 ID 字段:</label>
            <select id="ie-db-id-field" class="b3-select">
              <option value="id" ${p.databaseIdField !== 'parent_id' ? 'selected' : ''}>块 id (id)</option>
              <option value="parent_id" ${p.databaseIdField === 'parent_id' ? 'selected' : ''}>父块 id (parent_id)</option>
            </select>
          </div>
          <div style="font-size:12px;color:var(--b3-theme-on-surface-light); margin-top:4px; display:flex; align-items:center; gap:4px;">
            <svg style="width:12px;height:12px;"><use xlink:href="#iconInfo"></use></svg>SQL 结果需包含对应字段；若缺失将回退到其它可用字段。
          </div>
        </div>
        <div>
          <label style="display:block; margin-bottom:6px; font-weight:500; color: var(--b3-theme-on-background); font-size:14px;">
            <svg style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;"><use xlink:href="#iconHistory"></use></svg>
            上次插入时间戳 (可选)
          </label>
          <input id="ie-last-insert-time" class="b3-text-field" value="${p.lastInsertTime || ''}" placeholder="YYYYMMDDHHmmss" style="width:100%; padding:8px; border:1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); font-size:13px; font-family: var(--b3-font-family-code);" />
          <div style="font-size:12px;color:var(--b3-theme-on-surface-light); margin-top:4px; display:flex; align-items:center; gap:4px;">
            <svg style="width:12px;height:12px;"><use xlink:href="#iconInfo"></use></svg>用于过滤已插入内容，留空重置。
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; padding-top:8px; border-top:1px solid var(--b3-border-color);">
          <button class="b3-button b3-button--cancel">收起</button>
          <button class="b3-button b3-button--primary">保存</button>
        </div>
      </div>
    `;

    const btnCancel = panel.querySelector('.b3-button--cancel') as HTMLButtonElement;
    const btnSave = panel.querySelector('.b3-button--primary') as HTMLButtonElement;
    const btnPreview = panel.querySelector('#ie-preview') as HTMLButtonElement;
    const btnOpenSQLEditor = panel.querySelector('#ie-open-sql-editor') as HTMLButtonElement;
    const previewContainer = panel.querySelector('#ie-preview-container') as HTMLElement;

    btnCancel?.addEventListener('click', () => { panel.style.display = 'none'; panel.innerHTML = ''; delete panel.dataset.mode; });

    btnSave?.addEventListener('click', async () => {
      const tpl = (panel.querySelector('#ie-template') as HTMLTextAreaElement)?.value.trim() || '';
      const docId = (panel.querySelector('#ie-target-doc') as HTMLInputElement)?.value.trim() || '';
      const dbId = (panel.querySelector('#ie-target-db') as HTMLInputElement)?.value.trim() || '';
      const lastTime = (panel.querySelector('#ie-last-insert-time') as HTMLInputElement)?.value.trim() || '';
      const dbField = ((panel.querySelector('#ie-db-id-field') as HTMLSelectElement)?.value === 'parent_id' ? 'parent_id' : 'id') as 'id' | 'parent_id';
      const insertMode = ((panel.querySelector('#ie-doc-insert-mode') as HTMLSelectElement)?.value === 'prepend' ? 'prepend' : 'append') as 'append' | 'prepend';

      // 更新
      (p as any).docInsertMode = insertMode || undefined;
      p.template = tpl || undefined;
      p.targetDocId = docId || undefined;
      p.targetDatabaseId = dbId || undefined;
      p.lastInsertTime = lastTime || undefined;
      p.databaseIdField = dbId ? dbField : undefined;

      await this.aggregator.updatePresetTemplate(name, tpl);
      await this.aggregator.updatePresetTargetDocId(name, docId);
      await this.aggregator.updatePresetTargetDatabaseId(name, dbId);
      await this.aggregator.updatePresetLastInsertTime(name, lastTime);
      await this.aggregator.updatePresetDatabaseIdField(name, p.databaseIdField || '');
      await (this.aggregator as any).updatePresetDocInsertMode(name, insertMode);

      showMessage('预设已更新', 3000, 'info');
      await this.refresh();
      panel.style.display = 'none';
      panel.innerHTML = '';
      delete panel.dataset.mode;
    });

    btnPreview?.addEventListener('click', async () => {
      const currentDocId = (panel.querySelector('#ie-target-doc') as HTMLInputElement)?.value.trim() || '';
      const currentLastTime = (panel.querySelector('#ie-last-insert-time') as HTMLInputElement)?.value.trim() || '';
      let previewSql = p.sql;
      const upper = previewSql.toUpperCase();
      if (!upper.includes(' LIMIT ')) previewSql += ' LIMIT 5';
      let excludeId: string | undefined;
      if (currentDocId) {
        const resolved = await (this.aggregator as any).resolveInsertDocId(currentDocId);
        excludeId = resolved?.docId || undefined;
      }
      const results = await (this.aggregator as any).executeSql(previewSql, excludeId, currentLastTime || undefined);
      (this.aggregator as any).renderResultTable(results, previewContainer);
      previewContainer.style.display = 'block';
    });

    // 跳转到“SQL 可视化生成器”页签并自动应用对应预设
    btnOpenSQLEditor?.addEventListener('click', async () => {
      try {
        const sql = String(p.sql || '').trim();
        if (!sql) { showMessage('无有效 SQL', 2000, 'info'); return; }
        const pluginName = String(((this.aggregator as any)?._plugin?.name) || '');
        await openTab({
          app: (window as any).siyuan.ws.app,
          custom: { icon: 'iconSQL', title: 'SQL 视图', id: pluginName + 'visual-sql', data: { id: null, presetName: name } },
          keepCursor: false,
        });
        window.dispatchEvent(new CustomEvent('siyuan-steve-tools:apply-visual-sql-preset', { detail: { presetName: name } }));
      } catch {
        showMessage('打开 SQL 编辑器失败', 3000, 'error');
      }
    });
  }

  private async openTimerInline(name: string, preset: PresetItem, panel: HTMLElement) {
    const p = preset as PresetItem;
    if (!panel) return;

    const currentEnabled = p.timerEnabled || false;
    const currentMode = (p.timerMode || 'interval') as ('interval' | 'daily');
    const currentUnit = p.timerUnit || 'hours';
    const currentValue = p.timerValue || 1;
    const currentDailyHour = Number.isFinite(p.dailyHour) ? (p.dailyHour as number) : 9;
    const currentDailyMinute = Number.isFinite(p.dailyMinute) ? (p.dailyMinute as number) : 0;

    panel.style.display = 'block';
    panel.dataset.mode = 'timer';
    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap: 12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding: 12px; background: var(--b3-theme-surface); border-radius: var(--b3-border-radius); border: 1px solid var(--b3-border-color);">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg style="width:20px; height:20px; fill: var(--b3-theme-primary);"><use xlink:href="#iconClock"></use></svg>
            <div>
              <div style="font-weight:500; color: var(--b3-theme-on-background);">启用定时更新</div>
              <div style="font-size:12px; color: var(--b3-theme-on-surface-light); margin-top:2px;">自动执行聚合并插入到目标文档/数据库</div>
            </div>
          </div>
          <label class="veq-switch" style="margin:0;">
            <input id="it-enabled" type="checkbox" ${currentEnabled ? 'checked' : ''}>
            <i></i>
          </label>
        </div>
        <div id="it-mode-wrap" style="display:${currentEnabled ? 'block' : 'none'}; padding: 12px; background: var(--b3-theme-surface); border-radius: var(--b3-border-radius); border: 1px solid var(--b3-border-color);">
          <label style="display:block; margin-bottom:8px; font-weight:500; color: var(--b3-theme-on-background); font-size:14px;">
            <svg style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;"><use xlink:href="#iconSetting"></use></svg>定时模式
          </label>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <select id="it-mode" class="b3-select">
              <option value="interval" ${currentMode === 'interval' ? 'selected' : ''}>按间隔</option>
              <option value="daily" ${currentMode === 'daily' ? 'selected' : ''}>每日固定时间</option>
            </select>
          </div>
          <div id="it-interval" style="display:${currentMode === 'interval' ? 'block' : 'none'};">
            <label style="display:block; margin-bottom:8px; font-weight:500; color: var(--b3-theme-on-background); font-size:14px;">
              <svg style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;"><use xlink:href="#iconClock"></use></svg>执行间隔
            </label>
            <div style="display:flex; gap:12px; align-items:center;">
              <input id="it-value" type="number" min="1" value="${currentValue}" class="b3-text-field" style="flex:1; padding:8px 12px; border:1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); font-size:14px;" />
              <select id="it-unit" class="b3-select">
                <option value="minutes" ${currentUnit === 'minutes' ? 'selected' : ''}>分钟</option>
                <option value="hours" ${currentUnit === 'hours' ? 'selected' : ''}>小时</option>
                <option value="days" ${currentUnit === 'days' ? 'selected' : ''}>天</option>
              </select>
            </div>
          </div>
          <div id="it-daily" style="display:${currentMode === 'daily' ? 'block' : 'none'}; margin-top:8px;">
            <label style="display:block; margin-bottom:8px; font-weight:500; color: var(--b3-theme-on-background); font-size:14px;">
              <svg style="width:14px;height:14px;margin-right:4px;vertical-align:-2px;"><use xlink:href="#iconCalendar"></use></svg>每日执行时间
            </label>
            <div style="display:flex; gap:8px; align-items:center;">
              <input id="it-dh" type="number" min="0" max="23" value="${currentDailyHour}" class="b3-text-field" style="width:80px;" />
              <span style="color:var(--b3-theme-on-surface);">:</span>
              <input id="it-dm" type="number" min="0" max="59" value="${currentDailyMinute}" class="b3-text-field" style="width:80px;" />
              <span style="font-size:12px; color:var(--b3-theme-on-surface-light);">24小时制</span>
            </div>
          </div>
          <div style="font-size:12px; color: var(--b3-theme-on-surface-light); margin-top:8px; display:flex; align-items:center; gap:4px;">
            <svg style="width:12px;height:12px;"><use xlink:href="#iconInfo"></use></svg>定时器将在保存后立即生效
          </div>
        </div>
        ${(currentEnabled && p.lastExecuteTime) ? `
        <div style="padding: 12px; background: var(--b3-theme-surface-light); border-radius: var(--b3-border-radius); font-size:12px; color: var(--b3-theme-on-surface);">
          <div style="margin-bottom:4px;"><strong>上次执行:</strong> ${new Date(p.lastExecuteTime).toLocaleString('zh-CN')}</div>
          ${p.nextExecuteTime ? `<div><strong>下次执行:</strong> ${new Date(p.nextExecuteTime).toLocaleString('zh-CN')}</div>` : ''}
        </div>` : ''}
        <div style="display:flex; justify-content:flex-end; gap:8px; padding-top:8px; border-top:1px solid var(--b3-border-color);">
          <button class="b3-button b3-button--cancel">收起</button>
          <button class="b3-button b3-button--primary">保存</button>
        </div>
      </div>
    `;

    const enabledSwitch = panel.querySelector('#it-enabled') as HTMLInputElement;
    const modeWrap = panel.querySelector('#it-mode-wrap') as HTMLElement;
    const modeSelect = panel.querySelector('#it-mode') as HTMLSelectElement;
    const intervalWrap = panel.querySelector('#it-interval') as HTMLElement;
    const dailyWrap = panel.querySelector('#it-daily') as HTMLElement;
    const valueInput = panel.querySelector('#it-value') as HTMLInputElement;
    const unitSelect = panel.querySelector('#it-unit') as HTMLSelectElement;
    const dhInput = panel.querySelector('#it-dh') as HTMLInputElement;
    const dmInput = panel.querySelector('#it-dm') as HTMLInputElement;

    const refreshMode = () => {
      if (modeWrap) modeWrap.style.display = enabledSwitch.checked ? 'block' : 'none';
      const mode = (modeSelect?.value || 'interval');
      if (intervalWrap) intervalWrap.style.display = mode === 'interval' ? 'block' : 'none';
      if (dailyWrap) dailyWrap.style.display = mode === 'daily' ? 'block' : 'none';
    };
    enabledSwitch?.addEventListener('change', refreshMode);
    modeSelect?.addEventListener('change', refreshMode);
    refreshMode();

    const btnCancel = panel.querySelector('.b3-button--cancel') as HTMLButtonElement;
    const btnSave = panel.querySelector('.b3-button--primary') as HTMLButtonElement;

    btnCancel?.addEventListener('click', () => { panel.style.display = 'none'; panel.innerHTML = ''; delete panel.dataset.mode; });

    btnSave?.addEventListener('click', async () => {
      const enabled = !!enabledSwitch?.checked;
      const mode = (modeSelect?.value || 'interval') as ('interval' | 'daily');

      p.timerEnabled = enabled;
      p.timerMode = mode;

      if (!enabled) {
        p.nextExecuteTime = undefined;
        p.lastExecuteTime = undefined;
      } else if (mode === 'interval') {
        const value = parseInt(valueInput?.value || '1');
        const unit = (unitSelect?.value as 'minutes' | 'hours' | 'days');
        if (!value || value < 1) { showMessage('请输入有效的时间间隔', 3000, 'error'); return; }
        const ms = unit === 'minutes' ? value * 60 * 1000 : unit === 'hours' ? value * 60 * 60 * 1000 : value * 24 * 60 * 60 * 1000;
        p.timerInterval = ms;
        p.timerUnit = unit;
        p.timerValue = value;
        p.dailyHour = undefined;
        p.dailyMinute = undefined;
        p.nextExecuteTime = Date.now() + ms;
      } else {
        const h = Math.max(0, Math.min(23, parseInt(dhInput?.value || '0')));
        const mm = Math.max(0, Math.min(59, parseInt(dmInput?.value || '0')));
        p.dailyHour = h; p.dailyMinute = mm;
        p.timerInterval = undefined;
        // nextExecuteTime: 今天/明天的最近一次
        const now = new Date();
        const today = new Date(); today.setHours(h, mm, 0, 0);
        p.nextExecuteTime = now.getTime() < today.getTime() ? today.getTime() : (() => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(h, mm, 0, 0); return t.getTime(); })();
      }

      await (this.aggregator as any).updatePresetTimerSettings(name, p, { skipUpdatedAt: false });

      // 尝试立即应用到定时器
      try {
        const tm = (this.aggregator as any).timerManager;
        if (tm) {
          if (enabled) await tm.startTimer(name, p);
          else tm.stopTimer(name);
        }
      } catch { }

      showMessage('定时设置已更新', 3000, 'info');
      await this.refresh();
      panel.style.display = 'none';
      panel.innerHTML = '';
      delete panel.dataset.mode;
    });
  }
}
