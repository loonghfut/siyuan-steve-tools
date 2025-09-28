import { buildPresetCountIIFE } from './option-templates';
import { VisualEchartsQueryUI } from './visual-echarts-query-ui';

export interface VisualEchartsOptions {
  persistKey?: string;
  initialSQL?: string; // 外部传入的初始 SQL
  /**
   * 提供 SQL 预设加载器，使 ECharts 面板可读取与 SQL 面板相同来源（如 PluginConfig）的预设。
   * 若未提供则回退到 localStorage('siyuan-steve-tools:visual-sql-presets')。
   */
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>;
  /**
   * 转到 SQL 面板的回调（例如打开 SQL 生成器对话框或页签）。
   * 若未提供，则隐藏“转到 SQL”按钮。
   */
  onGotoSQL?: () => void;
}

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
  private presetItems: Array<{ name: string; sql: string }> = [];
  private presetTypeSel?: HTMLSelectElement; // bar/line/pie
  private presetTitleInput?: HTMLInputElement;
  // 颜色仅由调色盘控制，不再使用文本输入
  private presetColors: string[] = [];
  private paletteEl?: HTMLElement;
  // 每种图的自定义设置（持久化）
  private perTypeSettings: {
          bar: { stack?: boolean; boundaryGap?: boolean; xLabelRotate?: number; label?: { show?: boolean; position?: string } };
          line: { smooth?: boolean; boundaryGap?: boolean; xLabelRotate?: number; label?: { show?: boolean; position?: string } };
          scatter: { /* Add properties for scatter if needed */ }; // New scatter type
          pie: { innerRadius?: number; outerRadius?: number; roseType?: 'radius' | 'area' | false; label?: { show?: boolean; position?: string } };
  } = {
      bar: { stack: false, boundaryGap: true, xLabelRotate: 0, label: { show: false, position: 'top' } },
      line: { smooth: true, boundaryGap: false, xLabelRotate: 0, label: { show: false, position: 'top' } },
          scatter: { /* Initialize properties for scatter if needed */ }, // Initialize scatter type
          pie: { innerRadius: 0, outerRadius: 70, roseType: false, label: { show: false, position: 'outside' } },
    };
  // 与查询模式统一的“通用设置”
  private commonSettings: { legendPos: 'top'|'bottom'|'left'|'right'; ySplitLine: 'dashed'|'solid'|'none'; grid: { top: number; right: number; bottom: number; left: number } } = {
    legendPos: 'top',
    ySplitLine: 'dashed',
    grid: { top: 50, right: 10, bottom: 24, left: 10 }
  };
  private currentSettingsEl?: HTMLElement;
  private loadSqlPresetsProvider?: () => Promise<Record<string, any>> | Record<string, any>;
  private opts?: VisualEchartsOptions;
  // 避免设置时的回写触发重绘导致丢焦点：从预设面板向查询子面板同步设置期间置位
  private syncingFromPreset: boolean = false;

  constructor(container: HTMLElement, options?: VisualEchartsOptions) {
    this.container = container;
    this.key = options?.persistKey || 'siyuan-steve-tools:visual-echarts-ui';
    this.loadSqlPresetsProvider = options?.loadSqlPresets;
    this.opts = options;
    // 初始化颜色相关的防抖重建
    this.debouncedRebuildColorUpdate = this.debounce(() => this.rebuildPresetCode(), 160);
    this.render();
    this.restore();
    this.rebuildCode();
  }

  private html(strings: TemplateStringsArray, ...values: any[]) {
    return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
  }

  // 简单的防抖工具：在 wait 毫秒内只触发最后一次
  private debounce<T extends (...args: any[]) => void>(fn: T, wait = 200) {
    let timer: number | undefined;
    return ((...args: Parameters<T>) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        fn(...args);
      }, wait) as unknown as number;
    }) as T;
  }

  private render() {
    this.injectStyle();
    // 预读取持久化的模式用于初始渲染，避免首次打开时显示为默认 preset
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && (obj.mode === 'preset' || obj.mode === 'query')) this.mode = obj.mode;
      }
    } catch { /* ignore */ }
    const initialMode = this.mode;
    this.container.innerHTML = this.html`
      <div class="ve-wrap">
        <details class="ve-card" open data-section="preview">
          <summary class="ve-legend">
            <span class="ve-legend-left">结果预览 <button class="ve-icon" data-refresh title="刷新">⟳</button><button class="ve-icon" data-copy-block-top title="复制图表块">⎘</button><button class="ve-icon" data-pin-preview title="顶住">📌</button></span>
            <div class="ve-mode-tabs" role="tablist">
              <button class="ve-tab ${initialMode==='preset' ? 'active' : ''}" data-tab="preset" type="button">SQL预设计数</button>
              <button class="ve-tab ${initialMode==='query' ? 'active' : ''}" data-tab="query" type="button">数据库查询</button>
            </div>
          </summary>
          <div class="ve-result" data-result><div class="ve-placeholder">在下方完成配置后，这里会显示图表</div></div>
        </details>

        <details class="ve-card" open data-section="preset" style="display:${initialMode==='preset' ? '' : 'none'}">
          <summary class="ve-legend">SQL预设计数
            <span style="margin-left:8px; display:inline-flex; gap:6px; align-items:center;">
              <select class="ve-input" data-preset-type style="width:120px">
                <option value="bar">柱状图</option>
                <option value="line">折线图</option>
                <option value="scatter">散点图</option>
                <option value="pie">饼图</option>
              </select>
            </span>
          </summary>
          <div class="ve-row" style="margin:6px 0;">
            <label class="ve-field">标题
              <input class="ve-input" data-preset-title placeholder="图表标题" />
            </label>
            <div class="ve-field">
              <div class="ve-label">颜色</div>
              <div class="ve-row ve-color-row">
                <div class="ve-color-editor">
                  <div class="ve-color-palette" data-color-palette></div>
                  <button class="ve-btn ve-ghost ve-small" data-color-add type="button">添加颜色</button>
                </div>
              </div>
            </div>
          </div>
          <div class="ve-row" style="margin:6px 0;">
            <button class="ve-btn" data-preset-add>从 SQL 预设添加</button>
            <button class="ve-btn" data-goto-sql>转到 SQL</button>
            <button class="ve-btn" data-preset-clear>清空</button>
            <button class="ve-btn" data-preset-copy>复制 JS(IIFE)</button>
            <button class="ve-btn" data-preset-copy-block>复制图表块</button>
          </div>
          <details class="ve-sub" data-type-settings>
            <summary class="ve-legend">图表自定义设置</summary>
            <div class="ve-collapse" data-collapse>
              <div class="ve-type-settings" data-type-settings-body></div>
            </div>
          </details>
          <details class="ve-sub">
            <summary class="ve-legend">代码预览</summary>
            <pre class="ve-output" data-output></pre>
          </details>
          <div class="ve-preset-list" data-preset-list></div>
          <div class="ve-hint" style="color:var(--muted); font-size:12px; margin-top:6px;">说明：x 轴为各预设名称，y 为各自 SQL 查询结果的行数。</div>
        </details>
        <details class="ve-card" open data-section="query" style="display:${initialMode==='query' ? '' : 'none'}">
          <summary class="ve-legend">数据库查询模式</summary>
          <div data-query-container></div>
        </details>
      </div>
    `;
    this.outputPre = this.container.querySelector('[data-output]') as HTMLPreElement;
    this.previewBody = this.container.querySelector('[data-result]') as HTMLElement;
    // 预览刷新
  (this.container.querySelector('[data-refresh]') as HTMLButtonElement).addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.refreshPreview(); });
  (this.container.querySelector('[data-copy-block-top]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.copyChartBlock(); });
    (this.container.querySelector('[data-pin-preview]') as HTMLButtonElement)?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.togglePinPreview(); });
    const gotoSqlBtn = this.container.querySelector('[data-goto-sql]') as HTMLButtonElement | null;
    if (gotoSqlBtn) {
      if (this.opts?.onGotoSQL) {
        gotoSqlBtn.addEventListener('click', () => this.opts!.onGotoSQL!());
      } else {
        gotoSqlBtn.style.display = 'none';
      }
    }

    // 预设区控件
    this.presetListEl = this.container.querySelector('[data-preset-list]') as HTMLElement;
    this.presetTypeSel = this.container.querySelector('[data-preset-type]') as HTMLSelectElement;
    this.presetTitleInput = this.container.querySelector('[data-preset-title]') as HTMLInputElement;
    this.paletteEl = this.container.querySelector('[data-color-palette]') as HTMLElement | undefined;
    this.currentSettingsEl = this.container.querySelector('[data-type-settings-body]') as HTMLElement;
    (this.container.querySelector('[data-preset-add]') as HTMLButtonElement)?.addEventListener('click', () => this.addFromSqlPresets());
    (this.container.querySelector('[data-preset-clear]') as HTMLButtonElement)?.addEventListener('click', () => { this.presetItems = []; this.rebuildPresetListUI(); this.rebuildPresetCode(); });
    (this.container.querySelector('[data-preset-copy]') as HTMLButtonElement)?.addEventListener('click', () => this.copyPresetCode());
  (this.container.querySelector('[data-preset-copy-block]') as HTMLButtonElement)?.addEventListener('click', () => this.copyChartBlock());
    this.presetTypeSel?.addEventListener('change', () => {
      this.renderTypeSettingsUI();
      // 同步到查询面板以保持统一
      try {
        const t = (this.presetTypeSel!.value as any);
        this.queryUI?.setViewSettings((t==='scatter'?'line':t) as any, this.getCurrentTypeSettings());
      } catch { /* ignore */ }
      this.rebuildPresetCode();
    });
    this.presetTitleInput?.addEventListener('input', () => {
      try { this.queryUI?.setTitle(this.presetTitleInput!.value || ''); } catch { /* ignore */ }
      this.rebuildPresetCode();
    });
    // 颜色编辑器交互
    const addColorBtn = this.container.querySelector('[data-color-add]') as HTMLButtonElement | null;
    const getColors = (): string[] => this.presetColors.slice();
    const setColors = (arr: string[]) => {
      this.presetColors = arr.slice();
      try { this.queryUI?.setColors(this.presetColors.slice()); } catch { /* ignore */ }
      // 立即保存，避免用户快速离开导致防抖未触发
      this.save();
      this.debouncedRebuildColorUpdate();
    };
    const renderPalette = () => this.renderPaletteFromState(getColors, setColors);
    if (addColorBtn) addColorBtn.addEventListener('click', () => {
      const cs = getColors();
      cs.push('#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'));
      try { this.syncingFromPreset = true; setColors(cs); } finally { this.syncingFromPreset = false; }
      renderPalette();
    });
    // 初始化 palette
    renderPalette();
    // 初始化类型设置区（默认折叠）
    this.renderTypeSettingsUI();
    // 绑定折叠过渡动画
    const typeDetails = this.container.querySelector('details[data-type-settings]') as HTMLDetailsElement | null;
    const collapse = this.container.querySelector('[data-collapse]') as HTMLElement | null;
    if (typeDetails && collapse) {
      const syncHeight = () => {
        if (!collapse) return;
        if (typeDetails.open) {
          // 先设为 auto 获取高度，再回退到像素值以触发过渡
          collapse.style.height = 'auto';
          const h = collapse.getBoundingClientRect().height;
          collapse.style.height = '0px';
          // 下一帧应用目标高度
          requestAnimationFrame(() => { collapse.style.height = h + 'px'; });
        } else {
          const h = collapse.getBoundingClientRect().height;
          collapse.style.height = h + 'px';
          requestAnimationFrame(() => { collapse.style.height = '0px'; });
        }
      };
      // 初始化：若 open 则同步到实际高度，否则为 0
      if (typeDetails.open) {
        collapse.style.height = 'auto';
      } else {
        collapse.style.height = '0px';
      }
      typeDetails.addEventListener('toggle', syncHeight);
      // 当内部内容变化（切换图类型或值变化导致高度变化）时，如果是展开状态，更新为 auto 再回流到像素值
      const ro = new ResizeObserver(() => {
        if (!typeDetails.open) return;
        collapse.style.height = 'auto';
        const h = collapse.getBoundingClientRect().height;
        collapse.style.height = h + 'px';
      });
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
          // 若此变更由预设面板触发（例如调节滑块/输入框），跳过回写以避免重绘导致输入焦点丢失
          if (this.syncingFromPreset) {
            this.rebuildCode();
            return;
          }
          // 从查询面板拉取最新统一设置并同步到预设面板
          try {
            if (!this.queryUI) return;
            const vs = this.queryUI.getViewSettings();
            const colors = this.queryUI.getColors();
            const title = this.queryUI.getTitle();
            // 同步图表类型：仅在当前显示为“数据库查询”模式时回写；
            // 并且当查询面板返回 line(统计) 时，优先保留预设选择中的 scatter/bar
            if (this.mode === 'query' && this.presetTypeSel) {
              const cur = (this.presetTypeSel.value as any) || 'bar';
              let next = (vs?.type as any) || cur || 'bar';
              if (next === 'line' && (cur === 'scatter' || cur === 'bar')) next = cur; // 保留散点/柱状
              this.presetTypeSel.value = next;
            }
            // 同步每类型设置
            if (vs && vs.settings) {
              const t = vs.type || 'bar';
              if (t === 'line') this.perTypeSettings.line = { ...this.perTypeSettings.line, ...vs.settings };
              else if (t === 'pie') this.perTypeSettings.pie = { ...this.perTypeSettings.pie, ...vs.settings };
              else this.perTypeSettings.bar = { ...this.perTypeSettings.bar, ...vs.settings };
              this.renderTypeSettingsUI();
            }
            // 同步颜色与标题
            if (Array.isArray(colors)) { this.presetColors = colors.slice(); this.renderPaletteFromState(() => this.presetColors.slice(), (arr)=>{ this.presetColors = arr.slice(); }); }
            if (this.presetTitleInput && typeof title === 'string') this.presetTitleInput.value = title;
          } catch { /* ignore */ }
          this.rebuildCode();
          // 同步子面板的折叠状态到父存储中，方便未来跨会话读取（冗余一份，便于集中恢复）
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
      // 将当前预设视图设置与颜色/标题初始化同步到查询面板
      try {
        // 读取查询面板自身的持久化类型，避免被预设类型覆盖
        const vs = this.queryUI.getViewSettings();
        const curPreset = (this.presetTypeSel?.value as any) || 'bar';
        let qType = (vs?.type as any) || curPreset || 'bar';
        // 若查询返回 line(统计)，而预设已有 scatter/bar 选择，则保留预设选择
        if (qType === 'line' && (curPreset === 'scatter' || curPreset === 'bar')) qType = curPreset;
        // 同步预设选择器显示
        if (this.presetTypeSel) this.presetTypeSel.value = qType;
        // 按查询面板的类型推送对应设置
        const settingsFor = (t: any) => ((t === 'line' || t === 'scatter') ? this.perTypeSettings.line : (t === 'pie' ? this.perTypeSettings.pie : this.perTypeSettings.bar));
        this.queryUI.setViewSettings(qType, settingsFor(qType));
        this.queryUI.setColors(this.presetColors.slice());
        this.queryUI.setTitle(this.presetTitleInput?.value || '');
        // 初始化后同步一次折叠状态到父存储（与 onChange 中逻辑一致）
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
    tabs.forEach(btn => btn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const t = btn.getAttribute('data-tab') as 'preset'|'query';
      if (!t) return;
      const prev = this.mode;
      this.mode = t;
      this.save();
      applyMode();
      // 仅在从非 query 进入 query 时做一次同步
      if (this.mode === 'query' && prev !== 'query') {
        try {
          // 保留查询面板自身的类型，避免被预设覆盖
          const vs = this.queryUI?.getViewSettings();
          const curPreset = (this.presetTypeSel?.value as any) || 'bar';
          let qType = (vs?.type as any) || curPreset || 'bar';
          if (qType === 'line' && (curPreset === 'scatter' || curPreset === 'bar')) qType = curPreset;
          if (this.presetTypeSel) this.presetTypeSel.value = qType;
          const settingsFor = (tt: any) => ((tt === 'line' || tt === 'scatter') ? this.perTypeSettings.line : (tt === 'pie' ? this.perTypeSettings.pie : this.perTypeSettings.bar));
          this.queryUI?.setViewSettings(qType, settingsFor(qType));
          this.queryUI?.setColors(this.presetColors.slice());
          this.queryUI?.setTitle(this.presetTitleInput?.value || '');
        } catch { /* ignore */ }
      }
      this.rebuildCode();
    }));

    // 离开前兜底保存一次，防止某些防抖中的更改未及时写入
    window.addEventListener('beforeunload', () => {
      try { this.save(); } catch { /* ignore */ }
    });
  }

  private rebuildCode() {
    this.rebuildPresetCode();
  }

  private async refreshPreview() {
    await this.renderChartPreview();
  }

  private save() {
    try {
      const data = {
        mode: this.mode,
        previewPinned: this.previewPinned,
        preset: {
          items: this.presetItems,
          type: this.presetTypeSel?.value || 'bar',
          title: this.presetTitleInput?.value || '',
          colors: this.presetColors.join(','),
          perTypeSettings: this.perTypeSettings,
          commonSettings: this.commonSettings
        }
      };
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch { }
  }
  private restore() {
    try {
      const raw = localStorage.getItem(this.key); if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj?.mode) this.mode = obj.mode === 'query' ? 'query' : 'preset';
      this.previewPinned = !!obj?.previewPinned;
      const tabs = Array.from(this.container.querySelectorAll('[data-tab]')) as HTMLButtonElement[];
      const presetCard = this.container.querySelector('[data-section="preset"]') as HTMLElement | null;
      const queryCard = this.container.querySelector('[data-section="query"]') as HTMLElement | null;
      tabs.forEach(b => b.classList.toggle('active', (b.getAttribute('data-tab') as any) === this.mode));
      if (presetCard) presetCard.style.display = this.mode==='preset' ? '' : 'none';
      if (queryCard) queryCard.style.display = this.mode==='query' ? '' : 'none';
      // 应用预览置顶状态
      this.applyPinPreviewUI();

      if (obj?.preset) {
        this.presetItems = Array.isArray(obj.preset.items) ? obj.preset.items : [];
        if (this.presetTypeSel && obj.preset.type) this.presetTypeSel.value = obj.preset.type;
        if (this.presetTitleInput) this.presetTitleInput.value = obj.preset.title || '';
        this.presetColors = String(obj.preset.colors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        if (obj.preset.perTypeSettings) this.perTypeSettings = { ...this.perTypeSettings, ...obj.preset.perTypeSettings };
        // 读取通用设置：优先从 preset.commonSettings；兼容旧数据从 perTypeSettings.common
        const cs = obj.preset.commonSettings || (obj.preset.perTypeSettings && (obj.preset.perTypeSettings as any).common) || null;
        if (cs && typeof cs === 'object') {
          this.commonSettings = {
            legendPos: (cs.legendPos === 'bottom' || cs.legendPos === 'left' || cs.legendPos === 'right') ? cs.legendPos : 'top',
            ySplitLine: (cs.ySplitLine === 'solid' || cs.ySplitLine === 'none') ? cs.ySplitLine : 'dashed',
            grid: {
              top: Number(cs.grid?.top ?? 50),
              right: Number(cs.grid?.right ?? 10),
              bottom: Number(cs.grid?.bottom ?? 24),
              left: Number(cs.grid?.left ?? 10)
            }
          };
        }
        this.rebuildPresetListUI();
        this.renderTypeSettingsUI();
        // 恢复后刷新调色盘
        this.renderPaletteFromState(() => this.presetColors.slice(), (arr) => { this.presetColors = arr.slice(); });
      }
      // 可选：将查询子面板的折叠状态从父存储中读回（如果子存储尚未生成）
      try {
        const childRaw = localStorage.getItem(this.key + ':query');
        const child = childRaw ? JSON.parse(childRaw) : {};
        if ((!child || !child.fold) && obj && obj.queryFold) {
          child.fold = obj.queryFold;
          localStorage.setItem(this.key + ':query', JSON.stringify(child));
        }
      } catch { /* ignore */ }
    } catch { }
  }

  // 已移除表格相关的格式化方法

  private escape(s: any) {
    const str = s == null ? '' : String(s);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  private injectStyle() {
    const ID = 'visual-echarts-ui-style';
    if (document.getElementById(ID)) return;
    const st = document.createElement('style'); st.id = ID; st.textContent = `
      .ve-wrap{--fg: var(--b3-theme-on-background); --muted: var(--b3-theme-on-surface); --border: var(--b3-border-color); --bg: var(--b3-theme-surface); font-family: var(--b3-font-family); font-size: var(--b3-font-size);}
  .ve-card{border:1px solid var(--border); border-radius:10px; padding:12px; background: var(--bg); margin-bottom:12px; box-shadow: 0 6px 20px color-mix(in oklab, var(--b3-theme-on-background), transparent 92%)}
      .ve-legend{font-weight:600; color: var(--muted)}
  details > summary.ve-legend{display:flex; align-items:center; justify-content:space-between; gap:8px}
  .ve-legend-left{display:inline-flex; align-items:center; gap:6px}
      .ve-grid{display:grid; gap:8px}
      .ve-grid-2{grid-template-columns: 1fr 1fr}
  .ve-field{display:grid; gap:6px; font-size:13.5px; color: var(--fg)}
      .ve-label{font-size:12px; color: var(--muted)}
  .ve-legend{font-size:13.5px}
      .ve-input{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); border-radius:6px; padding:6px 8px; outline:none}
  .ve-field input[type="checkbox"]{accent-color: var(--b3-theme-primary); transform: scale(1.05);}
  .ve-inline{display:flex; align-items:center; gap:10px}
  /* Switch style */
  .ve-switch{position:relative; display:inline-flex; align-items:center}
  .ve-switch input{position:absolute; opacity:0; width:0; height:0}
  .ve-switch i{width:36px; height:20px; background: var(--b3-border-color); border-radius:999px; position:relative; transition:all .18s ease; box-shadow: inset 0 0 0 1px var(--b3-border-color)}
  .ve-switch i:before{content:""; position:absolute; left:2px; top:2px; width:16px; height:16px; border-radius:50%; background: var(--b3-theme-on-surface); transition:transform .18s ease}
  .ve-switch input:checked + i{background: var(--b3-theme-primary); box-shadow: inset 0 0 0 1px var(--b3-theme-primary)}
  .ve-switch input:checked + i:before{background: var(--b3-theme-on-primary); transform: translateX(16px)}
      .ve-row{display:flex; gap:8px; flex-wrap:wrap}
      .ve-btn{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); padding:6px 10px; border-radius:6px; cursor:pointer}
      .ve-btn.ve-ghost{background:transparent}
  .ve-btn.ve-small{padding:4px 8px; font-size:12px}
      .ve-actions{display:flex; gap:8px; margin:8px 0}
      .ve-output{white-space:pre-wrap; background: var(--b3-protyle-code-background, var(--b3-theme-background)); border:1px solid var(--border); border-radius:6px; padding:8px; font-family: var(--b3-font-family-code, ui-monospace,monospace); font-size:11px}
      .ve-result{border:1px solid var(--border); border-radius:8px; overflow:auto}
      .ve-placeholder{padding:10px; color: var(--muted)}
      .ve-table{width:100%; border-collapse:collapse; font-size:12px}
      .ve-table th,.ve-table td{border-bottom:1px solid var(--border); padding:6px 8px; text-align:left}
      .ve-icon{border:1px solid var(--border); background: var(--b3-theme-background); color: var(--muted); width:22px; height:22px; padding:0; border-radius:6px; cursor:pointer; margin-left:6px}
  .ve-icon.active{background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); border-color: var(--b3-theme-primary)}
      @media(max-width:980px){.ve-grid-2{grid-template-columns:1fr}}
      /* 预设模式样式 */
  .ve-preset-list{display:flex; flex-direction:column; gap:8px}
  .ve-type-settings{display:grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 10px 14px}
  @media(max-width:980px){.ve-type-settings{grid-template-columns: 1fr}}
    .ve-preset-item{border:1px solid var(--border); border-radius:8px; padding:8px; position:relative; background: var(--b3-theme-surface); cursor: move}
  .ve-preset-item.drag-over{outline: 2px dashed var(--b3-theme-primary)}
      .ve-chip{position:relative}
      .ve-chip input{position:absolute; opacity:0; pointer-events:none}
    .ve-chip span{display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid var(--border); color: var(--fg); background: var(--b3-theme-background); cursor:pointer; transition: all .15s ease}
    .ve-chip input:checked + span{background: var(--b3-theme-primary); border-color: var(--b3-theme-primary); color: var(--b3-theme-on-primary)}
    .ve-chip span:hover{border-color: var(--b3-theme-primary)}
    .ve-chip input:focus-visible + span{outline:2px solid color-mix(in oklab, var(--b3-theme-primary), transparent 60%); outline-offset:2px}
  .ve-chip-group{display:flex; gap:6px; flex-wrap:wrap}
  .ve-range{width:220px}
  .ve-range{appearance:none; height:4px; border-radius:999px; background: color-mix(in oklab, var(--b3-border-color), transparent 30%)}
  .ve-range::-webkit-slider-thumb{appearance:none; width:14px; height:14px; border-radius:50%; background: var(--b3-theme-primary); border: 2px solid var(--b3-theme-on-primary); margin-top:-5px}
  .ve-range::-moz-range-thumb{width:14px; height:14px; border-radius:50%; background: var(--b3-theme-primary); border: 2px solid var(--b3-theme-on-primary)}
  .ve-help{color: var(--muted); font-size: 12px}
  .ve-justify-end{justify-content: flex-end}
  /* collapse wrapper for smooth open/close */
  .ve-collapse{overflow:hidden; transition: height .24s cubic-bezier(0.4, 0, 0.2, 1)}
  /* color editor */
  .ve-color-editor{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
  .ve-color-row{align-items:center}
  .ve-color-palette{display:flex; gap:8px; flex-wrap:wrap}
  .ve-color-chip{position:relative; width:28px; height:28px}
  .ve-color-swatch{display:block; width:100%; height:100%; border-radius:6px; border:1px solid var(--border); box-shadow: inset 0 0 0 1px color-mix(in oklab, #000, transparent 85%)}
  .ve-color-del{position:absolute; right:-6px; top:-6px; width:18px; height:18px; border-radius:50%; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--muted); cursor:pointer; line-height:16px; font-size:12px; z-index:2}
  .ve-color-chip input[type="color"]{position:absolute; inset:0; opacity:0; cursor:pointer; z-index:1}
  .ve-color-empty{color: var(--muted); font-size:12px}
  /* Grouped sections */
  .ve-group{border:1px solid var(--border); border-radius:10px; padding:10px; background: color-mix(in oklab, var(--b3-theme-surface), var(--b3-theme-background) 30%)}
  .ve-group__title{font-weight:600; color: var(--muted); margin-bottom:6px}
  .ve-type-settings > .ve-group{grid-column: 1 / -1}
      .ve-modal-mask{position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:9999}
      .ve-modal{width:min(640px, 92vw); max-height:86vh; background: var(--b3-theme-surface); border:1px solid var(--border); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.35); display:flex; flex-direction:column}
      .ve-modal__head{display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--border)}
      .ve-modal__body{padding:12px; overflow:auto}
      .ve-modal__foot{display:flex; gap:8px; justify-content:flex-end; padding:10px 12px; border-top:1px solid var(--border)}
      .ve-preset-chooser{display:flex; flex-wrap:wrap; gap:6px}
      .ve-search{margin-bottom:8px}
      .ve-empty{color: var(--muted); font-size:12px; padding:4px 0}
  .ve-mode-tabs{display:flex; gap:6px}
      .ve-tab{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); padding:6px 10px; border-radius:999px; cursor:pointer}
      .ve-tab.active{background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); border-color: var(--b3-theme-primary)}
  /* 仅缩小预览顶部模式切换的两个按钮尺寸，不影响其它按钮 */
  .ve-mode-tabs .ve-tab{padding:3px 8px; font-size:12px}
  /* 预览置顶 */
  .ve-card.pinned{position: sticky; top: 0; z-index: 100}
    `; document.head.appendChild(st);
  }

  public resize() {
    // 保留扩展点，当前无重算需求
  }

  // 供外部设置 SQL 并可选择触发一次查询
  public setSQL(..._args: any[]) {
    this.rebuildCode();
  }

  private toast(msg: string) {
    const tip = document.createElement('div');
    tip.textContent = msg;
    tip.style.cssText = 'position:fixed; right:16px; bottom:16px; background:#323232; color:#fff; padding:8px 12px; border-radius:4px; z-index:9999; opacity:0; transition:opacity .2s';
    document.body.appendChild(tip);
    requestAnimationFrame(() => tip.style.opacity = '1');
    setTimeout(() => { tip.style.opacity = '0'; setTimeout(() => tip.remove(), 200); }, 1200);
  }

  // -------- 图表预览 --------
  private async ensureEcharts(): Promise<void> {
    if ((window as any).echarts) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('无法加载 ECharts'));
      document.head.appendChild(s);
    });
  }

  private buildOptionForPreview() {
    // 根据模式选择对应 IIFE 并执行
    try {
      let iife = '';
      if (this.mode === 'preset') {
        const title = (this.presetTitleInput?.value ?? '') as string;
        const t = (this.presetTypeSel?.value as any) || 'bar';
        const settings = this.buildSettingsPayloadFor(t);
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
        el.addEventListener('change', () => { this.setDeepSetting(key, el.checked); try { this.syncingFromPreset = true; this.queryUI?.setViewSettings(mappedTypeForQuery as any, this.getCurrentTypeSettings()); } catch { /* ignore */ } finally { this.syncingFromPreset = false; } this.rebuildPresetCode(); });
      } else if (el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'text' || el.type === 'range')) {
        el.addEventListener('input', () => {
          const v = (el.type === 'number' || el.type === 'range') ? Number(el.value) : el.value;
          // 实时更新旁侧的数值
          const labelSpan = el.parentElement?.querySelector('.ve-label') as HTMLElement | null;
          if (labelSpan && (typeof v === 'number')) labelSpan.textContent = key.includes('Radius') ? `${v}%` : `${v}°`;
          this.setDeepSetting(key, v); try { this.syncingFromPreset = true; this.queryUI?.setViewSettings(mappedTypeForQuery as any, this.getCurrentTypeSettings()); } catch { /* ignore */ } finally { this.syncingFromPreset = false; } this.rebuildPresetCode();
        });
      } else if (el instanceof HTMLInputElement && el.type === 'radio') {
        el.addEventListener('change', () => { let v: any = el.value; if (v === 'false') v = false; this.setDeepSetting(key, v); try { this.syncingFromPreset = true; this.queryUI?.setViewSettings(mappedTypeForQuery as any, this.getCurrentTypeSettings()); } catch { /* ignore */ } finally { this.syncingFromPreset = false; } this.rebuildPresetCode(); });
      } else if (el instanceof HTMLSelectElement) {
        el.addEventListener('change', () => { const v = (el as HTMLSelectElement).value; this.setDeepSetting(key, v || (v as any)); try { this.syncingFromPreset = true; this.queryUI?.setViewSettings(mappedTypeForQuery as any, this.getCurrentTypeSettings()); } catch { /* ignore */ } finally { this.syncingFromPreset = false; } this.rebuildPresetCode(); });
      }
    });
    // 恢复默认
    const resetBtn = this.currentSettingsEl.querySelector('[data-type-reset]') as HTMLButtonElement | null;
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetCurrentTypeSettings());
  }

  private setDeepSetting(path: string, value: any) {
    const segs = path.split('.');
    if (segs[0] === 'common') {
      // 写入通用设置
      let cur: any = this.commonSettings as any;
      for (let i = 1; i < segs.length - 1; i++) {
        const k = segs[i];
        if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
        cur = cur[k];
      }
      cur[segs[segs.length - 1]] = value;
    } else {
      // 写入每类型设置
      let cur: any = this.perTypeSettings as any;
      for (let i = 0; i < segs.length - 1; i++) {
        const k = segs[i];
        if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
        cur = cur[k];
      }
      cur[segs[segs.length - 1]] = value;
    }
    this.save();
  }

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
    this.save();
    this.renderTypeSettingsUI();
    this.rebuildPresetCode();
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
    this.save();
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
          <input class="ve-input" data-name value="${this.escape(it.name)}" style="width:180px" />
          <textarea class="ve-input" data-sql rows="2" style="flex:1">${this.escape(it.sql)}</textarea>
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
      const settings = this.buildSettingsPayloadFor(t);
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
    this.save();
    this.renderChartPreview().catch(() => { });
  }

  private async copyPresetCode() {
    const t = (this.presetTypeSel?.value as any) || 'bar';
    const title = (this.presetTitleInput?.value ?? '') as string;
    const settings = this.buildSettingsPayloadFor(t);
    const iife = buildPresetCountIIFE(
      this.presetItems,
      t,
      title || '',
      settings,
      this.presetColors
    );
    try { await navigator.clipboard.writeText(iife); this.toast('已复制'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = iife; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); this.toast('已复制');
    }
  }

  private async copyChartBlock() {
    let iife = '';
    if (this.mode === 'preset') {
      const t = (this.presetTypeSel?.value as any) || 'bar';
      const title = (this.presetTitleInput?.value ?? '') as string;
      const settings = this.buildSettingsPayloadFor(t);
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
    try { await navigator.clipboard.writeText(block); this.toast('已复制图表块'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = block; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); this.toast('已复制图表块');
    }
  }

  // 重新渲染调色盘（基于内部状态）
  private renderPaletteFromState(getColors: () => string[], setColors: (arr: string[]) => void) {
    const paletteEl = this.paletteEl;
    if (!paletteEl) return;
    const colors = getColors();
    if (!colors.length) { paletteEl.innerHTML = '<div class="ve-color-empty">未设置颜色，使用内置默认配色</div>'; return; }
    paletteEl.innerHTML = colors.map((c, i) => `
      <div class="ve-color-chip" data-idx="${i}">
        <span class="ve-color-swatch" style="background:${c}"></span>
        <button class="ve-color-del" title="删除" type="button">×</button>
        <input type="color" value="${c}" />
      </div>
    `).join('');
    // 绑定变化
    Array.from(paletteEl.querySelectorAll('.ve-color-chip')).forEach((chip) => {
      const idx = Number((chip as HTMLElement).getAttribute('data-idx') || '0');
      const picker = chip.querySelector('input[type="color"]') as HTMLInputElement | null;
      const del = chip.querySelector('.ve-color-del') as HTMLButtonElement | null;
      const swatch = chip.querySelector('.ve-color-swatch') as HTMLElement | null;
      if (picker) picker.addEventListener('input', () => {
        const cs = getColors();
        cs[idx] = picker.value;
        if (swatch) swatch.style.background = picker.value;
        try { this.syncingFromPreset = true; setColors(cs); } finally { this.syncingFromPreset = false; }
      });
      if (del) del.addEventListener('click', () => {
        const cs = getColors();
        cs.splice(idx, 1);
        try { this.syncingFromPreset = true; setColors(cs); } finally { this.syncingFromPreset = false; }
        this.renderPaletteFromState(getColors, setColors);
      });
    });
  }

  private async addFromSqlPresets() {
    // 读取 SQL 预设（优先使用外部提供的加载器，否则回退到 localStorage）
    const presets = await this.getSqlPresets();
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    if (!names.length) { this.toast('暂无 SQL 预设'); return; }
    // 简易选择弹窗
    const overlay = document.createElement('div');
    overlay.className = 've-modal-mask';
    const dlg = document.createElement('div');
    dlg.className = 've-modal';
    dlg.innerHTML = `
      <div class="ve-modal__head"><div>选择要加入对比的预设</div><button class="ve-btn ve-ghost" data-close>×</button></div>
      <div class="ve-modal__body">
        <div class="ve-search"><input class="ve-input" type="search" data-filter placeholder="搜索预设名称…" /></div>
        <div class="ve-preset-chooser">${names.map(n => `<label class="ve-chip"><input type="checkbox" value="${this.escape(n)}"/><span>${this.escape(n)}</span></label>`).join('')}</div>
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
        const sql = this.safeCompileSqlFromSnapshot(snap);
        if (sql) this.presetItems.push({ name: n, sql });
      });
      this.rebuildPresetListUI();
      this.rebuildPresetCode();
      close();
    });
  }

  private async getSqlPresets(): Promise<Record<string, any>> {
    try {
      if (this.loadSqlPresetsProvider) {
        const maybe = this.loadSqlPresetsProvider();
        // 支持同步/异步
        // @ts-ignore
        return typeof maybe?.then === 'function' ? await (maybe as Promise<Record<string, any>>) : (maybe as Record<string, any>) || {};
      }
      const raw = localStorage.getItem('siyuan-steve-tools:visual-sql-presets');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  private safeCompileSqlFromSnapshot(s: any): string {
    try {
      // 动态导入构建器的轻量实现：只复用已有的 snap 结构。
      // 这里内嵌一个简化生成函数以避免循环依赖
      const v = s || {};
      const quote = (x: any) => x == null ? 'NULL' : (typeof x === 'number' ? String(x) : `'${String(x).replace(/'/g, "''")}'`);
      const list = (arr: any[]) => `(${arr.map(quote).join(', ')})`;
      const parts: string[] = [];
      const push = (p: string) => { if (p) parts.push(p); };
      if (Array.isArray(v.types) && v.types.length) push(`type IN ${list(v.types)}`);
      if (Array.isArray(v.subtypes) && v.subtypes.length) push(`subtype IN ${list(v.subtypes)}`);
      if (Array.isArray(v.boxes) && v.boxes.length) push(`box IN ${list(v.boxes)}`);
      if (v.rootId) push(`root_id = ${quote(v.rootId)}`);
      if (v.parentId) push(`parent_id = ${quote(v.parentId)}`);
      if (v.path) push(`path LIKE ${quote(v.path.includes('%') || v.path.includes('_') ? v.path : '%' + v.path + '%')}`);
      if (v.content) push(`content LIKE ${quote(v.content.includes('%') || v.content.includes('_') ? v.content : '%' + v.content + '%')}`);
      if (v.md) push(`markdown LIKE ${quote(v.md.includes('%') || v.md.includes('_') ? v.md : '%' + v.md + '%')}`);
      if (v.hpath) push(`hpath LIKE ${quote(v.hpath.includes('%') || v.hpath.includes('_') ? v.hpath : '%' + v.hpath + '%')}`);
      if (v.ial) push(`ial LIKE ${quote(v.ial.includes('%') || v.ial.includes('_') ? v.ial : '%' + v.ial + '%')}`);
      if (v.tag) push(`tag LIKE ${quote('%#' + String(v.tag).replace(/^#+/, '') + '%')}`);
      // 时间不在此简化处理，避免复杂性；用户预设一般包含常用筛选即可
      let where = parts.length ? ' WHERE ' + parts.join(' AND ') : '';
      let order = '';
      if (v.orderField) order = ' ORDER BY ' + v.orderField + (v.orderDir ? ' ' + String(v.orderDir).toUpperCase() : '');
      let limit = '';
      if (v.limit) limit = ' LIMIT ' + Math.min(999, Math.max(0, Number(v.limit) || 0));
      return `select * from blocks${where}${order}${limit}`;
    } catch { return ''; }
  }

  // 组装预设模式给模板的设置载荷：按类型打包，并包含 common
  private buildSettingsPayloadFor(t: 'bar'|'line'|'scatter'|'pie') {
    const common = this.commonSettings;
    if (t === 'line' || t === 'scatter') return { line: this.perTypeSettings.line, common } as any;
    if (t === 'pie') return { pie: this.perTypeSettings.pie, common } as any;
    return { bar: this.perTypeSettings.bar, common } as any;
  }
}
