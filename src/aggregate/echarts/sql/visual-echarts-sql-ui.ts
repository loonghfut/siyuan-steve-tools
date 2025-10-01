import { buildSqlMappingExpressions, SeriesItem } from './sql-data-mapping';
import { preprocessSqlData } from './sql-data-preprocessor';

export interface VisualEchartsSqlOptions {
  persistKey?: string;
  onChange?: () => void; // 配置变化回调,用于外部触发预览刷新
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>; // 加载 SQL 预设
}

export class VisualEchartsSqlUI {
  private root: HTMLElement;
  private opts?: VisualEchartsSqlOptions;
  private key: string;

  // 元素句柄
  private titleInput!: HTMLInputElement;
  private sqlTextarea!: HTMLTextAreaElement;
  private xExprTextarea!: HTMLTextAreaElement;
  private seriesListEl!: HTMLElement;
  private paletteEl!: HTMLElement;
  private codePre!: HTMLPreElement;
  private chartTypeSel?: HTMLSelectElement;
  private typeSettingsEl?: HTMLElement;
  
  // SQL 相关
  private sql: string = '';
  private presets: Record<string, any> = {}; // SQL 预设映射
  private presetSelectEl?: HTMLSelectElement; // 预设下拉框
  
  // 多SQL预设模式
  private sqlMode: 'single' | 'multi-preset' = 'single'; // SQL模式: 单SQL 或 多SQL预设对比
  private multiSqlPresets: Array<{ name: string; sql: string }> = []; // 多SQL预设列表
  private multiSqlPresetsEl?: HTMLElement; // 多SQL预设列表容器
  private sqlModeSwitchEl?: HTMLSelectElement; // SQL模式切换下拉框
  
  // 通用设置
  private commonSettings: {
    legendPos: 'top' | 'bottom' | 'left' | 'right';
    grid: { top: number; right: number; bottom: number; left: number };
    title: {
      textAlign: 'left' | 'center' | 'right';
      textVerticalAlign: 'top' | 'middle' | 'bottom';
    };
  } = {
      legendPos: 'top',
      grid: { top: 90, right: 70, bottom: 24, left: 40 },
      title: {
        textAlign: 'center',
        textVerticalAlign: 'top'
      }
    };
  private statInteractions: {
    tooltipTrigger: 'axis' | 'item';
    axisPointerType: 'line' | 'shadow' | 'cross' | 'none';
    dataZoom: 'none' | 'inside' | 'slider' | 'both';
    ySplitLine: 'dashed' | 'solid' | 'none';
  } = {
      tooltipTrigger: 'axis',
      axisPointerType: 'line',
      dataZoom: 'none',
      ySplitLine: 'dashed'
    };
  // 设置面板折叠状态(持久化)
  private foldCommon: boolean = false;
  private foldStat: boolean = false;
  private foldPie: boolean = false;

  // 统一图表设置
  private chartType: 'stat' | 'pie' = 'stat';
  private perTypeSettings: {
    bar: {
      stack?: boolean;
      boundaryGap?: boolean;
      xLabelRotate?: number;
      label?: { show?: boolean; position?: string };
      barWidth?: number | null;
      barGap?: string | number | null;
      xAxisName?: string;
      yAxisLeftName?: string;
      yAxisRightName?: string;
    };
    line: {
      smooth?: boolean;
      boundaryGap?: boolean;
      xLabelRotate?: number;
      label?: { show?: boolean; position?: string };
      area?: boolean;
      symbol?: string;
      symbolSize?: number;
      lineWidth?: number;
      xAxisName?: string;
      yAxisLeftName?: string;
      yAxisRightName?: string;
    };
    pie: { innerRadius?: number; outerRadius?: number; roseType?: 'radius' | 'area' | false; label?: { show?: boolean; position?: string } };
  } = {
      bar: { stack: false, boundaryGap: true, xLabelRotate: 0, label: { show: false, position: 'top' }, barWidth: null, barGap: '30%', xAxisName: '', yAxisLeftName: '', yAxisRightName: '' },
      line: { smooth: true, boundaryGap: false, xLabelRotate: 0, label: { show: false, position: 'top' }, area: false, symbol: 'circle', symbolSize: 8, lineWidth: 2, xAxisName: '', yAxisLeftName: '', yAxisRightName: '' },
      pie: { innerRadius: 0, outerRadius: 70, roseType: false, label: { show: false, position: 'outside' } },
    };
  private colors: string[] = [];
  private series: Array<SeriesItem> = [];
  private debug = false;
  private debugSampleSize = 5;
  private loadingKeys = false;

  // 可视化映射状态(默认启用且无开关)
  private visualMode = true;
  private keys: string[] = [];
  private xKey: string = '';
  private sort: 'none' | 'asc' | 'desc' = 'asc';
  private xBucket: 'none' | 'year' | 'month' | 'day' | 'hour' = 'none';
  private mergeMode: boolean = true;

  constructor(container: HTMLElement, options?: VisualEchartsSqlOptions) {
    this.root = container;
    this.opts = options;
    this.key = options?.persistKey || 'siyuan-steve-tools:visual-echarts-sql-ui';
    this.render();
    this.restore();
    this.rebuildCode();
    // 异步加载预设
    this.loadPresetsToUI().catch(err => console.error('加载 SQL 预设失败:', err));
  }

  // 供外部读取 IIFE
  public getIIFE(): string {
    return this.buildIIFE();
  }

  public setSQL(sql: string) {
    this.sql = sql;
    if (this.sqlTextarea) {
      this.sqlTextarea.value = sql;
    }
    this.rebuildCode();
  }

  public getSQL(): string {
    return this.sql;
  }

  // 统一的变化处理:可视化时自动生成表达式,然后保存并刷新预览
  private onChanged() {
    try {
      if (this.visualMode) this.autoBuildExpr();
      this.save();
      this.rebuildCode();
      if (this.opts?.onChange) this.opts.onChange();
    } catch (e) {
      // 保底:即便表达式生成失败也刷新预览为当前输入
      this.rebuildCode();
    }
  }

  private render() {
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

        <div class="veq-grid" style="display:flex; flex-direction:column; gap:8px;">
          <div class="veq-group">
            <div class="veq-group__title">
              SQL 查询语句
              <label class="veq-field" style="display:inline-block; margin-left:16px; font-weight:normal;">
                <span style="font-size:12px;">SQL模式:</span>
                <select class="veq-input" data-sql-mode style="width:140px; margin-left:4px;">
                  <option value="single">单SQL查询</option>
                  <option value="multi-preset">多SQL预设对比</option>
                </select>
              </label>
            </div>
            
            <!-- 单SQL模式 -->
            <div data-single-sql-mode>
              <label class="veq-field">
                <div class="veq-label">预设模板</div>
                <select class="veq-input" data-sql-preset style="margin-bottom:8px;">
                  <option value="">-- 选择预设 --</option>
                </select>
              </label>
              <label class="veq-field">
                <textarea class="veq-input" data-sql rows="4" placeholder="SELECT * FROM blocks WHERE type='d' LIMIT 100"></textarea>
              </label>
              <button class="veq-btn veq-small" data-load-keys type="button">加载字段</button>
            </div>
            
            <!-- 多SQL预设对比模式 -->
            <div data-multi-sql-mode style="display:none;">
              <div class="veq-field">
                <div class="veq-label">SQL预设列表</div>
                <div data-multi-sql-presets-list style="margin-bottom:8px;"></div>
                <button class="veq-btn veq-small" data-add-multi-sql type="button">添加SQL预设</button>
              </div>
            </div>
          </div>
          <div class="veq-group">
            <div class="veq-group__title">数据映射
              <div class="veq-inline" style="gap:8px; align-items:center;">
                <span style="font-weight: normal; color: var(--b3-theme-on-surface);">合并相同 X</span>
                <label class="veq-switch"><input type="checkbox" data-merge checked/><i></i></label>
              </div>
            </div>
            <div class="veq-grid" style="grid-template-columns: 1fr 1fr 1fr; gap:8px;" data-visual-row>
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
              <label class="veq-field">时间分桶
                <select class="veq-input" data-bucket>
                  <option value="none" selected>无</option>
                  <option value="year">年</option>
                  <option value="month">月</option>
                  <option value="day">日</option>
                  <option value="hour">时</option>
                </select>
              </label>
            </div>
            <div class="veq-field" data-expr-row style="display:none;">
              <label class="veq-field">x 轴数据表达式(高级)
                <textarea class="veq-input" data-xexpr rows="3" placeholder="rows.map(r => r.created)"></textarea>
              </label>
            </div>
          </div>
        </div>

        <div class="veq-group" style="margin-top:8px;">
          <div class="veq-group__title">系列(Series)
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
          <pre class="veq-output" data-code data-output></pre>
        </details>
      </div>
    `;

    this.titleInput = this.root.querySelector('[data-title]') as HTMLInputElement;
    this.sqlTextarea = this.root.querySelector('[data-sql]') as HTMLTextAreaElement;
    this.xExprTextarea = this.root.querySelector('[data-xexpr]') as HTMLTextAreaElement;
    const xkeySel = this.root.querySelector('[data-xkey]') as HTMLSelectElement;
    const sortSel = this.root.querySelector('[data-sort]') as HTMLSelectElement;
    const bucketSel = this.root.querySelector('[data-bucket]') as HTMLSelectElement | null;
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
    this.presetSelectEl = this.root.querySelector('[data-sql-preset]') as HTMLSelectElement | undefined;
    this.sqlModeSwitchEl = this.root.querySelector('[data-sql-mode]') as HTMLSelectElement | undefined;
    this.multiSqlPresetsEl = this.root.querySelector('[data-multi-sql-presets-list]') as HTMLElement | undefined;

    // 事件
    this.titleInput.addEventListener('input', () => this.onChanged());
    this.sqlTextarea.addEventListener('input', (e) => { this.sql = (e.target as HTMLTextAreaElement).value; this.onChanged(); });
    
    // SQL模式切换事件
    this.sqlModeSwitchEl?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as 'single' | 'multi-preset';
      this.sqlMode = mode;
      const singleMode = this.root.querySelector('[data-single-sql-mode]') as HTMLElement | null;
      const multiMode = this.root.querySelector('[data-multi-sql-mode]') as HTMLElement | null;
      if (mode === 'single') {
        if (singleMode) singleMode.style.display = '';
        if (multiMode) multiMode.style.display = 'none';
      } else {
        if (singleMode) singleMode.style.display = 'none';
        if (multiMode) multiMode.style.display = '';
      }
      this.onChanged();
    });
    
    // 添加多SQL预设按钮事件
    const addMultiSqlBtn = this.root.querySelector('[data-add-multi-sql]') as HTMLButtonElement | null;
    addMultiSqlBtn?.addEventListener('click', () => {
      this.multiSqlPresets.push({ name: 'SQL预设' + (this.multiSqlPresets.length + 1), sql: '' });
      this.renderMultiSqlPresetsList();
      this.onChanged();
    });
    
    // 预设选择事件
    this.presetSelectEl?.addEventListener('change', () => {
      const key = this.presetSelectEl?.value || '';
      console.log('[SQL预设] 选择了预设:', key);
      
      if (!key) {
        console.log('[SQL预设] 预设 key 为空,已重置');
        return;
      }
      
      if (!this.presets[key]) {
        console.warn('[SQL预设] 预设不存在:', key);
        this.toast('预设不存在');
        return;
      }
      
      const preset = this.presets[key];
      console.log('[SQL预设] 预设内容:', preset);
      
      // 新版预设会在保存时同时保存编译后的 SQL
      const sql = preset.sql || '';
      console.log('[SQL预设] 提取的 SQL:', sql);
      
      if (sql) {
        this.sql = sql;
        this.sqlTextarea.value = sql;
        console.log('[SQL预设] SQL 已填充到 textarea');
        this.onChanged();
        this.toast('已应用预设');
      } else {
        console.warn('[SQL预设] 预设中没有 SQL 字段');
        this.toast('旧版预设不包含 SQL,请重新保存预设');
      }
    });
    
    if (this.xExprTextarea) this.xExprTextarea.addEventListener('input', () => this.onChanged());
    
    // 默认可视化映射:visualRow 常显,表达式行隐藏
    visualRow.style.display = '';
    exprRow.style.display = 'none';
    if (xkeySel) xkeySel.addEventListener('change', (e) => { this.xKey = (e.target as HTMLSelectElement).value; this.onChanged(); });
    if (sortSel) sortSel.addEventListener('change', (e) => { this.sort = (e.target as HTMLSelectElement).value as any; this.onChanged(); });
    if (bucketSel) bucketSel.addEventListener('change', (e) => { 
      this.xBucket = (e.target as HTMLSelectElement).value as any; 
      if (this.xBucket !== 'none') { 
        this.mergeMode = true; 
        this.series = this.series.map(s => ({ ...s, agg: s.agg === 'raw' ? 'count' : (s.agg || 'count') })); 
        const mt = this.root.querySelector('[data-merge]') as HTMLInputElement | null; 
        if (mt) mt.checked = true; 
        this.renderSeriesList(); 
      } 
      this.onChanged(); 
    });
    if (mergeToggle) mergeToggle.addEventListener('change', (e) => {
      this.mergeMode = (e.target as HTMLInputElement).checked;
      this.series = this.series.map(s => ({
        ...s,
        agg: this.mergeMode ? (s.agg === 'raw' ? 'count' : (s.agg || 'count')) : 'raw'
      }));
      this.renderSeriesList();
      this.onChanged();
    });
    if (chartTypeSel) chartTypeSel.addEventListener('change', (e) => {
      this.chartType = (e.target as HTMLSelectElement).value as any;
      if (this.chartType === 'pie') {
        this.series = this.series.map(s => ({ ...s, type: 'pie' }));
        if (this.statInteractions.tooltipTrigger !== 'item') {
          this.statInteractions.tooltipTrigger = 'item';
        }
      } else {
        this.series = this.series.map(s => (s.type === 'pie' ? { ...s, type: 'line' } : s));
      }
      this.applyTypeConstraints(mergeToggle);
      this.renderSeriesList();
      this.renderTypeSettingsUI(typeSettingsEl || undefined);
      this.onChanged();
    });

    this.applyTypeConstraints(mergeToggle);
    (this.root.querySelector('[data-add-series]') as HTMLButtonElement).addEventListener('click', () => {
      const defType = this.chartType === 'pie' ? 'pie' : 'line';
      this.series.push({ name: '系列' + (this.series.length + 1), expr: 'rows.map(r => 0)', type: defType as any, axisIndex: 0 });
      this.renderSeriesList(); 
      this.onChanged();
    });
    
    (this.root.querySelector('[data-load-keys]') as HTMLButtonElement).addEventListener('click', () => this.loadKeys());
    (this.root.querySelector('[data-copy-iife]') as HTMLButtonElement).addEventListener('click', () => this.copyIIFE());
    (this.root.querySelector('[data-copy-block]') as HTMLButtonElement).addEventListener('click', () => this.copyChartBlock());

    // 颜色
    const addColorBtn = this.root.querySelector('[data-color-add]') as HTMLButtonElement;
    addColorBtn.addEventListener('click', () => {
      this.colors.push('#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'));
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
      list.innerHTML = '<div class="veq-empty">尚未添加系列,点击"添加系列"。</div>';
      return;
    }
    this.series.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'veq-series-item';
      row.setAttribute('data-idx', String(idx));
      row.draggable = true;
      
      const typeOptions = ((): Array<{ v: string; t: string }> => {
        if (this.chartType === 'pie') return [{ v: 'pie', t: '饼图' }];
        return [
          { v: 'line', t: '折线' },
          { v: 'bar', t: '柱状' },
          { v: 'scatter', t: '散点' }
        ];
      })();
      
      if (!typeOptions.some(o => o.v === (s.type || ''))) {
        const preferred = typeOptions.find(o => o.v === this.chartType);
        s.type = (preferred ? preferred.v : typeOptions[0].v) as any;
      }
      
      const aggSelHtml = this.mergeMode
        ? `<select class="veq-input" data-agg style="width:48px">
             <option value="count" ${s.agg === 'count' ? 'selected' : ''}>计数</option>
             <option value="sum" ${s.agg === 'sum' ? 'selected' : ''}>求和</option>
             <option value="avg" ${s.agg === 'avg' ? 'selected' : ''}>平均</option>
             <option value="min" ${s.agg === 'min' ? 'selected' : ''}>最小</option>
             <option value="max" ${s.agg === 'max' ? 'selected' : ''}>最大</option>
           </select>`
        : `<select class="veq-input" data-agg style="width:48px" disabled>
             <option value="raw" selected>原值</option>
           </select>`;

      row.innerHTML = `
        <div class="veq-row" style="align-items:center; gap:6px;">
          <input class="veq-input" data-name placeholder="名称" value="${this.escape(s.name)}" style="width:160px"/>
          <select class="veq-input" data-type style="width:auto">
            ${typeOptions.map(o => `<option value="${o.v}" ${s.type === o.v ? 'selected' : ''}>${o.t}</option>`).join('')}
          </select>
          <select class="veq-input" data-axis style="width:32px">
            <option value="0" ${Number(s.axisIndex || 0) === 0 ? 'selected' : ''}>左</option>
            <option value="1" ${Number(s.axisIndex || 0) === 1 ? 'selected' : ''}>右</option>
          </select>
          <div class="veq-row" data-visual-only style="gap:6px;">
            <select class="veq-input" data-value-key style="width:auto">
              ${this.keys.map(k => `<option value="${this.escape(k)}" ${s.valueKey === k ? 'selected' : ''}>${this.escape(k)}</option>`).join('')}
            </select>
            ${aggSelHtml}
          </div>
          <textarea class="veq-input" data-expr rows="2" style="flex:1; display:none;" placeholder="rows.map(r=>r.value)">${this.escape(s.expr)}</textarea>
          <button class="veq-btn veq-ghost" data-del type="button">删除</button>
        </div>`;
      (row.querySelector('[data-name]') as HTMLInputElement).addEventListener('input', (e) => { this.series[idx].name = (e.target as HTMLInputElement).value; this.onChanged(); });
      (row.querySelector('[data-type]') as HTMLSelectElement).addEventListener('change', (e) => { this.series[idx].type = (e.target as HTMLSelectElement).value as any; this.onChanged(); });
      (row.querySelector('[data-axis]') as HTMLSelectElement).addEventListener('change', (e) => { const v = Number((e.target as HTMLSelectElement).value) || 0; this.series[idx].axisIndex = v; this.onChanged(); });
      (row.querySelector('[data-expr]') as HTMLTextAreaElement).addEventListener('input', (e) => { this.series[idx].expr = (e.target as HTMLTextAreaElement).value; this.onChanged(); });
      const vk = row.querySelector('[data-value-key]') as HTMLSelectElement | null;
      if (vk) vk.addEventListener('change', (e) => { this.series[idx].valueKey = (e.target as HTMLSelectElement).value; this.autoBuildExpr(); this.onChanged(); this.rebuildCode(); });
      const agg = row.querySelector('[data-agg]') as HTMLSelectElement | null;
      if (agg && !agg.disabled) agg.addEventListener('change', (e) => { this.series[idx].agg = (e.target as HTMLSelectElement).value as any; this.autoBuildExpr(); this.onChanged(); this.rebuildCode(); });
      (row.querySelector('[data-del]') as HTMLButtonElement).addEventListener('click', () => { this.series.splice(idx, 1); this.renderSeriesList(); this.onChanged(); });
      
      // 拖拽排序事件
      row.addEventListener('dragstart', (ev) => {
        row.classList.add('dragging');
        try { ev.dataTransfer?.setData('text/plain', String(idx)); } catch { }
      });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); });
      row.addEventListener('dragover', (ev) => { ev.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => { row.classList.remove('drag-over'); });
      row.addEventListener('drop', (ev) => {
        ev.preventDefault(); row.classList.remove('drag-over');
        let fromIdx = idx;
        try { const data = ev.dataTransfer?.getData('text/plain'); if (data != null && data !== '') fromIdx = Number(data) | 0; } catch { }
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

  private applyTypeConstraints(mergeToggle?: HTMLInputElement | null) {
    if (mergeToggle) mergeToggle.disabled = false;
    this.series = this.series.map(s => ({ ...s, agg: this.mergeMode ? (s.agg === 'raw' ? 'count' : (s.agg || 'count')) : 'raw' }));
  }

  // 渲染多SQL预设列表
  private renderMultiSqlPresetsList() {
    const list = this.multiSqlPresetsEl;
    if (!list) return;
    
    if (!this.multiSqlPresets.length) {
      list.innerHTML = '<div class="veq-empty">尚未添加SQL预设,点击"添加SQL预设"。</div>';
      return;
    }
    
    list.innerHTML = '';
    this.multiSqlPresets.forEach((preset, idx) => {
      const row = document.createElement('div');
      row.className = 'veq-series-item';
      row.style.cssText = 'margin-bottom:8px; padding:8px; border:1px solid var(--b3-border-color); border-radius:4px;';
      
      row.innerHTML = `
        <div class="veq-row" style="align-items:flex-start; gap:6px; margin-bottom:6px;">
          <input class="veq-input" data-preset-name placeholder="预设名称" value="${this.escape(preset.name)}" style="width:200px"/>
          <button class="veq-btn veq-ghost veq-small" data-del type="button">删除</button>
        </div>
        <textarea class="veq-input" data-preset-sql rows="3" placeholder="SELECT * FROM blocks WHERE ...">${this.escape(preset.sql)}</textarea>
      `;
      
      const nameInput = row.querySelector('[data-preset-name]') as HTMLInputElement;
      const sqlTextarea = row.querySelector('[data-preset-sql]') as HTMLTextAreaElement;
      const delBtn = row.querySelector('[data-del]') as HTMLButtonElement;
      
      nameInput.addEventListener('input', (e) => {
        this.multiSqlPresets[idx].name = (e.target as HTMLInputElement).value;
        this.onChanged();
      });
      
      sqlTextarea.addEventListener('input', (e) => {
        this.multiSqlPresets[idx].sql = (e.target as HTMLTextAreaElement).value;
        this.onChanged();
      });
      
      delBtn.addEventListener('click', () => {
        this.multiSqlPresets.splice(idx, 1);
        this.renderMultiSqlPresetsList();
        this.onChanged();
      });
      
      list.appendChild(row);
    });
  }

  // 从 SQL 查询结果加载字段名
  private loadKeys() {
    try {
      if (this.loadingKeys) return;
      this.loadingKeys = true;
      
      const btn = this.root.querySelector('[data-load-keys]') as HTMLButtonElement;
      const oldText = btn.textContent || '';
      btn.disabled = true;
      btn.textContent = '加载中…';

      const sql = this.sql.trim();
      if (!sql) {
        this.toast('请先输入 SQL 查询语句');
        this.loadingKeys = false;
        btn.disabled = false;
        btn.textContent = oldText;
        return;
      }

      // 使用同步 XMLHttpRequest 获取 SQL 查询结果
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/query/sql', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ stmt: sql }));

      if (xhr.status >= 200 && xhr.status < 300) {
        const result = JSON.parse(xhr.responseText || '[]');
        const rawRows = Array.isArray(result) ? result : (result.data || []);
        
        // 使用预处理器处理数据
        const rows = preprocessSqlData(rawRows, { debug: true });
        
        if (rows.length > 0) {
          // 获取第一行的所有键作为字段名(使用预处理后的数据)
          this.keys = Object.keys(rows[0]);
          
          console.log('🔍 字段加载调试:', {
            原始字段: Object.keys(rawRows[0] || {}),
            预处理后字段: this.keys,
            box字段转换: rawRows[0]?.box !== rows[0]?.box ? `${rawRows[0]?.box} -> ${rows[0]?.box}` : '无变化'
          });
          
          // 渲染 X 轴字段下拉
          const xSel = this.root.querySelector('[data-xkey]') as HTMLSelectElement | null;
          if (xSel) {
            xSel.innerHTML = this.keys.map(k => `<option value="${this.escape(k)}" ${this.xKey === k ? 'selected' : ''}>${this.escape(k)}</option>`).join('');
            if (!this.xKey && this.keys.length) { this.xKey = this.keys[0]; }
          }
          
          // 系列行中的 valueKey
          this.renderSeriesList();
          
          // 自动构建表达式并刷新预览
          this.autoBuildExpr();
          this.save();
          this.rebuildCode();
          if (this.opts?.onChange) this.opts.onChange();
          
          this.toast(`已加载 ${this.keys.length} 个字段`);
        } else {
          this.toast('查询结果为空');
        }
      } else {
        this.toast('查询失败');
      }
    } catch (e) {
      this.toast('查询出错');
      console.error(e);
    } finally {
      this.loadingKeys = false;
      const btn = this.root.querySelector('[data-load-keys]') as HTMLButtonElement;
      btn.disabled = false;
      btn.textContent = '加载字段';
    }
  }

  // 根据可视化选择自动生成表达式
  private autoBuildExpr() {
    if (!this.visualMode) return;
    
    // 调试输出:打印输入参数
    console.group('🔍 SQL数据映射调试');
    console.log('📊 X轴配置:', {
      xKey: this.xKey,
      sort: this.sort,
      bucket: this.xBucket,
      mergeMode: this.mergeMode
    });
    console.log('📈 系列配置:', this.series.map(s => ({
      name: s.name,
      valueKey: s.valueKey,
      agg: s.agg,
      type: s.type,
      axisIndex: s.axisIndex
    })));
    
    const { xExpr, series } = buildSqlMappingExpressions({
      visualMode: this.visualMode,
      mergeMode: this.mergeMode,
      sort: this.sort,
      xKey: this.xKey,
      bucket: this.xBucket,
      series: this.series,
    });
    
    // 调试输出:打印生成的表达式
    console.log('✅ 生成的X轴表达式:', xExpr);
    console.log('✅ 生成的系列表达式:', series.map(s => ({
      name: s.name,
      expr: s.expr,
      type: s.type,
      axisIndex: s.axisIndex
    })));
    console.groupEnd();
    
    if (this.xExprTextarea && xExpr) this.xExprTextarea.value = xExpr;
    this.series = series;
  }

  private renderPalette() {
    const el = this.paletteEl; 
    if (!el) return;
    if (!this.colors.length) { 
      el.innerHTML = '<div class="veq-color-empty">未设置颜色,使用默认配色</div>'; 
      return; 
    }
    el.innerHTML = this.colors.map((c, i) => `
      <div class="veq-color-chip" data-idx="${i}">
        <span class="veq-color-swatch" style="background:${c}"></span>
        <button class="veq-color-del" title="删除" type="button">×</button>
        <input type="color" value="${c}" />
      </div>
    `).join('');
    Array.from(el.querySelectorAll('.veq-color-chip')).forEach(chip => {
      const idx = Number((chip as HTMLElement).getAttribute('data-idx') || '0');
      const picker = chip.querySelector('input[type="color"]') as HTMLInputElement | null;
      const del = chip.querySelector('.veq-color-del') as HTMLButtonElement | null;
      const swatch = chip.querySelector('.veq-color-swatch') as HTMLElement | null;
      if (picker) picker.addEventListener('input', () => { this.colors[idx] = picker.value; if (swatch) swatch.style.background = picker.value; this.onChanged(); });
      if (del) del.addEventListener('click', () => { this.colors.splice(idx, 1); this.renderPalette(); this.onChanged(); });
    });
  }

  private buildIIFE(): string {
    const title = this.titleInput?.value || '';
    
    // 多SQL预设对比模式
    if (this.sqlMode === 'multi-preset') {
      return this.buildMultiSqlPresetIIFE(title);
    }
    
    // 单SQL查询模式
    const xExpr = this.xExprTextarea?.value || 'rows.map((_, i) => String(i+1))';
    const seriesExprs = this.series.map(s => ({ 
      name: s.name, 
      expr: s.expr, 
      type: (this.chartType === 'pie' ? 'pie' : (s.type || 'line')), 
      axisIndex: s.axisIndex 
    }));
    
    return this.buildSimpleIIFE(title, this.sql, xExpr, seriesExprs);
  }

  // 构建多SQL预设对比的IIFE
  private buildMultiSqlPresetIIFE(title: string): string {
    if (!this.multiSqlPresets || this.multiSqlPresets.length === 0) {
      return `(() => { return { title: { text: '${title || '请添加SQL预设'}' }, xAxis: { type: 'category', data: [] }, yAxis: { type: 'value' }, series: [] }; })()`;
    }
    
    const presetsJson = JSON.stringify(this.multiSqlPresets.map(p => ({ name: p.name, sql: p.sql })));
    
    return `(() => {
    function fetchSqlSync(sql){
      try{
        var xhr = new XMLHttpRequest();
        xhr.open('POST','/api/query/sql', false);
        xhr.setRequestHeader('Content-Type','application/json');
        xhr.send(JSON.stringify({stmt: sql}));
        if (xhr.status>=200 && xhr.status<300){
          var res = {};
          try { res = JSON.parse(xhr.responseText || '[]'); } catch { res = []; }
          var rows = Array.isArray(res) ? res : (res.data || []);
          return Array.isArray(rows) ? rows : [];
        }
      } catch(e){ /* ignore */ }
      return [];
    }
    
    const option = {};
    const presets = ${presetsJson};
    
    // 执行每个SQL预设并收集结果数量
    const xAxisData = [];
    const yAxisData = [];
    
    presets.forEach(function(preset) {
      xAxisData.push(preset.name);
      var rows = fetchSqlSync(preset.sql);
      yAxisData.push(rows.length);
    });
    
    console.group('🔍 多SQL预设对比 - 数据调试');
    console.log('📊 预设列表:', presets);
    console.log('📐 X轴(预设名称):', xAxisData);
    console.log('📐 Y轴(查询数量):', yAxisData);
    console.groupEnd();
    
    option.title = { text: ${JSON.stringify(title)}, left: 'center' };
    option.backgroundColor = 'transparent';
    option.tooltip = { trigger: 'axis', axisPointer: { type: 'shadow' } };
    option.xAxis = {
      type: 'category',
      data: xAxisData,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { rotate: 0, interval: 0 }
    };
    option.yAxis = {
      type: 'value',
      name: '查询结果数量',
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: true, lineStyle: { color: 'rgba(0, 0, 0, .38)', type: 'dashed' } }
    };
    option.series = [{
      name: '查询结果数量',
      type: 'bar',
      data: yAxisData,
      itemStyle: {
        color: '#5470c6'
      },
      label: {
        show: true,
        position: 'top',
        formatter: '{c}'
      }
    }];
    ${Array.isArray(this.colors) && this.colors.length ? `
    try{ option.series[0].itemStyle.color = ${JSON.stringify(this.colors[0])}; }catch(e){}
    ` : ''}
    option.animation = false;
    return option;
  })()`;
  }

  private buildSimpleIIFE(title: string, sql: string, xExpr: string, seriesExprs: any[]): string {
    const needDualAxis = seriesExprs.some(s => (s as any).axisIndex === 1);
    const isAllPie = seriesExprs.length > 0 && seriesExprs.every(s => (s.type || 'line') === 'pie');
    const st: any = this.perTypeSettings;
    const stCommon: any = this.commonSettings;
    const stStat: any = this.statInteractions;
    
    const legendArr = JSON.stringify(seriesExprs.map(s => s.name));
    
    const splitType = stStat.ySplitLine || 'dashed';
    const splitTypeShow = splitType !== 'none';
    const splitLineStyleType = splitType === 'solid' ? 'solid' : 'dashed';
    
    const tooltipTrigger = isAllPie ? 'item' : (stStat.tooltipTrigger || 'axis');
    const axisPointerType = tooltipTrigger === 'axis' ? (stStat.axisPointerType || 'line') : 'none';
    const dataZoomMode = isAllPie ? 'none' : (stStat.dataZoom || 'none');
    
    let pieNo = -1;
    const pieCount = seriesExprs.filter(s => (s.type || 'line') === 'pie').length;
    
    const seriesJs = seriesExprs.map(s => {
      const type = s.type || 'line';
      const name = JSON.stringify(s.name);
      const yAxisIndex = (typeof (s as any).axisIndex === 'number' && (s as any).axisIndex! > 0) ? `yAxisIndex:${(s as any).axisIndex | 0},` : '';
      
      const dataExpr = (type === 'pie')
        ? `(function(){
          var ys = (${s.expr});
          if (Array.isArray(ys) && ys.length && typeof ys[0]==='object' && ys[0] && Object.prototype.hasOwnProperty.call(ys[0], 'value')) return ys;
          var xs = (${xExpr});
          var m = Math.min(xs.length, Array.isArray(ys)?ys.length:0);
          return xs.slice(0,m).map(function(n,i){ return { name: String(n), value: ys[i] }; });
        })()`
        : `(${s.expr})`;
      
      const pieExtra = (type === 'pie' && pieCount > 1) ? (function () {
        pieNo++;
        const ir0 = 0, or0 = 70;
        const span = Math.max(1, or0 - ir0);
        const ring = span / pieCount;
        let r1 = Math.round(ir0 + ring * pieNo);
        let r2 = Math.round(ir0 + ring * (pieNo + 1));
        if (r2 <= r1) r2 = r1 + 1;
        return `radius: ['${r1}%', '${r2}%'],`;
      })() : '';
      
      return `{
        name: ${name}, type: '${type}', ${yAxisIndex} ${pieExtra} z: 1,
        data: ${dataExpr}
      }`;
    }).join(',\n');
    
    const tooltipPatch = (function () {
      if (tooltipTrigger === 'axis' && !isAllPie) {
        if (axisPointerType === 'none') return `option.tooltip = { trigger: 'axis' };`;
        return `option.tooltip = { trigger: 'axis', axisPointer: { type: '${axisPointerType}' } };`;
      }
      return `option.tooltip = { trigger: 'item' };`;
    })();
    
    const dataZoomPatch = (function () {
      if (dataZoomMode === 'inside') return `option.dataZoom = [{ type: 'inside' }];`;
      if (dataZoomMode === 'slider') return `option.dataZoom = [{ type: 'slider' }];`;
      if (dataZoomMode === 'both') return `option.dataZoom = [{ type: 'inside' }, { type: 'slider' }];`;
      return '';
    })();
    
    return `(() => {
    function fetchSqlSync(sql){
      try{
        var xhr = new XMLHttpRequest();
        xhr.open('POST','/api/query/sql', false);
        xhr.setRequestHeader('Content-Type','application/json');
        xhr.send(JSON.stringify({stmt: sql}));
        if (xhr.status>=200 && xhr.status<300){
          var res = {};
          try { res = JSON.parse(xhr.responseText || '[]'); } catch { res = []; }
          var rows = Array.isArray(res) ? res : (res.data || []);
          return Array.isArray(rows) ? rows : [];
        }
      } catch(e){ /* ignore */ }
      return [];
    }
    
    // 数据预处理函数: box字段ID转name + 时间戳转换 + IAL解析
    function preprocessData(rows) {
      if (!rows || !rows.length) return rows;
      
      // 构建笔记本ID到name的映射表
      var notebooksMap = new Map();
      try {
        if (typeof window !== 'undefined' && window.siyuan && window.siyuan.notebooks) {
          window.siyuan.notebooks.forEach(function(nb) {
            notebooksMap.set(nb.id, nb.name);
          });
        }
      } catch(e) { console.warn('加载笔记本列表失败:', e); }
      
      // 时间戳转换函数
      function convertTimestamp(timestamp) {
        if (!timestamp) return timestamp;
        var ts = String(timestamp);
        
        // 验证格式: 14位数字 YYYYMMDDHHMMSS
        if (!/^\\d{14}$/.test(ts)) return ts;
        
        try {
          var year = ts.substring(0, 4);
          var month = ts.substring(4, 6);
          var day = ts.substring(6, 8);
          var hour = ts.substring(8, 10);
          var minute = ts.substring(10, 12);
          var second = ts.substring(12, 14);
          
          // 返回标准格式: 2025-09-30 23:02:10
          return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
        } catch(e) {
          return ts;
        }
      }
      
      // IAL解析函数
      function parseIAL(ial) {
        if (!ial || typeof ial !== 'string') return {};
        
        try {
          var content = ial.trim();
          if (content.startsWith('{:')) content = content.substring(2);
          if (content.endsWith('}')) content = content.substring(0, content.length - 1);
          content = content.trim();
          
          var result = {};
          var regex = /(\\w[\\w-]*)\\s*=\\s*"([^"]*)"/g;
          var match;
          
          while ((match = regex.exec(content)) !== null) {
            result[match[1]] = match[2];
          }
          
          return result;
        } catch(e) {
          return {};
        }
      }
      
      // 第一步: 处理每一行数据
      var processedRows = rows.map(function(row) {
        if (!row) return row;
        var processedRow = Object.assign({}, row);
        
        // 转换box字段
        if (processedRow.box && notebooksMap.has(processedRow.box)) {
          processedRow.box = notebooksMap.get(processedRow.box);
        }
        
        // 转换时间戳字段
        if (processedRow.created) {
          processedRow.created = convertTimestamp(processedRow.created);
        }
        if (processedRow.updated) {
          processedRow.updated = convertTimestamp(processedRow.updated);
        }
        
        // 解析IAL字段
        if (processedRow.ial) {
          var ialParsed = parseIAL(processedRow.ial);
          
          // 将IAL属性添加为新字段 (ial_ 前缀)
          Object.keys(ialParsed).forEach(function(key) {
            var fieldName = 'ial_' + key;
            var value = ialParsed[key];
            
            // 如果是时间戳格式,也进行转换
            if (/^\\d{14}$/.test(value)) {
              processedRow[fieldName] = convertTimestamp(value);
            } else {
              processedRow[fieldName] = value;
            }
          });
          
          // 转为JSON字符串避免显示[object Object]
          processedRow.ial_parsed = JSON.stringify(ialParsed);
          processedRow.ial_keys = Object.keys(ialParsed).join(', ');
        }
        
        return processedRow;
      });
      
      // 第二步: 收集所有IAL字段并填充默认值
      var allIALKeys = [];
      processedRows.forEach(function(row) {
        Object.keys(row).forEach(function(key) {
          if (key.indexOf('ial_') === 0 && key !== 'ial_parsed' && key !== 'ial_keys') {
            if (allIALKeys.indexOf(key) === -1) {
              allIALKeys.push(key);
            }
          }
        });
      });
      
      // 为每一行填充缺失的IAL字段,默认值为 "无"
      if (allIALKeys.length > 0) {
        processedRows.forEach(function(row) {
          allIALKeys.forEach(function(key) {
            if (!(key in row)) {
              row[key] = '无';
            }
          });
        });
      }
      
      return processedRows;
    }
    
    const option = {};
    var rawRows = fetchSqlSync(${JSON.stringify(sql)});
    const rows = preprocessData(rawRows);
    
    // 🔍 调试输出: 打印SQL查询结果和预处理结果
    console.group('🔍 ECharts SQL数据调试');
    console.log('📦 SQL原始查询结果:', rawRows);
    console.log('🔧 预处理后的数据:', rows);
    console.log('📊 数据行数:', rows.length);
    if (rows.length > 0) {
      console.log('📄 原始第一条数据:', rawRows[0]);
      console.log('📄 预处理后第一条数据:', rows[0]);
      console.log('🔑 可用字段:', Object.keys(rows[0] || {}));
      
      // 显示box字段转换情况
      if (rawRows[0] && rawRows[0].box && rows[0] && rows[0].box && rawRows[0].box !== rows[0].box) {
        console.log('🔄 box字段转换: "' + rawRows[0].box + '" -> "' + rows[0].box + '"');
      }
    }
    
    // 计算 X轴 数据
    const xAxisData = (${xExpr});
    console.log('📐 X轴表达式:', ${JSON.stringify(xExpr)});
    console.log('📐 X轴数据结果:', xAxisData);
    console.log('📐 X轴数据类型:', typeof xAxisData, Array.isArray(xAxisData) ? '(Array)' : '');
    console.log('📐 X轴数据长度:', Array.isArray(xAxisData) ? xAxisData.length : 'N/A');
    if (Array.isArray(xAxisData) && xAxisData.length > 0) {
      console.log('📐 X轴前5项:', xAxisData.slice(0, 5));
    }
    
    option.title = { text: ${JSON.stringify(title)} };
    option.backgroundColor = 'transparent';
    ${tooltipPatch}
    option.legend = { data: ${legendArr} };
    ${!isAllPie ? `
    option.xAxis = [{ type: 'category', boundaryGap: false, data: xAxisData, axisTick: { show:false }, axisLine: { show:false } }];
    option.yAxis = [{ type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { show: ${splitTypeShow}, lineStyle: { color: 'rgba(0, 0, 0, .38)', type: '${splitLineStyleType}' } } }${needDualAxis ? ", { type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { show:false } }" : ''}];
    ` : ''}
    option.series = [${seriesJs}];
    
    // 🔍 调试输出: 打印系列数据
    console.log('📈 系列配置:', option.series);
    if (option.series && option.series.length > 0) {
      option.series.forEach(function(s, idx) {
        console.log('📈 系列 #' + idx + ' [' + s.name + ']:', {
          type: s.type,
          data: s.data,
          dataLength: Array.isArray(s.data) ? s.data.length : 'N/A',
          firstItems: Array.isArray(s.data) ? s.data.slice(0, 5) : s.data
        });
      });
    }
    console.groupEnd();
    
    ${dataZoomPatch}
    ${Array.isArray(this.colors) && this.colors.length ? `
    try{ (option.series||[]).forEach(function(s, i){ if (s && s.type === 'pie') return; s.itemStyle = s.itemStyle || {}; s.itemStyle.color = ${JSON.stringify(this.colors)}[i] || s.itemStyle.color; }); }catch(e){}
    ` : ''}
    ${(Array.isArray(this.colors) && this.colors.length && pieCount > 0) ? `
    try{ option.color = ${JSON.stringify(this.colors)}; }catch(e){}
    ` : ''}
    option.animation = false;
    return option;
  })()`;
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
    const iife = this.getIIFE().replace('option.animation = false;', 'option.animation = true;');
    const block = '```echarts\n' + iife + '\n```';
    this.copyText(block, '已复制');
  }

  private renderTypeSettingsUI(target?: HTMLElement) {
    // 与 query-ui 相同的实现,这里省略以节省空间
    // 实际使用时需要完整复制 renderTypeSettingsUI 的实现
  }

  private setDeepSetting(path: string, value: any) {
    // 与 query-ui 相同的实现
  }

  private getChartSettingsForTemplate() {
    if (this.chartType === 'pie') {
      return { pie: this.perTypeSettings.pie, common: this.commonSettings } as any;
    }
    return {
      bar: this.perTypeSettings.bar,
      line: this.perTypeSettings.line,
      common: this.commonSettings,
      stat: this.statInteractions
    } as any;
  }

  private copyText(text: string, okMsg: string) {
    (async () => {
      try { 
        await navigator.clipboard.writeText(text); 
        this.toast(okMsg); 
      } catch {
        const ta = document.createElement('textarea'); 
        ta.value = text; 
        document.body.appendChild(ta); 
        ta.select(); 
        document.execCommand('copy'); 
        document.body.removeChild(ta); 
        this.toast(okMsg);
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

  // 加载 SQL 预设到下拉框
  private async loadPresetsToUI() {
    console.log('[SQL预设] 开始加载预设');
    if (!this.opts?.loadSqlPresets) {
      console.warn('[SQL预设] loadSqlPresets 未提供');
      return;
    }
    if (!this.presetSelectEl) {
      console.warn('[SQL预设] presetSelectEl 未找到');
      return;
    }
    try {
      console.log('[SQL预设] 调用 loadSqlPresets()');
      const result = this.opts.loadSqlPresets();
      const presetsData = (result instanceof Promise) ? await result : result;
      this.presets = presetsData || {};
      console.log('[SQL预设] 加载到的预设数据:', this.presets);
      
      // 清空并重新填充下拉框
      while (this.presetSelectEl.options.length > 1) {
        this.presetSelectEl.remove(1);
      }
      
      const keys = Object.keys(this.presets);
      console.log('[SQL预设] 预设数量:', keys.length);
      if (keys.length === 0) {
        console.warn('[SQL预设] 没有可用的预设');
        return;
      }
      
      for (const key of keys) {
        const preset = this.presets[key];
        const name = preset.name || key;
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = name;
        this.presetSelectEl.appendChild(opt);
        console.log('[SQL预设] 添加预设选项:', { key, name, sql: preset.sql || preset.source?.sql });
      }
      console.log('[SQL预设] 预设加载完成');
    } catch (err) {
      console.error('[SQL预设] 加载失败:', err);
    }
  }

  private save() {
    try {
      const data = {
        title: this.titleInput?.value || '',
        sql: this.sql,
        xExpr: this.xExprTextarea?.value || '',
        series: this.series,
        chartType: this.chartType,
        chartSettings: { ...this.perTypeSettings, common: this.commonSettings, stat: this.statInteractions },
        colors: this.colors.join(','),
        visual: { xKey: this.xKey, sort: this.sort, merge: this.mergeMode, bucket: this.xBucket },
        fold: { common: this.foldCommon, stat: this.foldStat, pie: this.foldPie },
        sqlMode: this.sqlMode,
        multiSqlPresets: this.multiSqlPresets,
      };
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(this.key); 
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj) return;
      if (this.titleInput) this.titleInput.value = obj.title || '';
      this.sql = obj.sql || '';
      if (this.sqlTextarea) this.sqlTextarea.value = this.sql;
      if (this.xExprTextarea) this.xExprTextarea.value = obj.xExpr || '';
      this.series = Array.isArray(obj.series) ? obj.series : [];
      
      if (obj.chartType) {
        this.chartType = (obj.chartType === 'pie') ? 'pie' : 'stat';
      }
      
      // 恢复SQL模式
      if (obj.sqlMode) {
        this.sqlMode = obj.sqlMode;
        if (this.sqlModeSwitchEl) this.sqlModeSwitchEl.value = this.sqlMode;
        const singleMode = this.root.querySelector('[data-single-sql-mode]') as HTMLElement | null;
        const multiMode = this.root.querySelector('[data-multi-sql-mode]') as HTMLElement | null;
        if (this.sqlMode === 'single') {
          if (singleMode) singleMode.style.display = '';
          if (multiMode) multiMode.style.display = 'none';
        } else {
          if (singleMode) singleMode.style.display = 'none';
          if (multiMode) multiMode.style.display = '';
        }
      }
      
      // 恢复多SQL预设
      if (obj.multiSqlPresets && Array.isArray(obj.multiSqlPresets)) {
        this.multiSqlPresets = obj.multiSqlPresets;
        this.renderMultiSqlPresetsList();
      }
      
      if (obj.chartSettings) {
        // 恢复设置(简化版)
        const merged = { ...this.perTypeSettings } as any;
        if (obj.chartSettings.bar) merged.bar = { ...merged.bar, ...obj.chartSettings.bar };
        if (obj.chartSettings.line) merged.line = { ...merged.line, ...obj.chartSettings.line };
        if (obj.chartSettings.pie) merged.pie = { ...merged.pie, ...obj.chartSettings.pie };
        this.perTypeSettings = merged;
        
        if (obj.chartSettings.common) {
          this.commonSettings = obj.chartSettings.common;
        }
        
        if (obj.chartSettings.stat) {
          this.statInteractions = obj.chartSettings.stat;
        }
      }
      
      if (obj.fold && typeof obj.fold === 'object') {
        this.foldCommon = obj.fold.common === true;
        this.foldStat = obj.fold.stat === true;
        this.foldPie = obj.fold.pie === true;
      }
      
      const typeSel = this.root.querySelector('[data-chart-type]') as HTMLSelectElement | null; 
      if (typeSel) typeSel.value = this.chartType;
      
      if (obj.visual) {
        this.xKey = obj.visual.xKey || '';
        this.sort = obj.visual.sort || 'asc';
        this.mergeMode = obj.visual.merge !== false;
        this.xBucket = obj.visual.bucket || 'none';
        const st = this.root.querySelector('[data-sort]') as HTMLSelectElement | null; 
        if (st) st.value = this.sort;
        const bk = this.root.querySelector('[data-bucket]') as HTMLSelectElement | null; 
        if (bk) bk.value = this.xBucket;
        const mt = this.root.querySelector('[data-merge]') as HTMLInputElement | null; 
        if (mt) mt.checked = this.mergeMode;
      }
      
      this.colors = String(obj.colors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      this.renderPalette();
      this.renderSeriesList();
      this.applyTypeConstraints(this.root.querySelector('[data-merge]') as HTMLInputElement | null);
    } catch { /* ignore */ }
  }
}
