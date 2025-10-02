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
  private opts?: VisualEchartsOptions;
  // 仅保留查询面板

  constructor(container: HTMLElement, opts?: VisualEchartsOptions) {
    this.container = container;
    this.opts = opts;
    this.key = opts?.persistKey || 'siyuan-steve-tools:visual-echarts-ui';
    this.loadSqlPresetsProvider = opts?.loadSqlPresets;
    this.saveSqlPresetsProvider = opts?.saveSqlPresets;
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
    }
  }

  // 已移除表格相关的格式化方法


  public resize() {
    // 保留扩展点，当前无重算需求
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
    } catch { return {}; }
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
    const option = this.buildOptionForPreview();
    this.echartsInst.setOption(option, true);
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

}
