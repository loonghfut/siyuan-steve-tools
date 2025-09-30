import { buildIIFEFromAVCtx, EchartsAvTplCtx } from '../core/option-templates';
import { buildDbMappingExpressions, SeriesItem } from '../av_data/db-data-mapping';
import { getallavids } from '../../../api/api3';
import { AVManager } from '../../../api/db_pro';
import { getFieldNamesForUI } from '../av_data/av-response-mapping';

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
  private xExprTextarea!: HTMLTextAreaElement;
  private seriesListEl!: HTMLElement;
  private paletteEl!: HTMLElement;
  private codePre!: HTMLPreElement;
  private chartTypeSel?: HTMLSelectElement;
  private typeSettingsEl?: HTMLElement;
  // 新增：数据库/视图下拉与数据缓存

  private viewSelEl?: HTMLSelectElement;
  // 新：组合框（单一输入 + 下拉）
  private dbComboInput?: HTMLInputElement;
  private dbComboList?: HTMLElement;
  private dbMirrorEl?: HTMLSpanElement;
  private avList: Array<{ id: string; name: string }> = [];
  private avManager = new AVManager('');
  private selectedAvID: string = '';
  private selectedViewID: string = '';
  private selectedViewName: string = '';
  private showDbId: boolean = false; // 开关：切换 DB 下拉显示名称或 avID
  private showDbNameAndViewName: boolean = false; // 开关：是否在标题下面显示数据库名称和视图名称
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
  // 设置面板折叠状态（持久化）
  private foldCommon: boolean = false;
  private foldStat: boolean = false;
  private foldPie: boolean = false;

  // 统一图表设置（与预设模式保持一致）
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

  // 可视化映射状态（默认启用且无开关）
  private visualMode = true;
  private keys: string[] = [];
  private xKey: string = '';
  private sort: 'none' | 'asc' | 'desc' = 'asc';
  private xBucket: 'none' | 'year' | 'month' | 'day' | 'hour' = 'none';
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
    const dbName = this.avList.find(x => x.id === this.selectedAvID)?.name || this.selectedAvID;
    const viewName = this.selectedViewName || (this.selectedViewID ? this.selectedViewID : '默认视图');
    const ctx: EchartsAvTplCtx = {
      avID: this.selectedAvID || '',
      // 传递 viewID
      viewID: this.selectedViewID || '',
      dbName: dbName,
      viewName: viewName,
      showDbNameAndViewName: this.showDbNameAndViewName,
      title: this.titleInput?.value || '',
      xDataExpr: this.xExprTextarea?.value || 'rows.map((_, i) => String(i+1))',
      seriesExprs: this.series.map(s => ({ name: s.name, expr: s.expr, type: (this.chartType === 'pie' ? 'pie' : (s.type || 'line')), axisIndex: s.axisIndex })),
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
            <div class="veq-group__title">数据库查询参数（AV API）
              <div class="veq-inline" style="gap:8px; align-items:center;">
                <span style="font-weight: normal; color: var(--b3-theme-on-surface);">显示 avID</span>
                <label class="veq-switch"><input type="checkbox" data-db-showid/><i></i></label>
              </div>
            </div>
            <div class="veq-grid" style="grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">
              <label class="veq-field">
                <div class="veq-field__caption">
                  <span>数据库</span>
                  <span class="popover__block veq-db-mirror" data-db-mirror data-popover-url="/api/av/getMirrorDatabaseBlocks" style="display:none;">未命名</span>
                </div>
                <div class="veq-combo-wrap">
                  <input class="vsb-input" data-dbcombo placeholder="选择或搜索数据库" autocomplete="off" />
                  <div class="veq-combo-list" data-dbcombo-popup style="display:none;"></div>
                </div>
              </label>
              <label class="veq-field">视图
                <select class="veq-input" data-viewsel disabled>
                  <option value="">请选择数据库</option>
                </select>
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
          <pre class="veq-output" data-code data-output></pre>
        </details>
      </div>
    `;

  this.titleInput = this.root.querySelector('[data-title]') as HTMLInputElement;
    // 新增：下拉框句柄
    this.viewSelEl = this.root.querySelector('[data-viewsel]') as HTMLSelectElement | undefined || undefined;
    this.dbComboInput = this.root.querySelector('[data-dbcombo]') as HTMLInputElement | undefined || undefined;
  this.dbComboList = undefined; // 不再使用 datalist
  const popup = this.root.querySelector('[data-dbcombo-popup]') as HTMLElement | null;
  (this as any).dbComboPopup = popup || undefined;
  this.dbMirrorEl = this.root.querySelector('[data-db-mirror]') as HTMLSpanElement | null || undefined;
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

    // 事件
    this.titleInput.addEventListener('input', () => this.onChanged());
    // 组合框：输入/聚焦/选择
    if (this.dbComboInput) { 
      this.dbComboInput.addEventListener('input', () => { this.updateDbComboList(); this.openDbComboPopup(); });
      this.dbComboInput.addEventListener('focus', () => { this.updateDbComboList(); this.openDbComboPopup(); });
      this.dbComboInput.addEventListener('click', () => { this.updateDbComboList(); this.openDbComboPopup(); });
      this.dbComboInput.addEventListener('change', async () => {
        const v = (this.dbComboInput as HTMLInputElement).value.trim();
        if (!v) { this.selectedAvID = ''; this.selectedViewID = ''; this.setDbComboDisplayBySelection(); this.onChanged(); await this.populateViewsFor(''); return; }
        if (!this.avList.length) { // 列表尚未加载，尝试加载一次
          await this.initDbList();
        }
        // 支持按显示名或 id 以及 datalist 的 label 反向匹配
        const cand = this.avList.find(x => x.id === v) || this.avList.find(x => x.name === v) || this.avList.find(x => (this.showDbId ? x.name : x.id) === v);
        if (cand) {
          this.selectedAvID = cand.id;
          this.selectedViewID = '';
          this.setDbComboDisplayBySelection();
          this.onChanged();
          await this.populateViewsFor(cand.id);
        } else if (!this.avList.length && this.dbComboList) {
          // 仍未有列表，提示
          this.dbComboList.innerHTML = '<option value="未加载到数据库"></option>';
        }
      });
      // blur 时稍延迟关闭，允许点击 popup 项
      this.dbComboInput.addEventListener('blur', () => setTimeout(()=> this.closeDbComboPopup(), 150));
    }
    // popup 选择
    const popupEl = (this as any).dbComboPopup as HTMLElement | undefined;
    if (popupEl) {
      popupEl.addEventListener('mousedown', (e)=> e.preventDefault()); // 保持输入框焦点
      popupEl.addEventListener('click', async (e)=>{
        const item = (e.target as HTMLElement).closest('.veq-combo-item') as HTMLElement | null;
        if (!item) return;
        const avID = item.getAttribute('data-id') || '';
        this.selectedAvID = avID;
        this.selectedViewID = '';
        this.setDbComboDisplayBySelection();
        this.onChanged();
        await this.populateViewsFor(avID);
        this.closeDbComboPopup();
      });
    }
    if (this.viewSelEl) this.viewSelEl.addEventListener('change', (e) => {
      const viewID = (e.target as HTMLSelectElement).value || '';
      this.selectedViewID = viewID;
      // 设置视图名称
      const views = Array.from((e.target as HTMLSelectElement).options).map(opt => ({ id: opt.value, name: opt.textContent || '' }));
      this.selectedViewName = views.find(v => v.id === viewID)?.name || '';
      this.onChanged();
      this.loadKeys();
    });
    // 显示 avID 开关
    const showIdSwitch = this.root.querySelector('[data-db-showid]') as HTMLInputElement | null;
    if (showIdSwitch) {
      showIdSwitch.addEventListener('change', (e) => {
        this.showDbId = (e.target as HTMLInputElement).checked;
        // 更新组合框展示文本与下拉列表
        this.setDbComboDisplayBySelection();
        this.updateDbComboList();
        this.save();
      });
    }
    if (this.xExprTextarea) this.xExprTextarea.addEventListener('input', () => this.onChanged());
    // 默认可视化映射：visualRow 常显，表达式行隐藏
    visualRow.style.display = '';
    exprRow.style.display = 'none';
    if (xkeySel) xkeySel.addEventListener('change', (e) => { this.xKey = (e.target as HTMLSelectElement).value; this.onChanged(); });
    if (sortSel) sortSel.addEventListener('change', (e) => { this.sort = (e.target as HTMLSelectElement).value as any; this.onChanged(); });
  if (bucketSel) bucketSel.addEventListener('change', (e) => { this.xBucket = (e.target as HTMLSelectElement).value as any; if (this.xBucket !== 'none') { this.mergeMode = true; this.series = this.series.map(s => ({ ...s, agg: s.agg === 'raw' ? 'count' : (s.agg || 'count') })); const mt = this.root.querySelector('[data-merge]') as HTMLInputElement | null; if (mt) mt.checked = true; this.renderSeriesList(); } this.onChanged(); });
    if (mergeToggle) mergeToggle.addEventListener('change', (e) => {
      this.mergeMode = (e.target as HTMLInputElement).checked;
      // 模式切换时，修正系列聚合：非合并模式强制原值；合并模式下如为 raw 则改为 count
      this.series = this.series.map(s => ({
        ...s,
        agg: this.mergeMode ? (s.agg === 'raw' ? 'count' : (s.agg || 'count')) : 'raw'
      }));
      this.renderSeriesList();
      this.onChanged();
    });
    if (chartTypeSel) chartTypeSel.addEventListener('change', (e) => {
      this.chartType = (e.target as HTMLSelectElement).value as any;
      // 切换图表类型：
      // - 若切到饼图：所有系列强制为 pie
      // - 若切到统计图：仅将原 pie 系列转换为默认统计类型（line），保留现有 line/bar/scatter 混合
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

    // 初始时根据图表类型约束一次
    this.applyTypeConstraints(mergeToggle);
    (this.root.querySelector('[data-add-series]') as HTMLButtonElement).addEventListener('click', () => {
      const defType = this.chartType === 'pie' ? 'pie' : 'line';
      this.series.push({ name: '系列' + (this.series.length + 1), expr: 'rows.map(r => r.value)', type: defType as any, axisIndex: 0 });
      this.renderSeriesList(); this.onChanged();
    });
    // 统一类型设置面板负责处理细节
    // 无调试设置
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
    // 初始化加载数据库列表
    this.initDbList();
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
      const typeOptions = ((): Array<{ v: string; t: string }> => {
        if (this.chartType === 'pie') return [{ v: 'pie', t: '饼图' }];
        return [
          { v: 'line', t: '折线' },
          { v: 'bar', t: '柱状' },
          { v: 'scatter', t: '散点' }
        ];
      })();
      // 如果当前 series 类型不在允许列表中，优先设置为当前图表类型（若可选），否则为列表第一个
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
      const avID = this.selectedAvID || '';
      const viewID = this.selectedViewID || '';
      if (!avID) { this.toast('请先选择数据库'); this.loadingKeys = false; if (btn) { btn.disabled = false; const old = btn.getAttribute('data-old-text'); if (old != null) btn.textContent = old; } return; }
      const payload: any = { id: avID };
      if (viewID) payload.viewID = viewID;

      fetch('/api/av/renderAttributeView', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(async r => {
          const raw = await r.text();
          if (!raw || raw.trim() === '') throw new Error('响应为空');
          let res: any;
          try { res = JSON.parse(raw); } catch (e: any) { throw new Error('JSON 解析失败: ' + (e?.message || e)); }
          if (!res || res.code !== 0) throw new Error(res?.msg || '加载失败');
          // 使用通用解析器以兼容新旧格式
          this.keys = getFieldNamesForUI(res);

          // 渲染 X 轴字段下拉
          const xSel = this.root.querySelector('[data-xkey]') as HTMLSelectElement | null;
          if (xSel) {
            xSel.innerHTML = this.keys.map(k => `<option value="${this.escape(k)}" ${this.xKey === k ? 'selected' : ''}>${this.escape(k)}</option>`).join('');
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
        .catch(e => { this.toast('加载字段失败'); console.error('加载字段失败：', e); })
        .then(() => {
          // 收尾：恢复按钮与状态
          this.loadingKeys = false;
          if (btn) { btn.disabled = false; const old = btn.getAttribute('data-old-text'); if (old != null) btn.textContent = old; }
        });
    } catch (e) {
      this.toast('加载字段失败');
      console.error(e);
      this.loadingKeys = false;
      if (btn) { btn.disabled = false; const old = btn.getAttribute('data-old-text'); if (old != null) btn.textContent = old; }
    }
  }

  // 根据可视化选择自动生成表达式
  private autoBuildExpr() {
    if (!this.visualMode) return;
    const { xExpr, series } = buildDbMappingExpressions({
      visualMode: this.visualMode,
      mergeMode: this.mergeMode,
      sort: this.sort,
      xKey: this.xKey,
      bucket: this.xBucket,
      series: this.series,
    });
    if (this.xExprTextarea && xExpr) this.xExprTextarea.value = xExpr;
    this.series = series;
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
      const idx = Number((chip as HTMLElement).getAttribute('data-idx') || '0');
      const picker = chip.querySelector('input[type="color"]') as HTMLInputElement | null;
      const del = chip.querySelector('.veq-color-del') as HTMLButtonElement | null;
      const swatch = chip.querySelector('.veq-color-swatch') as HTMLElement | null;
      if (picker) picker.addEventListener('input', () => { this.colors[idx] = picker.value; if (swatch) swatch.style.background = picker.value; this.onChanged(); });
      if (del) del.addEventListener('click', () => { this.colors.splice(idx, 1); this.renderPalette(); this.onChanged(); });
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
    const iife = this.getIIFE().replace('option.animation = false;', 'option.animation = true;');
    const block = '```echarts\n' + iife + '\n```';
    this.copyText(block, '已复制');
  }

  // 对外 API：用于父容器同步视图设置和标题/颜色
  public setViewSettings(type: 'bar' | 'line' | 'pie', settings: any) {
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

  public getViewSettings(): { type: 'bar' | 'line' | 'pie', settings: any } {
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
        avID: this.selectedAvID || '',
        viewID: this.selectedViewID || '',
        xExpr: this.xExprTextarea?.value || '',
        series: this.series,
        chartType: this.chartType,
  chartSettings: { ...this.perTypeSettings, common: this.commonSettings, stat: this.statInteractions },
        colors: this.colors.join(','),
        visual: { xKey: this.xKey, sort: this.sort, merge: this.mergeMode, bucket: this.xBucket },
        fold: { common: this.foldCommon, stat: this.foldStat, pie: this.foldPie },
        db: { showId: this.showDbId },
        showDbNameAndViewName: this.showDbNameAndViewName
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
      // 恢复到内部状态
      this.selectedAvID = obj.avID || '';
      this.selectedViewID = obj.viewID || '';
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
        const { common, stat, ...rest } = obj.chartSettings || {};
        const merged = { ...this.perTypeSettings } as any;
        if (rest && typeof rest === 'object') {
          if (rest.bar && typeof rest.bar === 'object') merged.bar = { ...merged.bar, ...rest.bar };
          if (rest.line && typeof rest.line === 'object') merged.line = { ...merged.line, ...rest.line };
          if (rest.pie && typeof rest.pie === 'object') merged.pie = { ...merged.pie, ...rest.pie };
          // 兼容旧平铺属性（如 stack / smooth 等）
          const flatTargets: Array<[string, 'line' | 'bar']> = [
            ['stack', 'bar'],
            ['boundaryGap', 'line'],
            ['boundaryGap', 'bar'],
            ['xLabelRotate', 'line'],
            ['xLabelRotate', 'bar'],
            ['label', 'line'],
            ['label', 'bar'],
            ['smooth', 'line'],
            ['area', 'line'],
          ];
          flatTargets.forEach(([prop, target]) => {
            if (prop in rest && rest[prop] !== undefined) {
              merged[target] = { ...merged[target], [prop]: rest[prop] };
            }
          });
        }
        // 补全默认值，保障新增字段回落
        merged.line = {
          ...merged.line,
          symbol: (typeof merged.line.symbol === 'string' && merged.line.symbol) ? merged.line.symbol : 'circle',
          symbolSize: Number.isFinite(merged.line.symbolSize) ? merged.line.symbolSize : 8,
          lineWidth: Number.isFinite(merged.line.lineWidth) ? merged.line.lineWidth : 2,
          area: merged.line.area === true,
        };
        merged.bar = {
          ...merged.bar,
          barWidth: (typeof merged.bar.barWidth === 'number' && merged.bar.barWidth > 0) ? merged.bar.barWidth : null,
          barGap: (() => {
            const raw = merged.bar.barGap;
            if (typeof raw === 'string' && raw.trim().length) return raw;
            if (typeof raw === 'number' && Number.isFinite(raw)) return `${raw}%`;
            return '30%';
          })(),
        };
        merged.pie = { ...merged.pie };
        this.perTypeSettings = merged;
        // 恢复通用设置
        if (common && typeof common === 'object') {
          this.commonSettings = {
            legendPos: (common.legendPos === 'bottom' || common.legendPos === 'left' || common.legendPos === 'right') ? common.legendPos : 'top',
            grid: {
              top: Number(common.grid?.top ?? 50),
              right: Number(common.grid?.right ?? 10),
              bottom: Number(common.grid?.bottom ?? 24),
              left: Number(common.grid?.left ?? 10)
            },
            title: {
              textAlign: (common.title?.textAlign === 'left' || common.title?.textAlign === 'right') ? common.title.textAlign : 'center',
              textVerticalAlign: (common.title?.textVerticalAlign === 'middle' || common.title?.textVerticalAlign === 'bottom') ? common.title.textVerticalAlign : 'top'
            }
          };
        } else {
          this.commonSettings = {
            legendPos: 'top',
            grid: { top: 50, right: 10, bottom: 24, left: 10 },
            title: {
              textAlign: 'center',
              textVerticalAlign: 'top'
            }
          };
        }
        // 恢复统计图交互设置（向下兼容原 common 存储）
        const statObj = (stat && typeof stat === 'object') ? stat : {};
        const axisPointerCandidate = statObj.axisPointerType ?? (common as any)?.axisPointerType;
        const dataZoomCandidate = statObj.dataZoom ?? (common as any)?.dataZoom;
        const tooltipCandidate = statObj.tooltipTrigger ?? (common as any)?.tooltipTrigger;
        const ySplitCandidate = statObj.ySplitLine ?? (common as any)?.ySplitLine;
        this.statInteractions = {
          tooltipTrigger: (tooltipCandidate === 'item') ? 'item' : 'axis',
          axisPointerType: (axisPointerCandidate === 'shadow' || axisPointerCandidate === 'cross' || axisPointerCandidate === 'none') ? axisPointerCandidate : 'line',
          dataZoom: (dataZoomCandidate === 'inside' || dataZoomCandidate === 'slider' || dataZoomCandidate === 'both') ? dataZoomCandidate : 'none',
          ySplitLine: (ySplitCandidate === 'solid' || ySplitCandidate === 'none') ? ySplitCandidate : 'dashed'
        };
        if (this.chartType === 'pie' && this.statInteractions.tooltipTrigger !== 'item') {
          this.statInteractions.tooltipTrigger = 'item';
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
        this.xBucket = (obj.visual.bucket === 'year' || obj.visual.bucket === 'month' || obj.visual.bucket === 'day' || obj.visual.bucket === 'hour') ? obj.visual.bucket : 'none';
        if (this.xBucket !== 'none') {
          this.mergeMode = true;
          this.series = this.series.map(s => ({ ...s, agg: s.agg === 'raw' ? 'count' : (s.agg || 'count') }));
        }
        const st = this.root.querySelector('[data-sort]') as HTMLSelectElement | null; if (st) st.value = this.sort;
        const bk = this.root.querySelector('[data-bucket]') as HTMLSelectElement | null; if (bk) bk.value = this.xBucket;
        const mt = this.root.querySelector('[data-merge]') as HTMLInputElement | null; if (mt) mt.checked = this.mergeMode;
      }
      // 已移除调试设置恢复
      this.colors = String(obj.colors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      this.renderPalette();
      this.renderSeriesList();
      this.applyTypeConstraints(this.root.querySelector('[data-merge]') as HTMLInputElement | null);
      // 刷新类型设置面板（仅刷新内容区域 body，避免替换 details 结构）
      this.renderTypeSettingsUI(this.root.querySelector('[data-type-settings-body]') as HTMLElement | null || undefined);
      // 恢复显示 avID 开关
      if (obj.db && typeof obj.db === 'object') {
        this.showDbId = !!obj.db.showId;
        const showIdSwitch = this.root.querySelector('[data-db-showid]') as HTMLInputElement | null;
        if (showIdSwitch) showIdSwitch.checked = this.showDbId;
      }
      // 恢复显示数据来源开关
      this.showDbNameAndViewName = !!obj.showDbNameAndViewName;
      // 同步下拉框并自动加载字段
      this.syncSelectorsWithInputs();
      this.loadKeys();
    } catch { /* ignore */ }
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
        <div class="veq-grid-responsive">
          <div class="veq-field">
            <div class="veq-label">图例位置</div>
            <select class="veq-input" data-set="common.legendPos" style="width:auto;">
              <option value="top" ${cs.legendPos === 'top' ? 'selected' : ''}>上</option>
              <option value="bottom" ${cs.legendPos === 'bottom' ? 'selected' : ''}>下</option>
              <option value="left" ${cs.legendPos === 'left' ? 'selected' : ''}>左</option>
              <option value="right" ${cs.legendPos === 'right' ? 'selected' : ''}>右</option>
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
          <div class="veq-field">
            <div class="veq-label">显示数据来源</div>
            <label class="veq-switch"><input type="checkbox" data-set="showDbNameAndViewName" ${this.showDbNameAndViewName ? 'checked' : ''}/><i></i></label>
          </div>
          
          <div class="veq-field">
            <div class="veq-label">标题水平位置</div>
            <select class="veq-input" data-set="common.title.textAlign" style="width:auto;">
              <option value="left" ${cs.title.textAlign === 'left' ? 'selected' : ''}>左对齐</option>
              <option value="center" ${cs.title.textAlign === 'center' ? 'selected' : ''}>居中</option>
              <option value="right" ${cs.title.textAlign === 'right' ? 'selected' : ''}>右对齐</option>
            </select>
          </div>
          
          <div class="veq-field">
            <div class="veq-label">标题垂直位置</div>
            <select class="veq-input" data-set="common.title.textVerticalAlign" style="width:auto;">
              <option value="top" ${cs.title.textVerticalAlign === 'top' ? 'selected' : ''}>顶部</option>
              <option value="middle" ${cs.title.textVerticalAlign === 'middle' ? 'selected' : ''}>中间</option>
              <option value="bottom" ${cs.title.textVerticalAlign === 'bottom' ? 'selected' : ''}>底部</option>
            </select>
          </div>
          

        </div>
      </details>`;
    if (t === 'stat') {
      const sb = this.perTypeSettings.bar;
      const sl = this.perTypeSettings.line;
      // 共享值：若两者不一致，优先取折线的值，其次取柱状；目标是通过该面板统一两者
      const sharedBoundaryGap = (typeof sl.boundaryGap === 'boolean') ? sl.boundaryGap : (typeof sb.boundaryGap === 'boolean' ? sb.boundaryGap : false);
      const sharedRotate = (typeof sl.xLabelRotate === 'number') ? (sl.xLabelRotate as number) : (typeof sb.xLabelRotate === 'number' ? (sb.xLabelRotate as number) : 0);
      const sharedLabelShow = !!(sl.label?.show || sb.label?.show);
      const sharedLabelPos = (sl.label?.position || sb.label?.position || 'top');
      const lineSymbol = (typeof sl.symbol === 'string' && sl.symbol) ? sl.symbol : 'circle';
      const lineSymbolSize = Number.isFinite(sl.symbolSize) ? Number(sl.symbolSize) : 8;
      const lineWidth = Number.isFinite((sl as any).lineWidth) ? Number((sl as any).lineWidth) : 2;
      const barWidthDisplay = (typeof sb.barWidth === 'number' && Number.isFinite(sb.barWidth) && sb.barWidth > 0) ? String(sb.barWidth) : '';
      const barGapRaw = (sb.barGap ?? '30%');
      const barGapNum = (typeof barGapRaw === 'string' && barGapRaw.trim().endsWith('%'))
        ? Math.max(0, Math.min(100, parseInt(barGapRaw, 10) || 0))
        : (typeof barGapRaw === 'number' ? Math.max(0, Math.min(100, barGapRaw)) : 30);
    const statInteract = this.statInteractions;
    const axisPointerType = statInteract.axisPointerType;
    const dataZoomMode = statInteract.dataZoom;
    const tooltipTrigger = statInteract.tooltipTrigger;
    const ySplitLine = statInteract.ySplitLine;
    const axisPointerDisabled = tooltipTrigger !== 'axis';
    const tooltipDisabled = this.chartType === 'pie';
      html += `
        <details class="veq-sub" data-fold-stat ${this.foldStat ? 'open' : ''}>
          <summary class="veq-legend">统计图设置（折线 / 柱状）</summary>
          <div class="veq-stat-groups">
            <div class="veq-stat-group">
              <div class="veq-stat-group__title">基础</div>
              <div class="veq-switch-grid">
                <label class="veq-switch-item"><span>折线平滑</span><label class="veq-switch"><input type="checkbox" data-set="line.smooth" ${sl.smooth ? 'checked' : ''}/><i></i></label></label>
                <label class="veq-switch-item"><span>柱状堆叠</span><label class="veq-switch"><input type="checkbox" data-set="bar.stack" ${sb.stack ? 'checked' : ''}/><i></i></label></label>
                <label class="veq-switch-item"><span>x 轴留白</span><label class="veq-switch"><input type="checkbox" data-set="stat.boundaryGap" ${sharedBoundaryGap ? 'checked' : ''}/><i></i></label></label>
                <label class="veq-switch-item"><span>面积填充</span><label class="veq-switch"><input type="checkbox" data-set="line.area" ${(sl as any).area ? 'checked' : ''}/><i></i></label></label>
              </div>
            </div>
            <div class="veq-stat-group">
              <div class="veq-stat-group__title">标签</div>
              <div class="veq-switch-grid">
                <label class="veq-switch-item"><span>显示标签</span><label class="veq-switch"><input type="checkbox" data-set="stat.label.show" ${sharedLabelShow ? 'checked' : ''}/><i></i></label></label>
              </div>
              <div class="veq-field" style="margin-top:6px;">
                <div class="veq-label">标签位置</div>
                <select class="veq-input" data-set="stat.label.position" style="width:160px">
                  <option value="top" ${sharedLabelPos === 'top' ? 'selected' : ''}>top</option>
                  <option value="bottom" ${sharedLabelPos === 'bottom' ? 'selected' : ''}>bottom</option>
                  <option value="left" ${sharedLabelPos === 'left' ? 'selected' : ''}>left</option>
                  <option value="right" ${sharedLabelPos === 'right' ? 'selected' : ''}>right</option>
                  <option value="inside" ${sharedLabelPos === 'inside' ? 'selected' : ''}>inside</option>
                  <option value="insideTop" ${sharedLabelPos === 'insideTop' ? 'selected' : ''}>insideTop</option>
                  <option value="insideBottom" ${sharedLabelPos === 'insideBottom' ? 'selected' : ''}>insideBottom</option>
                  <option value="insideLeft" ${sharedLabelPos === 'insideLeft' ? 'selected' : ''}>insideLeft</option>
                  <option value="insideRight" ${sharedLabelPos === 'insideRight' ? 'selected' : ''}>insideRight</option>
                </select>
              </div>
            </div>
            <div class="veq-stat-group">
              <div class="veq-stat-group__title">折线样式</div>
              <div class="veq-field">
                <div class="veq-label">节点形状</div>
                <select class="veq-input" data-set="line.symbol" style="width:160px">
                  ${['circle','rect','roundRect','triangle','diamond','pin','arrow','none'].map(sym => `<option value="${sym}" ${lineSymbol === sym ? 'selected' : ''}>${sym}</option>`).join('')}
                </select>
              </div>
              <label class="veq-field veq-field--range">节点大小
                <div class="veq-row" style="align-items:center; gap:8px;">
                  <input class="veq-input" type="range" min="2" max="24" step="1" data-set="line.symbolSize" data-unit="px" value="${lineSymbolSize}" />
                  <span class="veq-label">${lineSymbolSize}px</span>
                </div>
              </label>
              <label class="veq-field veq-field--range">线条粗细
                <div class="veq-row" style="align-items:center; gap:8px;">
                  <input class="veq-input" type="range" min="1" max="10" step="1" data-set="line.lineWidth" data-unit="px" value="${lineWidth}" />
                  <span class="veq-label">${lineWidth}px</span>
                </div>
              </label>
            </div>
            <div class="veq-stat-group">
              <div class="veq-stat-group__title">柱状样式</div>
              <label class="veq-field">柱宽(px)
                <input class="veq-input" type="number" min="0" step="2" data-set="bar.barWidth" data-allow-empty="true" placeholder="自动" value="${barWidthDisplay}" />
              </label>
              <label class="veq-field veq-field--range">柱间距(%)
                <div class="veq-row" style="align-items:center; gap:8px;">
                  <input class="veq-input" type="range" min="0" max="60" step="5" data-set="bar.barGap" data-unit="%" data-cast="percent" value="${barGapNum}" />
                  <span class="veq-label">${barGapNum}%</span>
                </div>
              </label>
            </div>
            <div class="veq-stat-group veq-stat-group--double-col">
              <div class="veq-stat-group__title">交互</div>
              <div class="veq-field">
                <div class="veq-label">提示框触发</div>
                <select class="veq-input" data-set="statExtras.tooltipTrigger" style="width:auto;" ${tooltipDisabled ? 'disabled' : ''}>
                  <option value="axis" ${tooltipTrigger === 'axis' ? 'selected' : ''}>轴对齐</option>
                  <option value="item" ${tooltipTrigger === 'item' ? 'selected' : ''}>数据项</option>
                </select>
              </div>
              <div class="veq-field">
                <div class="veq-label">轴指示器</div>
                <select class="veq-input" data-set="statExtras.axisPointerType" style="width:auto;" ${axisPointerDisabled ? 'disabled' : ''}>
                  <option value="line" ${axisPointerType === 'line' ? 'selected' : ''}>线</option>
                  <option value="shadow" ${axisPointerType === 'shadow' ? 'selected' : ''}>阴影</option>
                  <option value="cross" ${axisPointerType === 'cross' ? 'selected' : ''}>十字准星</option>
                  <option value="none" ${axisPointerType === 'none' ? 'selected' : ''}>关闭</option>
                </select>
              </div>
              <div class="veq-field">
                <div class="veq-label">数据缩放</div>
                <select class="veq-input" data-set="statExtras.dataZoom" style="width:auto;">
                  <option value="none" ${dataZoomMode === 'none' ? 'selected' : ''}>关闭</option>
                  <option value="inside" ${dataZoomMode === 'inside' ? 'selected' : ''}>内置</option>
                  <option value="slider" ${dataZoomMode === 'slider' ? 'selected' : ''}>滑块</option>
                  <option value="both" ${dataZoomMode === 'both' ? 'selected' : ''}>双控</option>
                </select>
              </div>
              <div class="veq-field">
                <div class="veq-label">Y 轴分割线</div>
                <select class="veq-input" data-set="statExtras.ySplitLine" style="width:auto;">
                  <option value="dashed" ${ySplitLine === 'dashed' ? 'selected' : ''}>虚线</option>
                  <option value="solid" ${ySplitLine === 'solid' ? 'selected' : ''}>实线</option>
                  <option value="none" ${ySplitLine === 'none' ? 'selected' : ''}>无</option>
                </select>
              </div>
            </div>
            <div class="veq-stat-group">
              <div class="veq-stat-group__title">轴 & 旋转</div>
              <label class="veq-field veq-field--range">x 轴标签旋转
                <div class="veq-row" style="align-items:center; gap:8px;">
                  <input class="veq-input" type="range" min="-90" max="90" step="5" data-set="stat.xLabelRotate" data-unit="deg" value="${sharedRotate}" />
                  <span class="veq-label">${sharedRotate}°</span>
                </div>
              </label>
              <label class="veq-field">X 轴名称
                <input class="veq-input" type="text" data-set="stat.xAxisName" placeholder="X 轴名称" value="${sl.xAxisName || sb.xAxisName || ''}" />
              </label>
              <label class="veq-field">Y 轴名称（左）
                <input class="veq-input" type="text" data-set="stat.yAxisLeftName" placeholder="Y 轴左侧名称" value="${sl.yAxisLeftName || sb.yAxisLeftName || ''}" />
              </label>
              <label class="veq-field">Y 轴名称（右）
                <input class="veq-input" type="text" data-set="stat.yAxisRightName" placeholder="Y 轴右侧名称" value="${sl.yAxisRightName || sb.yAxisRightName || ''}" />
              </label>
            </div>
          </div>
        </details>`;
    } else if (t === 'pie') {
      const s = this.perTypeSettings.pie;
      const labelPos = s.label?.position || 'outside';
      html += `
        <details class="veq-sub" data-fold-pie ${this.foldPie ? 'open' : ''}>
          <summary class="veq-legend">饼图设置</summary>
          <div class="veq-stat-groups" style="margin-top:10px;">
            <div class="veq-stat-group">
              <div class="veq-stat-group__title">半径</div>
              <label class="veq-field veq-field--range">内径(%)
                <div class="veq-row" style="align-items:center; gap:8px;">
                  <input class="veq-input" type="range" min="0" max="95" step="5" data-set="pie.innerRadius" data-unit="%" value="${s.innerRadius ?? 0}" />
                  <span class="veq-label">${s.innerRadius ?? 0}%</span>
                </div>
              </label>
              <label class="veq-field veq-field--range">外径(%)
                <div class="veq-row" style="align-items:center; gap:8px;">
                  <input class="veq-input" type="range" min="5" max="100" step="5" data-set="pie.outerRadius" data-unit="%" value="${s.outerRadius ?? 70}" />
                  <span class="veq-label">${s.outerRadius ?? 70}%</span>
                </div>
              </label>
            </div>
            <div class="veq-stat-group">
              <div class="veq-stat-group__title">形态</div>
              <div class="veq-field">
                <div class="veq-label">玫瑰图 roseType</div>
                <select class="veq-input" data-set="pie.roseType" style="width:auto;">
                  <option value="false" ${!s.roseType ? 'selected' : ''}>无</option>
                  <option value="radius" ${s.roseType === 'radius' ? 'selected' : ''}>radius</option>
                  <option value="area" ${s.roseType === 'area' ? 'selected' : ''}>area</option>
                </select>
              </div>
            </div>
            <div class="veq-stat-group">
              <div class="veq-stat-group__title">标签</div>
              <div class="veq-switch-grid">
                <label class="veq-switch-item"><span>显示标签</span><label class="veq-switch"><input type="checkbox" data-set="pie.label.show" ${s.label?.show ? 'checked' : ''}/><i></i></label></label>
              </div>
              <div class="veq-field" style="margin-top:6px;">
                <div class="veq-label">标签位置</div>
                <select class="veq-input" data-set="pie.label.position" style="width:auto;">
                  <option value="outside" ${labelPos === 'outside' ? 'selected' : ''}>outside</option>
                  <option value="inside" ${labelPos === 'inside' ? 'selected' : ''}>inside</option>
                  <option value="center" ${labelPos === 'center' ? 'selected' : ''}>center</option>
                </select>
              </div>
            </div>
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
        const updateValue = () => {
          const raw = elm.value;
          if (elm.dataset.allowEmpty === 'true' && raw.trim() === '') {
            this.setDeepSetting(key, undefined);
            this.onChanged();
            return;
          }
          let v: any;
          if (elm.dataset.cast === 'percent') {
            const num = Number(raw);
            if (!Number.isFinite(num)) return;
            v = `${num}%`;
          } else if (elm.type === 'number' || elm.type === 'range') {
            const num = Number(raw);
            if (!Number.isFinite(num)) return;
            v = num;
          } else {
            v = raw;
          }
          const labelSpan = elm.parentElement?.querySelector('.veq-label') as HTMLElement | null;
          if (labelSpan) {
            const unit = elm.dataset.unit;
            const numeric = Number(raw);
            const hasNumeric = Number.isFinite(numeric);
            if (unit === '%') {
              labelSpan.textContent = hasNumeric ? `${numeric}%` : `${raw}%`;
            } else if (unit === 'px') {
              labelSpan.textContent = hasNumeric ? `${numeric}px` : `${raw}px`;
            } else if (unit === 'deg') {
              labelSpan.textContent = hasNumeric ? `${numeric}°` : `${raw}°`;
            } else if (key.includes('Radius')) {
              labelSpan.textContent = `${v}%`;
            } else if (typeof v === 'number') {
              labelSpan.textContent = `${v}°`;
            } else {
              labelSpan.textContent = String(v ?? '');
            }
          }
          this.setDeepSetting(key, v);
          this.onChanged();
        };
        elm.addEventListener('input', updateValue);
        if (elm.type === 'number') elm.addEventListener('change', updateValue);
      } else if (elm instanceof HTMLSelectElement) {
        elm.addEventListener('change', () => {
          let v: any = (elm as HTMLSelectElement).value;
          if (v === 'false') v = false;
          this.setDeepSetting(key, v);
          this.onChanged();
          if (key.startsWith('statExtras.')) {
            this.renderTypeSettingsUI(el);
          }
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
    if (segs[0] === 'statExtras') {
      const key = segs[1];
      if (key === 'axisPointerType') {
        this.statInteractions.axisPointerType = (value === 'shadow' || value === 'cross' || value === 'none') ? value : 'line';
        return;
      }
      if (key === 'dataZoom') {
        this.statInteractions.dataZoom = (value === 'inside' || value === 'slider' || value === 'both') ? value : 'none';
        return;
      }
      if (key === 'tooltipTrigger') {
        this.statInteractions.tooltipTrigger = (value === 'item') ? 'item' : 'axis';
        if (this.chartType === 'pie') {
          this.statInteractions.tooltipTrigger = 'item';
        }
        return;
      }
      if (key === 'ySplitLine') {
        this.statInteractions.ySplitLine = (value === 'solid' || value === 'none') ? value : 'dashed';
        return;
      }
      return;
    }
    // 统计图共享设置：同时作用于 line 与 bar
    if (segs[0] === 'stat') {
      const leaf = segs.slice(1).join('.');
      if (leaf === 'boundaryGap' || leaf === 'xLabelRotate' || leaf === 'xAxisName' || leaf === 'yAxisLeftName' || leaf === 'yAxisRightName') {
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
      if (leaf === 'label.position') {
        const ensure = (obj: any) => { obj.label = obj.label || {}; obj.label.position = String(value || 'top'); };
        ensure((this.perTypeSettings as any).line);
        ensure((this.perTypeSettings as any).bar);
        return;
      }
      // 其他 stat.* 暂不处理
      return;
    }
    if (segs[0] === 'showDbNameAndViewName') {
      this.showDbNameAndViewName = !!value;
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
    if (this.chartType === 'pie') {
      return { pie: this.perTypeSettings.pie, common: this.commonSettings } as any;
    }
    // 统计图：传给构建器按系列类型各自读取
    return {
      bar: this.perTypeSettings.bar,
      line: this.perTypeSettings.line,
      common: this.commonSettings,
      stat: this.statInteractions
    } as any;
  }

  private openDbComboPopup() {
    const popup = (this as any).dbComboPopup as HTMLElement | undefined; if (!popup) return;
    popup.style.display = '';
  }

  private closeDbComboPopup() {
    const popup = (this as any).dbComboPopup as HTMLElement | undefined; if (!popup) return;
    popup.style.display = 'none';
  }

  // 组合框：过滤/展示列表
  private getFilteredAvList(query?: string): Array<{ id: string; name: string }> {
    const q = (query ?? this.dbComboInput?.value ?? '').trim().toLowerCase();
    if (!q) return this.avList.slice();
    return this.avList.filter(x => x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
  }

  private updateDbComboList() {
    const popup = (this as any).dbComboPopup as HTMLElement | undefined; if (!popup) return;
    if (!this.avList.length) { popup.innerHTML = '<div class="veq-combo-empty">加载中或无数据</div>'; return; }
    const arr = this.getFilteredAvList();
    if (!arr.length) { popup.innerHTML = '<div class="veq-combo-empty">无匹配数据库</div>'; return; }
    popup.innerHTML = arr.map(it => {
      const main = this.showDbId ? it.id : it.name;
      const minor = this.showDbId ? it.name : it.id;
      return `<div class="veq-combo-item" data-id="${this.escape(it.id)}"><span class="main">${this.escape(main)}</span><span class="minor">${this.escape(minor)}</span></div>`;
    }).join('');
  }

  private setDbComboDisplayBySelection() {
    const input = this.dbComboInput;
    if (input) {
      if (!this.selectedAvID) {
        input.value = '';
      } else {
        const found = this.avList.find(x => x.id === this.selectedAvID);
        input.value = this.showDbId ? (found?.id || this.selectedAvID) : (found?.name || '');
      }
    }
    this.updateDbMirrorBlock();
  }

  private updateDbMirrorBlock() {
    const mirrorEl = this.dbMirrorEl;
    if (!mirrorEl) return;
    if (!this.selectedAvID) {
      mirrorEl.style.display = 'none';
      mirrorEl.removeAttribute('data-av-id');
      mirrorEl.textContent = '未命名';
      return;
    }
    const found = this.avList.find(x => x.id === this.selectedAvID);
    const label = (found?.name || '').trim() || '未命名';
    mirrorEl.setAttribute('data-av-id', this.selectedAvID);
    mirrorEl.setAttribute('data-popover-url', '/api/av/getMirrorDatabaseBlocks');
    mirrorEl.textContent = label;
    mirrorEl.style.display = '';
  }

  // ===== 新增：数据库/视图下拉逻辑 =====
  private async initDbList() {
    try {
      // 加载列表
      const list = await getallavids();
      this.avList = Array.isArray(list) ? list.filter((x: any) => x && x.id).map((x: any) => ({ id: String(x.id), name: String(x.name || x.id) })) : [];
  // 预填充 popup 列表，避免首次 focus 没有任何选项
  this.updateDbComboList();
      // 恢复选择显示
      if (this.selectedAvID && this.avList.some(x => x.id === this.selectedAvID)) {
        this.setDbComboDisplayBySelection();
        await this.populateViewsFor(this.selectedAvID);
      } else {
        // 无选择，清空视图
        this.setDbComboDisplayBySelection();
        await this.populateViewsFor('');
      }
    } catch (e) {
      console.warn('加载数据库列表失败', e);
  const popup = (this as any).dbComboPopup as HTMLElement | undefined; if (popup) popup.innerHTML = '<div class="veq-combo-empty">加载失败</div>';
    }
  }

  private async populateViewsFor(avID: string) {
    const viewSel = this.viewSelEl; if (!viewSel) return;
    if (!avID) { viewSel.innerHTML = '<option value="">请选择数据库</option>'; viewSel.disabled = true; return; }
    try {
      viewSel.disabled = true;
      viewSel.innerHTML = '<option value="">加载视图中…</option>';
  // 使用 renderAttributeView 获取视图列表与默认 viewID
  // 注意：page/pageSize 传入正数，避免内核异常
  const res = await this.avManager.renderAttributeView(avID, { page: 1, pageSize: -1 });
      const views = Array.isArray((res as any).views) ? (res as any).views : [];
      const defaultViewID = (res as any).viewID || '';
      if (!views.length) {
        viewSel.innerHTML = '<option value="">无可用视图（默认）</option>';
        viewSel.disabled = false;
        // 清空 viewID，使用默认
        this.selectedViewID = '';
        this.loadKeys();
        return;
      }
      viewSel.innerHTML = '<option value="">默认视图</option>' + views.map((v: any) => `<option value="${this.escape(v.id)}">${this.escape(v.name || v.id)}</option>`).join('');
      viewSel.disabled = false;
      // 若已有 viewID（恢复态）则优先
      const curView = this.selectedViewID || '';
      if (curView && views.some((v: any) => v.id === curView)) {
        viewSel.value = curView;
        this.selectedViewName = views.find((v: any) => v.id === curView)?.name || '';
      } else if (defaultViewID && views.some((v: any) => v.id === defaultViewID)) {
        viewSel.value = defaultViewID;
        this.selectedViewID = defaultViewID;
        this.selectedViewName = views.find((v: any) => v.id === defaultViewID)?.name || '';
      } else {
        // 保持默认空（用默认视图）
        viewSel.value = '';
        this.selectedViewID = '';
        this.selectedViewName = '';
      }
      // 选择变化后刷新字段
      this.loadKeys();
    } catch (e) {
      console.warn('加载视图失败', e);
      viewSel.innerHTML = '<option value="">加载视图失败</option>';
      viewSel.disabled = true;
    }
  }

  private async syncSelectorsWithInputs() {
    // 基于内部状态进行同步
    if (!this.avList.length) { await this.initDbList(); return; }
    this.setDbComboDisplayBySelection();
    await this.populateViewsFor(this.selectedAvID || '');
    // 视图下拉在 populateViewsFor 中同步
  }
}
