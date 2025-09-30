import { VisualEchartsQueryUI } from './visual-echarts-query-ui';
import "@/aggregate/echarts/echart_panel.scss";
import { ensureEcharts as ensureEchartsLib } from './echarts-loader';
import { toast } from './utils';
import type { VisualEchartsOptions } from './types';

export class VisualEchartsUI {
  private container: HTMLElement;
  private key: string;
  private previewBody!: HTMLElement;
  private chartDiv?: HTMLDivElement;
  private echartsInst?: any;
  private previewPinned: boolean = false;
  // 仅保留数据库查询模式
  private queryUI?: VisualEchartsQueryUI;
  private loadSqlPresetsProvider?: () => Promise<Record<string, any>> | Record<string, any>;
  private opts?: VisualEchartsOptions;
  // 仅保留查询面板

  constructor(container: HTMLElement, opts?: VisualEchartsOptions) {
    this.container = container;
    this.opts = opts;
    this.key = opts?.persistKey || 'siyuan-steve-tools:visual-echarts-ui';
    this.loadSqlPresetsProvider = opts?.loadSqlPresets;
    // injectStyleOnce();
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const s = JSON.parse(raw);
        this.previewPinned = !!s.previewPinned;
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
            ${this.opts?.onGotoSQL ? '<button class="ve-btn ve-link" data-goto-sql title="跳转到 SQL 编辑位置">转到 SQL ➜</button>' : ''}
            <button class="ve-btn ve-icon ${this.previewPinned ? 'active' : ''}" title="置顶预览" data-pin-preview>📌</button>
          </div>
        </div>
        <div class="ve-card" data-section="preview">
          <div class="ve-result" data-result><div class="ve-placeholder">暂无预览</div></div>
        </div>
        <details class="ve-card" open data-section="query">
          <summary class="ve-legend">数据库查询模式</summary>
          <div data-query-container></div>
        </details>
      </div>
    `;
    // 绑定基础元素（无代码预览）
    this.previewBody = this.container.querySelector('[data-result]') as HTMLElement;
    // 顶部按钮
    (this.container.querySelector('[data-refresh]') as HTMLButtonElement).addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.renderChartPreview().catch(()=>{}); });
  (this.container.querySelector('[data-copy-block-top]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.copyChartBlock(); });
  (this.container.querySelector('[data-pin-preview]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.togglePinPreview(); });
    if (this.opts?.onGotoSQL) {
      (this.container.querySelector('[data-goto-sql]') as HTMLButtonElement)?.addEventListener('click', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        try { this.opts?.onGotoSQL?.(); } catch { /* ignore */ }
      });
    }
    // 初始化查询模式子 UI
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
  }

  // 已移除表格相关的格式化方法


  public resize() {
    // 保留扩展点，当前无重算需求
  }

  // 供外部设置 SQL 并可选择触发一次查询
  public setSQL(..._args: any[]) {
    this.renderChartPreview();
  }


  // -------- 图表预览 --------
  private async ensureEcharts(): Promise<void> {
    await ensureEchartsLib();
  }

  private buildOptionForPreview() {
    // 根据模式选择对应 IIFE 并执行
    try {
      const iife = this.queryUI?.getIIFE() || '(()=>({}))()';
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
    const iife = (this.queryUI?.getIIFE() || '').replace('option.animation = false;', 'option.animation = true;');
    const block = '```echarts\n' + iife + '\n```';
  try { await navigator.clipboard.writeText(block); toast('已复制图表块'); }
    catch {
  const ta = document.createElement('textarea'); ta.value = block; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('已复制图表块');
    }
  }

}
