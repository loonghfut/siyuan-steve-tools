import { buildIIFEFromAVCtx, EchartsAvTplCtx } from './option-templates';

export interface VisualEchartsQueryOptions {
  persistKey?: string;
  onGotoSQL?: () => void;
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>;
  onChange?: () => void; // 配置变化回调，用于外部触发预览刷新
}

export class VisualEchartsQueryUI {
  private root: HTMLElement;
  private opts?: VisualEchartsQueryOptions;
  private key: string;

  // 元素句柄
  private titleInput!: HTMLInputElement;
  private avIdInput!: HTMLInputElement;
  // 新增 viewID 输入
  private viewIdInput!: HTMLInputElement;
  private xExprTextarea!: HTMLTextAreaElement;
  private seriesListEl!: HTMLElement;
  private paletteEl!: HTMLElement;
  private codePre!: HTMLPreElement;
  private chartTypeSel?: HTMLSelectElement;
  private typeSettingsEl?: HTMLElement;
  // 通用设置
  private commonSettings: { legendPos: 'top'|'bottom'|'left'|'right'; ySplitLine: 'dashed'|'solid'|'none'; grid: { top: number; right: number; bottom: number; left: number } } = {
    legendPos: 'top',
    ySplitLine: 'dashed',
    grid: { top: 10, right: 10, bottom: 24, left: 10 }
  };
  // 设置面板折叠状态（持久化）
  private foldCommon: boolean = false;
  private foldStat: boolean = false;
  private foldPie: boolean = false;

  // 统一图表设置（与预设模式保持一致）
  private chartType: 'stat'|'pie' = 'stat';
  private perTypeSettings: {
    bar: { stack?: boolean; boundaryGap?: boolean; xLabelRotate?: number; label?: { show?: boolean; position?: string } };
    line: { smooth?: boolean; boundaryGap?: boolean; xLabelRotate?: number; label?: { show?: boolean; position?: string } };
    pie: { innerRadius?: number; outerRadius?: number; roseType?: 'radius' | 'area' | false; label?: { show?: boolean; position?: string } };
  } = {
    bar: { stack: false, boundaryGap: true, xLabelRotate: 0, label: { show: false, position: 'top' } },
    line: { smooth: true, boundaryGap: false, xLabelRotate: 0, label: { show: false, position: 'top' } },
    pie: { innerRadius: 0, outerRadius: 70, roseType: false, label: { show: false, position: 'outside' } },
  };
  private colors: string[] = [];
  private series: Array<{ name: string; expr: string; type?: 'line'|'bar'|'scatter'|'pie'; axisIndex?: number; valueKey?: string; agg?: 'raw'|'count'|'sum'|'avg'|'min'|'max' }> = [];
  private debug = false;
  private debugSampleSize = 5;
  private loadingKeys = false;

  // 可视化映射状态（默认启用且无开关）
  private visualMode = true;
  private keys: string[] = [];
  private xKey: string = '';
  private sort: 'none'|'asc'|'desc' = 'asc';
  private mergeMode: boolean = true;

  constructor(container: HTMLElement, options?: VisualEchartsQueryOptions) {
    this.root = container;
    this.opts = options;
    this.key = options?.persistKey || 'siyuan-steve-tools:visual-echarts-query-ui';
    this.render();
    this.restore();
    this.rebuildCode();
  }

  // 供外部读取 IIFE
  public getIIFE(): string {
    const ctx: EchartsAvTplCtx = {
      avID: this.avIdInput?.value || '',
      // 传递 viewID
      viewID: this.viewIdInput?.value || '',
      title: this.titleInput?.value || '',
      xDataExpr: this.xExprTextarea?.value || 'rows.map((_, i) => String(i+1))',
      seriesExprs: this.series.map(s => ({ name: s.name, expr: s.expr, type: (this.chartType==='pie' ? 'pie' : (s.type || 'line')), axisIndex: s.axisIndex })),
      chartSettings: this.getChartSettingsForTemplate(),
      debug: this.debug,
      debugSampleSize: this.debugSampleSize,
      colors: this.colors.length ? this.colors.slice() : undefined,
    };
    return buildIIFEFromAVCtx(ctx);
  }

  public setSQL(_sql: string) {
    // 兼容旧方法名：此处不再支持 SQL，忽略传入内容
    this.rebuildCode();
  }

  // 统一的变化处理：可视化时自动生成表达式，然后保存并刷新预览
  private onChanged() {
    try {
      if (this.visualMode) this.autoBuildExpr();
      this.save();
      this.rebuildCode();
      if (this.opts?.onChange) this.opts.onChange();
    } catch (e) {
      // 保底：即便表达式生成失败也刷新预览为当前输入
      this.rebuildCode();
    }
  }

  private render() {
    this.injectStyle();
    this.root.innerHTML = `
      <div class="veq-wrap">
        <div class="veq-row" style="gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
          <label class="veq-field">标题
            <input class="veq-input" data-title placeholder="图表标题" />
          </label>
          <div class="veq-field">
            <div class="veq-label">颜色</div>
            <div class="veq-row veq-color-row">
              <div class="veq-color-palette" data-color-palette></div>
              <button class="veq-btn veq-ghost veq-small" type="button" data-color-add>添加颜色</button>
            </div>
          </div>
          <label class="veq-field">图表类型
            <select class="veq-input" data-chart-type style="width:120px">
              <option value="stat">统计图</option>
              <option value="pie">饼图</option>
            </select>
          </label>
        </div>

        <div class="veq-grid veq-grid-2">
          <div class="veq-group">
            <div class="veq-group__title">数据库查询参数（AV API）</div>
            <div class="veq-grid" style="grid-template-columns: 1fr 1fr 1fr; gap:8px;">
              <label class="veq-field">avID
                <input class="veq-input" data-avid placeholder="属性视图 avID，如 20250101-abcdefg" />
              </label>
              <label class="veq-field">viewID
                <input class="veq-input" data-viewid placeholder="可选，视图 ID（不填使用默认）" />
              </label>
            </div>
          </div>
          <div class="veq-group">
            <div class="veq-group__title">数据映射
              <div class="veq-inline" style="gap:8px; align-items:center;">
                <span style="font-weight: normal; color: var(--b3-theme-on-surface);">合并相同 X</span>
                <label class="veq-switch"><input type="checkbox" data-merge checked/><i></i></label>
              </div>
            </div>
            <div class="veq-grid" style="grid-template-columns: 1fr 1fr; gap:8px;" data-visual-row>
              <label class="veq-field">X 轴字段
                <select class="veq-input" data-xkey></select>
              </label>
              <label class="veq-field">排序
                <select class="veq-input" data-sort>
                  <option value="none">无</option>
                  <option value="asc" selected>升序</option>
                  <option value="desc">降序</option>
                </select>
              </label>
            </div>
            <div class="veq-field" data-expr-row style="display:none;">
              <label class="veq-field">x 轴数据表达式（高级）
                <textarea class="veq-input" data-xexpr rows="3" placeholder="rows.map(r => r.created)"></textarea>
              </label>
            </div>
          </div>
        </div>

        <div class="veq-group" style="margin-top:8px;">
          <div class="veq-group__title">系列（Series）
            <button class="veq-btn veq-small" data-add-series type="button">添加系列</button>
          </div>
          <div class="veq-series-list" data-series-list></div>
        </div>

        <div class="veq-group" style="margin-top:8px;">
          <div class="veq-type-settings" data-type-settings-body></div>
          <div class="veq-row veq-actions-compact" style="margin-top:8px;">
            <button class="veq-btn" data-copy-iife type="button">复制 JS(IIFE)</button>
            <button class="veq-btn" data-copy-block type="button">复制图表块</button>
          </div>
        </div>

        <details class="veq-sub">
          <summary class="veq-legend">代码预览</summary>
          <pre class="veq-output" data-code></pre>
        </details>
      </div>
    `;

    this.titleInput = this.root.querySelector('[data-title]') as HTMLInputElement;
    this.avIdInput = this.root.querySelector('[data-avid]') as HTMLInputElement;
    // 选择 viewID 输入
    this.viewIdInput = this.root.querySelector('[data-viewid]') as HTMLInputElement;
  this.xExprTextarea = this.root.querySelector('[data-xexpr]') as HTMLTextAreaElement;
    const xkeySel = this.root.querySelector('[data-xkey]') as HTMLSelectElement;
    const sortSel = this.root.querySelector('[data-sort]') as HTMLSelectElement;
  const visualRow = this.root.querySelector('[data-visual-row]') as HTMLElement;
  const exprRow = this.root.querySelector('[data-expr-row]') as HTMLElement;
  const mergeToggle = this.root.querySelector('[data-merge]') as HTMLInputElement;
  const chartTypeSel = this.root.querySelector('[data-chart-type]') as HTMLSelectElement;
    this.seriesListEl = this.root.querySelector('[data-series-list]') as HTMLElement;
    this.paletteEl = this.root.querySelector('[data-color-palette]') as HTMLElement;
    this.codePre = this.root.querySelector('[data-code]') as HTMLPreElement;
  const typeSettingsEl = this.root.querySelector('[data-type-settings-body]') as HTMLElement | null;
  this.chartTypeSel = chartTypeSel || undefined;
  this.typeSettingsEl = typeSettingsEl || undefined;

    // 事件
    this.titleInput.addEventListener('input', () => this.onChanged());
  this.avIdInput.addEventListener('input', () => { this.onChanged(); this.loadKeys(); });
  if (this.viewIdInput) this.viewIdInput.addEventListener('input', () => { this.onChanged(); this.loadKeys(); });
  if (this.xExprTextarea) this.xExprTextarea.addEventListener('input', () => this.onChanged());
    // 默认可视化映射：visualRow 常显，表达式行隐藏
    visualRow.style.display = '';
    exprRow.style.display = 'none';
    if (xkeySel) xkeySel.addEventListener('change', (e)=>{ this.xKey = (e.target as HTMLSelectElement).value; this.onChanged(); });
    if (sortSel) sortSel.addEventListener('change', (e)=>{ this.sort = (e.target as HTMLSelectElement).value as any; this.onChanged(); });
    if (mergeToggle) mergeToggle.addEventListener('change', (e)=>{
      this.mergeMode = (e.target as HTMLInputElement).checked;
      // 模式切换时，修正系列聚合：非合并模式强制原值；合并模式下如为 raw 则改为 count
      this.series = this.series.map(s => ({
        ...s,
        agg: this.mergeMode ? (s.agg === 'raw' ? 'count' : (s.agg || 'count')) : 'raw'
      }));
      this.renderSeriesList();
      this.onChanged();
    });
    if (chartTypeSel) chartTypeSel.addEventListener('change', (e)=>{
      this.chartType = (e.target as HTMLSelectElement).value as any;
      // 切换图表类型：
      // - 若切到饼图：所有系列强制为 pie
      // - 若切到统计图：仅将原 pie 系列转换为默认统计类型（line），保留现有 line/bar/scatter 混合
      if (this.chartType === 'pie') {
        this.series = this.series.map(s => ({ ...s, type: 'pie' }));
      } else {
        this.series = this.series.map(s => (s.type === 'pie' ? { ...s, type: 'line' } : s));
      }
      this.applyTypeConstraints(mergeToggle);
      this.renderSeriesList();
      this.renderTypeSettingsUI(typeSettingsEl || undefined);
      this.onChanged();
    });

    // 初始时根据图表类型约束一次
    this.applyTypeConstraints(mergeToggle);
    (this.root.querySelector('[data-add-series]') as HTMLButtonElement).addEventListener('click', () => {
      const defType = this.chartType === 'pie' ? 'pie' : 'line';
      this.series.push({ name: '系列' + (this.series.length+1), expr: 'rows.map(r => r.value)', type: defType as any, axisIndex: 0 });
      this.renderSeriesList(); this.onChanged();
    });
    // 统一类型设置面板负责处理细节
    // 无调试设置
  (this.root.querySelector('[data-copy-iife]') as HTMLButtonElement).addEventListener('click', () => this.copyIIFE());
  (this.root.querySelector('[data-copy-block]') as HTMLButtonElement).addEventListener('click', () => this.copyChartBlock());

    // 颜色
    const addColorBtn = this.root.querySelector('[data-color-add]') as HTMLButtonElement;
    addColorBtn.addEventListener('click', () => {
      this.colors.push('#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6, '0'));
      this.renderPalette();
      this.onChanged();
    });
    this.renderPalette();

    this.renderSeriesList();
    this.renderTypeSettingsUI(typeSettingsEl || undefined);
  }

  private renderSeriesList() {
    const list = this.seriesListEl;
    if (!list) return;
    list.innerHTML = '';
    if (!this.series.length) {
      list.innerHTML = '<div class="veq-empty">尚未添加系列，点击“添加系列”。</div>';
      return;
    }
    this.series.forEach((s, idx) => {
      const row = document.createElement('div');
  row.className = 'veq-series-item';
  row.setAttribute('data-idx', String(idx));
  row.draggable = true;
      // 限制可选类型：根据 chartType 过滤
      const typeOptions = ((): Array<{v:string; t:string}> => {
        if (this.chartType === 'pie') return [{v:'pie', t:'饼图'}];
        return [
          {v:'line', t:'折线'},
          {v:'bar', t:'柱状'},
          {v:'scatter', t:'散点'}
        ];
      })();
      // 如果当前 series 类型不在允许列表中，优先设置为当前图表类型（若可选），否则为列表第一个
      if (!typeOptions.some(o => o.v === (s.type||''))) {
        const preferred = typeOptions.find(o => o.v === this.chartType);
        s.type = (preferred ? preferred.v : typeOptions[0].v) as any;
      }
      const aggSelHtml = this.mergeMode
        ? `<select class="veq-input" data-agg style="width:48px">
             <option value="count" ${s.agg==='count'?'selected':''}>计数</option>
             <option value="sum" ${s.agg==='sum'?'selected':''}>求和</option>
             <option value="avg" ${s.agg==='avg'?'selected':''}>平均</option>
             <option value="min" ${s.agg==='min'?'selected':''}>最小</option>
             <option value="max" ${s.agg==='max'?'selected':''}>最大</option>
           </select>`
        : `<select class="veq-input" data-agg style="width:48px" disabled>
             <option value="raw" selected>原值</option>
           </select>`;

      row.innerHTML = `
        <div class="veq-row" style="align-items:center; gap:6px;">
          <input class="veq-input" data-name placeholder="名称" value="${this.escape(s.name)}" style="width:160px"/>
          <select class="veq-input" data-type style="width:auto">
            ${typeOptions.map(o=>`<option value="${o.v}" ${s.type===o.v?'selected':''}>${o.t}</option>`).join('')}
          </select>
          <select class="veq-input" data-axis style="width:32px">
            <option value="0" ${Number(s.axisIndex||0)===0?'selected':''}>左</option>
            <option value="1" ${Number(s.axisIndex||0)===1?'selected':''}>右</option>
          </select>
          <div class="veq-row" data-visual-only style="gap:6px;">
            <select class="veq-input" data-value-key style="width:auto">
              ${this.keys.map(k=>`<option value="${this.escape(k)}" ${s.valueKey===k?'selected':''}>${this.escape(k)}</option>`).join('')}
            </select>
            ${aggSelHtml}
          </div>
          <textarea class="veq-input" data-expr rows="2" style="flex:1; display:none;" placeholder="rows.map(r=>r.value)">${this.escape(s.expr)}</textarea>
          <button class="veq-btn veq-ghost" data-del type="button">删除</button>
        </div>`;
      (row.querySelector('[data-name]') as HTMLInputElement).addEventListener('input', (e) => { this.series[idx].name = (e.target as HTMLInputElement).value; this.onChanged(); });
      (row.querySelector('[data-type]') as HTMLSelectElement).addEventListener('change', (e) => { this.series[idx].type = (e.target as HTMLSelectElement).value as any; this.onChanged(); });
  (row.querySelector('[data-axis]') as HTMLSelectElement).addEventListener('change', (e) => { const v = Number((e.target as HTMLSelectElement).value)||0; this.series[idx].axisIndex = v; this.onChanged(); });
      (row.querySelector('[data-expr]') as HTMLTextAreaElement).addEventListener('input', (e) => { this.series[idx].expr = (e.target as HTMLTextAreaElement).value; this.onChanged(); });
      const vk = row.querySelector('[data-value-key]') as HTMLSelectElement | null;
      if (vk) vk.addEventListener('change', (e)=>{ this.series[idx].valueKey = (e.target as HTMLSelectElement).value; this.autoBuildExpr(); this.onChanged(); this.rebuildCode(); });
  const agg = row.querySelector('[data-agg]') as HTMLSelectElement | null;
  if (agg && !agg.disabled) agg.addEventListener('change', (e)=>{ this.series[idx].agg = (e.target as HTMLSelectElement).value as any; this.autoBuildExpr(); this.onChanged(); this.rebuildCode(); });
      (row.querySelector('[data-del]') as HTMLButtonElement).addEventListener('click', () => { this.series.splice(idx, 1); this.renderSeriesList(); this.onChanged(); });
      // 拖拽排序事件
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
        if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= this.series.length) return;
        const moved = this.series.splice(fromIdx, 1)[0];
        this.series.splice(toIdx, 0, moved);
        this.renderSeriesList();
        this.onChanged();
      });
      list.appendChild(row);
    });
  }

  // 根据图表类型调整可选项与合并模式：
  // - 允许 pie 与非 pie 都可自由切换合并模式
  private applyTypeConstraints(mergeToggle?: HTMLInputElement | null) {
    if (mergeToggle) mergeToggle.disabled = false;
    // 不改变 this.mergeMode，仅保证 series 的 agg 与模式相容
    this.series = this.series.map(s => ({ ...s, agg: this.mergeMode ? (s.agg === 'raw' ? 'count' : (s.agg || 'count')) : 'raw' }));
  }

  // 从 AV API 加载键名，填充下拉（等待请求完成后再继续）
  private loadKeys(btn?: HTMLButtonElement) {
    try {
      if (this.loadingKeys) return;
      this.loadingKeys = true;
      if (btn) { const old = btn.textContent || ''; btn.setAttribute('data-old-text', old); btn.disabled = true; btn.textContent = '加载中…'; }

      // 改用 renderAttributeView 获取列定义
      const avID = this.avIdInput?.value || '';
      const viewID = this.viewIdInput?.value || '';
      if (!avID) { this.toast('请先填写 avID'); return; }
      const payload: any = { id: avID };
      if (viewID) payload.viewID = viewID;

      fetch('/api/av/renderAttributeView', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(r=>r.json())
        .then(res=>{
          if (!res || res.code !== 0) throw new Error(res?.msg||'加载失败');
          const cols = res.data && res.data.view && Array.isArray(res.data.view.columns) ? res.data.view.columns : [];
          this.keys = (cols||[]).map((c:any)=>c && c.name).filter(Boolean);

          // 渲染 X 轴字段下拉
          const xSel = this.root.querySelector('[data-xkey]') as HTMLSelectElement | null;
          if (xSel) {
            xSel.innerHTML = this.keys.map(k=>`<option value="${this.escape(k)}" ${this.xKey===k?'selected':''}>${this.escape(k)}</option>`).join('');
            if (!this.xKey && this.keys.length) { this.xKey = this.keys[0]; }
          }
          // 系列行中的 valueKey
          this.renderSeriesList();

          // 等字段加载完成后再进行下一步：自动构建表达式并刷新预览
          this.autoBuildExpr();
          this.save();
          this.rebuildCode();
          if (this.opts?.onChange) this.opts.onChange();
        })
        .catch(e=>{ this.toast('加载字段失败'); console.error(e); })
        .then(()=>{
          // 收尾：恢复按钮与状态
          this.loadingKeys = false;
          if (btn) { btn.disabled = false; const old = btn.getAttribute('data-old-text'); if (old!=null) btn.textContent = old; }
        });
    } catch(e){
      this.toast('加载字段失败');
      console.error(e);
      this.loadingKeys = false;
      if (btn) { btn.disabled = false; const old = btn.getAttribute('data-old-text'); if (old!=null) btn.textContent = old; }
    }
  }

  // 根据可视化选择自动生成表达式
  private autoBuildExpr() {
    if (!this.visualMode) return;
    const xKey = this.xKey;
    if (this.mergeMode) {
      // 合并模式：唯一化并聚合
      const xExprRaw = (!xKey)
        ? 'rows.map((_, i) => String(i+1))'
        : `Array.from(new Set(rows.map(function(r){ return String(r[${JSON.stringify(xKey)}]); })))`;
      let xExprFinal = xExprRaw;
      if (this.sort !== 'none') {
        const asc = this.sort === 'asc';
        xExprFinal = `(()=>{ var arr = (${xExprRaw}).slice(); arr.sort(function(a,b){ if(a===b) return 0; return (a>b?1:-1)*${asc?1:-1}; }); return arr; })()`;
      }
      if (this.xExprTextarea) this.xExprTextarea.value = xExprFinal;
      const catVar = 'cats';
      const catsDef = `(function(){ var ${catVar} = (${xExprFinal}); return ${catVar}; })()`;
      this.series = this.series.map(s => {
        const key = s.valueKey || this.xKey;
        const agg = s.agg || 'count';
        let dataExpr = '';
        if (!key) {
          dataExpr = `${catsDef}.map(()=>0)`;
        } else if (agg === 'count') {
          dataExpr = `${catsDef}.map(function(c){ return rows.filter(function(r){ return String(r[${JSON.stringify(xKey)}])===c; }).length; })`;
        } else if (agg === 'sum') {
          dataExpr = `(function(){ var cats = (${xExprFinal}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(c){ return rows.filter(function(r){ return String(r[${JSON.stringify(xKey)}])===c; }).reduce(function(a,b){ var n=toNum(b[${JSON.stringify(key)}]); return a + (n==null?0:n); },0); }); })()`;
        } else if (agg === 'avg') {
          dataExpr = `(function(){ var cats = (${xExprFinal}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(c){ var arr = rows.filter(function(r){ return String(r[${JSON.stringify(xKey)}])===c; }).map(function(b){ return toNum(b[${JSON.stringify(key)}]); }).filter(function(v){ return v!=null; }); return arr.length? (arr.reduce(function(a,b){return a+b;},0)/arr.length):0; }); })()`;
        } else if (agg === 'min') {
          dataExpr = `(function(){ var cats = (${xExprFinal}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(c){ var arr = rows.filter(function(r){ return String(r[${JSON.stringify(xKey)}])===c; }).map(function(b){ return toNum(b[${JSON.stringify(key)}]); }).filter(function(v){ return v!=null; }); return arr.length? Math.min.apply(null, arr):0; }); })()`;
        } else if (agg === 'max') {
          dataExpr = `(function(){ var cats = (${xExprFinal}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(c){ var arr = rows.filter(function(r){ return String(r[${JSON.stringify(xKey)}])===c; }).map(function(b){ return toNum(b[${JSON.stringify(key)}]); }).filter(function(v){ return v!=null; }); return arr.length? Math.max.apply(null, arr):0; }); })()`;
        } else { // 原值在合并模式下不提供
          dataExpr = `${catsDef}.map(()=>0)`;
        }
        return { ...s, expr: dataExpr };
      });
    } else {
      // 非合并模式：逐行（原值），并支持排序时的重排
      const baseArr = (!xKey)
        ? 'rows.map((_, i) => String(i+1))'
        : `rows.map(function(r){ return r[${JSON.stringify(xKey)}]; })`;
      let xExprFinal = baseArr;
      let idxsExpr = '';
      if (this.sort !== 'none') {
        const asc = this.sort === 'asc';
        idxsExpr = `(()=>{ var a = (${baseArr}); var idx = a.map(function(_,i){return i}); idx.sort(function(i,j){ var x=a[i], y=a[j]; if(x===y) return 0; return (x>y?1:-1)*${asc?1:-1}; }); return idx; })()`;
        xExprFinal = `(()=>{ var a = (${baseArr}); var idx = ${idxsExpr}; return idx.map(function(i){ return a[i]; }); })()`;
      }
      if (this.xExprTextarea) this.xExprTextarea.value = xExprFinal;
      const catVar = 'cats';
      const catsDef = `(function(){ var ${catVar} = (${xExprFinal}); return ${catVar}; })()`;
      this.series = this.series.map(s => {
        const key = s.valueKey || this.xKey;
        let dataExpr = '';
        if (!key) {
          dataExpr = `${catsDef}.map(()=>0)`;
        } else {
          if (idxsExpr) {
            dataExpr = `(function(){ var idx = ${idxsExpr}; function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return idx.map(function(i){ var v = rows[i][${JSON.stringify(key)}]; var n=toNum(v); return n==null?0:n; }); })()`;
          } else {
            dataExpr = `(function(){ function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return rows.map(function(r){ var n=toNum(r[${JSON.stringify(key)}]); return n==null?0:n; }); })()`;
          }
        }
        return { ...s, agg: 'raw', expr: dataExpr };
      });
    }
    // 排序已反映在 xExprFinal 中，series 使用 catsDef 与之保持一致
  }

  private renderPalette() {
    const el = this.paletteEl; if (!el) return;
    if (!this.colors.length) { el.innerHTML = '<div class="veq-color-empty">未设置颜色，使用默认配色</div>'; return; }
    el.innerHTML = this.colors.map((c, i) => `
      <div class="veq-color-chip" data-idx="${i}">
        <span class="veq-color-swatch" style="background:${c}"></span>
        <button class="veq-color-del" title="删除" type="button">×</button>
        <input type="color" value="${c}" />
      </div>
    `).join('');
    Array.from(el.querySelectorAll('.veq-color-chip')).forEach(chip => {
      const idx = Number((chip as HTMLElement).getAttribute('data-idx')||'0');
      const picker = chip.querySelector('input[type="color"]') as HTMLInputElement | null;
      const del = chip.querySelector('.veq-color-del') as HTMLButtonElement | null;
      const swatch = chip.querySelector('.veq-color-swatch') as HTMLElement | null;
      if (picker) picker.addEventListener('input', () => { this.colors[idx] = picker.value; if (swatch) swatch.style.background = picker.value; this.onChanged(); });
      if (del) del.addEventListener('click', () => { this.colors.splice(idx,1); this.renderPalette(); this.onChanged(); });
    });
  }

  

  private rebuildCode() {
    try {
      this.codePre.textContent = this.getIIFE();
    } catch (e) {
      this.codePre.textContent = '/* 构建失败 */';
    }
  }

  private copyIIFE() {
    const iife = this.getIIFE();
    this.copyText(iife, '已复制');
  }

  private copyChartBlock() {
    const block = '```echarts\n' + this.getIIFE() + '\n```';
    this.copyText(block, '已复制');
  }

  // 对外 API：用于父容器同步视图设置和标题/颜色
  public setViewSettings(type: 'bar'|'line'|'pie', settings: any) {
    try {
      // 兼容旧接口：bar/line -> stat，pie 保持
      const incoming = type || 'line';
      this.chartType = incoming === 'pie' ? 'pie' : 'stat';
      if (settings && typeof settings === 'object') {
        const merged = { ...this.perTypeSettings } as any;
        if (incoming === 'bar') merged.bar = { ...merged.bar, ...settings };
        if (incoming === 'line') merged.line = { ...merged.line, ...settings };
        if (incoming === 'pie') merged.pie = { ...merged.pie, ...settings };
        this.perTypeSettings = merged;
      }
      if (this.chartTypeSel) this.chartTypeSel.value = this.chartType;
      // 同步系列类型：切到 pie 时强制为 pie；切到 stat 时仅把原 pie 系列转换为 line
      if (this.chartType === 'pie') {
        this.series = this.series.map(s => ({ ...s, type: 'pie' }));
      } else {
        this.series = this.series.map(s => (s.type === 'pie' ? { ...s, type: 'line' } : s));
      }
      this.applyTypeConstraints(this.root.querySelector('[data-merge]') as HTMLInputElement | null);
      this.renderSeriesList();
      this.renderTypeSettingsUI(this.typeSettingsEl);
      this.onChanged();
    } catch { /* ignore */ }
  }

  public getViewSettings(): { type: 'bar'|'line'|'pie', settings: any } {
    // 对外兼容：stat 作为 line 返回
    if (this.chartType === 'pie') return { type: 'pie', settings: this.perTypeSettings.pie };
    return { type: 'line', settings: this.perTypeSettings.line };
  }

  public setColors(colors: string[]) {
    if (Array.isArray(colors)) {
      this.colors = colors.slice();
      this.renderPalette();
      this.onChanged();
    }
  }

  public getColors(): string[] { return this.colors.slice(); }

  public setTitle(title: string) {
    if (typeof title === 'string' && this.titleInput) {
      this.titleInput.value = title;
      this.onChanged();
    }
  }

  public getTitle(): string { return this.titleInput?.value || ''; }

  private copyText(text: string, okMsg: string) {
    (async () => {
      try { await navigator.clipboard.writeText(text); this.toast(okMsg); }
      catch {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); this.toast(okMsg);
      }
    })();
  }

  private escape(s: any) {
    const str = s == null ? '' : String(s);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  private toast(msg: string) {
    const tip = document.createElement('div');
    tip.textContent = msg;
    tip.style.cssText = 'position:fixed; right:16px; bottom:16px; background:#323232; color:#fff; padding:8px 12px; border-radius:4px; z-index:9999; opacity:0; transition:opacity .2s';
    document.body.appendChild(tip);
    requestAnimationFrame(() => tip.style.opacity = '1');
    setTimeout(() => { tip.style.opacity = '0'; setTimeout(() => tip.remove(), 200); }, 1200);
  }

  private save() {
    try {
      const data = {
        title: this.titleInput?.value || '',
        avID: this.avIdInput?.value || '',
        // 保存 viewID
        viewID: this.viewIdInput?.value || '',
        xExpr: this.xExprTextarea?.value || '',
        series: this.series,
        chartType: this.chartType,
        chartSettings: { ...this.perTypeSettings, common: this.commonSettings },
        colors: this.colors.join(','),
        visual: { xKey: this.xKey, sort: this.sort, merge: this.mergeMode },
        fold: { common: this.foldCommon, stat: this.foldStat, pie: this.foldPie }
      };
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(this.key); if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj) return;
      if (this.titleInput) this.titleInput.value = obj.title || '';
      if (this.avIdInput) this.avIdInput.value = obj.avID || '';
      // 恢复 viewID
      if (this.viewIdInput) this.viewIdInput.value = obj.viewID || '';
      if (this.xExprTextarea) this.xExprTextarea.value = obj.xExpr || '';
      this.series = Array.isArray(obj.series) ? obj.series : [];
      // 兼容旧 flags -> 迁移到统一设置
      if (obj.flags) {
        this.perTypeSettings.line.smooth = !!obj.flags.smooth;
        this.perTypeSettings.line.boundaryGap = !!obj.flags.boundaryGap;
        this.perTypeSettings.bar.stack = !!obj.flags.stack;
        this.perTypeSettings.bar.boundaryGap = !!obj.flags.boundaryGap;
      }
      if (obj.chartType) {
        // 兼容旧值：bar/line 映射为 stat
        this.chartType = (obj.chartType === 'pie') ? 'pie' : 'stat';
      }
      if (obj.chartSettings) {
        const { common, ...rest } = obj.chartSettings || {};
        this.perTypeSettings = { ...this.perTypeSettings, ...rest };
        if (common && typeof common === 'object') {
          this.commonSettings = {
            legendPos: (common.legendPos==='bottom'||common.legendPos==='left'||common.legendPos==='right') ? common.legendPos : 'top',
            ySplitLine: (common.ySplitLine==='solid'||common.ySplitLine==='none') ? common.ySplitLine : 'dashed',
            grid: {
              top: Number(common.grid?.top ?? 10),
              right: Number(common.grid?.right ?? 10),
              bottom: Number(common.grid?.bottom ?? 24),
              left: Number(common.grid?.left ?? 10)
            }
          };
        }
      }
      // 恢复折叠状态（默认折叠）
      if (obj.fold && typeof obj.fold === 'object') {
        this.foldCommon = obj.fold.common === true; // 仅当存储为 true 时展开
        this.foldStat = obj.fold.stat === true;
        this.foldPie = obj.fold.pie === true;
      } else {
        this.foldCommon = false; this.foldStat = false; this.foldPie = false;
      }
  const typeSel = this.root.querySelector('[data-chart-type]') as HTMLSelectElement | null; if (typeSel) typeSel.value = this.chartType;
  if (this.chartTypeSel) this.chartTypeSel.value = this.chartType;
      if (obj.visual) {
        this.xKey = obj.visual.xKey || '';
        this.sort = obj.visual.sort || 'asc';
        this.mergeMode = obj.visual.merge !== false; // 默认合并
        const st = this.root.querySelector('[data-sort]') as HTMLSelectElement | null; if (st) st.value = this.sort;
        const mt = this.root.querySelector('[data-merge]') as HTMLInputElement | null; if (mt) mt.checked = this.mergeMode;
      }
      // 已移除调试设置恢复
      this.colors = String(obj.colors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      this.renderPalette();
      this.renderSeriesList();
      this.applyTypeConstraints(this.root.querySelector('[data-merge]') as HTMLInputElement | null);
  // 刷新类型设置面板（仅刷新内容区域 body，避免替换 details 结构）
  this.renderTypeSettingsUI(this.root.querySelector('[data-type-settings-body]') as HTMLElement | null || undefined);
      // 自动加载字段
      this.loadKeys();
    } catch { /* ignore */ }
  }

  private injectStyle() {
    const ID = 'visual-echarts-query-ui-style';
    if (document.getElementById(ID)) return;
    const st = document.createElement('style'); st.id = ID; st.textContent = `
      .veq-wrap{--fg: var(--b3-theme-on-background); --muted: var(--b3-theme-on-surface); --border: var(--b3-border-color); --bg: var(--b3-theme-surface); font-family: var(--b3-font-family); font-size: var(--b3-font-size);}
      .veq-input{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); border-radius:6px; padding:6px 8px; outline:none}
      .veq-field{display:grid; gap:6px; font-size:13.5px; color: var(--fg)}
      .veq-label{font-size:12px; color: var(--muted)}
      .veq-row{display:flex; gap:8px; flex-wrap:wrap}
      .veq-btn{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); padding:6px 10px; border-radius:6px; cursor:pointer}
      .veq-btn.veq-ghost{background:transparent}
      .veq-btn.veq-small{padding:4px 8px; font-size:12px}
      .veq-grid{display:grid; gap:10px}
      .veq-grid-2{grid-template-columns: 1fr 1fr}
      .veq-grid-switches{grid-template-columns: repeat(2, minmax(160px, 1fr)); align-items:center}
  .veq-grid-switches-row{grid-template-columns: repeat(2, minmax(160px, 1fr)); align-items:center}
  .veq-control{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 8px; border:1px solid var(--border); border-radius:8px; background: var(--b3-theme-background)}
  .veq-control > span{color: var(--fg); font-size:13.5px}
      @media(max-width:980px){.veq-grid-2{grid-template-columns: 1fr}}
      @media(max-width:680px){.veq-grid-switches{grid-template-columns: 1fr}}
  @media(max-width:680px){.veq-grid-switches-row{grid-template-columns: 1fr}}
      .veq-group{border:1px solid var(--border); border-radius:10px; padding:10px; background: color-mix(in oklab, var(--b3-theme-surface), var(--b3-theme-background) 30%)}
      .veq-group__title{font-weight:600; color: var(--muted); margin-bottom:8px; display:flex; align-items:center; justify-content:space-between}
      .veq-series-list{display:flex; flex-direction:column; gap:8px}
  .veq-series-item{border:1px solid var(--border); border-radius:8px; padding:8px; background: var(--b3-theme-surface); cursor: move}
  .veq-series-item.drag-over{outline: 2px dashed var(--b3-theme-primary)}
      .veq-empty{color: var(--muted); font-size:12px}
      .veq-output{white-space:pre-wrap; background: var(--b3-protyle-code-background, var(--b3-theme-background)); border:1px solid var(--border); border-radius:6px; padding:8px; font-family: var(--b3-font-family-code, ui-monospace,monospace); font-size:11px}
      .veq-legend{font-weight:600; color: var(--muted)}
      .veq-sub{border:1px solid var(--border); border-radius:10px; padding:8px; background: var(--bg); margin-top:10px}
      /* switch */
      .veq-switch{position:relative; display:inline-flex; align-items:center}
      .veq-switch input{position:absolute; opacity:0; width:0; height:0}
      .veq-switch i{width:36px; height:20px; background: var(--b3-border-color); border-radius:999px; position:relative; transition:all .18s ease; box-shadow: inset 0 0 0 1px var(--b3-border-color)}
      .veq-switch i:before{content:""; position:absolute; left:2px; top:2px; width:16px; height:16px; border-radius:50%; background: var(--b3-theme-on-surface); transition:transform .18s ease}
      .veq-switch input:checked + i{background: var(--b3-theme-primary); box-shadow: inset 0 0 0 1px var(--b3-theme-primary)}
      .veq-switch input:checked + i:before{background: var(--b3-theme-on-primary); transform: translateX(16px)}
      /* color editor */
      .veq-color-row{align-items:center}
      .veq-color-palette{display:flex; gap:8px; flex-wrap:wrap}
      .veq-color-chip{position:relative; width:28px; height:28px}
      .veq-color-swatch{display:block; width:100%; height:100%; border-radius:6px; border:1px solid var(--border); box-shadow: inset 0 0 0 1px color-mix(in oklab, #000, transparent 85%)}
      .veq-color-del{position:absolute; right:-6px; top:-6px; width:18px; height:18px; border-radius:50%; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--muted); cursor:pointer; line-height:16px; font-size:12px; z-index:2}
      .veq-color-chip input[type="color"]{position:absolute; inset:0; opacity:0; cursor:pointer; z-index:1}
      .veq-color-empty{color: var(--muted); font-size:12px}
  .veq-justify-end{justify-content:flex-end}
  .veq-actions-compact{gap:6px; flex-wrap:wrap}
      .veq-inline{display:flex; align-items:center; gap:10px}
  .veq-type-settings{display:block}
  .veq-stack{display:flex; flex-direction:column; gap:10px}
  .veq-sub{border:1px solid var(--border); border-radius:10px; padding:8px; background: var(--bg);}
  .veq-legend{font-weight:600; color: var(--muted)}
  .veq-collapse{overflow:hidden; transition: height .24s cubic-bezier(0.4, 0, 0.2, 1)}
    `; document.head.appendChild(st);
  }

  private renderTypeSettingsUI(target?: HTMLElement) {
    const el = target || (this.root.querySelector('[data-type-settings]') as HTMLElement | null);
    if (!el) return;
    const t = this.chartType;
    let html = '';
    // 通用设置
    const cs = this.commonSettings;
    html += `
      <details class="veq-sub" data-fold-common ${this.foldCommon ? 'open' : ''}>
        <summary class="veq-legend">通用设置</summary>
        <div class="veq-grid" style="grid-template-columns: repeat(2, minmax(220px,1fr)); gap:10px 14px; margin-top:8px;">
          <div class="veq-field">
            <div class="veq-label">图例位置</div>
            <select class="veq-input" data-set="common.legendPos" style="width:140px">
              <option value="top" ${cs.legendPos==='top'?'selected':''}>上</option>
              <option value="bottom" ${cs.legendPos==='bottom'?'selected':''}>下</option>
              <option value="left" ${cs.legendPos==='left'?'selected':''}>左</option>
              <option value="right" ${cs.legendPos==='right'?'selected':''}>右</option>
            </select>
          </div>
          <div class="veq-field">
            <div class="veq-label">Y 轴分割线</div>
            <select class="veq-input" data-set="common.ySplitLine" style="width:140px">
              <option value="dashed" ${cs.ySplitLine==='dashed'?'selected':''}>虚线</option>
              <option value="solid" ${cs.ySplitLine==='solid'?'selected':''}>实线</option>
              <option value="none" ${cs.ySplitLine==='none'?'selected':''}>无</option>
            </select>
          </div>
          <label class="veq-field">Grid 顶部(px)
            <input class="veq-input" type="number" step="1" data-set="common.grid.top" value="${cs.grid.top}" />
          </label>
          <label class="veq-field">Grid 右侧(px)
            <input class="veq-input" type="number" step="1" data-set="common.grid.right" value="${cs.grid.right}" />
          </label>
          <label class="veq-field">Grid 底部(px)
            <input class="veq-input" type="number" step="1" data-set="common.grid.bottom" value="${cs.grid.bottom}" />
          </label>
          <label class="veq-field">Grid 左侧(px)
            <input class="veq-input" type="number" step="1" data-set="common.grid.left" value="${cs.grid.left}" />
          </label>
        </div>
      </details>`;
    if (t === 'stat') {
      const sb = this.perTypeSettings.bar;
      const sl = this.perTypeSettings.line;
      // 共享值：若两者不一致，优先取折线的值，其次取柱状；目标是通过该面板统一两者
      const sharedBoundaryGap = (typeof sl.boundaryGap === 'boolean') ? sl.boundaryGap : (typeof sb.boundaryGap === 'boolean' ? sb.boundaryGap : false);
      const sharedRotate = (typeof sl.xLabelRotate === 'number') ? (sl.xLabelRotate as number) : (typeof sb.xLabelRotate === 'number' ? (sb.xLabelRotate as number) : 0);
      const sharedLabelShow = !!(sl.label?.show || sb.label?.show);
      html += `
        <details class="veq-sub" data-fold-stat ${this.foldStat ? 'open' : ''}>
          <summary class="veq-legend">统计图设置（折线/柱状）</summary>
          <div class="veq-grid veq-grid-switches-row">
            <label class="veq-field"><div class="veq-inline"><span>折线平滑</span><label class="veq-switch"><input type="checkbox" data-set="line.smooth" ${sl.smooth ? 'checked' : ''}/><i></i></label></div></label>
            <label class="veq-field"><div class="veq-inline"><span>柱状堆叠</span><label class="veq-switch"><input type="checkbox" data-set="bar.stack" ${sb.stack ? 'checked' : ''}/><i></i></label></div></label>
          </div>
          <div class="veq-grid veq-grid-switches-row" style="margin-top:10px;">
            <label class="veq-field"><div class="veq-inline"><span>x 轴留白</span><label class="veq-switch"><input type="checkbox" data-set="stat.boundaryGap" ${sharedBoundaryGap ? 'checked' : ''}/><i></i></label></div></label>
            <label class="veq-field"><div class="veq-inline"><span>显示标签</span><label class="veq-switch"><input type="checkbox" data-set="stat.label.show" ${sharedLabelShow ? 'checked' : ''}/><i></i></label></div></label>
          </div>
          <label class="veq-field" style="margin-top:10px;">x 轴标签旋转
            <div class="veq-row" style="align-items:center; gap:8px;">
              <input class="veq-input" type="range" min="-90" max="90" step="5" data-set="stat.xLabelRotate" value="${sharedRotate}" />
              <span class="veq-label">${sharedRotate}°</span>
            </div>
          </label>
          <div class="veq-grid veq-grid-switches-row" style="margin-top:10px;">
            <label class="veq-field"><div class="veq-inline"><span>面积填充(折线)</span><label class="veq-switch"><input type="checkbox" data-set="line.area" ${(sl as any).area ? 'checked' : ''}/><i></i></label></div></label>
          </div>
        </details>`;
    } else if (t === 'pie') {
      const s = this.perTypeSettings.pie;
      html += `
        <details class="veq-sub" data-fold-pie ${this.foldPie ? 'open' : ''}>
          <summary class="veq-legend">饼图设置</summary>
          <div class="veq-grid" style="grid-template-columns: repeat(2, minmax(220px,1fr)); gap:10px 14px; margin-top:8px;">
          <label class="veq-field">内径(%)
            <div class="veq-row" style="align-items:center; gap:8px;">
              <input class="veq-input" type="range" min="0" max="95" step="5" data-set="pie.innerRadius" value="${s.innerRadius ?? 0}" />
              <span class="veq-label">${s.innerRadius ?? 0}%</span>
            </div>
          </label>
          <label class="veq-field">外径(%)
            <div class="veq-row" style="align-items:center; gap:8px;">
              <input class="veq-input" type="range" min="5" max="100" step="5" data-set="pie.outerRadius" value="${s.outerRadius ?? 70}" />
              <span class="veq-label">${s.outerRadius ?? 70}%</span>
            </div>
          </label>
          <div class="veq-field">
            <div class="veq-label">玫瑰图 roseType</div>
            <select class="veq-input" data-set="pie.roseType" style="width:140px">
              <option value="false" ${!s.roseType ? 'selected' : ''}>无</option>
              <option value="radius" ${s.roseType==='radius' ? 'selected' : ''}>radius</option>
              <option value="area" ${s.roseType==='area' ? 'selected' : ''}>area</option>
            </select>
          </div>
          <label class="veq-field"><div class="veq-inline"><span>显示标签</span><label class="veq-switch"><input type="checkbox" data-set="pie.label.show" ${s.label?.show ? 'checked' : ''}/><i></i></label></div></label>
          </div>
        </details>`;
    }
    el.innerHTML = html;
    // 监听折叠切换并持久化
    const dCommon = el.querySelector('details[data-fold-common]') as HTMLDetailsElement | null;
    if (dCommon) dCommon.addEventListener('toggle', () => { this.foldCommon = !!dCommon.open; this.save(); });
    const dStat = el.querySelector('details[data-fold-stat]') as HTMLDetailsElement | null;
    if (dStat) dStat.addEventListener('toggle', () => { this.foldStat = !!dStat.open; this.save(); });
    const dPie = el.querySelector('details[data-fold-pie]') as HTMLDetailsElement | null;
    if (dPie) dPie.addEventListener('toggle', () => { this.foldPie = !!dPie.open; this.save(); });
    const inputs = Array.from(el.querySelectorAll('[data-set]')) as HTMLElement[];
    inputs.forEach(elm => {
      const key = elm.getAttribute('data-set') || '';
      if (elm instanceof HTMLInputElement && elm.type === 'checkbox') {
        elm.addEventListener('change', () => { this.setDeepSetting(key, elm.checked); this.onChanged(); this.renderTypeSettingsUI(el); });
      } else if (elm instanceof HTMLInputElement && (elm.type === 'number' || elm.type === 'text' || elm.type === 'range')) {
        elm.addEventListener('input', () => {
          const v = (elm.type === 'number' || elm.type === 'range') ? Number(elm.value) : elm.value;
          const labelSpan = elm.parentElement?.querySelector('.veq-label') as HTMLElement | null;
          if (labelSpan && (typeof v === 'number')) labelSpan.textContent = key.includes('Radius') ? `${v}%` : `${v}°`;
          this.setDeepSetting(key, v); this.onChanged();
        });
      } else if (elm instanceof HTMLSelectElement) {
        elm.addEventListener('change', () => {
          let v: any = (elm as HTMLSelectElement).value;
          if (v === 'false') v = false;
          this.setDeepSetting(key, v); this.onChanged();
        });
      }
    });
  }

  private setDeepSetting(path: string, value: any) {
    const segs = path.split('.');
    if (segs[0] === 'common') {
      // 更新通用设置
      let cur: any = this.commonSettings as any;
      for (let i = 1; i < segs.length - 1; i++) {
        const k = segs[i];
        if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
        cur = cur[k];
      }
      cur[segs[segs.length - 1]] = value;
      return;
    }
    // 统计图共享设置：同时作用于 line 与 bar
    if (segs[0] === 'stat') {
      const leaf = segs.slice(1).join('.');
      if (leaf === 'boundaryGap' || leaf === 'xLabelRotate') {
        // 基本标量
        (this.perTypeSettings as any).line[leaf] = value;
        (this.perTypeSettings as any).bar[leaf] = value;
        return;
      }
      if (leaf === 'label.show') {
        const ensure = (obj: any) => { obj.label = obj.label || {}; obj.label.show = !!value; };
        ensure((this.perTypeSettings as any).line);
        ensure((this.perTypeSettings as any).bar);
        return;
      }
      // 其他 stat.* 暂不处理
      return;
    }
    let cur: any = this.perTypeSettings as any;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = segs[i];
      if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
      cur = cur[k];
    }
    cur[segs[segs.length - 1]] = value;
  }

  private getChartSettingsForTemplate() {
    if (this.chartType === 'pie') return this.perTypeSettings.pie;
    // 统计图：传给构建器按系列类型各自读取
    return { bar: this.perTypeSettings.bar, line: this.perTypeSettings.line, common: this.commonSettings } as any;
  }
}
