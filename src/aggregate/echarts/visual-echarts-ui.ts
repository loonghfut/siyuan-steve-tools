import { defaultLineAreaTpl, EchartsTplCtx, barTpl, scatterTpl, stackedAreaTpl, mixedDualAxisTpl, buildPresetCountIIFE } from './option-templates';
import { sql as runSql } from '@/api/api';

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
  private ctx: EchartsTplCtx;
  private outputPre!: HTMLPreElement;
  private sqlInput!: HTMLTextAreaElement;
  private xFieldSel!: HTMLSelectElement;
  private seriesWrap!: HTMLElement;
  private previewBody!: HTMLElement;
  private previewMode: 'table'|'chart' = 'chart';
  private mode: 'normal' | 'presetCount' = 'presetCount';
  private chartDiv?: HTMLDivElement;
  private echartsInst?: any;
  private lastRows: any[] = [];
  private tplSel!: HTMLSelectElement;
  private titleInput!: HTMLInputElement;
  private smoothInput!: HTMLInputElement;
  private areaInput!: HTMLInputElement;
  private stackInput!: HTMLInputElement;
  private boundaryGapInput!: HTMLInputElement;
  private colorsInput!: HTMLInputElement;
  // 预设计数相关
  private presetListEl?: HTMLElement;
  private presetItems: Array<{ name: string; sql: string }> = [];
  private presetTypeSel?: HTMLSelectElement; // bar/line/pie
  private presetTitleInput?: HTMLInputElement;
  private presetColorsInput?: HTMLInputElement;
  private loadSqlPresetsProvider?: () => Promise<Record<string, any>> | Record<string, any>;
  private opts?: VisualEchartsOptions;

  constructor(container: HTMLElement, options?: VisualEchartsOptions) {
    this.container = container;
    this.key = options?.persistKey || 'siyuan-steve-tools:visual-echarts-ui';
    this.ctx = defaultLineAreaTpl;
    this.loadSqlPresetsProvider = options?.loadSqlPresets;
    this.opts = options;
    this.render();
    // 初始根据模式隐藏/显示区块
    this.toggleSections();
    this.restore();
    // 仅保留预设模式，忽略外部传入 SQL
    this.rebuildCode();
  }

  private html(strings: TemplateStringsArray, ...values: any[]) {
    return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
  }

  private render() {
    this.injectStyle();
    this.container.innerHTML = this.html`
      <div class="ve-wrap">
  <details class="ve-card" data-section="normal" style="display:none">
          <summary class="ve-legend">数据与映射</summary>
          <div class="ve-row" style="margin-top:8px;">
            <label class="ve-field">模板
              <select class="ve-input" data-tpl></select>
            </label>
            <label class="ve-field">标题
              <input class="ve-input" data-title placeholder="图表标题" />
            </label>
          </div>
          <div class="ve-row">
            <label class="ve-field"><input type="checkbox" data-smooth /> 平滑</label>
            <label class="ve-field"><input type="checkbox" data-area /> 面积</label>
            <label class="ve-field"><input type="checkbox" data-stack /> 堆叠</label>
            <label class="ve-field"><input type="checkbox" data-boundarygap /> boundaryGap</label>
            <label class="ve-field">颜色
              <input class="ve-input" data-colors placeholder="#3b82f6,#ef4444,#10b981" />
            </label>
          </div>
          <div class="ve-grid ve-grid-2" style="margin-top:8px;">
            <label class="ve-field">SQL
              <textarea class="ve-input" data-sql rows="5" placeholder="SELECT x, y1 FROM blocks ..."></textarea>
            </label>
            <div class="ve-field">
              <div class="ve-label">字段映射</div>
              <div class="ve-row">
                <label class="ve-field">x 轴字段
                  <select class="ve-input" data-x></select>
                </label>
              </div>
              <div class="ve-row">
                <div data-series></div>
                <button class="ve-btn" data-add-series>添加序列</button>
                <button class="ve-btn" data-add-series-num>从数值列批量添加序列</button>
              </div>
            </div>
          </div>
          <div class="ve-actions">
            <button class="ve-btn" data-run>运行 SQL</button>
            <button class="ve-btn" data-suggest>根据数据猜测映射</button>
            <button class="ve-btn" data-copy>复制 JS(IIFE)</button>
            <button class="ve-btn ve-ghost" data-reset>重置</button>
          </div>
          <details class="ve-sub">
            <summary class="ve-legend">代码预览</summary>
            <pre class="ve-output" data-output></pre>
          </details>
        </details>
        <details class="ve-card" open data-section="preview">
          <summary class="ve-legend">结果预览 <button class="ve-icon" data-refresh title="刷新">⟳</button>
            <span style="margin-left:8px; display:inline-flex; gap:6px; align-items:center;">
              <button class="ve-btn" data-mode="table">数据</button>
              <button class="ve-btn" data-mode="chart">图表</button>
              <button class="ve-btn" data-goto-sql>转到 SQL</button>
            </span>
          </summary>
          <div class="ve-result" data-result><div class="ve-placeholder">请在下方添加对比的 SQL 预设后，切换到“图表”查看预览</div></div>
        </details>

        <details class="ve-card" open data-section="preset">
          <summary class="ve-legend">预设对比计数
            <span style="margin-left:8px; display:inline-flex; gap:6px; align-items:center;">
              <select class="ve-input" data-preset-type style="width:120px">
                <option value="bar">柱状图</option>
                <option value="line">折线图</option>
                <option value="pie">饼图</option>
              </select>
            </span>
          </summary>
          <div class="ve-row" style="margin:6px 0;">
            <label class="ve-field">标题
              <input class="ve-input" data-preset-title placeholder="图表标题" />
            </label>
            <label class="ve-field">颜色
              <input class="ve-input" data-preset-colors placeholder="#3b82f6,#ef4444,#10b981" />
            </label>
          </div>
          <div class="ve-row" style="margin:6px 0;">
            <button class="ve-btn" data-preset-add>从 SQL 预设添加</button>
            <button class="ve-btn" data-preset-clear>清空</button>
            <button class="ve-btn" data-preset-copy>复制 JS(IIFE)</button>
          </div>
          <div class="ve-preset-list" data-preset-list></div>
          <div class="ve-hint" style="color:var(--muted); font-size:12px; margin-top:6px;">说明：x 轴为各预设名称，y 为各自 SQL 查询结果的行数。</div>
        </details>
      </div>
    `;
    this.outputPre = this.container.querySelector('[data-output]') as HTMLPreElement;
    this.sqlInput = this.container.querySelector('[data-sql]') as HTMLTextAreaElement;
    this.xFieldSel = this.container.querySelector('[data-x]') as HTMLSelectElement;
    this.seriesWrap = this.container.querySelector('[data-series]') as HTMLElement;
    this.previewBody = this.container.querySelector('[data-result]') as HTMLElement;
  this.tplSel = this.container.querySelector('[data-tpl]') as HTMLSelectElement;
  this.titleInput = this.container.querySelector('[data-title]') as HTMLInputElement;
  this.smoothInput = this.container.querySelector('[data-smooth]') as HTMLInputElement;
  this.areaInput = this.container.querySelector('[data-area]') as HTMLInputElement;
  this.stackInput = this.container.querySelector('[data-stack]') as HTMLInputElement;
  this.boundaryGapInput = this.container.querySelector('[data-boundarygap]') as HTMLInputElement;
  this.colorsInput = this.container.querySelector('[data-colors]') as HTMLInputElement;

    (this.container.querySelector('[data-run]') as HTMLButtonElement).addEventListener('click', () => this.query());
    (this.container.querySelector('[data-suggest]') as HTMLButtonElement).addEventListener('click', () => this.suggestMappings());
    (this.container.querySelector('[data-copy]') as HTMLButtonElement).addEventListener('click', () => this.copyCode());
    (this.container.querySelector('[data-reset]') as HTMLButtonElement).addEventListener('click', () => this.reset());
    (this.container.querySelector('[data-refresh]') as HTMLButtonElement).addEventListener('click', () => this.refreshPreview());
  (this.container.querySelector('[data-mode="table"]') as HTMLButtonElement).addEventListener('click', () => { this.previewMode = 'table'; this.refreshPreview(); });
  (this.container.querySelector('[data-mode="chart"]') as HTMLButtonElement).addEventListener('click', () => { this.previewMode = 'chart'; this.refreshPreview(); });
  const gotoSqlBtn = this.container.querySelector('[data-goto-sql]') as HTMLButtonElement;
  if (this.opts?.onGotoSQL) {
    gotoSqlBtn.addEventListener('click', () => this.opts!.onGotoSQL!());
  } else {
    gotoSqlBtn.style.display = 'none';
  }

    this.sqlInput.addEventListener('input', () => this.rebuildCode());
    this.xFieldSel.addEventListener('change', () => {
      const field = this.xFieldSel.value || '';
      if (field) this.ctx.xDataExpr = `rows.map(r=>String(r.${field}))`;
      this.rebuildCode();
    });

    // 模板选项
    const templates: Array<{key:string;name:string;tpl:EchartsTplCtx|undefined}> = [
      { key:'lineArea', name:'折线(面积)', tpl: defaultLineAreaTpl },
      { key:'bar', name:'柱状图', tpl: barTpl },
      { key:'stackedArea', name:'堆叠面积', tpl: stackedAreaTpl },
      { key:'scatter', name:'散点图', tpl: scatterTpl },
      { key:'mixed', name:'混合双轴', tpl: mixedDualAxisTpl },
      { key:'presetCount', name:'预设对比计数（柱/线/饼）', tpl: undefined },
    ];
    if (this.tplSel) {
      this.tplSel.innerHTML = templates.map(t=>`<option value="${t.key}">${t.name}</option>`).join('');
      this.tplSel.value = 'presetCount';
      this.tplSel.addEventListener('change', () => {
        // 强制预设模式
        this.mode = 'presetCount';
        this.toggleSections();
        this.rebuildPresetListUI();
        this.rebuildPresetCode();
      });
    }

    // 全局输入
    if (this.titleInput) this.titleInput.addEventListener('input', () => { this.ctx.title = this.titleInput.value || ''; this.rebuildCode(); });
    if (this.smoothInput) this.smoothInput.addEventListener('change', () => { this.ctx.smooth = !!this.smoothInput.checked; this.rebuildCode(); });
    if (this.areaInput) this.areaInput.addEventListener('change', () => { this.ctx.area = !!this.areaInput.checked; this.rebuildCode(); });
    if (this.stackInput) this.stackInput.addEventListener('change', () => { this.ctx.stack = !!this.stackInput.checked; this.rebuildCode(); });
    if (this.boundaryGapInput) this.boundaryGapInput.addEventListener('change', () => { this.ctx.boundaryGap = !!this.boundaryGapInput.checked; this.rebuildCode(); });
    if (this.colorsInput) this.colorsInput.addEventListener('input', () => { this.ctx.colors = (this.colorsInput.value||'').split(',').map(s=>s.trim()).filter(Boolean); this.rebuildCode(); });

    // 批量添加序列
    const addNumBtn = this.container.querySelector('[data-add-series-num]') as HTMLButtonElement;
    if (addNumBtn) addNumBtn.addEventListener('click', () => this.addNumericSeries());

    // 预设区控件
    this.presetListEl = this.container.querySelector('[data-preset-list]') as HTMLElement;
    this.presetTypeSel = this.container.querySelector('[data-preset-type]') as HTMLSelectElement;
    this.presetTitleInput = this.container.querySelector('[data-preset-title]') as HTMLInputElement;
    this.presetColorsInput = this.container.querySelector('[data-preset-colors]') as HTMLInputElement;
    (this.container.querySelector('[data-preset-add]') as HTMLButtonElement)?.addEventListener('click', () => this.addFromSqlPresets());
    (this.container.querySelector('[data-preset-clear]') as HTMLButtonElement)?.addEventListener('click', () => { this.presetItems = []; this.rebuildPresetListUI(); this.rebuildPresetCode(); });
    (this.container.querySelector('[data-preset-copy]') as HTMLButtonElement)?.addEventListener('click', () => this.copyPresetCode());
    this.presetTypeSel?.addEventListener('change', () => this.rebuildPresetCode());
    this.presetTitleInput?.addEventListener('input', () => this.rebuildPresetCode());
    this.presetColorsInput?.addEventListener('input', () => this.rebuildPresetCode());
  }

  private rebuildSeriesUI() {
    this.seriesWrap.innerHTML = '';
    const series = this.ctx.seriesExprs || [];
    series.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 've-series-row';
      row.innerHTML = `
        <div class="ve-row">
          <label class="ve-field">名称
            <input class="ve-input" data-name value="${this.escape(s.name)}" />
          </label>
          <label class="ve-field">类型
            <select class="ve-input" data-type>
              <option value="line" ${s.type==='line'?'selected':''}>line</option>
              <option value="bar" ${s.type==='bar'?'selected':''}>bar</option>
              <option value="scatter" ${s.type==='scatter'?'selected':''}>scatter</option>
            </select>
          </label>
          <label class="ve-field">y 数据字段
            <select class="ve-input" data-y></select>
          </label>
          <button class="ve-btn ve-ghost" data-del title="删除">删除</button>
        </div>
      `;
      const ySel = row.querySelector('[data-y]') as HTMLSelectElement;
      this.fillFieldOptions(ySel, this.lastRows);
      // 若 expr 是简单 rows.map(r=>r.xxx)，尽量还原选择
      const m = (s.expr || '').match(/rows\.map\(r=>Number\(r\.(.+?)\)\|\|0\)\)/);
      const field = m?.[1] || '';
      if (field) ySel.value = field;
      ySel.addEventListener('change', () => {
        const f = ySel.value || '';
        this.ctx.seriesExprs![idx].expr = `rows.map(r=>Number(r.${f})||0)`;
        this.rebuildCode();
      });
      (row.querySelector('[data-name]') as HTMLInputElement).addEventListener('input', (e) => {
        this.ctx.seriesExprs![idx].name = (e.target as HTMLInputElement).value;
        this.rebuildCode();
      });
      (row.querySelector('[data-type]') as HTMLSelectElement).addEventListener('change', (e) => {
        this.ctx.seriesExprs![idx].type = (e.target as HTMLSelectElement).value as any;
        this.rebuildCode();
      });
      (row.querySelector('[data-del]') as HTMLButtonElement).addEventListener('click', () => {
        this.ctx.seriesExprs!.splice(idx, 1);
        this.rebuildSeriesUI();
        this.rebuildCode();
      });
      this.seriesWrap.appendChild(row);
    });
  }

  private async query() {
    const sql = (this.sqlInput.value || '').trim();
    if (!sql) { this.toast('请输入 SQL'); return; }
    this.previewBody.innerHTML = '<div class="ve-loading">查询中…</div>';
    try {
      const rows = await runSql(sql);
      if (!Array.isArray(rows)) throw new Error('结果异常');
      this.lastRows = rows;
      this.fillFieldOptions(this.xFieldSel, rows);
      // 若当前没有配置，则尝试猜测映射
      if (!(this.ctx.xDataExpr && (this.ctx.seriesExprs||[]).length)) {
        this.suggestMappings();
      }
      if (this.previewMode === 'chart') await this.renderChartPreview(rows); else this.renderPreviewTable(rows);
    } catch (e:any) {
      this.previewBody.innerHTML = `<div class="ve-error">${this.escape(e?.message||'查询失败')}</div>`;
    }
  }

  private suggestMappings() {
    const rows = this.lastRows || [];
    if (!rows.length) { this.toast('无数据可分析'); return; }
    const keys = Object.keys(rows[0] || {});
    if (!keys.length) return;
    // 简单策略：优先匹配日期、时间或 name 的字段作为 x
    const x = keys.find(k => /date|time|day|created|updated|name|title|x/i.test(k)) || keys[0];
    const nums = keys.filter(k => k!==x).filter(k => typeof rows[0][k] === 'number' || /^\d+(\.\d+)?$/.test(String(rows[0][k])));
    const ys = nums.slice(0, 3);
    this.ctx.xDataExpr = `rows.map(r=>String(r.${x}))`;
    this.ctx.seriesExprs = ys.length ? ys.map((k, i) => ({ name: `系列${i+1}`, expr: `rows.map(r=>Number(r.${k})||0)`, type: 'line' as const })) : [{ name: '系列1', expr: 'rows.map((_,i)=>i+1)', type: 'line' }];
    this.ctx.legend = (this.ctx.seriesExprs||[]).map(s=>s.name);
    // 同步 UI
    this.fillFieldOptions(this.xFieldSel, rows);
    this.xFieldSel.value = x;
    this.syncGeneralInputs();
    this.rebuildSeriesUI();
    this.rebuildCode();
  }

  private renderPreviewTable(rows: any[]) {
    if (!rows.length) { this.previewBody.innerHTML = '<div class="ve-placeholder">无结果</div>'; return; }
    const keys = Object.keys(rows[0]);
    const thead = `<thead><tr>${keys.map(k=>`<th>${this.escape(k)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.slice(0,64).map(r=>`<tr>${keys.map(k=>`<td>${this.escape(this.format(r[k]))}</td>`).join('')}</tr>`).join('')}</tbody>`;
    this.previewBody.innerHTML = `<div class="ve-table-wrap"><table class="ve-table">${thead}${tbody}</table></div>`;
  }

  private fillFieldOptions(sel: HTMLSelectElement, rows: any[]) {
    const keys = rows.length ? Object.keys(rows[0]) : [];
    sel.innerHTML = keys.map(k => `<option value="${this.escape(k)}">${this.escape(k)}</option>`).join('');
    sel.dispatchEvent(new Event('change'));
  }

  private rebuildCode() {
    // 仅保留预设模式
    this.mode = 'presetCount';
    this.rebuildPresetCode();
  }

  private async refreshPreview() {
    // 仅保留预设模式
    if (this.previewMode === 'chart') await this.renderChartPreview(this.lastRows);
    else this.previewBody.innerHTML = '<div class="ve-placeholder">预设模式不提供数据表预览，请切换到“图表”</div>';
  }

  private reset() {
    // 重置为预设模式初始状态
    this.mode = 'presetCount';
    this.toggleSections();
    this.presetItems = [];
    if (this.presetTypeSel) this.presetTypeSel.value = 'bar';
    if (this.presetTitleInput) this.presetTitleInput.value = '';
    if (this.presetColorsInput) this.presetColorsInput.value = '';
    this.rebuildPresetListUI();
    this.previewBody.innerHTML = '<div class="ve-placeholder">已重置，请添加 SQL 预设</div>';
    this.rebuildCode();
  }

  private async copyCode() {
    const txt = this.outputPre.textContent || '';
    try { await navigator.clipboard.writeText(txt); this.toast('已复制'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); this.toast('已复制');
    }
  }

  private save() {
    try {
      const data = {
        ctx: this.ctx,
        sql: this.sqlInput.value,
        preset: {
          items: this.presetItems,
          type: this.presetTypeSel?.value || 'bar',
          title: this.presetTitleInput?.value || '',
          colors: this.presetColorsInput?.value || ''
        }
      };
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {}
  }
  private restore() {
    try {
      const raw = localStorage.getItem(this.key); if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj?.ctx) this.ctx = obj.ctx;
      if (obj?.sql) this.sqlInput.value = obj.sql;
      if (obj?.preset) {
        this.presetItems = Array.isArray(obj.preset.items) ? obj.preset.items : [];
        if (this.presetTypeSel && obj.preset.type) this.presetTypeSel.value = obj.preset.type;
        if (this.presetTitleInput) this.presetTitleInput.value = obj.preset.title || '';
        if (this.presetColorsInput) this.presetColorsInput.value = obj.preset.colors || '';
        this.rebuildPresetListUI();
      }
      this.rebuildSeriesUI();
      this.syncGeneralInputs();
    } catch {}
  }

  private format(v: any) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { return JSON.stringify(v); } catch { return String(v); }
  }

  private escape(s: any) {
    const str = s == null ? '' : String(s);
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  private injectStyle() {
    const ID = 'visual-echarts-ui-style';
    if (document.getElementById(ID)) return;
    const st = document.createElement('style'); st.id = ID; st.textContent = `
      .ve-wrap{--fg: var(--b3-theme-on-background); --muted: var(--b3-theme-on-surface); --border: var(--b3-border-color); --bg: var(--b3-theme-surface); font-family: var(--b3-font-family); font-size: var(--b3-font-size);}
      .ve-card{border:1px solid var(--border); border-radius:8px; padding:10px; background: var(--bg); margin-bottom:10px}
      .ve-legend{font-weight:600; color: var(--muted)}
      .ve-grid{display:grid; gap:8px}
      .ve-grid-2{grid-template-columns: 1fr 1fr}
      .ve-field{display:grid; gap:6px; font-size:12px; color: var(--muted)}
      .ve-label{font-size:12px; color: var(--muted)}
      .ve-input{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); border-radius:6px; padding:6px 8px; outline:none}
      .ve-row{display:flex; gap:8px; flex-wrap:wrap}
      .ve-btn{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); padding:6px 10px; border-radius:6px; cursor:pointer}
      .ve-btn.ve-ghost{background:transparent}
      .ve-actions{display:flex; gap:8px; margin:8px 0}
      .ve-output{white-space:pre-wrap; background: var(--b3-protyle-code-background, var(--b3-theme-background)); border:1px solid var(--border); border-radius:6px; padding:8px; font-family: var(--b3-font-family-code, ui-monospace,monospace); font-size:11px}
      .ve-result{border:1px solid var(--border); border-radius:8px; overflow:auto}
      .ve-placeholder{padding:10px; color: var(--muted)}
      .ve-table{width:100%; border-collapse:collapse; font-size:12px}
      .ve-table th,.ve-table td{border-bottom:1px solid var(--border); padding:6px 8px; text-align:left}
      .ve-icon{border:1px solid var(--border); background: var(--b3-theme-background); color: var(--muted); width:22px; height:22px; padding:0; border-radius:6px; cursor:pointer; margin-left:6px}
      @media(max-width:980px){.ve-grid-2{grid-template-columns:1fr}}
      /* 预设模式样式 */
      .ve-preset-list{display:flex; flex-direction:column; gap:8px}
      .ve-preset-item{border:1px solid var(--border); border-radius:8px; padding:8px}
      .ve-chip{position:relative}
      .ve-chip input{position:absolute; opacity:0; pointer-events:none}
      .ve-chip span{display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid var(--border); color: var(--fg); background: var(--b3-theme-background); cursor:pointer}
      .ve-chip input:checked + span{background: var(--b3-theme-primary); border-color: var(--b3-theme-primary); color: var(--b3-theme-on-primary)}
      .ve-modal-mask{position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:9999}
      .ve-modal{width:min(640px, 92vw); max-height:86vh; background: var(--b3-theme-surface); border:1px solid var(--border); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.35); display:flex; flex-direction:column}
      .ve-modal__head{display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--border)}
      .ve-modal__body{padding:12px; overflow:auto}
      .ve-modal__foot{display:flex; gap:8px; justify-content:flex-end; padding:10px 12px; border-top:1px solid var(--border)}
      .ve-preset-chooser{display:flex; flex-wrap:wrap; gap:6px}
      .ve-search{margin-bottom:8px}
      .ve-empty{color: var(--muted); font-size:12px; padding:4px 0}
    `; document.head.appendChild(st);
  }

  public resize() {
    // 保留扩展点，当前无重算需求
  }

  // 供外部设置 SQL 并可选择触发一次查询
  public setSQL(..._args: any[]) {
    // 仅保留预设模式，忽略外部 SQL 设置
    this.mode = 'presetCount';
    this.toggleSections();
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

  private syncGeneralInputs() {
    if (this.titleInput) this.titleInput.value = this.ctx.title || '';
    if (this.smoothInput) this.smoothInput.checked = !!this.ctx.smooth;
    if (this.areaInput) this.areaInput.checked = !!this.ctx.area;
    if (this.stackInput) this.stackInput.checked = !!this.ctx.stack;
    if (this.boundaryGapInput) this.boundaryGapInput.checked = !!this.ctx.boundaryGap;
    if (this.colorsInput) this.colorsInput.value = (this.ctx.colors||[]).join(',');
  }

  private addNumericSeries() {
    const rows = this.lastRows || [];
    if (!rows.length) { this.toast('请先运行 SQL'); return; }
    const sample = rows[0] || {};
    const keys = Object.keys(sample);
    const numeric = keys.filter(k => typeof sample[k] === 'number');
    if (!numeric.length) { this.toast('未检测到数值列'); return; }
    const names = new Set((this.ctx.seriesExprs||[]).map(s=>s.name));
    numeric.forEach((k) => {
      if (names.has(k)) return;
      (this.ctx.seriesExprs ||= []).push({ name: k, expr: `rows.map(r=>Number(r.${k})||0)`, type: (this.ctx.seriesExprs && this.ctx.seriesExprs[0]?.type) || 'line' });
    });
    this.ctx.legend = (this.ctx.seriesExprs||[]).map(s=>s.name);
    if (!this.ctx.xDataExpr) {
      const nonNum = keys.find(k => typeof sample[k] !== 'number') || keys[0];
      if (nonNum) this.ctx.xDataExpr = `rows.map(r=>String(r.${nonNum}))`;
    }
    this.rebuildSeriesUI();
    this.rebuildCode();
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

  private evalExpr<T = any>(expr: string, rows: any[]): T {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('rows', `return (${expr});`);
      return fn(rows);
    } catch { return [] as any; }
  }

  private buildOptionForPreview(rows: any[]) {
    if (this.mode === 'presetCount') {
      // 预设模式的图表预览不依赖 lastRows，这里直接基于 presetItems 构造 option（同步计数）
      try {
        // 复用 IIFE 生成字符串后执行得到 option
        const title = (this.presetTitleInput?.value ?? this.titleInput?.value ?? '') as string;
        const colors = (this.presetColorsInput?.value ?? this.colorsInput?.value ?? '') as string;
        const iife = buildPresetCountIIFE(this.presetItems, (this.presetTypeSel?.value as any) || 'bar', title || '', (colors||'').split(',').map(s=>s.trim()).filter(Boolean));
        // eslint-disable-next-line no-new-func
        const fn = new Function(`return ${iife};`);
        return fn();
      } catch { return {}; }
    }
    const legend = (this.ctx.legend && this.ctx.legend.length) ? this.ctx.legend : (this.ctx.seriesExprs||[]).map(s=>s.name);
    const xData = this.evalExpr<any[]>(this.ctx.xDataExpr || 'rows.map((_,i)=>String(i+1))', rows);
    const needDualAxis = (this.ctx.seriesExprs||[]).some(s => (s as any).axisIndex === 1);
    const series = (this.ctx.seriesExprs||[]).map((s,i)=>{
      const type = s.type || 'line';
      const data = this.evalExpr<any[]>(s.expr, rows);
      const it: any = { name: s.name, type, data, smooth: !!(this.ctx.smooth && type==='line'), z:1 };
      if (this.ctx.area && type==='line') it.areaStyle = { normal: {} };
      if (this.ctx.stack) it.stack = 'total';
      if (typeof (s as any).axisIndex === 'number' && (s as any).axisIndex! > 0) it.yAxisIndex = (s as any).axisIndex|0;
      if (Array.isArray(this.ctx.colors) && this.ctx.colors[i]) it.itemStyle = { color: this.ctx.colors[i] };
      return it;
    });
    const option: any = {
      title: { text: this.ctx.title || '' },
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { lineStyle: { width: 0 } } },
      legend: { data: legend },
      xAxis: [{ type: 'category', boundaryGap: !!this.ctx.boundaryGap, data: xData, axisTick: { show:false }, axisLine: { show:false } }],
      yAxis: [{ type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { lineStyle: { color: 'rgba(0, 0, 0, .38)', type: 'dashed' } } }],
      series
    };
    if (needDualAxis) option.yAxis.push({ type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { show:false } });
    return option;
  }

  private async renderChartPreview(rows: any[]) {
    if (this.mode !== 'presetCount' && (!rows || !rows.length)) { this.previewBody.innerHTML = '<div class="ve-placeholder">无结果</div>'; return; }
    this.previewBody.innerHTML = '<div data-chart style="width:100%;height:360px"></div>';
    this.chartDiv = this.previewBody.querySelector('[data-chart]') as HTMLDivElement;
    await this.ensureEcharts();
    const echarts = (window as any).echarts;
    if (this.echartsInst) { try { this.echartsInst.dispose(); } catch {}
    }
    this.echartsInst = echarts.init(this.chartDiv);
    const option = this.buildOptionForPreview(rows);
    this.echartsInst.setOption(option, true);
  }

  // ---------- 预设模式 ----------
  private toggleSections() {
    const normal = this.container.querySelector('details[data-section="normal"]') as HTMLDetailsElement | null;
    const preset = this.container.querySelector('details[data-section="preset"]') as HTMLDetailsElement | null;
    // 仅保留预设模式
    normal?.setAttribute('style','display:none');
    preset?.setAttribute('style','');
  }

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
    const t = (this.presetTypeSel?.value as any) || 'bar';
    const title = (this.presetTitleInput?.value ?? this.titleInput?.value ?? '') as string;
    const colors = (this.presetColorsInput?.value ?? this.colorsInput?.value ?? '') as string;
    const iife = buildPresetCountIIFE(this.presetItems, t, title || '', (colors||'').split(',').map(s=>s.trim()).filter(Boolean));
    this.outputPre.textContent = iife;
    this.save();
    if (this.previewMode === 'chart') this.renderChartPreview(this.lastRows).catch(()=>{});
  }

  private async copyPresetCode() {
    const t = (this.presetTypeSel?.value as any) || 'bar';
    const title = (this.presetTitleInput?.value ?? this.titleInput?.value ?? '') as string;
    const colors = (this.presetColorsInput?.value ?? this.colorsInput?.value ?? '') as string;
    const iife = buildPresetCountIIFE(this.presetItems, t, title || '', (colors||'').split(',').map(s=>s.trim()).filter(Boolean));
    try { await navigator.clipboard.writeText(iife); this.toast('已复制'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = iife; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); this.toast('已复制');
    }
  }

  private async addFromSqlPresets() {
    // 读取 SQL 预设（优先使用外部提供的加载器，否则回退到 localStorage）
    const presets = await this.getSqlPresets();
    const names = Object.keys(presets).sort((a,b)=>a.localeCompare(b,'zh-CN'));
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
        <div class="ve-preset-chooser">${names.map(n=>`<label class="ve-chip"><input type="checkbox" value="${this.escape(n)}"/><span>${this.escape(n)}</span></label>`).join('')}</div>
        <div class="ve-empty" data-empty style="display:none">无匹配结果</div>
      </div>
      <div class="ve-modal__foot"><button class="ve-btn" data-ok>加入</button><button class="ve-btn ve-ghost" data-close2>取消</button></div>`;
    overlay.appendChild(dlg); document.body.appendChild(overlay);
    const close = ()=> overlay.remove();
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
      const picked = checks.filter(c=>c.checked).map(c=>c.value);
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
      const quote = (x: any) => x==null? 'NULL' : (typeof x==='number'? String(x) : `'${String(x).replace(/'/g, "''")}'`);
      const list = (arr: any[]) => `(${arr.map(quote).join(', ')})`;
      const parts: string[] = [];
      const push = (p: string)=>{ if (p) parts.push(p); };
      if (Array.isArray(v.types) && v.types.length) push(`type IN ${list(v.types)}`);
      if (Array.isArray(v.subtypes) && v.subtypes.length) push(`subtype IN ${list(v.subtypes)}`);
      if (Array.isArray(v.boxes) && v.boxes.length) push(`box IN ${list(v.boxes)}`);
      if (v.rootId) push(`root_id = ${quote(v.rootId)}`);
      if (v.parentId) push(`parent_id = ${quote(v.parentId)}`);
      if (v.path) push(`path LIKE ${quote(v.path.includes('%')||v.path.includes('_')? v.path: '%'+v.path+'%')}`);
      if (v.content) push(`content LIKE ${quote(v.content.includes('%')||v.content.includes('_')? v.content: '%'+v.content+'%')}`);
      if (v.md) push(`markdown LIKE ${quote(v.md.includes('%')||v.md.includes('_')? v.md: '%'+v.md+'%')}`);
      if (v.hpath) push(`hpath LIKE ${quote(v.hpath.includes('%')||v.hpath.includes('_')? v.hpath: '%'+v.hpath+'%')}`);
      if (v.ial) push(`ial LIKE ${quote(v.ial.includes('%')||v.ial.includes('_')? v.ial: '%'+v.ial+'%')}`);
  if (v.tag) push(`tag LIKE ${quote('%#' + String(v.tag).replace(/^#+/, '') + '%')}`);
      // 时间不在此简化处理，避免复杂性；用户预设一般包含常用筛选即可
      let where = parts.length ? ' WHERE ' + parts.join(' AND ') : '';
      let order = '';
      if (v.orderField) order = ' ORDER BY ' + v.orderField + (v.orderDir? ' '+String(v.orderDir).toUpperCase(): '');
      let limit = '';
      if (v.limit) limit = ' LIMIT ' + Math.min(999, Math.max(0, Number(v.limit) || 0));
      return `select * from blocks${where}${order}${limit}`;
    } catch { return ''; }
  }
}
