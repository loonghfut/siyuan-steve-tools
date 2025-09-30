import { buildPresetCountIIFE } from './option-templates';
import { VisualEchartsQueryUI } from './visual-echarts-query-ui';
import { injectStyleOnce } from './style';
import { ensureEcharts as ensureEchartsLib } from './echarts-loader';
import { renderPaletteFromState } from './palette';
import { getSqlPresets, safeCompileSqlFromSnapshot } from './sql-presets';
import { debounce, escapeHtml, toast, setDeepSetting, buildSettingsPayloadFor } from './utils';
import type { ChartType, CommonSettings, PerTypeSettings, PresetItem, VisualEchartsOptions } from './types';

export class VisualEchartsUI {
  private container: HTMLElement;
  private key: string;
  private outputPre!: HTMLPreElement;
  private previewBody!: HTMLElement;
  private chartDiv?: HTMLDivElement;
  private echartsInst?: any;
  private previewPinned: boolean = false;
  // 模式切换：预设计数 | 数据库查询
  private mode: 'preset' | 'query' = 'preset';
  private queryUI?: VisualEchartsQueryUI;
  // Debounced operations
  private debouncedRebuildColorUpdate!: () => void;
  // 预设计数相关
  private presetListEl?: HTMLElement;
  private presetItems: PresetItem[] = [];
  private presetTypeSel?: HTMLSelectElement; // bar/line/scatter/pie
  private presetTitleInput?: HTMLInputElement;
  // 颜色仅由调色盘控制，不再使用文本输入
  private presetColors: string[] = [];
  private paletteEl?: HTMLElement;
  // 每种图的自定义设置（持久化）
  private perTypeSettings: PerTypeSettings = {
      bar: { stack: false, boundaryGap: true, xLabelRotate: 0, label: { show: false, position: 'top' } },
      line: { smooth: true, boundaryGap: false, xLabelRotate: 0, label: { show: false, position: 'top' } },
    scatter: {},
    pie: { innerRadius: 0, outerRadius: 70, roseType: false, label: { show: false, position: 'outside' } },
    };
  // 与查询模式统一的“通用设置”
  private commonSettings: CommonSettings = {
    legendPos: 'top',
    ySplitLine: 'dashed',
    grid: { top: 50, right: 10, bottom: 24, left: 10 }
  };
  private currentSettingsEl?: HTMLElement;
  private loadSqlPresetsProvider?: () => Promise<Record<string, any>> | Record<string, any>;
  private opts?: VisualEchartsOptions;
  // 避免设置时的回写触发重绘导致丢焦点：从预设面板向查询子面板同步设置期间置位
  private syncingFromPreset: boolean = false;

  constructor(container: HTMLElement, opts?: VisualEchartsOptions) {
    this.container = container;
    this.opts = opts;
    this.key = opts?.persistKey || 'siyuan-steve-tools:visual-echarts-ui';
    this.loadSqlPresetsProvider = opts?.loadSqlPresets;
    injectStyleOnce();
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const s = JSON.parse(raw);
        this.mode = s.mode || this.mode;
        this.presetItems = Array.isArray(s.presetItems) ? s.presetItems : this.presetItems;
        this.presetColors = Array.isArray(s.presetColors) ? s.presetColors : this.presetColors;
        if (s.perTypeSettings) this.perTypeSettings = { ...this.perTypeSettings, ...s.perTypeSettings };
        if (s.commonSettings) this.commonSettings = { ...this.commonSettings, ...s.commonSettings };
        this.previewPinned = !!s.previewPinned;
      }
    } catch { /* ignore */ }
    this.debouncedRebuildColorUpdate = debounce(() => this.rebuildPresetCode(), 150);
    this.render();
    this.rebuildPresetCode();
    this.applyPinPreviewUI();
  }

  private persist() {
    try {
      const data = {
        mode: this.mode,
        presetItems: this.presetItems,
        presetType: this.presetTypeSel?.value || 'bar',
        presetTitle: this.presetTitleInput?.value || '',
        presetColors: this.presetColors,
        perTypeSettings: this.perTypeSettings,
        commonSettings: this.commonSettings,
        previewPinned: this.previewPinned,
      };
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  private render() {
    this.container.innerHTML = `
      <div class="ve-wrap">
        <div class="ve-row ve-actions ve-mode-tabs">
          <button class="ve-tab ${this.mode==='preset' ? 'active' : ''}" data-tab="preset">预设</button>
          <button class="ve-tab ${this.mode==='query' ? 'active' : ''}" data-tab="query">查询</button>
          <span style="flex:1"></span>
          <button class="ve-btn" data-refresh>刷新</button>
          <button class="ve-btn" data-copy-block-top>复制图表块</button>
          <button class="ve-btn ve-icon ${this.previewPinned ? 'active' : ''}" title="置顶预览" data-pin-preview>📌</button>
          ${this.opts?.onGotoSQL ? '<button class="ve-btn" data-goto-sql>转到 SQL</button>' : ''}
        </div>
        <div class="ve-card" data-section="preview">
          <div class="ve-result" data-result><div class="ve-placeholder">暂无预览</div></div>
        </div>
        <details class="ve-card" open data-section="preset" style="display:${this.mode==='preset' ? '' : 'none'}">
          <summary class="ve-legend">预设模式</summary>
          <div class="ve-row" style="align-items:center; gap:8px; flex-wrap:wrap;">
            <label class="ve-field">图类型
              <select class="ve-input" data-preset-type>
                <option value="bar">柱状</option>
                <option value="line">折线</option>
                <option value="scatter">散点</option>
                <option value="pie">饼图</option>
              </select>
            </label>
            <label class="ve-field">标题
              <input class="ve-input" data-preset-title placeholder="标题..." />
            </label>
          </div>
          <div class="ve-group">
            <div class="ve-group__title">调色盘</div>
            <div class="ve-row ve-color-row"><button class="ve-btn ve-small" data-color-add>+ 颜色</button></div>
            <div class="ve-color-palette" data-color-palette></div>
          </div>
          <div class="ve-group" data-type-settings>
            <div class="ve-group__title">类型设置</div>
            <div data-collapse><div data-type-settings-body></div></div>
            <div class="ve-row ve-justify-end"><button class="ve-btn ve-small" data-type-reset>恢复默认</button></div>
          </div>
          <div class="ve-group">
            <div class="ve-group__title">预设列表</div>
            <div class="ve-row">
              <button class="ve-btn ve-small" data-preset-add>从 SQL 预设添加</button>
              <button class="ve-btn ve-small" data-preset-clear>清空</button>
              <button class="ve-btn ve-small" data-preset-copy>复制 IIFE</button>
              <button class="ve-btn ve-small" data-preset-copy-block>复制图表块</button>
            </div>
            <div class="ve-preset-list" data-preset-list></div>
            <div class="ve-hint" style="color:var(--muted); font-size:12px; margin-top:6px;">说明：x 轴为各预设名称，y 为各自 SQL 查询结果的行数。</div>
            <div class="ve-output" data-output></div>
          </div>
        </details>
        <details class="ve-card" open data-section="query" style="display:${this.mode==='query' ? '' : 'none'}">
          <summary class="ve-legend">数据库查询模式</summary>
          <div data-query-container></div>
        </details>
      </div>
    `;
    // 绑定基础元素
    this.outputPre = this.container.querySelector('[data-output]') as HTMLPreElement;
    this.previewBody = this.container.querySelector('[data-result]') as HTMLElement;
    // 顶部按钮
    (this.container.querySelector('[data-refresh]') as HTMLButtonElement).addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.renderChartPreview().catch(()=>{}); });
    (this.container.querySelector('[data-copy-block-top]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.copyChartBlock(); });
    (this.container.querySelector('[data-pin-preview]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.togglePinPreview(); });
    const gotoSqlBtn = this.container.querySelector('[data-goto-sql]') as HTMLButtonElement | null;
    if (gotoSqlBtn) {
      if (this.opts?.onGotoSQL) gotoSqlBtn.addEventListener('click', () => this.opts!.onGotoSQL!());
      else gotoSqlBtn.style.display = 'none';
    }
    // 预设区控件
    this.presetListEl = this.container.querySelector('[data-preset-list]') as HTMLElement;
    this.presetTypeSel = this.container.querySelector('[data-preset-type]') as HTMLSelectElement;
    this.presetTitleInput = this.container.querySelector('[data-preset-title]') as HTMLInputElement;
    this.paletteEl = this.container.querySelector('[data-color-palette]') as HTMLElement | undefined;
    this.currentSettingsEl = this.container.querySelector('[data-type-settings-body]') as HTMLElement;
    // 恢复选择器/标题
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.presetType && this.presetTypeSel) this.presetTypeSel.value = s.presetType;
        if (typeof s.presetTitle === 'string' && this.presetTitleInput) this.presetTitleInput.value = s.presetTitle;
      }
    } catch { /* ignore */ }
    (this.container.querySelector('[data-preset-add]') as HTMLButtonElement)?.addEventListener('click', () => this.addFromSqlPresets());
    (this.container.querySelector('[data-preset-clear]') as HTMLButtonElement)?.addEventListener('click', () => { this.presetItems = []; this.rebuildPresetListUI(); this.rebuildPresetCode(); });
    (this.container.querySelector('[data-preset-copy]') as HTMLButtonElement)?.addEventListener('click', () => this.copyPresetCode());
    (this.container.querySelector('[data-preset-copy-block]') as HTMLButtonElement)?.addEventListener('click', () => this.copyChartBlock());
    this.presetTypeSel?.addEventListener('change', () => {
      this.renderTypeSettingsUI();
      try { const t = (this.presetTypeSel!.value as any); this.queryUI?.setViewSettings((t==='scatter'?'line':t) as any, this.getCurrentTypeSettings()); } catch { /* ignore */ }
      this.rebuildPresetCode();
    });
    this.presetTitleInput?.addEventListener('input', () => { try { this.queryUI?.setTitle(this.presetTitleInput!.value || ''); } catch { /* ignore */ } this.rebuildPresetCode(); });
    // 颜色编辑器交互
    const addColorBtn = this.container.querySelector('[data-color-add]') as HTMLButtonElement | null;
    const getColors = (): string[] => this.presetColors.slice();
    const setColors = (arr: string[]) => {
      this.presetColors = arr.slice();
      try { this.queryUI?.setColors(this.presetColors.slice()); } catch { /* ignore */ }
      this.persist();
      this.debouncedRebuildColorUpdate();
    };
    const renderPal = () => renderPaletteFromState(this.paletteEl!, getColors, setColors, (apply) => { try { this.syncingFromPreset = true; apply(); } finally { this.syncingFromPreset = false; } });
    if (addColorBtn) addColorBtn.addEventListener('click', () => { const cs = getColors(); cs.push('#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')); try { this.syncingFromPreset = true; setColors(cs); } finally { this.syncingFromPreset = false; } renderPal(); });
    renderPal();
    // 类型设置区
    this.renderTypeSettingsUI();
    // 折叠动画
    const typeDetails = this.container.querySelector('details[data-type-settings]') as HTMLDetailsElement | null;
    const collapse = this.container.querySelector('[data-collapse]') as HTMLElement | null;
    if (typeDetails && collapse) {
      const syncHeight = () => {
        if (!collapse) return;
        if (typeDetails.open) {
          collapse.style.height = 'auto';
          const h = collapse.getBoundingClientRect().height;
          collapse.style.height = '0px';
          requestAnimationFrame(() => { collapse.style.height = h + 'px'; });
        } else {
          const h = collapse.getBoundingClientRect().height;
          collapse.style.height = h + 'px';
          requestAnimationFrame(() => { collapse.style.height = '0px'; });
        }
      };
      if (typeDetails.open) collapse.style.height = 'auto'; else collapse.style.height = '0px';
      typeDetails.addEventListener('toggle', syncHeight);
      const ro = new ResizeObserver(() => { if (!typeDetails.open) return; collapse.style.height = 'auto'; const h = collapse.getBoundingClientRect().height; collapse.style.height = h + 'px'; });
      ro.observe(collapse);
    }
    // 初始化查询模式子 UI
    const queryContainer = this.container.querySelector('[data-query-container]') as HTMLElement | null;
    if (queryContainer) {
      this.queryUI = new VisualEchartsQueryUI(queryContainer, {
        persistKey: this.key + ':query',
        onGotoSQL: this.opts?.onGotoSQL,
        loadSqlPresets: this.loadSqlPresetsProvider,
        onChange: () => {
          if (this.syncingFromPreset) { this.rebuildPresetCode(); return; }
          try {
            if (!this.queryUI) return;
            const vs = this.queryUI.getViewSettings();
            const colors = this.queryUI.getColors();
            const title = this.queryUI.getTitle();
            if (this.mode === 'query' && this.presetTypeSel) {
              const cur = (this.presetTypeSel.value as any) || 'bar';
              let next = (vs?.type as any) || cur || 'bar';
              if (next === 'line' && (cur === 'scatter' || cur === 'bar')) next = cur;
              this.presetTypeSel.value = next;
            }
            if (vs && vs.settings) {
              const t = vs.type || 'bar';
              if (t === 'line') this.perTypeSettings.line = { ...this.perTypeSettings.line, ...vs.settings };
              else if (t === 'pie') this.perTypeSettings.pie = { ...this.perTypeSettings.pie, ...vs.settings };
              else this.perTypeSettings.bar = { ...this.perTypeSettings.bar, ...vs.settings };
              this.renderTypeSettingsUI();
            }
            if (Array.isArray(colors)) { this.presetColors = colors.slice(); renderPal(); }
            if (this.presetTitleInput && typeof title === 'string') this.presetTitleInput.value = title;
          } catch { /* ignore */ }
          this.rebuildPresetCode();
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
      try {
        const vs = this.queryUI.getViewSettings();
        const curPreset = (this.presetTypeSel?.value as any) || 'bar';
        let qType = (vs?.type as any) || curPreset || 'bar';
        if (qType === 'line' && (curPreset === 'scatter' || curPreset === 'bar')) qType = curPreset;
        if (this.presetTypeSel) this.presetTypeSel.value = qType;
        const settingsFor = (t: any) => ((t === 'line' || t === 'scatter') ? this.perTypeSettings.line : (t === 'pie' ? this.perTypeSettings.pie : this.perTypeSettings.bar));
        this.queryUI.setViewSettings(qType, settingsFor(qType));
        this.queryUI.setColors(this.presetColors.slice());
        this.queryUI.setTitle(this.presetTitleInput?.value || '');
        try {
          const parentRaw = localStorage.getItem(this.key);
          const parent = parentRaw ? JSON.parse(parentRaw) : {};
          const childRaw = localStorage.getItem(this.key + ':query');
          const child = childRaw ? JSON.parse(childRaw) : {};
          parent.queryFold = child.fold || parent.queryFold || {};
          localStorage.setItem(this.key, JSON.stringify(parent));
        } catch { /* ignore */ }
      } catch { /* ignore */ }
    }
    // 模式切换
    const tabs = Array.from(this.container.querySelectorAll('[data-tab]')) as HTMLButtonElement[];
    const presetCard = this.container.querySelector('[data-section="preset"]') as HTMLElement | null;
    const queryCard = this.container.querySelector('[data-section="query"]') as HTMLElement | null;
    const applyMode = () => {
      tabs.forEach(b => b.classList.toggle('active', (b.getAttribute('data-tab') as any) === this.mode));
      if (presetCard) presetCard.style.display = this.mode==='preset' ? '' : 'none';
      if (queryCard) queryCard.style.display = this.mode==='query' ? '' : 'none';
    };
    tabs.forEach(btn => btn.addEventListener('click', (ev) => { ev.preventDefault(); const t = (btn.getAttribute('data-tab') as 'preset'|'query') || 'preset'; if (this.mode === t) return; this.mode = t; applyMode(); this.rebuildPresetCode(); }));
  }

  // 已移除表格相关的格式化方法


  public resize() {
    // 保留扩展点，当前无重算需求
  }

  // 供外部设置 SQL 并可选择触发一次查询
  public setSQL(..._args: any[]) {
    this.rebuildPresetCode();
  }


  // -------- 图表预览 --------
  private async ensureEcharts(): Promise<void> {
    await ensureEchartsLib();
  }

  private buildOptionForPreview() {
    // 根据模式选择对应 IIFE 并执行
    try {
      let iife = '';
      if (this.mode === 'preset') {
        const title = (this.presetTitleInput?.value ?? '') as string;
        const t = (this.presetTypeSel?.value as any) || 'bar';
  const settings = buildSettingsPayloadFor(t as ChartType, this.commonSettings, this.perTypeSettings);
        iife = buildPresetCountIIFE(
          this.presetItems,
          t,
          title || '',
          settings,
          this.presetColors
        );
      } else {
        iife = this.queryUI?.getIIFE() || '(()=>({}))()';
      }
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return ${iife};`);
      return fn();
    } catch { return {}; }
  }

  // ------- 类型设置渲染与读取 -------
  private renderTypeSettingsUI() {
    if (!this.currentSettingsEl) return;
  const t = (this.presetTypeSel?.value as any) || 'bar';
    const mappedTypeForQuery = (t === 'scatter') ? 'line' : t; // 查询面板仅区分 stat(line) 与 pie
    let html = '';
    // 通用设置区（与查询模式一致）
    const cs = this.commonSettings;
    const commonHtml = `
      <div class="ve-type-settings">
        <div class="ve-group">
          <div class="ve-group__title">通用</div>
          <div class="ve-row" style="align-items:center; gap:8px;">
            <label class="ve-field" style="min-width:220px">
              <div class="ve-label">图例位置</div>
              <select class="ve-input" data-set="common.legendPos" style="width:140px">
                <option value="top" ${cs.legendPos==='top'?'selected':''}>上</option>
                <option value="bottom" ${cs.legendPos==='bottom'?'selected':''}>下</option>
                <option value="left" ${cs.legendPos==='left'?'selected':''}>左</option>
                <option value="right" ${cs.legendPos==='right'?'selected':''}>右</option>
              </select>
            </label>
            <label class="ve-field" style="min-width:220px">
              <div class="ve-label">Y 分割线</div>
              <select class="ve-input" data-set="common.ySplitLine" style="width:140px">
                <option value="dashed" ${cs.ySplitLine==='dashed'?'selected':''}>虚线</option>
                <option value="solid" ${cs.ySplitLine==='solid'?'selected':''}>实线</option>
                <option value="none" ${cs.ySplitLine==='none'?'selected':''}>无</option>
              </select>
            </label>
          </div>
          <div class="ve-row" style="align-items:center; gap:8px; flex-wrap:wrap; margin-top:6px;">
            <label class="ve-field" style="min-width:160px">Grid 顶部(px)
              <input class="ve-input" type="number" step="1" data-set="common.grid.top" value="${cs.grid.top}" />
            </label>
            <label class="ve-field" style="min-width:160px">Grid 右侧(px)
              <input class="ve-input" type="number" step="1" data-set="common.grid.right" value="${cs.grid.right}" />
            </label>
            <label class="ve-field" style="min-width:160px">Grid 底部(px)
              <input class="ve-input" type="number" step="1" data-set="common.grid.bottom" value="${cs.grid.bottom}" />
            </label>
            <label class="ve-field" style="min-width:160px">Grid 左侧(px)
              <input class="ve-input" type="number" step="1" data-set="common.grid.left" value="${cs.grid.left}" />
            </label>
          </div>
        </div>
      </div>`;
  if (t === 'bar') {
      const s = this.perTypeSettings.bar;
      html = `
        ${commonHtml}
        <div class="ve-type-settings">
          <div class="ve-group">
            <div class="ve-group__title">基础</div>
            <label class="ve-field">
              <div class="ve-inline"><span>堆叠</span><label class="ve-switch"><input type="checkbox" data-set="bar.stack" ${s.stack ? 'checked' : ''}/><i></i></label></div>
            </label>
            <label class="ve-field">
              <div class="ve-inline"><span>x 轴留白</span><label class="ve-switch"><input type="checkbox" data-set="bar.boundaryGap" ${s.boundaryGap ? 'checked' : ''}/><i></i></label></div>
            </label>
          </div>
          <div class="ve-group">
            <div class="ve-group__title">标签</div>
            <label class="ve-field">
              <div class="ve-inline"><span>显示标签</span><label class="ve-switch"><input type="checkbox" data-set="bar.label.show" ${s.label?.show ? 'checked' : ''}/><i></i></label></div>
            </label>
            <div class="ve-field">
              <div class="ve-label">标签位置</div>
              <div class="ve-chip-group" role="group">
                <label class="ve-chip"><input type="radio" name="bar_label_position" data-set="bar.label.position" value="top" ${s.label?.position === 'top' ? 'checked' : ''}/><span>top</span></label>
                <label class="ve-chip"><input type="radio" name="bar_label_position" data-set="bar.label.position" value="inside" ${s.label?.position === 'inside' ? 'checked' : ''}/><span>inside</span></label>
                <label class="ve-chip"><input type="radio" name="bar_label_position" data-set="bar.label.position" value="insideTop" ${s.label?.position === 'insideTop' ? 'checked' : ''}/><span>insideTop</span></label>
              </div>
            </div>
          </div>
          <div class="ve-group">
            <div class="ve-group__title">轴样式</div>
          <label class="ve-field">x 轴标签旋转
            <div class="ve-row" style="align-items:center; gap:8px;">
              <input class="ve-range" type="range" min="-90" max="90" step="5" data-set="bar.xLabelRotate" value="${s.xLabelRotate ?? 0}" />
              <span class="ve-label">${s.xLabelRotate ?? 0}°</span>
            </div>
          </label>
          </div>
        </div>`;
    } else if (t === 'line' || t === 'scatter') {
      const s = this.perTypeSettings.line;
      html = `
        ${commonHtml}
        <div class="ve-type-settings">
          <div class="ve-group">
            <div class="ve-group__title">基础</div>
            <label class="ve-field">
              <div class="ve-inline"><span>平滑</span><label class="ve-switch"><input type="checkbox" data-set="line.smooth" ${s.smooth ? 'checked' : ''}/><i></i></label></div>
            </label>
            <label class="ve-field">
              <div class="ve-inline"><span>x 轴留白</span><label class="ve-switch"><input type="checkbox" data-set="line.boundaryGap" ${s.boundaryGap ? 'checked' : ''}/><i></i></label></div>
            </label>
          </div>
          <div class="ve-group">
            <div class="ve-group__title">标签</div>
            <label class="ve-field">
              <div class="ve-inline"><span>显示标签</span><label class="ve-switch"><input type="checkbox" data-set="line.label.show" ${s.label?.show ? 'checked' : ''}/><i></i></label></div>
            </label>
            <div class="ve-field">
              <div class="ve-label">标签位置</div>
              <div class="ve-chip-group" role="group">
                <label class="ve-chip"><input type="radio" name="line_label_position" data-set="line.label.position" value="top" ${s.label?.position === 'top' ? 'checked' : ''}/><span>top</span></label>
                <label class="ve-chip"><input type="radio" name="line_label_position" data-set="line.label.position" value="left" ${s.label?.position === 'left' ? 'checked' : ''}/><span>left</span></label>
                <label class="ve-chip"><input type="radio" name="line_label_position" data-set="line.label.position" value="right" ${s.label?.position === 'right' ? 'checked' : ''}/><span>right</span></label>
              </div>
            </div>
          </div>
          <div class="ve-group">
            <div class="ve-group__title">轴样式</div>
          <label class="ve-field">x 轴标签旋转
            <div class="ve-row" style="align-items:center; gap:8px;">
              <input class="ve-range" type="range" min="-90" max="90" step="5" data-set="line.xLabelRotate" value="${s.xLabelRotate ?? 0}" />
              <span class="ve-label">${s.xLabelRotate ?? 0}°</span>
            </div>
          </label>
          </div>
        </div>`;
    } else if (t === 'pie') {
      const s = this.perTypeSettings.pie;
      html = `
        ${commonHtml}
        <div class="ve-type-settings">
          <div class="ve-group">
            <div class="ve-group__title">半径</div>
            <label class="ve-field">内径(%)
            <div class="ve-row" style="align-items:center; gap:8px;">
              <input class="ve-range" type="range" min="0" max="95" step="5" data-set="pie.innerRadius" value="${s.innerRadius ?? 0}" />
              <span class="ve-label">${s.innerRadius ?? 0}%</span>
            </div>
            <div class="ve-help">建议小于外径，形成环图</div>
            </label>
            <label class="ve-field">外径(%)
            <div class="ve-row" style="align-items:center; gap:8px;">
              <input class="ve-range" type="range" min="5" max="100" step="5" data-set="pie.outerRadius" value="${s.outerRadius ?? 70}" />
              <span class="ve-label">${s.outerRadius ?? 70}%</span>
            </div>
            </label>
          </div>
          <div class="ve-group">
            <div class="ve-group__title">类型与标签</div>
            <div class="ve-field">
            <div class="ve-label">玫瑰图 roseType</div>
            <div class="ve-chip-group" role="group">
              <label class="ve-chip"><input type="radio" name="pie_rosetype" data-set="pie.roseType" value="false" ${!s.roseType ? 'checked' : ''}/><span>无</span></label>
              <label class="ve-chip"><input type="radio" name="pie_rosetype" data-set="pie.roseType" value="radius" ${s.roseType === 'radius' ? 'checked' : ''}/><span>radius</span></label>
              <label class="ve-chip"><input type="radio" name="pie_rosetype" data-set="pie.roseType" value="area" ${s.roseType === 'area' ? 'checked' : ''}/><span>area</span></label>
            </div>
            </div>
            <label class="ve-field">
              <div class="ve-inline"><span>显示标签</span><label class="ve-switch"><input type="checkbox" data-set="pie.label.show" ${s.label?.show ? 'checked' : ''}/><i></i></label></div>
            </label>
            <div class="ve-field">
            <div class="ve-label">标签位置</div>
            <div class="ve-chip-group" role="group">
              <label class="ve-chip"><input type="radio" name="pie_label_position" data-set="pie.label.position" value="outside" ${s.label?.position === 'outside' ? 'checked' : ''}/><span>outside</span></label>
              <label class="ve-chip"><input type="radio" name="pie_label_position" data-set="pie.label.position" value="inside" ${s.label?.position === 'inside' ? 'checked' : ''}/><span>inside</span></label>
              <label class="ve-chip"><input type="radio" name="pie_label_position" data-set="pie.label.position" value="center" ${s.label?.position === 'center' ? 'checked' : ''}/><span>center</span></label>
            </div>
          </div>
        </div>`;
    }
    this.currentSettingsEl.innerHTML = html;
    // 绑定事件
    const inputs = Array.from(this.currentSettingsEl.querySelectorAll('[data-set]')) as HTMLElement[];
    inputs.forEach(el => {
      const key = el.getAttribute('data-set') || '';
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
  el.addEventListener('change', () => { setDeepSetting(this.commonSettings, this.perTypeSettings, key, el.checked, () => this.persist()); try { this.syncingFromPreset = true; this.queryUI?.setViewSettings(mappedTypeForQuery as any, this.getCurrentTypeSettings()); } catch { /* ignore */ } finally { this.syncingFromPreset = false; } this.rebuildPresetCode(); });
      } else if (el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'text' || el.type === 'range')) {
        el.addEventListener('input', () => {
          const v = (el.type === 'number' || el.type === 'range') ? Number(el.value) : el.value;
          // 实时更新旁侧的数值
          const labelSpan = el.parentElement?.querySelector('.ve-label') as HTMLElement | null;
          if (labelSpan && (typeof v === 'number')) labelSpan.textContent = key.includes('Radius') ? `${v}%` : `${v}°`;
          setDeepSetting(this.commonSettings, this.perTypeSettings, key, v, () => this.persist()); try { this.syncingFromPreset = true; this.queryUI?.setViewSettings(mappedTypeForQuery as any, this.getCurrentTypeSettings()); } catch { /* ignore */ } finally { this.syncingFromPreset = false; } this.rebuildPresetCode();
        });
      } else if (el instanceof HTMLInputElement && el.type === 'radio') {
  el.addEventListener('change', () => { let v: any = el.value; if (v === 'false') v = false; setDeepSetting(this.commonSettings, this.perTypeSettings, key, v, () => this.persist()); try { this.syncingFromPreset = true; this.queryUI?.setViewSettings(mappedTypeForQuery as any, this.getCurrentTypeSettings()); } catch { /* ignore */ } finally { this.syncingFromPreset = false; } this.rebuildPresetCode(); });
      } else if (el instanceof HTMLSelectElement) {
  el.addEventListener('change', () => { const v = (el as HTMLSelectElement).value; setDeepSetting(this.commonSettings, this.perTypeSettings, key, v || (v as any), () => this.persist()); try { this.syncingFromPreset = true; this.queryUI?.setViewSettings(mappedTypeForQuery as any, this.getCurrentTypeSettings()); } catch { /* ignore */ } finally { this.syncingFromPreset = false; } this.rebuildPresetCode(); });
      }
    });
    // 恢复默认
    const resetBtn = this.container.querySelector('[data-type-reset]') as HTMLButtonElement | null;
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetCurrentTypeSettings());
  }

  // setDeepSetting 已抽离至 utils.ts

  private getCurrentTypeSettings() {
    const t = (this.presetTypeSel?.value as any) || 'bar';
    if (t === 'line' || t === 'scatter') return this.perTypeSettings.line;
    if (t === 'pie') return this.perTypeSettings.pie;
    return this.perTypeSettings.bar;
  }

  private resetCurrentTypeSettings() {
    const t = (this.presetTypeSel?.value as any) || 'bar';
    if (t === 'line' || t === 'scatter') {
      this.perTypeSettings.line = { smooth: true, boundaryGap: false, xLabelRotate: 0, label: { show: false, position: 'top' } };
    } else if (t === 'pie') {
      this.perTypeSettings.pie = { innerRadius: 0, outerRadius: 70, roseType: false, label: { show: false, position: 'outside' } };
    } else {
      this.perTypeSettings.bar = { stack: false, boundaryGap: true, xLabelRotate: 0, label: { show: false, position: 'top' } };
    }
  this.persist();
    this.renderTypeSettingsUI();
  // rebuildPresetCode 会在 renderTypeSettingsUI() 之后由事件触发
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

  // ---------- 预设模式 ----------

  private rebuildPresetListUI() {
    if (!this.presetListEl) return;
    this.presetListEl.innerHTML = '';
    if (!this.presetItems.length) {
      this.presetListEl.innerHTML = '<div class="ve-placeholder">尚未添加任何预设。点击“从 SQL 预设添加”。</div>';
      return;
    }
    this.presetItems.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 've-preset-item';
      row.innerHTML = `
        <div class="ve-row" style="align-items:center; gap:6px;">
          <input class="ve-input" data-name value="${escapeHtml(it.name)}" style="width:180px" />
          <textarea class="ve-input" data-sql rows="2" style="flex:1">${escapeHtml(it.sql)}</textarea>
          <button class="ve-btn ve-ghost" data-del title="删除">删除</button>
        </div>
      `;
      // 整行拖拽（与查询模式一致）
      row.draggable = true;
      row.addEventListener('dragstart', (ev) => {
        row.classList.add('dragging');
        try { ev.dataTransfer?.setData('text/plain', String(idx)); } catch {}
      });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); });
      row.addEventListener('dragover', (ev) => { ev.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => { row.classList.remove('drag-over'); });
      row.addEventListener('drop', (ev) => {
        ev.preventDefault(); row.classList.remove('drag-over');
        let fromIdx = idx;
        try { const data = ev.dataTransfer?.getData('text/plain'); if (data!=null && data!=='') fromIdx = Number(data)|0; } catch{}
        const toIdx = idx;
        if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= this.presetItems.length) return;
        const moved = this.presetItems.splice(fromIdx, 1)[0];
        this.presetItems.splice(toIdx, 0, moved);
    this.rebuildPresetListUI();
    this.rebuildPresetCode();
      });
      (row.querySelector('[data-name]') as HTMLInputElement).addEventListener('input', (e) => {
        this.presetItems[idx].name = (e.target as HTMLInputElement).value;
        this.rebuildPresetCode();
      });
      (row.querySelector('[data-sql]') as HTMLTextAreaElement).addEventListener('input', (e) => {
        this.presetItems[idx].sql = (e.target as HTMLTextAreaElement).value;
        this.rebuildPresetCode();
      });
      (row.querySelector('[data-del]') as HTMLButtonElement).addEventListener('click', () => {
        this.presetItems.splice(idx, 1);
        this.rebuildPresetListUI();
        this.rebuildPresetCode();
      });
      this.presetListEl!.appendChild(row);
    });
  }

  private rebuildPresetCode() {
    let iife = '';
    if (this.mode === 'preset') {
      const t = (this.presetTypeSel?.value as any) || 'bar';
      const title = (this.presetTitleInput?.value ?? '') as string;
  const settings = buildSettingsPayloadFor(t as ChartType, this.commonSettings, this.perTypeSettings);
      iife = buildPresetCountIIFE(
        this.presetItems,
        t,
        title || '',
        settings,
        this.presetColors
      );
    } else {
      iife = this.queryUI?.getIIFE() || '';
    }
  this.outputPre.textContent = iife;
  this.persist();
    this.renderChartPreview().catch(() => { });
  }

  private async copyPresetCode() {
    const t = (this.presetTypeSel?.value as any) || 'bar';
    const title = (this.presetTitleInput?.value ?? '') as string;
  const settings = buildSettingsPayloadFor(t as ChartType, this.commonSettings, this.perTypeSettings);
    const iife = buildPresetCountIIFE(
      this.presetItems,
      t,
      title || '',
      settings,
      this.presetColors
    );
  try { await navigator.clipboard.writeText(iife); toast('已复制'); }
    catch {
  const ta = document.createElement('textarea'); ta.value = iife; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('已复制');
    }
  }

  private async copyChartBlock() {
    let iife = '';
    if (this.mode === 'preset') {
      const t = (this.presetTypeSel?.value as any) || 'bar';
      const title = (this.presetTitleInput?.value ?? '') as string;
  const settings = buildSettingsPayloadFor(t as ChartType, this.commonSettings, this.perTypeSettings);
      iife = buildPresetCountIIFE(
        this.presetItems,
        t,
        title || '',
        settings,
        this.presetColors
      );
    } else {
      iife = this.queryUI?.getIIFE() || '';
    }
    const block = '```echarts\n' + iife + '\n```';
  try { await navigator.clipboard.writeText(block); toast('已复制图表块'); }
    catch {
  const ta = document.createElement('textarea'); ta.value = block; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('已复制图表块');
    }
  }

  private async addFromSqlPresets() {
    // 读取 SQL 预设（优先使用外部提供的加载器，否则回退到 localStorage）
  const presets = await getSqlPresets(this.loadSqlPresetsProvider);
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (!names.length) { toast('暂无 SQL 预设'); return; }
    // 简易选择弹窗
    const overlay = document.createElement('div');
    overlay.className = 've-modal-mask';
    const dlg = document.createElement('div');
    dlg.className = 've-modal';
    dlg.innerHTML = `
      <div class="ve-modal__head"><div>选择要加入对比的预设</div><button class="ve-btn ve-ghost" data-close>×</button></div>
      <div class="ve-modal__body">
        <div class="ve-search"><input class="ve-input" type="search" data-filter placeholder="搜索预设名称…" /></div>
  <div class="ve-preset-chooser">${names.map(n => `<label class="ve-chip"><input type="checkbox" value="${escapeHtml(n)}"/><span>${escapeHtml(n)}</span></label>`).join('')}</div>
        <div class="ve-empty" data-empty style="display:none">无匹配结果</div>
      </div>
      <div class="ve-modal__foot"><button class="ve-btn ve-ghost" data-close2>取消</button><button class="ve-btn" data-ok>加入</button></div>`;
    overlay.appendChild(dlg); document.body.appendChild(overlay);
    const close = () => overlay.remove();
    (dlg.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', close);
    (dlg.querySelector('[data-close2]') as HTMLButtonElement).addEventListener('click', close);
    // 过滤逻辑
    const filterInput = dlg.querySelector('[data-filter]') as HTMLInputElement;
    const chooser = dlg.querySelector('.ve-preset-chooser') as HTMLElement;
    const empty = dlg.querySelector('[data-empty]') as HTMLElement;
    const labels = Array.from(chooser.querySelectorAll('.ve-chip')) as HTMLElement[];
    const applyFilter = () => {
      const q = (filterInput.value || '').trim().toLowerCase();
      let visibleCount = 0;
      labels.forEach(lbl => {
        const name = (lbl.querySelector('span')?.textContent || '').toLowerCase();
        const show = !q || name.includes(q);
        (lbl as HTMLElement).style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });
      if (empty) empty.style.display = visibleCount ? 'none' : '';
    };
    if (filterInput) {
      filterInput.addEventListener('input', applyFilter);
      // 初始应用一次，避免空白边距抖动
      applyFilter();
    }
    (dlg.querySelector('[data-ok]') as HTMLButtonElement).addEventListener('click', () => {
      const checks = Array.from(dlg.querySelectorAll('.ve-preset-chooser input[type="checkbox"]')) as HTMLInputElement[];
      const picked = checks.filter(c => c.checked).map(c => c.value);
      picked.forEach(n => {
        const snap = presets[n];
  const sql = safeCompileSqlFromSnapshot(snap);
        if (sql) this.presetItems.push({ name: n, sql });
      });
      this.rebuildPresetListUI();
  this.rebuildPresetCode();
      close();
    });
  }

}
