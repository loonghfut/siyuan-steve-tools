import { buildSqlMappingExpressions, SeriesItem } from './sql-data-mapping';
import { preprocessSqlData } from './sql-data-preprocessor';

/**
 * 统一的 ECharts 设置生成器
 * 用于三种模式：数据库、单SQL、多SQL预设对比
 */
class ChartSettingsBuilder {
  /**
   * 生成标题位置代码
   */
  static buildTitlePosition(stCommon: any): string {
    const titleAlign = stCommon.title?.textAlign || 'center';
    const titleVAlign = stCommon.title?.textVerticalAlign || 'top';
    let code = '';
    
    if (titleAlign === 'left') code += 'option.title.left = 0; ';
    else if (titleAlign === 'right') code += 'option.title.right = 0; ';
    else code += 'option.title.left = "center"; ';
    
    if (titleVAlign === 'middle') code += 'option.title.top = "middle"; ';
    else if (titleVAlign === 'bottom') code += 'option.title.bottom = 0; ';
    else code += 'option.title.top = 0; ';
    
    return code;
  }

  /**
   * 生成图例位置代码
   */
  static buildLegendPosition(stCommon: any): string {
    const legendPos = stCommon.legendPos || 'top';
    const legendOrient = (legendPos === 'left' || legendPos === 'right') ? 'vertical' : 'horizontal';
    let code = `option.legend.orient = '${legendOrient}'; option.legend.${legendPos} = 0;`;
    if (legendPos === 'left' || legendPos === 'right') {
      code += ' option.legend.top = "middle";';
    }
    return code;
  }

  /**
   * 生成 Grid 设置代码
   */
  static buildGridSettings(stCommon: any): string {
    const g = stCommon.grid;
    if (g && [g.top, g.right, g.bottom, g.left].every((v: any) => Number.isFinite(v))) {
      return `option.grid = { top: ${g.top}, right: ${g.right}, bottom: ${g.bottom}, left: ${g.left}, containLabel: true };`;
    }
    return '';
  }

  /**
   * 生成分割线设置
   */
  static buildSplitLineSettings(stStat: any): { show: boolean; type: string } {
    const splitType = stStat.ySplitLine || 'dashed';
    return {
      show: splitType !== 'none',
      type: splitType === 'solid' ? 'solid' : 'dashed'
    };
  }

  /**
   * 生成提示框设置代码
   */
  static buildTooltipSettingsCode(tooltipTrigger: string, axisPointerType: string, isAllPie: boolean): string {
    if (tooltipTrigger === 'axis' && !isAllPie) {
      if (axisPointerType === 'none') return `option.tooltip = { trigger: 'axis' };`;
      return `option.tooltip = { trigger: 'axis', axisPointer: { type: '${axisPointerType}' } };`;
    }
    return `option.tooltip = { trigger: 'item' };`;
  }

  /**
   * 生成数据缩放代码
   */
  static buildDataZoomCode(dataZoomMode: string): string {
    if (dataZoomMode === 'inside') return `option.dataZoom = [{ type: 'inside' }];`;
    if (dataZoomMode === 'slider') return `option.dataZoom = [{ type: 'slider' }];`;
    if (dataZoomMode === 'both') return `option.dataZoom = [{ type: 'inside' }, { type: 'slider' }];`;
    return '';
  }

  /**
   * 生成 X 轴设置代码（适用于柱状图/折线图）
   */
  static buildXAxisSettings(stBar: any, stLine: any): string {
    const boundaryGap = stBar.boundaryGap !== undefined ? stBar.boundaryGap : (stLine.boundaryGap !== undefined ? stLine.boundaryGap : false);
    const xLabelRotate = stBar.xLabelRotate ?? stLine.xLabelRotate ?? 0;
    const xAxisName = stBar.xAxisName || stLine.xAxisName || '';
    
    return `
    option.xAxis = [{ 
      type: 'category', 
      boundaryGap: ${boundaryGap}, 
      data: xAxisData, 
      axisTick: { show: false }, 
      axisLine: { show: false },
      axisLabel: { rotate: ${xLabelRotate}, interval: 0 },
      name: '${xAxisName}'
    }];`;
  }

  /**
   * 生成 Y 轴设置代码（适用于柱状图/折线图）
   */
  static buildYAxisSettings(stBar: any, stLine: any, stStat: any, needDualAxis: boolean = false): string {
    const splitLine = ChartSettingsBuilder.buildSplitLineSettings(stStat);
    const yAxisLeftName = stBar.yAxisLeftName || stLine.yAxisLeftName || '';
    const yAxisRightName = stBar.yAxisRightName || stLine.yAxisRightName || '';
    
    let code = `
    option.yAxis = [{ 
      type: 'value', 
      axisTick: { show: false }, 
      axisLine: { show: false }, 
      splitLine: { show: ${splitLine.show}, lineStyle: { color: 'rgba(0, 0, 0, .38)', type: '${splitLine.type}' } },
      name: '${yAxisLeftName}'
    }`;
    
    if (needDualAxis) {
      code += `, { 
      type: 'value', 
      axisTick: { show: false }, 
      axisLine: { show: false }, 
      splitLine: { show: false },
      name: '${yAxisRightName}'
    }`;
    }
    
    code += `];`;
    return code;
  }

  /**
   * 生成系列样式设置（折线、柱状、饼图）
   */
  static buildSeriesExtras(type: string, stBar: any, stLine: any, stPie: any): {
    smooth: string;
    area: string;
    stack: string;
    label: string;
    lineExtras: string;
    barExtras: string;
    pieExtras: string;
  } {
    // 折线设置
    const smooth = (type === 'line' && stLine.smooth) ? 'true' : 'false';
    const area = (type === 'line' && stLine.area) ? `areaStyle: { normal: {} },` : '';
    
    // 折线额外样式
    const lineExtras = (function(){
      if (type !== 'line') return '';
      const parts: string[] = [];
      if (typeof stLine.symbol === 'string' && stLine.symbol) parts.push(`symbol: '${stLine.symbol}',`);
      if (Number.isFinite(stLine.symbolSize)) parts.push(`symbolSize: ${stLine.symbolSize|0},`);
      if (Number.isFinite((stLine as any).lineWidth)) parts.push(`lineStyle: { width: ${(stLine as any).lineWidth|0} },`);
      return parts.join(' ');
    })();
    
    // 柱状设置
    const stack = (type === 'bar' && stBar.stack) ? `stack: 'total',` : '';
    
    // 柱状额外样式
    const barExtras = (function(){
      if (type !== 'bar') return '';
      const parts: string[] = [];
      if (Number.isFinite(stBar.barWidth) && stBar.barWidth > 0) parts.push(`barWidth: ${stBar.barWidth|0},`);
      if (stBar.barGap !== undefined) parts.push(`barGap: '${stBar.barGap}',`);
      return parts.join(' ');
    })();
    
    // 饼图额外样式
    const pieExtras = (function(){
      if (type !== 'pie') return '';
      const parts: string[] = [];
      const innerRadius = stPie.innerRadius ?? 0;
      const outerRadius = stPie.outerRadius ?? 70;
      parts.push(`radius: ['${innerRadius}%', '${outerRadius}%'],`);
      parts.push(`center: ['50%', '50%'],`);
      if (stPie.roseType) parts.push(`roseType: '${stPie.roseType}',`);
      return parts.join(' ');
    })();
    
    // 标签设置
    const label = (function(){
      let l: any;
      if (type === 'bar') l = stBar.label;
      else if (type === 'line') l = stLine.label;
      else if (type === 'pie') l = stPie.label;
      return l ? `label: ${JSON.stringify(l)},` : '';
    })();
    
    return { smooth, area, stack, label, lineExtras, barExtras, pieExtras };
  }

  /**
   * 生成颜色应用代码
   */
  static buildColorSettings(colors: string[], isPie: boolean = false, seriesCount: number = 1): string {
    if (!Array.isArray(colors) || colors.length === 0) return '';
    
    if (isPie) {
      // 饼图使用全局颜色
      return `try{ option.color = ${JSON.stringify(colors)}; }catch(e){}`;
    } else if (seriesCount === 1) {
      // 单系列使用第一个颜色
      return `try{ option.series[0].itemStyle = option.series[0].itemStyle || {}; option.series[0].itemStyle.color = ${JSON.stringify(colors[0])}; }catch(e){}`;
    } else {
      // 多系列使用颜色数组
      return `try{ (option.series||[]).forEach(function(s, i){ if (s && s.type === 'pie') return; s.itemStyle = s.itemStyle || {}; s.itemStyle.color = ${JSON.stringify(colors)}[i] || s.itemStyle.color; }); }catch(e){}`;
    }
  }

  /**
   * 生成饼图颜色代码（单独处理）
   */
  static buildPieColorSettings(colors: string[], pieCount: number): string {
    if (!Array.isArray(colors) || colors.length === 0 || pieCount === 0) return '';
    return `try{ option.color = ${JSON.stringify(colors)}; }catch(e){}`;
  }
}

export interface VisualEchartsSqlOptions {
  persistKey?: string;
  onChange?: () => void; // 配置变化回调,用于外部触发预览刷新
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>; // 加载 SQL 预设
  saveSqlPresets?: (presets: Record<string, any>) => Promise<void> | void; // 保存 SQL 预设
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
  private loadingKeys = false; // 加载字段时防止重复

  // 防抖相关
  private debounceTimer: number | null = null;

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

  // 防抖方法
  private debounceLoadKeys() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.loadKeys();
      this.debounceTimer = null;
    }, 500); // 500ms 防抖延迟
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
              <div class="veq-row" style="gap:8px; margin-bottom:8px;">
                <button class="veq-btn veq-small" data-save-preset type="button">保存筛选</button>
                <button class="veq-btn veq-small" data-apply-preset type="button">应用筛选</button>
                <button class="veq-btn veq-small" data-retry-sql type="button">重试查询</button>
              </div>
              <label class="veq-field">
                <textarea class="veq-input" data-sql rows="4" placeholder="SELECT * FROM blocks WHERE type='d' LIMIT 100"></textarea>
              </label>
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
          <div class="veq-group" data-mapping-section>
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

        <div class="veq-group" style="margin-top:8px;" data-series-section>
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
    this.sqlModeSwitchEl = this.root.querySelector('[data-sql-mode]') as HTMLSelectElement | undefined;
    this.multiSqlPresetsEl = this.root.querySelector('[data-multi-sql-presets-list]') as HTMLElement | undefined;

    // 事件
    this.titleInput.addEventListener('input', () => this.onChanged());
    this.sqlTextarea.addEventListener('input', (e) => { 
      this.sql = (e.target as HTMLTextAreaElement).value; 
      this.debounceLoadKeys(); // 使用防抖的字段加载
    });

    // 保存和应用筛选按钮事件
    const savePresetBtn = this.root.querySelector('[data-save-preset]') as HTMLButtonElement | null;
    const applyPresetBtn = this.root.querySelector('[data-apply-preset]') as HTMLButtonElement | null;
    const retrySqlBtn = this.root.querySelector('[data-retry-sql]') as HTMLButtonElement | null;
    savePresetBtn?.addEventListener('click', () => this.savePresetFlow());
    applyPresetBtn?.addEventListener('click', () => this.openPresetModal());
    retrySqlBtn?.addEventListener('click', () => this.loadKeys());

    // SQL模式切换事件
    this.sqlModeSwitchEl?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as 'single' | 'multi-preset';
      this.sqlMode = mode;
      const singleMode = this.root.querySelector('[data-single-sql-mode]') as HTMLElement | null;
      const multiMode = this.root.querySelector('[data-multi-sql-mode]') as HTMLElement | null;
      const mappingSection = this.root.querySelector('[data-mapping-section]') as HTMLElement | null;
      const seriesSection = this.root.querySelector('[data-series-section]') as HTMLElement | null;
      
      if (mode === 'single') {
        if (singleMode) singleMode.style.display = '';
        if (multiMode) multiMode.style.display = 'none';
        if (mappingSection) mappingSection.style.display = '';
        if (seriesSection) seriesSection.style.display = '';
      } else {
        if (singleMode) singleMode.style.display = 'none';
        if (multiMode) multiMode.style.display = '';
        if (mappingSection) mappingSection.style.display = 'none';
        if (seriesSection) seriesSection.style.display = 'none';
      }
      this.onChanged();
    });

    // 添加多SQL预设按钮事件 - 从预设列表中选择
    const addMultiSqlBtn = this.root.querySelector('[data-add-multi-sql]') as HTMLButtonElement | null;
    addMultiSqlBtn?.addEventListener('click', () => {
      this.openPresetSelectModalForMulti();
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
      row.draggable = true;
      row.setAttribute('data-idx', String(idx));
      row.style.cssText = `
        margin-bottom: 12px;
        padding: 12px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        transition: all 0.2s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        cursor: move;
      `;

      row.innerHTML = `
        <div class="veq-row" style="align-items: center; gap: 8px; margin-bottom: 8px;">
          <span 
            style="
              cursor: grab;
              padding: 4px;
              color: var(--b3-theme-on-surface);
              opacity: 0.5;
              font-size: 16px;
              user-select: none;
            "
            title="拖拽排序"
          >⋮⋮</span>
          <input 
            class="veq-input" 
            data-preset-name 
            placeholder="预设名称" 
            value="${this.escape(preset.name)}" 
            style="
              flex: 1;
              min-width: 0;
              padding: 6px 10px;
              font-weight: 500;
              border-radius: 4px;
              transition: border-color 0.2s ease;
            "
          />
          <button 
            class="veq-btn veq-ghost veq-small" 
            data-del 
            type="button"
            style="
              flex-shrink: 0;
              padding: 6px 12px;
              color: var(--b3-theme-error);
              border-color: var(--b3-theme-error);
              transition: all 0.2s ease;
            "
            onmouseover="this.style.background='var(--b3-theme-error)'; this.style.color='#fff';"
            onmouseout="this.style.background='transparent'; this.style.color='var(--b3-theme-error)';"
          >删除</button>
        </div>
        <textarea 
          class="veq-input" 
          data-preset-sql 
          rows="3" 
          placeholder="SELECT * FROM blocks WHERE ..."
          style="
            width: 98%;
            padding: 8px 10px;
            font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            line-height: 1.5;
            border-radius: 4px;
            resize: vertical;
            transition: border-color 0.2s ease;
          "
        >${this.escape(preset.sql)}</textarea>
      `;

      const nameInput = row.querySelector('[data-preset-name]') as HTMLInputElement;
      const sqlTextarea = row.querySelector('[data-preset-sql]') as HTMLTextAreaElement;
      const delBtn = row.querySelector('[data-del]') as HTMLButtonElement;

      // 卡片悬停效果
      row.addEventListener('mouseenter', () => {
        row.style.borderColor = 'var(--b3-theme-primary)';
        row.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.borderColor = 'var(--b3-border-color)';
        row.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
      });

      // 输入框聚焦效果
      [nameInput, sqlTextarea].forEach(input => {
        input.addEventListener('focus', () => {
          input.style.borderColor = 'var(--b3-theme-primary)';
          input.style.boxShadow = '0 0 0 2px rgba(54, 119, 215, 0.1)';
        });
        input.addEventListener('blur', () => {
          input.style.borderColor = 'var(--b3-border-color)';
          input.style.boxShadow = 'none';
        });
      });

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

      // 拖拽事件处理
      row.addEventListener('dragstart', (e) => {
        row.style.opacity = '0.5';
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', String(idx));
      });

      row.addEventListener('dragend', () => {
        row.style.opacity = '1';
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        
        // 添加拖拽悬停效果
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          row.style.borderTop = '2px solid var(--b3-theme-primary)';
          row.style.borderBottom = '';
        } else {
          row.style.borderTop = '';
          row.style.borderBottom = '2px solid var(--b3-theme-primary)';
        }
      });

      row.addEventListener('dragleave', () => {
        row.style.borderTop = '';
        row.style.borderBottom = '';
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.style.borderTop = '';
        row.style.borderBottom = '';

        const fromIdx = parseInt(e.dataTransfer!.getData('text/plain'));
        const toIdx = idx;

        if (fromIdx === toIdx) return;

        // 执行拖拽排序
        const [movedItem] = this.multiSqlPresets.splice(fromIdx, 1);
        
        // 计算插入位置
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertIdx = e.clientY < midY ? toIdx : toIdx + 1;
        const finalIdx = fromIdx < toIdx ? insertIdx - 1 : insertIdx;
        
        this.multiSqlPresets.splice(finalIdx, 0, movedItem);
        
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

      const sql = this.sql.trim();
      if (!sql) {
        this.toast('请先输入 SQL 查询语句');
        this.loadingKeys = false;
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
      // 不再需要更新按钮状态，因为按钮已被移除
    }
  }

  // 根据可视化选择自动生成表达式
  private autoBuildExpr() {
    if (!this.visualMode) return;

    const { xExpr, series } = buildSqlMappingExpressions({
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
    
    // 获取当前图表类型
    const chartType = this.chartType;
    const isPie = chartType === 'pie';
    
    // 获取设置
    const stCommon: any = this.commonSettings;
    const stStat: any = this.statInteractions;
    const stBar: any = this.perTypeSettings.bar || {};
    const stPie: any = this.perTypeSettings.pie || {};
    
    // 使用统一的设置构建器
    const titlePos = ChartSettingsBuilder.buildTitlePosition(stCommon);
    const legendPosCode = ChartSettingsBuilder.buildLegendPosition(stCommon);
    const gridCode = ChartSettingsBuilder.buildGridSettings(stCommon);
    const splitLine = ChartSettingsBuilder.buildSplitLineSettings(stStat);
    const tooltipPatch = ChartSettingsBuilder.buildTooltipSettingsCode(isPie ? 'item' : (stStat.tooltipTrigger || 'axis'), isPie ? 'none' : (stStat.axisPointerType || 'shadow'), isPie);
    const dataZoomPatch = ChartSettingsBuilder.buildDataZoomCode(isPie ? 'none' : (stStat.dataZoom || 'none'));
    
    // 根据图表类型获取对应设置
    let seriesType = 'bar';
    let labelShow = true;
    let labelPos = 'top';
    let xLabelRotate = 0;
    let xAxisName = '';
    let yAxisName = '查询结果数量';
    let extraSettings = '';
    
    if (isPie) {
      // 饼图设置
      seriesType = 'pie';
      labelShow = stPie.label?.show ?? false;
      labelPos = stPie.label?.position || 'outside';
      const innerRadius = stPie.innerRadius ?? 0;
      const outerRadius = stPie.outerRadius ?? 70;
      const roseType = stPie.roseType || false;
      extraSettings = `
      radius: ['${innerRadius}%', '${outerRadius}%'],
      center: ['50%', '50%'],
      ${roseType ? `roseType: '${roseType}',` : ''}`;
    } else {
      // 柱状图设置
      seriesType = 'bar';
      labelShow = stBar.label?.show ?? true;
      labelPos = stBar.label?.position || 'top';
      xLabelRotate = stBar.xLabelRotate ?? 0;
      xAxisName = stBar.xAxisName || '';
      yAxisName = stBar.yAxisLeftName || '查询结果数量';
      const barWidth = stBar.barWidth;
      const barGap = stBar.barGap ?? '30%';
      const barStack = stBar.stack;
      extraSettings = `
      ${barStack ? "stack: 'total'," : ''}
      ${barWidth ? `barWidth: ${barWidth},` : ''}
      barGap: '${barGap}',`;
    }

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
    ${isPie ? `
    // 饼图模式：每个预设是一个扇区
    const pieData = [];
    presets.forEach(function(preset) {
      var rows = fetchSqlSync(preset.sql);
      pieData.push({ name: preset.name, value: rows.length });
    });
    ` : `
    // 柱状图模式：每个预设是X轴的一个分类
    const xAxisData = [];
    const yAxisData = [];
    presets.forEach(function(preset) {
      xAxisData.push(preset.name);
      var rows = fetchSqlSync(preset.sql);
      yAxisData.push(rows.length);
    });
    `}
    
    console.group('🔍 多SQL预设对比 - 数据调试');
    console.log('📊 预设列表:', presets);
    ${isPie ? `
    console.log('📊 饼图数据:', pieData);
    ` : `
    console.log('📐 X轴(预设名称):', xAxisData);
    console.log('📐 Y轴(查询数量):', yAxisData);
    `}
    console.groupEnd();
    
    option.title = { text: ${JSON.stringify(title)} };
    ${titlePos}
    option.backgroundColor = 'transparent';
    ${tooltipPatch}
    option.legend = { data: ${isPie ? 'pieData.map(d => d.name)' : "['查询结果数量']"} };
    ${legendPosCode}
    ${!isPie && gridCode ? gridCode : ''}
    ${!isPie ? `
    option.xAxis = {
      type: 'category',
      data: xAxisData,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { rotate: ${xLabelRotate}, interval: 0 },
      name: '${xAxisName}'
    };
    option.yAxis = {
      type: 'value',
      name: '${yAxisName}',
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: ${splitLine.show}, lineStyle: { color: 'rgba(0, 0, 0, .38)', type: '${splitLine.type}' } }
    };
    ` : ''}
    option.series = [{
      name: '查询结果数量',
      type: '${seriesType}',${extraSettings}
      data: ${isPie ? 'pieData' : 'yAxisData'},
      ${!isPie ? `itemStyle: { color: '#5470c6' },` : ''}
      label: {
        show: ${labelShow},
        position: '${labelPos}',
        formatter: ${isPie ? "'{b}: {c} ({d}%)'" : "'{c}'"}
      }
    }];
    ${dataZoomPatch}
    ${Array.isArray(this.colors) && this.colors.length ? `
    ${ChartSettingsBuilder.buildColorSettings(this.colors, isPie, 1)}
    ` : ''}
    ${!isPie && !(Array.isArray(this.colors) && this.colors.length) ? `
    try{ option.series[0].itemStyle = option.series[0].itemStyle || {}; option.series[0].itemStyle.color = '#5470c6'; }catch(e){}
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
    const stBar: any = st.bar || {};
    const stLine: any = st.line || {};
    const stPie: any = st.pie || {};

    const legendArr = JSON.stringify(seriesExprs.map(s => s.name));

    const tooltipTrigger = isAllPie ? 'item' : (stStat.tooltipTrigger || 'axis');
    const axisPointerType = tooltipTrigger === 'axis' ? (stStat.axisPointerType || 'line') : 'none';
    const dataZoomMode = isAllPie ? 'none' : (stStat.dataZoom || 'none');

    let pieNo = -1;
    const pieCount = seriesExprs.filter(s => (s.type || 'line') === 'pie').length;

    const seriesJs = seriesExprs.map(s => {
      const type = s.type || 'line';
      const name = JSON.stringify(s.name);
      const yAxisIndex = (typeof (s as any).axisIndex === 'number' && (s as any).axisIndex! > 0) ? `yAxisIndex:${(s as any).axisIndex | 0},` : '';

      // 应用折线设置
      const smooth = (type === 'line' && stLine.smooth) ? 'true' : 'false';
      const area = (type === 'line' && stLine.area) ? `areaStyle: { normal: {} },` : '';
      
      // 应用柱状设置
      const stack = (type === 'bar' && stBar.stack) ? `stack: 'total',` : '';
      
      // 应用标签设置
      const label = (function(){
        let l: any;
        if (type === 'bar') l = stBar.label;
        else if (type === 'line') l = stLine.label;
        else if (type === 'pie') l = stPie.label;
        return l ? `label: ${JSON.stringify(l)},` : '';
      })();
      
      // 折线额外样式
      const lineExtras = (function(){
        if (type !== 'line') return '';
        const parts: string[] = [];
        if (typeof stLine.symbol === 'string' && stLine.symbol) parts.push(`symbol: '${stLine.symbol}',`);
        if (Number.isFinite(stLine.symbolSize)) parts.push(`symbolSize: ${stLine.symbolSize|0},`);
        if (Number.isFinite((stLine as any).lineWidth)) parts.push(`lineStyle: { width: ${(stLine as any).lineWidth|0} },`);
        return parts.join(' ');
      })();
      
      // 柱状额外样式
      const barExtras = (function(){
        if (type !== 'bar') return '';
        const parts: string[] = [];
        if (Number.isFinite(stBar.barWidth)) parts.push(`barWidth: ${Number(stBar.barWidth)},`);
        if (typeof stBar.barGap === 'string' && stBar.barGap) parts.push(`barGap: '${stBar.barGap}',`);
        else if (Number.isFinite(stBar.barGap)) parts.push(`barGap: '${Number(stBar.barGap)}%',`);
        return parts.join(' ');
      })();

      const dataExpr = (type === 'pie')
        ? `(function(){
          var ys = (${s.expr});
          if (Array.isArray(ys) && ys.length && typeof ys[0]==='object' && ys[0] && Object.prototype.hasOwnProperty.call(ys[0], 'value')) return ys;
          var xs = (${xExpr});
          var m = Math.min(xs.length, Array.isArray(ys)?ys.length:0);
          return xs.slice(0,m).map(function(n,i){ return { name: String(n), value: ys[i] }; });
        })()`
        : `(${s.expr})`;

      // 饼图半径和玫瑰图设置
      const pieExtra = (type === 'pie') ? (function () {
        const irCfg = typeof stPie.innerRadius === 'number' ? Math.max(0, Math.min(100, stPie.innerRadius|0)) : 0;
        const orCfg = typeof stPie.outerRadius === 'number' ? Math.max(irCfg, Math.min(100, stPie.outerRadius|0)) : 70;
        const rose = (stPie.roseType === false || stPie.roseType === 'radius' || stPie.roseType === 'area') ? stPie.roseType : undefined;
        const parts: string[] = [];
        
        if (pieCount > 1) {
          pieNo++;
          const span = Math.max(1, orCfg - irCfg);
          const ring = span / pieCount;
          let r1 = Math.round(irCfg + ring * pieNo);
          let r2 = Math.round(irCfg + ring * (pieNo + 1));
          if (r2 <= r1) r2 = r1 + 1;
          parts.push(`radius: ['${r1}%', '${r2}%'],`);
        } else {
          parts.push(`radius: ['${irCfg}%', '${orCfg}%'],`);
        }
        
        if (rose !== undefined && rose !== false) parts.push(`roseType: '${rose}',`);
        return parts.join(' ');
      })() : '';

      return `{
        name: ${name}, type: '${type}', ${stack} ${yAxisIndex} smooth: ${smooth}, ${area} ${label} ${lineExtras} ${barExtras} ${pieExtra} z: 1,
        data: ${dataExpr}
      }`;
    }).join(',\n');

    // 使用统一设置构建器
    const tooltipPatch = ChartSettingsBuilder.buildTooltipSettingsCode(tooltipTrigger, axisPointerType, isAllPie);
    const dataZoomPatch = ChartSettingsBuilder.buildDataZoomCode(dataZoomMode);

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
    
    // 计算 X轴 数据
    const xAxisData = (${xExpr});
    
    option.title = { text: ${JSON.stringify(title)} };
    ${ChartSettingsBuilder.buildTitlePosition(stCommon)}
    option.backgroundColor = 'transparent';
    ${tooltipPatch}
    option.legend = { data: ${isAllPie ? `(${xExpr})` : legendArr} };
    ${ChartSettingsBuilder.buildLegendPosition(stCommon)}
    ${ChartSettingsBuilder.buildGridSettings(stCommon)}
    ${!isAllPie ? ChartSettingsBuilder.buildXAxisSettings(stBar, stLine) : ''}
    ${!isAllPie ? ChartSettingsBuilder.buildYAxisSettings(stBar, stLine, stStat, needDualAxis) : ''}
    option.series = [${seriesJs}];
    
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
    const el = target || (this.root.querySelector('[data-type-settings-body]') as HTMLElement | null);
    if (!el) return;
    
    // 判断当前是否为饼图模式
    // 对于 SQL 单模式,检查 series 中是否全是饼图
    let t = this.chartType;
    if (this.sqlMode === 'single' && this.series.length > 0) {
      const isAllPie = this.series.every(s => (s.type || 'line') === 'pie');
      t = isAllPie ? 'pie' : 'stat';
    }
    
    let html = '';
    // 通用设置
    const cs = this.commonSettings;
    html += `
      <details class="veq-sub" data-fold-common ${this.foldCommon ? '' : 'open'}>
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
    // 只在非饼图模式下显示统计图设置
    if (t !== 'pie') {
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
        <details class="veq-sub" data-fold-stat ${this.foldStat ? '' : 'open'}>
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
    }
    // 只在饼图模式下显示饼图设置
    if (t === 'pie') {
      const s = this.perTypeSettings.pie;
      const labelPos = s.label?.position || 'outside';
      html += `
        <details class="veq-sub" data-fold-pie ${this.foldPie ? '' : 'open'}>
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
    
    // 阻止 veq-switch 的点击事件冒泡,防止触发 details 折叠
    const switchLabels = Array.from(el.querySelectorAll('label.veq-switch')) as HTMLLabelElement[];
    switchLabels.forEach(label => {
      label.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
    
    // 同时阻止 veq-switch-item 的点击事件冒泡
    const switchItems = Array.from(el.querySelectorAll('label.veq-switch-item')) as HTMLLabelElement[];
    switchItems.forEach(item => {
      item.addEventListener('click', (e) => {
        // 只阻止冒泡到 details,不阻止内部元素的点击
        const target = e.target as HTMLElement;
        if (target.closest('label.veq-switch') || target.closest('input[type="checkbox"]')) {
          e.stopPropagation();
        }
      });
    });
    
    // 监听折叠切换并持久化
    const dCommon = el.querySelector('details[data-fold-common]') as HTMLDetailsElement | null;
    if (dCommon) {
      dCommon.addEventListener('toggle', () => { 
        this.foldCommon = !dCommon.open; // 注意: open 为 true 表示展开,foldCommon 为 true 表示折叠
        this.save(); 
      });
    }
    const dStat = el.querySelector('details[data-fold-stat]') as HTMLDetailsElement | null;
    if (dStat) {
      dStat.addEventListener('toggle', () => { 
        this.foldStat = !dStat.open; 
        this.save(); 
      });
    }
    const dPie = el.querySelector('details[data-fold-pie]') as HTMLDetailsElement | null;
    if (dPie) {
      dPie.addEventListener('toggle', () => { 
        this.foldPie = !dPie.open; 
        this.save(); 
      });
    }
    const inputs = Array.from(el.querySelectorAll('[data-set]')) as HTMLElement[];
    inputs.forEach(elm => {
      const key = elm.getAttribute('data-set') || '';
      if (elm instanceof HTMLInputElement && elm.type === 'checkbox') {
        elm.addEventListener('change', () => { 
          // 在重新渲染前,先保存当前的折叠状态
          const dCommonCurrent = el.querySelector('details[data-fold-common]') as HTMLDetailsElement | null;
          const dStatCurrent = el.querySelector('details[data-fold-stat]') as HTMLDetailsElement | null;
          const dPieCurrent = el.querySelector('details[data-fold-pie]') as HTMLDetailsElement | null;
          if (dCommonCurrent) this.foldCommon = !dCommonCurrent.open;
          if (dStatCurrent) this.foldStat = !dStatCurrent.open;
          if (dPieCurrent) this.foldPie = !dPieCurrent.open;
          
          this.setDeepSetting(key, elm.checked); 
          this.onChanged(); 
          this.renderTypeSettingsUI(el); 
        });
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
            // 在重新渲染前,先保存当前的折叠状态
            const dCommonCurrent = el.querySelector('details[data-fold-common]') as HTMLDetailsElement | null;
            const dStatCurrent = el.querySelector('details[data-fold-stat]') as HTMLDetailsElement | null;
            const dPieCurrent = el.querySelector('details[data-fold-pie]') as HTMLDetailsElement | null;
            if (dCommonCurrent) this.foldCommon = !dCommonCurrent.open;
            if (dStatCurrent) this.foldStat = !dStatCurrent.open;
            if (dPieCurrent) this.foldPie = !dPieCurrent.open;
            
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

  // ========== 预设管理方法 ==========

  // 加载预设(支持同步和异步)
  private loadPresets(): Record<string, any> {
    if (this.opts?.loadSqlPresets) {
      try {
        const res = this.opts.loadSqlPresets();
        if (res && typeof (res as any).then === 'function') {
          console.debug('[VisualEchartsSqlUI] loadPresets called synchronously, async provider will be awaited at call sites');
          return {};
        }
        return (res as Record<string, any>) || {};
      } catch { return {}; }
    }
    return {};
  }

  // 获取当前状态快照
  private getStateSnapshot() {
    return {
      sql: this.sql,
      xKey: this.xKey,
      sort: this.sort,
      xBucket: this.xBucket,
      mergeMode: this.mergeMode,
      series: this.series,
      colors: this.colors,
      chartType: this.chartType,
      perTypeSettings: this.perTypeSettings,
      commonSettings: this.commonSettings,
      statInteractions: this.statInteractions,
    };
  }

  // 恢复状态
  private hydrateState(s: any) {
    if (s.sql !== undefined) {
      this.sql = s.sql;
      if (this.sqlTextarea) this.sqlTextarea.value = s.sql;
    }
    if (s.xKey !== undefined) {
      this.xKey = s.xKey;
      const xkeySel = this.root.querySelector('[data-xkey]') as HTMLSelectElement | null;
      if (xkeySel) xkeySel.value = s.xKey;
    }
    if (s.sort !== undefined) {
      this.sort = s.sort;
      const sortSel = this.root.querySelector('[data-sort]') as HTMLSelectElement | null;
      if (sortSel) sortSel.value = s.sort;
    }
    if (s.xBucket !== undefined) {
      this.xBucket = s.xBucket;
      const bucketSel = this.root.querySelector('[data-bucket]') as HTMLSelectElement | null;
      if (bucketSel) bucketSel.value = s.xBucket;
    }
    if (s.mergeMode !== undefined) {
      this.mergeMode = s.mergeMode;
      const mergeToggle = this.root.querySelector('[data-merge]') as HTMLInputElement | null;
      if (mergeToggle) mergeToggle.checked = s.mergeMode;
    }
    if (s.series) this.series = s.series;
    if (s.colors) this.colors = s.colors;
    if (s.chartType) this.chartType = s.chartType;
    if (s.perTypeSettings) this.perTypeSettings = s.perTypeSettings;
    if (s.commonSettings) this.commonSettings = s.commonSettings;
    if (s.statInteractions) this.statInteractions = s.statInteractions;

    this.renderSeriesList();
    this.renderPalette();
  }

  // 保存预设流程
  private async savePresetFlow() {
    if (!this.opts?.loadSqlPresets || !this.opts?.saveSqlPresets) {
      this.toast('未配置预设存储');
      return;
    }

    const presetsResult = this.opts.loadSqlPresets();
    const presets = (presetsResult && typeof (presetsResult as any).then === 'function')
      ? await presetsResult
      : (presetsResult || {});

    const nameRaw = await this.openInputModal({ title: '保存为预设', label: '名称', placeholder: '输入预设名称' });
    const name = (nameRaw || '').trim();
    if (!name) return;

    if (presets[name]) {
      const ok = await this.openConfirmModal('同名预设已存在，是否覆盖？');
      if (!ok) return;
    }

    const snap = this.getStateSnapshot();
    presets[name] = {
      ...snap,
      name: name,
      _savedAt: new Date().toISOString()
    };

    try {
      const saveResult = this.opts.saveSqlPresets(presets);
      if (saveResult && typeof (saveResult as any).then === 'function') {
        await saveResult;
      }
      this.toast('已保存预设');
    } catch (e) {
      console.error('[VisualEchartsSqlUI] 保存预设失败:', e);
      this.toast('保存失败');
    }
  }

  // 打开预设选择模态框
  private async openPresetModal() {
    this.ensureModalStyle();

    const overlay = document.createElement('div');
    overlay.className = 'veq-modal-mask';
    const dialog = document.createElement('div');
    dialog.className = 'veq-modal veq-preset';
    dialog.innerHTML = `
      <div class="veq-modal-header">
        <div class="veq-modal-title">SQL预设</div>
        <button class="veq-btn veq-ghost" data-close>×</button>
      </div>
      <div class="veq-modal-body">
        <div class="veq-preset-head">
          <input class="veq-input veq-search" data-search placeholder="搜索预设..." />
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
      if (!this.opts?.loadSqlPresets) return;

      const presetsResult = this.opts.loadSqlPresets();
      const presets = (presetsResult && typeof (presetsResult as any).then === 'function')
        ? await presetsResult
        : (presetsResult || {});

      const q = (searchEl?.value || '').trim().toLowerCase();
      const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .filter(n => !q || n.toLowerCase().includes(q));

      if (!names.length) {
        listEl.innerHTML = `<div class="veq-item"><div class="veq-item-name" style="color: var(--veq-muted)">暂无预设</div></div>`;
        if (countEl) countEl.textContent = '0';
        return;
      }

      if (countEl) countEl.textContent = String(names.length);
      listEl.innerHTML = names.map(n => {
        const sql = this.escape(presets[n].sql || '');
        return `
        <div class="veq-item" data-name="${this.escape(n)}">
          <div class="veq-item__main">
            <div class="veq-item-name">${this.escape(n)}</div>
            <pre class="veq-item-sql">${sql || '（无 SQL）'}</pre>
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

        apply.addEventListener('click', async () => {
          if (!this.opts?.loadSqlPresets) return;
          const pResult = this.opts.loadSqlPresets();
          const p = (pResult && typeof (pResult as any).then === 'function')
            ? await pResult
            : (pResult || {});
          const s = p[name];
          if (!s) return;
          this.hydrateState(s);
          this.rebuildCode();
          this.toast('已应用预设');
          close();
        });

        // 双击也可应用
        (item as HTMLElement).addEventListener('dblclick', async () => {
          if (!this.opts?.loadSqlPresets) return;
          const pResult = this.opts.loadSqlPresets();
          const p = (pResult && typeof (pResult as any).then === 'function')
            ? await pResult
            : (pResult || {});
          const s = p[name];
          if (!s) return;
          this.hydrateState(s);
          this.rebuildCode();
          this.toast('已应用预设');
          close();
        });

        // 重命名预设
        rename.addEventListener('click', async () => {
          if (!this.opts?.loadSqlPresets || !this.opts?.saveSqlPresets) {
            this.toast('未配置预设存储');
            return;
          }

          try {
            const pResult = this.opts.loadSqlPresets();
            const p = (pResult && typeof (pResult as any).then === 'function')
              ? await pResult
              : (pResult || {});
            const cur = p[name];
            if (!cur) return;

            const newNameRaw = await this.openInputModal({ title: '重命名预设', label: '新名称', defaultValue: name });
            const newName = (newNameRaw || '').trim();
            if (!newName || newName === name) return;

            if (p[newName] && newName !== name) {
              const ok = await this.openConfirmModal('同名预设已存在，是否覆盖？');
              if (!ok) return;
            }

            p[newName] = cur;
            if (newName !== name) delete p[name];

            const saveResult = this.opts.saveSqlPresets(p);
            if (saveResult && typeof (saveResult as any).then === 'function') {
              await saveResult;
            }

            render();
            this.toast('已重命名预设');
          } catch (e) {
            console.error('[VisualEchartsSqlUI] 重命名预设失败:', e);
            this.toast('重命名失败');
          }
        });

        del.addEventListener('click', async () => {
          const ok = await this.openConfirmModal(`删除预设"${name}"？`);
          if (!ok) return;

          if (!this.opts?.loadSqlPresets || !this.opts?.saveSqlPresets) {
            this.toast('未配置预设存储');
            return;
          }

          try {
            const pResult = this.opts.loadSqlPresets();
            const presets = (pResult && typeof (pResult as any).then === 'function')
              ? await pResult
              : (pResult || {});

            delete presets[name];

            const saveResult = this.opts.saveSqlPresets(presets);
            if (saveResult && typeof (saveResult as any).then === 'function') {
              await saveResult;
            }

            render();
            this.toast('已删除预设');
          } catch (e) {
            console.error('[VisualEchartsSqlUI] 删除预设失败:', e);
            this.toast('删除失败');
          }
        });
      });
    };

    searchEl?.addEventListener('input', () => { render(); });
    render();
  }

  // 打开预设选择模态框(用于多SQL对比模式)
  private async openPresetSelectModalForMulti() {
    this.ensureModalStyle();

    const overlay = document.createElement('div');
    overlay.className = 'veq-modal-mask';
    const dialog = document.createElement('div');
    dialog.className = 'veq-modal veq-preset';
    dialog.innerHTML = `
      <div class="veq-modal-header">
        <div class="veq-modal-title">选择SQL预设</div>
        <button class="veq-btn veq-ghost" data-close>×</button>
      </div>
      <div class="veq-modal-body">
        <div class="veq-preset-head">
          <input class="veq-input veq-search" data-search placeholder="搜索预设..." />
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
      if (!this.opts?.loadSqlPresets) return;

      const presetsResult = this.opts.loadSqlPresets();
      const presets = (presetsResult && typeof (presetsResult as any).then === 'function')
        ? await presetsResult
        : (presetsResult || {});

      const q = (searchEl?.value || '').trim().toLowerCase();
      const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .filter(n => !q || n.toLowerCase().includes(q));

      if (!names.length) {
        listEl.innerHTML = `<div class="veq-item"><div class="veq-item-name" style="color: var(--veq-muted)">暂无预设</div></div>`;
        if (countEl) countEl.textContent = '0';
        return;
      }

      if (countEl) countEl.textContent = String(names.length);
      listEl.innerHTML = names.map(n => {
        const sql = this.escape(presets[n].sql || '');
        const alreadyAdded = this.multiSqlPresets.some(p => p.name === n);
        return `
        <div class="veq-item ${alreadyAdded ? 'veq-item--disabled' : ''}" data-name="${this.escape(n)}">
          <div class="veq-item__main">
            <div class="veq-item-name">${this.escape(n)}${alreadyAdded ? ' (已添加)' : ''}</div>
            <pre class="veq-item-sql">${sql || '（无 SQL）'}</pre>
          </div>
          <div class="veq-item-actions">
            <button class="veq-btn veq-small" data-add ${alreadyAdded ? 'disabled' : ''}>添加</button>
          </div>
        </div>`;
      }).join('');

      // 绑定事件
      listEl.querySelectorAll('.veq-item').forEach(item => {
        const name = (item as HTMLElement).getAttribute('data-name') || '';
        const addBtn = item.querySelector('[data-add]') as HTMLButtonElement;

        if (!addBtn.disabled) {
          addBtn.addEventListener('click', async () => {
            if (!this.opts?.loadSqlPresets) return;
            const pResult = this.opts.loadSqlPresets();
            const p = (pResult && typeof (pResult as any).then === 'function')
              ? await pResult
              : (pResult || {});
            const preset = p[name];
            if (!preset?.sql) {
              this.toast('预设无SQL内容');
              return;
            }

            this.multiSqlPresets.push({ name, sql: preset.sql });
            this.renderMultiSqlPresetsList();
            this.onChanged();
            this.toast(`已添加预设: ${name}`);
            render(); // 刷新列表以更新"已添加"状态
          });
        }
      });
    };

    searchEl?.addEventListener('input', () => { render(); });
    render();
  }

  // 确保模态框样式
  private ensureModalStyle() {
    const STYLE_ID = 'visual-echarts-sql-modal-style';
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = `
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
        .veq-item-sql{font-size:11px; color: var(--b3-theme-on-surface-light); background: var(--b3-theme-background); padding:6px 8px; border-radius:4px; margin:0; white-space:pre-wrap; word-break:break-all; max-height:60px; overflow:auto}
        .veq-item-actions{display:flex; gap:4px; flex-shrink:0}
      `;
      document.head.appendChild(st);
    }
  }

  // 输入模态框
  private openInputModal(opts: { title: string; label?: string; defaultValue?: string; placeholder?: string; confirmText?: string; cancelText?: string; }): Promise<string | null> {
    this.ensureModalStyle();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'veq-modal-mask';
      const dialog = document.createElement('div');
      dialog.className = 'veq-modal veq-modal--input';
      dialog.innerHTML = `
        <div class="veq-modal-header">
          <div class="veq-modal-title">${this.escape(opts.title)}</div>
          <button class="veq-btn veq-ghost" data-close>×</button>
        </div>
        <div class="veq-modal-body">
          <div class="veq-field">
            ${opts.label ? `<label class="veq-label">${this.escape(opts.label)}</label>` : ''}
            <input class="veq-input" data-input placeholder="${this.escape(opts.placeholder || '')}" />
          </div>
        </div>
        <div class="veq-modal-footer">
          <button class="veq-btn veq-ghost" data-cancel>${this.escape(opts.cancelText || '取消')}</button>
          <button class="veq-btn" data-ok>${this.escape(opts.confirmText || '确定')}</button>
        </div>
      `;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      const input = dialog.querySelector('[data-input]') as HTMLInputElement;
      const close = (val: string | null) => { overlay.remove(); resolve(val); };
      (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', () => close(null));
      (dialog.querySelector('[data-cancel]') as HTMLButtonElement).addEventListener('click', () => close(null));
      (dialog.querySelector('[data-ok]') as HTMLButtonElement).addEventListener('click', () => close(input.value || ''));
      input.value = opts.defaultValue || '';
      input.focus();
      input.select();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') close(input.value || '');
      };
      overlay.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }

  // 确认模态框
  private openConfirmModal(opts: string | { message: string; title?: string; okText?: string; cancelText?: string; danger?: boolean; }): Promise<boolean> {
    this.ensureModalStyle();
    return new Promise(resolve => {
      const o = typeof opts === 'string' ? { message: opts } : opts;
      const title = (o.title || '确认');
      const message = o.message || '';
      const okText = (o.okText || '确定');
      const cancelText = (o.cancelText || '取消');
      const danger = !!o.danger;
      const overlay = document.createElement('div');
      overlay.className = 'veq-modal-mask';
      const dialog = document.createElement('div');
      dialog.className = 'veq-modal veq-modal--confirm' + (danger ? ' veq-modal--danger' : '');
      dialog.innerHTML = `
        <div class="veq-modal-header">
          <div class="veq-modal-title">${this.escape(title)}</div>
          <button class="veq-btn veq-ghost" data-close>×</button>
        </div>
        <div class="veq-modal-body">
          <div>${this.escape(message)}</div>
        </div>
        <div class="veq-modal-footer">
          <button class="veq-btn" data-ok>${this.escape(okText)}</button>
          <button class="veq-btn veq-ghost" data-cancel>${this.escape(cancelText)}</button>
        </div>
      `;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      const close = (val: boolean) => { overlay.remove(); resolve(val); };
      (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', () => close(false));
      (dialog.querySelector('[data-cancel]') as HTMLButtonElement).addEventListener('click', () => close(false));
      (dialog.querySelector('[data-ok]') as HTMLButtonElement).addEventListener('click', () => close(true));
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter') close(true);
      };
      overlay.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
  }

  // ========== 持久化 ==========

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
        const mappingSection = this.root.querySelector('[data-mapping-section]') as HTMLElement | null;
        const seriesSection = this.root.querySelector('[data-series-section]') as HTMLElement | null;
        
        if (this.sqlMode === 'single') {
          if (singleMode) singleMode.style.display = '';
          if (multiMode) multiMode.style.display = 'none';
          if (mappingSection) mappingSection.style.display = '';
          if (seriesSection) seriesSection.style.display = '';
        } else {
          if (singleMode) singleMode.style.display = 'none';
          if (multiMode) multiMode.style.display = '';
          if (mappingSection) mappingSection.style.display = 'none';
          if (seriesSection) seriesSection.style.display = 'none';
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
      this.renderTypeSettingsUI(); // 添加设置面板渲染
      this.applyTypeConstraints(this.root.querySelector('[data-merge]') as HTMLInputElement | null);
    } catch { /* ignore */ }
  }
}
