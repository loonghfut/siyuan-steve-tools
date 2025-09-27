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

  // 状态
  private smooth = true;
  private area = false;
  private stack = false;
  private boundaryGap = false;
  private colors: string[] = [];
  private series: Array<{ name: string; expr: string; type?: 'line'|'bar'|'scatter'|'pie'; axisIndex?: number; valueKey?: string; agg?: 'raw'|'count'|'sum'|'avg'|'min'|'max' }> = [];
  private debug = false;
  private debugSampleSize = 5;
  private loadingKeys = false;

  // 可视化映射状态
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
      seriesExprs: this.series.map(s => ({ name: s.name, expr: s.expr, type: s.type, axisIndex: s.axisIndex })),
      smooth: this.smooth,
      area: this.area,
      stack: this.stack,
      boundaryGap: this.boundaryGap,
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
        </div>

        <div class="veq-grid veq-grid-2">
          <div class="veq-group">
            <div class="veq-group__title">数据库查询参数（AV API）</div>
            <div class="veq-grid" style="grid-template-columns: 1fr 1fr; gap:8px;">
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
              <div class="veq-row" style="gap:8px; align-items:center;">
                <label class="veq-inline">可视化映射<label class="veq-switch"><input type="checkbox" data-visual checked/><i></i></label></label>
                <label class="veq-inline">合并相同 X<label class="veq-switch"><input type="checkbox" data-merge checked/><i></i></label></label>
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
              <label class="veq-field">x 轴数据表达式
                <textarea class="veq-input" data-xexpr rows="3" placeholder="rows.map(r => r.created)"></textarea>
              </label>
              <div class="veq-help">表达式在浏览器中执行，入参可用 rows（AV 行数组，已以字段名扁平化）。</div>
            </div>
          </div>
        </div>

        <div class="veq-group" style="margin-top:8px;">
          <div class="veq-group__title">系列（Series）
            <button class="veq-btn veq-small" data-add-series type="button">添加系列</button>
          </div>
          <div class="veq-series-list" data-series-list></div>
        </div>

        <div class="veq-grid veq-grid-2" style="margin-top:8px;">
          <div class="veq-group">
            <div class="veq-group__title">线/柱通用</div>
            <label class="veq-field"><div class="veq-inline"><span>平滑线</span><label class="veq-switch"><input type="checkbox" data-smooth/><i></i></label></div></label>
            <label class="veq-field"><div class="veq-inline"><span>面积填充</span><label class="veq-switch"><input type="checkbox" data-area/><i></i></label></div></label>
            <label class="veq-field"><div class="veq-inline"><span>堆叠</span><label class="veq-switch"><input type="checkbox" data-stack/><i></i></label></div></label>
            <label class="veq-field"><div class="veq-inline"><span>x 轴留白</span><label class="veq-switch"><input type="checkbox" data-boundaryGap/><i></i></label></div></label>
            <label class="veq-field"><div class="veq-inline"><span>调试输出</span><label class="veq-switch"><input type="checkbox" data-debug/><i></i></label></div></label>
            <label class="veq-field">调试采样条数
              <input class="veq-input" data-debug-sample type="number" step="1" min="1" value="5"/>
            </label>
          </div>
          <div class="veq-group">
            <div class="veq-group__title">操作</div>
            <div class="veq-row veq-justify-end" style="gap:8px;">
              <button class="veq-btn" data-copy-iife type="button">复制 JS(IIFE)</button>
              <button class="veq-btn" data-copy-block type="button">复制图表块</button>
              <button class="veq-btn" data-goto-sql type="button">转到 SQL</button>
            </div>
          </div>
        </div>

        <details class="veq-sub" open>
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
    const visualToggle = this.root.querySelector('[data-visual]') as HTMLInputElement;
    const xkeySel = this.root.querySelector('[data-xkey]') as HTMLSelectElement;
    const sortSel = this.root.querySelector('[data-sort]') as HTMLSelectElement;
    const visualRow = this.root.querySelector('[data-visual-row]') as HTMLElement;
    const exprRow = this.root.querySelector('[data-expr-row]') as HTMLElement;
  const mergeToggle = this.root.querySelector('[data-merge]') as HTMLInputElement;
    this.seriesListEl = this.root.querySelector('[data-series-list]') as HTMLElement;
    this.paletteEl = this.root.querySelector('[data-color-palette]') as HTMLElement;
    this.codePre = this.root.querySelector('[data-code]') as HTMLPreElement;

    // 事件
    this.titleInput.addEventListener('input', () => this.onChanged());
  this.avIdInput.addEventListener('input', () => { this.onChanged(); this.loadKeys(); });
  if (this.viewIdInput) this.viewIdInput.addEventListener('input', () => { this.onChanged(); this.loadKeys(); });
    this.xExprTextarea.addEventListener('input', () => this.onChanged());
    if (visualToggle) visualToggle.addEventListener('change', (e)=>{
      this.visualMode = (e.target as HTMLInputElement).checked;
      visualRow.style.display = this.visualMode ? '' : 'none';
      exprRow.style.display = this.visualMode ? 'none' : '';
      this.onChanged();
      this.renderSeriesList();
    });
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
    (this.root.querySelector('[data-add-series]') as HTMLButtonElement).addEventListener('click', () => { this.series.push({ name: '系列' + (this.series.length+1), expr: 'rows.map(r => r.value)', type: 'line', axisIndex: 0 }); this.renderSeriesList(); this.onChanged(); });
    (this.root.querySelector('[data-smooth]') as HTMLInputElement).addEventListener('change', (e) => { this.smooth = (e.target as HTMLInputElement).checked; this.onChanged(); });
    (this.root.querySelector('[data-area]') as HTMLInputElement).addEventListener('change', (e) => { this.area = (e.target as HTMLInputElement).checked; this.onChanged(); });
    (this.root.querySelector('[data-stack]') as HTMLInputElement).addEventListener('change', (e) => { this.stack = (e.target as HTMLInputElement).checked; this.onChanged(); });
    (this.root.querySelector('[data-boundaryGap]') as HTMLInputElement).addEventListener('change', (e) => { this.boundaryGap = (e.target as HTMLInputElement).checked; this.onChanged(); });
  (this.root.querySelector('[data-debug]') as HTMLInputElement).addEventListener('change', (e) => { this.debug = (e.target as HTMLInputElement).checked; this.onChanged(); });
  (this.root.querySelector('[data-debug-sample]') as HTMLInputElement).addEventListener('input', (e) => { const v = Math.max(1, Number((e.target as HTMLInputElement).value) || 5); this.debugSampleSize = v; this.onChanged(); });
    (this.root.querySelector('[data-copy-iife]') as HTMLButtonElement).addEventListener('click', () => this.copyIIFE());
    (this.root.querySelector('[data-copy-block]') as HTMLButtonElement).addEventListener('click', () => this.copyChartBlock());
    (this.root.querySelector('[data-goto-sql]') as HTMLButtonElement).addEventListener('click', () => { if (this.opts?.onGotoSQL) this.opts.onGotoSQL(); });

    // 颜色
    const addColorBtn = this.root.querySelector('[data-color-add]') as HTMLButtonElement;
    addColorBtn.addEventListener('click', () => {
      this.colors.push('#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6, '0'));
      this.renderPalette();
      this.onChanged();
    });
    this.renderPalette();

    this.renderSeriesList();
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
      const aggSelHtml = this.mergeMode
        ? `<select class="veq-input" data-agg style="width:120px">
             <option value="count" ${s.agg==='count'?'selected':''}>计数</option>
             <option value="sum" ${s.agg==='sum'?'selected':''}>求和</option>
             <option value="avg" ${s.agg==='avg'?'selected':''}>平均</option>
             <option value="min" ${s.agg==='min'?'selected':''}>最小</option>
             <option value="max" ${s.agg==='max'?'selected':''}>最大</option>
           </select>`
        : `<select class="veq-input" data-agg style="width:120px" disabled>
             <option value="raw" selected>原值</option>
           </select>`;

      row.innerHTML = `
        <div class="veq-row" style="align-items:center; gap:6px;">
          <input class="veq-input" data-name placeholder="名称" value="${this.escape(s.name)}" style="width:160px"/>
          <select class="veq-input" data-type style="width:100px">
            <option value="line" ${s.type==='line'?'selected':''}>折线</option>
            <option value="bar" ${s.type==='bar'?'selected':''}>柱状</option>
            <option value="scatter" ${s.type==='scatter'?'selected':''}>散点</option>
            <option value="pie" ${s.type==='pie'?'selected':''}>饼图</option>
          </select>
          <select class="veq-input" data-axis style="width:120px">
            <option value="0" ${Number(s.axisIndex||0)===0?'selected':''}>左</option>
            <option value="1" ${Number(s.axisIndex||0)===1?'selected':''}>右</option>
          </select>
          <div class="veq-row" data-visual-only style="gap:6px; ${this.visualMode?'':'display:none;'}">
            <select class="veq-input" data-value-key style="width:160px">
              ${this.keys.map(k=>`<option value="${this.escape(k)}" ${s.valueKey===k?'selected':''}>${this.escape(k)}</option>`).join('')}
            </select>
            ${aggSelHtml}
          </div>
          <textarea class="veq-input" data-expr rows="2" style="flex:1; ${this.visualMode?'display:none;':''}" placeholder="rows.map(r=>r.value)">${this.escape(s.expr)}</textarea>
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
      list.appendChild(row);
    });
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
        flags: { smooth: this.smooth, area: this.area, stack: this.stack, boundaryGap: this.boundaryGap },
        debug: { enabled: this.debug, sample: this.debugSampleSize },
        colors: this.colors.join(','),
        visual: { enabled: this.visualMode, xKey: this.xKey, sort: this.sort, merge: this.mergeMode }
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
      if (obj.flags) {
        this.smooth = !!obj.flags.smooth;
        this.area = !!obj.flags.area;
        this.stack = !!obj.flags.stack;
        this.boundaryGap = !!obj.flags.boundaryGap;
        const smoothEl = this.root.querySelector('[data-smooth]') as HTMLInputElement | null; if (smoothEl) smoothEl.checked = this.smooth;
        const areaEl = this.root.querySelector('[data-area]') as HTMLInputElement | null; if (areaEl) areaEl.checked = this.area;
        const stackEl = this.root.querySelector('[data-stack]') as HTMLInputElement | null; if (stackEl) stackEl.checked = this.stack;
        const bgEl = this.root.querySelector('[data-boundaryGap]') as HTMLInputElement | null; if (bgEl) bgEl.checked = this.boundaryGap;
      }
      if (obj.visual) {
        this.visualMode = !!obj.visual.enabled;
        this.xKey = obj.visual.xKey || '';
        this.sort = obj.visual.sort || 'asc';
        this.mergeMode = obj.visual.merge !== false; // 默认合并
        const vt = this.root.querySelector('[data-visual]') as HTMLInputElement | null; if (vt) vt.checked = this.visualMode;
        const xr = this.root.querySelector('[data-expr-row]') as HTMLElement | null; if (xr) xr.style.display = this.visualMode ? 'none' : '';
        const vr = this.root.querySelector('[data-visual-row]') as HTMLElement | null; if (vr) vr.style.display = this.visualMode ? '' : 'none';
        const st = this.root.querySelector('[data-sort]') as HTMLSelectElement | null; if (st) st.value = this.sort;
        const mt = this.root.querySelector('[data-merge]') as HTMLInputElement | null; if (mt) mt.checked = this.mergeMode;
      }
      if (obj.debug) {
        this.debug = !!obj.debug.enabled;
        this.debugSampleSize = Math.max(1, Number(obj.debug.sample || 5));
        const dEl = this.root.querySelector('[data-debug]') as HTMLInputElement | null; if (dEl) dEl.checked = this.debug;
        const dsEl = this.root.querySelector('[data-debug-sample]') as HTMLInputElement | null; if (dsEl) dsEl.value = String(this.debugSampleSize);
      }
      this.colors = String(obj.colors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      this.renderPalette();
      this.renderSeriesList();
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
      @media(max-width:980px){.veq-grid-2{grid-template-columns: 1fr}}
      .veq-group{border:1px solid var(--border); border-radius:10px; padding:10px; background: color-mix(in oklab, var(--b3-theme-surface), var(--b3-theme-background) 30%)}
      .veq-group__title{font-weight:600; color: var(--muted); margin-bottom:6px; display:flex; align-items:center; justify-content:space-between}
      .veq-series-list{display:flex; flex-direction:column; gap:8px}
      .veq-series-item{border:1px solid var(--border); border-radius:8px; padding:8px; background: var(--b3-theme-surface)}
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
    `; document.head.appendChild(st);
  }
}
