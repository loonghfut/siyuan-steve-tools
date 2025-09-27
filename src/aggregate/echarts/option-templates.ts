export interface EchartsTplCtx {
  title?: string;
  legend?: string[];
  xDataExpr?: string; // JS 表达式，从 rows 推导 xAxis data
  seriesExprs?: Array<{ name: string; expr: string; type?: 'line'|'bar'|'scatter'|'pie', axisIndex?: number }>; // 从 rows 推导 series.data
  smooth?: boolean; // 全局平滑（针对 line）
  area?: boolean;   // 是否填充面积（针对 line）
  stack?: boolean;  // 是否堆叠（针对同类型）
  colors?: string[]; // 系列颜色（按顺序）
  boundaryGap?: boolean; // x 轴是否保留间隙
}

export const defaultLineAreaTpl: EchartsTplCtx = {
  title: '最近 30 天',
  legend: ['系列1'],
  xDataExpr: 'rows.map(r=>r.x)',
  seriesExprs: [
    { name: '系列1', expr: 'rows.map(r=>Number(r.y1)||0)', type: 'line' },
  ],
  smooth: true,
  area: true,
  stack: false,
  boundaryGap: false,
};

export const barTpl: EchartsTplCtx = {
  title: '柱状图',
  legend: ['系列1'],
  xDataExpr: 'rows.map(r=>r.x)',
  seriesExprs: [
    { name: '系列1', expr: 'rows.map(r=>Number(r.y1)||0)', type: 'bar' },
  ],
  smooth: false,
  area: false,
  stack: false,
  boundaryGap: true,
};

export const stackedAreaTpl: EchartsTplCtx = {
  title: '堆叠面积图',
  legend: ['系列1','系列2'],
  xDataExpr: 'rows.map(r=>r.x)',
  seriesExprs: [
    { name: '系列1', expr: 'rows.map(r=>Number(r.y1)||0)', type: 'line' },
    { name: '系列2', expr: 'rows.map(r=>Number(r.y2)||0)', type: 'line' },
  ],
  smooth: true,
  area: true,
  stack: true,
  boundaryGap: false,
};

export const scatterTpl: EchartsTplCtx = {
  title: '散点图',
  legend: ['系列1'],
  xDataExpr: 'rows.map(r=>r.x)',
  seriesExprs: [
    { name: '系列1', expr: 'rows.map(r=>Number(r.y1)||0)', type: 'scatter' },
  ],
  smooth: false,
  area: false,
  stack: false,
  boundaryGap: true,
};

export const mixedDualAxisTpl: EchartsTplCtx = {
  title: '混合双轴（柱+线）',
  legend: ['柱状-系列1','折线-系列2'],
  xDataExpr: 'rows.map(r=>r.x)',
  seriesExprs: [
    { name: '柱状-系列1', expr: 'rows.map(r=>Number(r.y1)||0)', type: 'bar', axisIndex: 0 },
    { name: '折线-系列2', expr: 'rows.map(r=>Number(r.y2)||0)', type: 'line', axisIndex: 1 },
  ],
  smooth: true,
  area: false,
  stack: false,
  boundaryGap: true,
};

export function buildIIFEFromCtx(ctx: EchartsTplCtx) {
  const legend = (ctx.legend && ctx.legend.length)
    ? ctx.legend
    : (ctx.seriesExprs || []).map(s=>s.name);
  const legendArr = JSON.stringify(legend || []);
  const xExpr = ctx.xDataExpr || 'rows.map((_,i)=>String(i+1))';
  const needDualAxis = (ctx.seriesExprs||[]).some(s => (s as any).axisIndex === 1);
  const seriesJs = (ctx.seriesExprs||[]).map(s=>{
    const type = s.type || 'line';
    const name = JSON.stringify(s.name);
    const smooth = ctx.smooth && type==='line' ? 'true' : 'false';
    const area = ctx.area && type==='line' ? `areaStyle: { normal: {} },` : '';
    const stack = ctx.stack ? `stack: 'total',` : '';
    const yAxisIndex = (typeof (s as any).axisIndex === 'number' && (s as any).axisIndex! > 0) ? `yAxisIndex:${(s as any).axisIndex|0},` : '';
    return `{
      name: ${name}, type: '${type}', ${stack} ${yAxisIndex} smooth: ${smooth}, ${area} z: 1,
      data: (${s.expr})
    }`;
  }).join(',\n');
  const body = `(() => {
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
    const rows = fetchSqlSync($SQL$);
    option.title = { text: ${JSON.stringify(ctx.title || '')} };
    option.backgroundColor = 'transparent';
    option.tooltip = { trigger: 'axis', axisPointer: { lineStyle: { width: 0 } } };
    option.legend = { data: ${legendArr} };
    option.xAxis = [{ type: 'category', boundaryGap: ${ctx.boundaryGap ? 'true':'false'}, data: (${xExpr}), axisTick: { show:false }, axisLine: { show:false } }];
    option.yAxis = ${`[{
      type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { lineStyle: { color: 'rgba(0, 0, 0, .38)', type: 'dashed' } }
    }${needDualAxis ? ", { type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { show:false } }" : ''}]`};
    option.series = [${seriesJs}];
    ${Array.isArray(ctx.colors) && ctx.colors.length ? `
    try{ (option.series||[]).forEach(function(s, i){ s.itemStyle = s.itemStyle || {}; s.itemStyle.color = ${JSON.stringify(ctx.colors)}[i] || s.itemStyle.color; }); }catch(e){}
    ` : ''}
    return option;
  })()`;
  return body;
}

/**
 * 生成按“预设名 → SQL → 行数”计数的 ECharts 代码（IIFE）。
 * - items: [{ name, sql }]
 * - type: 'bar' | 'line' | 'pie'
 */
export function buildPresetCountIIFE(
  items: Array<{ name: string; sql: string }>,
  type: 'bar'|'line'|'pie',
  title?: string,
  chartSettings?: any,
  colors?: string[]
) {
  // 兼容旧/新签名处理
  let settingsObj: any = chartSettings;
  let palette: string[] | undefined = colors;
  const maybeArgs: any[] = Array.prototype.slice.call(arguments);
  // 4 参数老用法：第4位可能是颜色数组
  if (maybeArgs.length === 4 && Array.isArray(maybeArgs[3])) {
    palette = maybeArgs[3];
    settingsObj = undefined;
  }
  // 4 参数老用法：第4位可能是设置对象
  if (maybeArgs.length === 4 && !Array.isArray(maybeArgs[3]) && typeof maybeArgs[3] === 'object') {
    settingsObj = maybeArgs[3];
  }
  // 5 参数新用法：第4位设置对象，第5位颜色数组
  if (maybeArgs.length >= 5) {
    settingsObj = maybeArgs[3];
    palette = maybeArgs[4];
  }
  const safeItems = (items || []).map(it => ({
    name: String(it?.name ?? ''),
    // 将反引号转义以便嵌入到模板字符串
    sql: String(it?.sql ?? '').replace(/`/g, '\\`')
  }));
  const itemsJson = JSON.stringify(safeItems);
  const t = type === 'pie' ? 'pie' : (type === 'line' ? 'line' : 'bar');
  const titleText = JSON.stringify(title || '预设计数');
  const colorsJs = Array.isArray(palette) && palette.length ? JSON.stringify(palette) : '';
  const settingsJs = JSON.stringify(settingsObj || {});
  const body = `(() => {
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
    var items = ${itemsJson};
  var st = ${settingsJs};
    var names = [];
    var counts = [];
    for (var i=0;i<items.length;i++){
      var it = items[i];
      var rows = fetchSqlSync(it.sql);
      names.push(it.name);
      counts.push(Array.isArray(rows) ? rows.length : 0);
    }
    var option = { title: { text: ${titleText} }, backgroundColor: 'transparent' };
    ${t === 'pie' ? `
    option.tooltip = { trigger: 'item' };
    option.legend = { data: names };
    var pie = { type: 'pie', name: '计数', data: names.map(function(n,i){ return { name: n, value: counts[i] }; }) };
    if (st && (st.innerRadius || st.outerRadius)) {
      var ir = Math.max(0, Math.min(100, Number(st.innerRadius||0)));
      var or = Math.max(ir, Math.min(100, Number(st.outerRadius||70)));
      pie.radius = [ir + '%', or + '%'];
    }
    if (st && st.roseType) pie.roseType = st.roseType;
    if (st && st.label) { pie.label = st.label; }
    option.series = [pie];
    ` : `
    option.tooltip = { trigger: 'axis', axisPointer: { lineStyle: { width: 0 } } };
    option.legend = { data: ['计数'] };
    var xRotate = st && typeof st.xLabelRotate === 'number' ? st.xLabelRotate|0 : 0;
    var boundaryGap = (st && typeof st.boundaryGap === 'boolean') ? !!st.boundaryGap : ${t === 'bar' ? 'true' : 'false'};
    option.xAxis = [{ type: 'category', boundaryGap: boundaryGap, data: names, axisTick: { show:false }, axisLine: { show:false }, axisLabel: { rotate: xRotate } }];
    var splitType = st && st.ySplitLine ? st.ySplitLine : 'dashed';
    option.yAxis = [{ type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { show: splitType!=='none', lineStyle: { color: 'rgba(0, 0, 0, .38)', type: splitType==='solid'?'solid':'dashed' } } }];
    var seriesItem = { type: '${t}', name: '计数', data: counts };
    if (st && st.stack && '${t}'==='bar') seriesItem.stack = 'total';
    if (st && st.smooth && '${t}'==='line') seriesItem.smooth = true;
    if (st && st.label) seriesItem.label = st.label;
    option.series = [seriesItem];
    `}
    ${colorsJs ? `option.color = ${colorsJs};` : ''}
    return option;
  })()`;
  return body;
}
