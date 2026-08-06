import { VisualEchartsQueryUI } from './visual-echarts-query-ui';
import { VisualEchartsSqlUI } from '../sql/visual-echarts-sql-ui';
import "./echart_panel.scss";
import { ensureEcharts as ensureEchartsLib } from './components/echarts-loader';
import { toast } from '../utils/utils';
import type { VisualEchartsOptions } from '../types/types';

export class VisualEchartsUI {
  private container: HTMLElement;
  private key: string;
  private previewBody!: HTMLElement;
  private chartDiv?: HTMLDivElement;
  private echartsInst?: any;
  private previewPinned: boolean = false;
  // 支持两种数据模式
  private dataMode: 'database' | 'sql' = 'database';
  private queryUI?: VisualEchartsQueryUI;
  private sqlUI?: VisualEchartsSqlUI;
  private loadSqlPresetsProvider?: () => Promise<Record<string, any>> | Record<string, any>;
  private saveSqlPresetsProvider?: (presets: Record<string, any>) => Promise<void> | void;
  private loadEchartsPresetsProvider?: () => Promise<Record<string, any>> | Record<string, any>;
  private saveEchartsPresetsProvider?: (presets: Record<string, any>) => Promise<void> | void;
  private opts?: VisualEchartsOptions;
  // 仅保留查询面板

  constructor(container: HTMLElement, opts?: VisualEchartsOptions) {
    this.container = container;
    this.opts = opts;
    this.key = opts?.persistKey || 'siyuan-steve-tools:visual-echarts-ui';
    this.loadSqlPresetsProvider = opts?.loadSqlPresets;
    this.saveSqlPresetsProvider = opts?.saveSqlPresets;
    this.loadEchartsPresetsProvider = opts?.loadEchartsPresets;
    this.saveEchartsPresetsProvider = opts?.saveEchartsPresets;
    // injectStyleOnce();
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const s = JSON.parse(raw);
        this.previewPinned = !!s.previewPinned;
        this.dataMode = (s.dataMode === 'sql') ? 'sql' : 'database';
      }
    } catch { /* ignore */ }
    this.render();
    this.renderChartPreview().catch(() => {});
    this.applyPinPreviewUI();
  }

  private persist() {
    try {
      const data = {
        previewPinned: this.previewPinned,
        dataMode: this.dataMode,
      };
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  private render() {
    this.container.innerHTML = `
      <div class="ve-wrap">
        <div class="ve-toolbar">
          <div class="ve-tool-group" style="flex:1; gap:6px">
            <button class="ve-btn ve-primary" data-refresh title="重新根据查询渲染预览">
              <span class="ve-btn__icon">🔄</span>刷新
            </button>
            <button class="ve-btn" data-copy-block-top title="复制当前查询图表块到剪贴板">
              <span class="ve-btn__icon">📋</span>复制图表块
            </button>
            <button class="ve-btn" data-save-config title="保存当前配置为预设">
              <span class="ve-btn__icon">💾</span>保存配置
            </button>
            <button class="ve-btn" data-manage-config title="管理配置预设">
              <span class="ve-btn__icon">📦</span>管理配置
            </button>
          </div>
          <div class="ve-sep"></div>
          <div class="ve-tool-group">
            <label class="ve-field" style="margin:0; display:flex; align-items:center; gap:6px;">
              <span style="font-size:12px; color:var(--b3-theme-on-surface);">数据源:</span>
              <select class="veq-input" data-mode-switch style="width:100px">
                <option value="database">数据库</option>
                <option value="sql">SQL</option>
              </select>
            </label>
            ${this.opts?.onGotoSQL ? '<button class="ve-btn ve-link" data-goto-sql title="跳转到 SQL 编辑位置">转到 SQL ➜</button>' : ''}
            <button class="ve-btn ve-icon ${this.previewPinned ? 'active' : ''}" title="置顶预览" data-pin-preview>📌</button>
          </div>
        </div>
        <div class="ve-card" data-section="preview">
          <div class="ve-result" data-result><div class="ve-placeholder">暂无预览</div></div>
        </div>
        <details class="ve-card" open data-section="query" style="display:${this.dataMode === 'database' ? '' : 'none'}">
          <summary class="ve-legend">数据库查询模式</summary>
          <div data-query-container></div>
        </details>
        <details class="ve-card" open data-section="sql" style="display:${this.dataMode === 'sql' ? '' : 'none'}">
          <summary class="ve-legend">SQL 查询模式</summary>
          <div data-sql-container></div>
        </details>
      </div>
    `;
    // 绑定基础元素（无代码预览）
    this.previewBody = this.container.querySelector('[data-result]') as HTMLElement;
    // 顶部按钮
    (this.container.querySelector('[data-refresh]') as HTMLButtonElement).addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.renderChartPreview().catch(()=>{}); });
  (this.container.querySelector('[data-copy-block-top]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.copyChartBlock(); });
  (this.container.querySelector('[data-pin-preview]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.togglePinPreview(); });
  (this.container.querySelector('[data-save-config]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.saveConfigFlow(); });
  (this.container.querySelector('[data-manage-config]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.openConfigModal(); });
    
    // 模式切换
    const modeSwitch = this.container.querySelector('[data-mode-switch]') as HTMLSelectElement | null;
    if (modeSwitch) {
      modeSwitch.value = this.dataMode;
      modeSwitch.addEventListener('change', (ev) => {
        const newMode = (ev.target as HTMLSelectElement).value as 'database' | 'sql';
        this.switchMode(newMode);
      });
    }
    
    if (this.opts?.onGotoSQL) {
      (this.container.querySelector('[data-goto-sql]') as HTMLButtonElement)?.addEventListener('click', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        try { this.opts?.onGotoSQL?.(); } catch { /* ignore */ }
      });
    }
    // 初始化查询模式子 UI
    const queryContainer = this.container.querySelector('[data-query-container]') as HTMLElement | null;
    if (queryContainer) {
      this.queryUI = new VisualEchartsQueryUI(queryContainer, {
        persistKey: this.key + ':query',
        onGotoSQL: this.opts?.onGotoSQL,
        loadSqlPresets: this.loadSqlPresetsProvider,
        onChange: () => {
          try {
            if (!this.queryUI) return;
          } catch { /* ignore */ }
          this.renderChartPreview().catch(() => {});
          try {
            if (this.queryUI) {
              const parentRaw = localStorage.getItem(this.key);
              const parent = parentRaw ? JSON.parse(parentRaw) : {};
              const childRaw = localStorage.getItem(this.key + ':query');
              const child = childRaw ? JSON.parse(childRaw) : {};
              parent.queryFold = child.fold || parent.queryFold || {};
              localStorage.setItem(this.key, JSON.stringify(parent));
            }
          } catch { /* ignore */ }
        },
      });
    }
    // 初始化 SQL 模式子 UI
    const sqlContainer = this.container.querySelector('[data-sql-container]') as HTMLElement | null;
    if (sqlContainer) {
      this.sqlUI = new VisualEchartsSqlUI(sqlContainer, {
        persistKey: this.key + ':sql',
        loadSqlPresets: this.loadSqlPresetsProvider,
        saveSqlPresets: this.saveSqlPresetsProvider,
        onChange: () => {
          try {
            if (!this.sqlUI) return;
          } catch { /* ignore */ }
          this.renderChartPreview().catch(() => {});
        },
      });
      const initialSQL = this.opts?.initialSQL?.trim();
      if (initialSQL) {
        this.sqlUI.setSQL(initialSQL);
        this.dataMode = 'sql';
        const modeSwitch = this.container.querySelector('[data-mode-switch]') as HTMLSelectElement | null;
        if (modeSwitch) modeSwitch.value = 'sql';
        const querySection = this.container.querySelector('[data-section="query"]') as HTMLElement | null;
        const sqlSection = this.container.querySelector('[data-section="sql"]') as HTMLElement | null;
        if (querySection) querySection.style.display = 'none';
        if (sqlSection) sqlSection.style.display = '';
        this.persist();
      }
    }
  }

  // 已移除表格相关的格式化方法


  public resize() {
    try { this.echartsInst?.resize?.(); } catch { /* ignore */ }
    try { (this.queryUI as any)?.resize?.(); } catch { /* ignore */ }
    try { (this.sqlUI as any)?.resize?.(); } catch { /* ignore */ }
  }

  public destroy() {
    try { this.echartsInst?.dispose?.(); } catch { /* ignore */ }
    this.echartsInst = undefined;
    try { (this.queryUI as any)?.destroy?.(); } catch { /* ignore */ }
    try { (this.sqlUI as any)?.destroy?.(); } catch { /* ignore */ }
    this.queryUI = undefined;
    this.sqlUI = undefined;
    this.container.innerHTML = '';
  }

  // 供外部读取 IIFE
  public getIIFE(): string {
    if (this.dataMode === 'sql') {
      return this.sqlUI?.getIIFE() || '';
    } else {
      return this.queryUI?.getIIFE() || '';
    }
  }

  // 切换数据模式
  private switchMode(mode: 'database' | 'sql') {
    this.dataMode = mode;
    this.persist();
    
    // 显示/隐藏对应的面板
    const querySection = this.container.querySelector('[data-section="query"]') as HTMLElement | null;
    const sqlSection = this.container.querySelector('[data-section="sql"]') as HTMLElement | null;
    
    if (querySection) querySection.style.display = mode === 'database' ? '' : 'none';
    if (sqlSection) sqlSection.style.display = mode === 'sql' ? '' : 'none';
    
    // 刷新预览
    this.renderChartPreview().catch(() => {});
  }


  // -------- 图表预览 --------
  private async ensureEcharts(): Promise<void> {
    await ensureEchartsLib();
  }

  private buildOptionForPreview() {
    // 根据模式选择对应 UI 并执行
    try {
      let iife = '';
      if (this.dataMode === 'sql') {
        iife = this.sqlUI?.getIIFE() || '(()=>({}))()';
      } else {
        iife = this.queryUI?.getIIFE() || '(()=>({}))()';
      }
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return ${iife};`);
      return fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`图表配置执行失败: ${message}`);
    }
  }

  private async renderChartPreview() {
    this.previewBody.innerHTML = '<div data-chart style="width:100%;height:360px"></div>';
    this.chartDiv = this.previewBody.querySelector('[data-chart]') as HTMLDivElement;
    await this.ensureEcharts();
    const echarts = (window as any).echarts;
    if (this.echartsInst) {
      try { this.echartsInst.dispose(); } catch { }
    }
    this.echartsInst = echarts.init(this.chartDiv);
    try {
      const option = this.buildOptionForPreview();
      this.echartsInst.setOption(option, true);
    } catch (error) {
      try { this.echartsInst.dispose(); } catch { /* ignore */ }
      this.echartsInst = undefined;
      const message = error instanceof Error ? error.message : String(error);
      this.previewBody.innerHTML = `<div class="ve-placeholder" style="color:var(--b3-card-error-color);">预览失败：${this.escapeHtml(message)}</div>`;
      throw error;
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  private togglePinPreview() {
    this.previewPinned = !this.previewPinned;
    this.applyPinPreviewUI();
  this.persist();
    // 重新计算图表尺寸
    setTimeout(() => { try { this.echartsInst?.resize?.(); } catch { /* ignore */ } }, 50);
  }

  private applyPinPreviewUI() {
    const previewCard = this.container.querySelector('[data-section="preview"]') as HTMLElement | null;
    const pinBtn = this.container.querySelector('[data-pin-preview]') as HTMLButtonElement | null;
    if (previewCard) previewCard.classList.toggle('pinned', !!this.previewPinned);
    if (pinBtn) {
      pinBtn.classList.toggle('active', !!this.previewPinned);
      pinBtn.title = this.previewPinned ? '取消顶住' : '顶住';
    }
  }

  private async copyChartBlock() {
    let iife = '';
    if (this.dataMode === 'sql') {
      iife = (this.sqlUI?.getIIFE() || '').replace('option.animation = false;', 'option.animation = true;');
    } else {
      iife = (this.queryUI?.getIIFE() || '').replace('option.animation = false;', 'option.animation = true;');
    }
    const block = '```echarts\n' + iife + '\n```';
  try { await navigator.clipboard.writeText(block); toast('已复制图表块'); }
    catch {
  const ta = document.createElement('textarea'); ta.value = block; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('已复制图表块');
    }
  }

  // -------- 配置管理 --------
  
  /**
   * 获取当前配置快照(包括数据模式和子UI的状态)
   */
  private getConfigSnapshot(): any {
    const snapshot: any = {
      dataMode: this.dataMode,
      previewPinned: this.previewPinned,
      _savedAt: new Date().toISOString(),
    };

    // 保存当前活动模式的配置
    if (this.dataMode === 'sql' && this.sqlUI) {
      // 获取SQL UI的状态
      try {
        const sqlState = (this.sqlUI as any).getStateSnapshot?.();
        if (sqlState) {
          snapshot.sqlConfig = sqlState;
        }
      } catch (e) {
        console.warn('[VisualEchartsUI] 获取SQL配置失败:', e);
      }
    } else if (this.dataMode === 'database' && this.queryUI) {
      // 获取Query UI的状态(如果有对应方法)
      try {
        const queryState = (this.queryUI as any).getStateSnapshot?.();
        if (queryState) {
          snapshot.queryConfig = queryState;
        }
      } catch (e) {
        console.warn('[VisualEchartsUI] 获取Query配置失败:', e);
      }
    }

    return snapshot;
  }

  /**
   * 应用配置快照
   */
  private applyConfigSnapshot(snapshot: any) {
    try {
      // 恢复基本设置
      if (snapshot.dataMode) {
        const targetMode = snapshot.dataMode as 'database' | 'sql';
        if (targetMode !== this.dataMode) {
          this.switchMode(targetMode);
        }
      }

      // 恢复对应模式的配置
      if (snapshot.sqlConfig && this.sqlUI) {
        try {
          (this.sqlUI as any).hydrateState?.(snapshot.sqlConfig);
        } catch (e) {
          console.warn('[VisualEchartsUI] 应用SQL配置失败:', e);
        }
      }

      if (snapshot.queryConfig && this.queryUI) {
        try {
          (this.queryUI as any).hydrateState?.(snapshot.queryConfig);
        } catch (e) {
          console.warn('[VisualEchartsUI] 应用Query配置失败:', e);
        }
      }

      // 刷新预览
      this.renderChartPreview().catch(() => {});
      toast('已应用配置');
    } catch (e) {
      console.error('[VisualEchartsUI] 应用配置失败:', e);
      toast('应用配置失败');
    }
  }

  /**
   * 保存配置流程
   */
  private async saveConfigFlow() {
    if (!this.loadEchartsPresetsProvider || !this.saveEchartsPresetsProvider) {
      toast('未配置预设存储');
      return;
    }

    try {
      // 加载现有预设
      const presetsResult = this.loadEchartsPresetsProvider();
      const presets = (presetsResult && typeof (presetsResult as any).then === 'function')
        ? await presetsResult
        : (presetsResult || {});

      // 请求配置名称
      const name = await this.openInputModal('请输入配置名称', '保存配置');
      if (!name || !name.trim()) return;

      const trimmedName = name.trim();

      // 检查是否存在同名配置
      if (presets[trimmedName]) {
        const ok = await this.openConfirmModal('同名配置已存在，是否覆盖？');
        if (!ok) return;
      }

      // 保存配置
      const snapshot = this.getConfigSnapshot();
      presets[trimmedName] = {
        ...snapshot,
        name: trimmedName,
      };

      const saveResult = this.saveEchartsPresetsProvider(presets);
      if (saveResult && typeof (saveResult as any).then === 'function') {
        await saveResult;
      }

      toast('配置已保存');
    } catch (e) {
      console.error('[VisualEchartsUI] 保存配置失败:', e);
      toast('保存失败');
    }
  }

  /**
   * 打开配置管理模态框
   */
  private async openConfigModal() {
    if (!this.loadEchartsPresetsProvider || !this.saveEchartsPresetsProvider) {
      toast('未配置预设存储');
      return;
    }

    this.ensureModalStyle();

    const overlay = document.createElement('div');
    overlay.className = 'veq-modal-mask';
    const dialog = document.createElement('div');
    dialog.className = 'veq-modal veq-preset';
    dialog.innerHTML = `
      <div class="veq-modal-header">
        <div class="veq-modal-title">ECharts 配置管理</div>
        <button class="veq-btn veq-ghost" data-close>×</button>
      </div>
      <div class="veq-modal-body">
        <div class="veq-preset-head">
          <input class="veq-input veq-search" data-search placeholder="搜索配置..." />
          <span class="veq-badge" data-count>0</span>
        </div>
        <div class="veq-list" data-list></div>
      </div>
      <div class="veq-modal-footer">
        <button class="veq-btn" data-close2>关闭</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', close);
    (dialog.querySelector('[data-close2]') as HTMLButtonElement).addEventListener('click', close);

    const listEl = dialog.querySelector('[data-list]') as HTMLElement;
    const searchEl = dialog.querySelector('[data-search]') as HTMLInputElement;
    const countEl = dialog.querySelector('[data-count]') as HTMLElement;

    const render = async () => {
      try {
        const presetsResult = this.loadEchartsPresetsProvider!();
        const presets = (presetsResult && typeof (presetsResult as any).then === 'function')
          ? await presetsResult
          : (presetsResult || {});

        const q = (searchEl?.value || '').trim().toLowerCase();
        const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'))
          .filter(n => !q || n.toLowerCase().includes(q));

        if (!names.length) {
          listEl.innerHTML = `<div class="veq-item"><div class="veq-item-name" style="color: var(--veq-muted)">暂无配置</div></div>`;
          if (countEl) countEl.textContent = '0';
          return;
        }

        if (countEl) countEl.textContent = String(names.length);
        
        listEl.innerHTML = names.map(n => {
          const config = presets[n];
          const dataMode = config.dataMode || 'sql';
          const savedAt = config._savedAt ? new Date(config._savedAt).toLocaleString('zh-CN') : '未知';
          return `
          <div class="veq-item" data-name="${this.escape(n)}">
            <div class="veq-item__main">
              <div class="veq-item-name">${this.escape(n)}</div>
              <div class="veq-item-meta" style="font-size:11px; color:var(--b3-theme-on-surface-light); margin-top:4px;">
                <span>数据源: ${dataMode === 'sql' ? 'SQL' : '数据库'}</span>
                <span style="margin-left:12px;">保存时间: ${savedAt}</span>
              </div>
            </div>
            <div class="veq-item-actions">
              <button class="veq-btn veq-small" data-apply>应用</button>
              <button class="veq-btn veq-small" data-rename>重命名</button>
              <button class="veq-btn veq-small" data-delete>删除</button>
            </div>
          </div>`;
        }).join('');

        // 绑定事件
        listEl.querySelectorAll('.veq-item').forEach(item => {
          const name = (item as HTMLElement).getAttribute('data-name') || '';
          const apply = item.querySelector('[data-apply]') as HTMLButtonElement;
          const rename = item.querySelector('[data-rename]') as HTMLButtonElement;
          const del = item.querySelector('[data-delete]') as HTMLButtonElement;

          // 应用配置
          apply.addEventListener('click', async () => {
            try {
              const pResult = this.loadEchartsPresetsProvider!();
              const p = (pResult && typeof (pResult as any).then === 'function')
                ? await pResult
                : (pResult || {});
              const config = p[name];
              if (!config) {
                toast('配置不存在');
                return;
              }
              this.applyConfigSnapshot(config);
              close();
            } catch (e) {
              console.error('[VisualEchartsUI] 应用配置失败:', e);
              toast('应用失败');
            }
          });

          // 双击也可应用
          (item as HTMLElement).addEventListener('dblclick', async () => {
            try {
              const pResult = this.loadEchartsPresetsProvider!();
              const p = (pResult && typeof (pResult as any).then === 'function')
                ? await pResult
                : (pResult || {});
              const config = p[name];
              if (!config) {
                toast('配置不存在');
                return;
              }
              this.applyConfigSnapshot(config);
              close();
            } catch (e) {
              console.error('[VisualEchartsUI] 应用配置失败:', e);
              toast('应用失败');
            }
          });

          // 重命名
          rename.addEventListener('click', async () => {
            try {
              const newName = await this.openInputModal('请输入新名称', '重命名配置', name);
              if (!newName || !newName.trim() || newName.trim() === name) return;

              const pResult = this.loadEchartsPresetsProvider!();
              const p = (pResult && typeof (pResult as any).then === 'function')
                ? await pResult
                : (pResult || {});

              if (p[newName.trim()]) {
                const ok = await this.openConfirmModal('同名配置已存在，是否覆盖？');
                if (!ok) return;
              }

              const config = p[name];
              p[newName.trim()] = { ...config, name: newName.trim() };
              if (newName.trim() !== name) delete p[name];

              const saveResult = this.saveEchartsPresetsProvider!(p);
              if (saveResult && typeof (saveResult as any).then === 'function') {
                await saveResult;
              }

              render();
              toast('已重命名');
            } catch (e) {
              console.error('[VisualEchartsUI] 重命名失败:', e);
              toast('重命名失败');
            }
          });

          // 删除
          del.addEventListener('click', async () => {
            try {
              const ok = await this.openConfirmModal(`删除配置"${name}"？`);
              if (!ok) return;

              const pResult = this.loadEchartsPresetsProvider!();
              const presets = (pResult && typeof (pResult as any).then === 'function')
                ? await pResult
                : (pResult || {});

              delete presets[name];

              const saveResult = this.saveEchartsPresetsProvider!(presets);
              if (saveResult && typeof (saveResult as any).then === 'function') {
                await saveResult;
              }

              render();
              toast('已删除');
            } catch (e) {
              console.error('[VisualEchartsUI] 删除失败:', e);
              toast('删除失败');
            }
          });
        });
      } catch (e) {
        console.error('[VisualEchartsUI] 渲染配置列表失败:', e);
        listEl.innerHTML = '<div class="veq-item"><div class="veq-item-name" style="color:var(--b3-theme-error)">加载失败</div></div>';
      }
    };

    searchEl?.addEventListener('input', () => { render(); });
    render();
  }

  /**
   * 确保模态框样式已注入
   */
  private ensureModalStyle() {
    const STYLE_ID = 'veq-echarts-config-modal-style';
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .veq-modal-mask{position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:9999}
      .veq-modal{width:min(720px, 92vw); max-height:86vh; background: var(--b3-theme-surface); border:1px solid var(--b3-border-color); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.35); display:flex; flex-direction:column}
      .veq-modal-header{display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--b3-border-color)}
      .veq-modal-title{font-weight:600}
      .veq-modal-body{padding:12px; overflow:auto}
      .veq-modal-footer{display:flex; gap:8px; justify-content:flex-end; padding:10px 12px; border-top:1px solid var(--b3-border-color)}
      .veq-modal .veq-input{appearance:none; border:1px solid var(--b3-border-color); background: var(--b3-theme-background); color: var(--b3-theme-on-background); border-radius:6px; padding:6px 8px; outline:none;}
      .veq-modal .veq-input:focus{border-color: var(--b3-theme-primary); box-shadow:0 0 0 2px var(--b3-theme-primary-light)}
      .veq-modal .veq-field{display:grid; gap:6px}
      .veq-modal .veq-label{font-size:12px; color: var(--b3-theme-on-surface)}
      .veq-preset-head{display:flex; gap:8px; align-items:center; margin-bottom:12px}
      .veq-preset-head .veq-input{flex:1}
      .veq-badge{background: var(--b3-theme-primary); color:#fff; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600}
      .veq-list{display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow:auto}
      .veq-item{border:1px solid var(--b3-border-color); border-radius:6px; padding:10px; display:flex; gap:12px; align-items:flex-start; transition:all .2s}
      .veq-item:hover{background: var(--b3-list-hover)}
      .veq-item--disabled{opacity:0.5; cursor:not-allowed}
      .veq-item__main{flex:1; min-width:0}
      .veq-item-name{font-weight:600; margin-bottom:4px}
      .veq-item-meta{font-size:11px; color: var(--b3-theme-on-surface-light); margin-top:4px}
      .veq-item-sql{font-size:11px; color: var(--b3-theme-on-surface-light); background: var(--b3-theme-background); padding:6px 8px; border-radius:4px; margin:0; white-space:pre-wrap; word-break:break-all; max-height:60px; overflow:auto}
      .veq-item-actions{display:flex; gap:4px; flex-shrink:0}
      .veq-btn{appearance:none; border:1px solid var(--b3-border-color); background: var(--b3-theme-background); color: var(--b3-theme-on-background); padding:6px 12px; border-radius:6px; cursor:pointer; transition:all .2s; font-size:14px}
      .veq-btn:hover{background: var(--b3-list-hover); border-color: var(--b3-theme-primary)}
      .veq-btn.ve-primary{background: var(--b3-theme-primary); color:#fff; border-color: var(--b3-theme-primary)}
      .veq-btn.ve-primary:hover{opacity:0.9}
      .veq-btn.veq-ghost{background:transparent; border-color:transparent}
      .veq-btn.veq-ghost:hover{background: var(--b3-list-hover)}
      .veq-btn.veq-small{padding:4px 8px; font-size:12px}
      .veq-btn:disabled{opacity:0.5; cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  /**
   * 输入模态框
   */
  private openInputModal(placeholder: string, title: string, defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      this.ensureModalStyle();
      const overlay = document.createElement('div');
      overlay.className = 'veq-modal-mask';
      const dialog = document.createElement('div');
      dialog.className = 'veq-modal';
      dialog.style.maxWidth = '400px';
      dialog.innerHTML = `
        <div class="veq-modal-header">
          <div class="veq-modal-title">${this.escape(title)}</div>
          <button class="veq-btn veq-ghost" data-close>×</button>
        </div>
        <div class="veq-modal-body">
          <input class="veq-input" data-input placeholder="${this.escape(placeholder)}" value="${this.escape(defaultValue)}" style="width:100%;" />
        </div>
        <div class="veq-modal-footer">
          <button class="veq-btn" data-cancel>取消</button>
          <button class="veq-btn ve-primary" data-ok>确定</button>
        </div>
      `;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const input = dialog.querySelector('[data-input]') as HTMLInputElement;
      const close = () => { overlay.remove(); resolve(null); };
      const ok = () => { const val = input.value.trim(); overlay.remove(); resolve(val || null); };

      (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', close);
      (dialog.querySelector('[data-cancel]') as HTMLButtonElement).addEventListener('click', close);
      (dialog.querySelector('[data-ok]') as HTMLButtonElement).addEventListener('click', ok);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      setTimeout(() => input.focus(), 50);
    });
  }

  /**
   * 确认模态框
   */
  private openConfirmModal(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.ensureModalStyle();
      const overlay = document.createElement('div');
      overlay.className = 'veq-modal-mask';
      const dialog = document.createElement('div');
      dialog.className = 'veq-modal';
      dialog.style.maxWidth = '400px';
      dialog.innerHTML = `
        <div class="veq-modal-header">
          <div class="veq-modal-title">确认</div>
          <button class="veq-btn veq-ghost" data-close>×</button>
        </div>
        <div class="veq-modal-body">
          <p style="margin:0; color: var(--b3-theme-on-surface);">${this.escape(message)}</p>
        </div>
        <div class="veq-modal-footer">
          <button class="veq-btn" data-cancel>取消</button>
          <button class="veq-btn ve-primary" data-ok>确定</button>
        </div>
      `;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const close = () => { overlay.remove(); resolve(false); };
      const ok = () => { overlay.remove(); resolve(true); };

      (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', close);
      (dialog.querySelector('[data-cancel]') as HTMLButtonElement).addEventListener('click', close);
      (dialog.querySelector('[data-ok]') as HTMLButtonElement).addEventListener('click', ok);
    });
  }

  /**
   * HTML 转义
   */
  private escape(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

}

