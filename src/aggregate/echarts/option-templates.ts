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
  debug?: boolean; // 是否输出调试信息
  debugSampleSize?: number; // 调试输出的采样条数
  /**
   * 统一的图表视图设置（与预设模式保持一致）。
   * bar: { stack, boundaryGap, xLabelRotate, label }
   * line: { smooth, boundaryGap, xLabelRotate, label }
   * pie: { innerRadius, outerRadius, roseType, label }
   */
  chartSettings?: any;
}


export function buildIIFEFromCtx(ctx: EchartsTplCtx) {
  const legend = (ctx.legend && ctx.legend.length)
    ? ctx.legend
    : (ctx.seriesExprs || []).map(s=>s.name);
  const legendArr = JSON.stringify(legend || []);
  const xExpr = ctx.xDataExpr || 'rows.map((_,i)=>String(i+1))';
  const needDualAxis = (ctx.seriesExprs||[]).some(s => (s as any).axisIndex === 1);
  const pieCount_ctx = (ctx.seriesExprs||[]).filter(s => (s.type||'line')==='pie').length;
  let pieNo_ctx = -1;
  const st: any = (ctx as any).chartSettings || {};
  const stCommon: any = st && st.common ? st.common : {};
  const legendPos = stCommon.legendPos as ('top'|'bottom'|'left'|'right'|undefined);
  const legendPatch = legendPos ? `
    try{ option.legend = option.legend || {}; option.legend.orient = ${(legendPos==='left'||legendPos==='right') ? `'vertical'` : `'horizontal'`}; option.legend.${legendPos} = 0; ${(legendPos==='left'||legendPos==='right') ? `option.legend.top = 'middle';` : ''} }catch(e){}` : '';
  const gridPatch = (stCommon && stCommon.grid && [stCommon.grid.top, stCommon.grid.right, stCommon.grid.bottom, stCommon.grid.left].every((v: any)=>Number.isFinite(v))) ? `
    option.grid = { top: ${Number(stCommon.grid.top)||0}, right: ${Number(stCommon.grid.right)||0}, bottom: ${Number(stCommon.grid.bottom)||0}, left: ${Number(stCommon.grid.left)||0}, containLabel: true };
  ` : '';
  const splitType = (function(){ const t = stCommon && stCommon.ySplitLine; return (t==='solid'||t==='none') ? t : 'dashed'; })();
  const seriesJs = (ctx.seriesExprs||[]).map(s=>{
    const type = s.type || 'line';
    const name = JSON.stringify(s.name);
    const smooth = ctx.smooth && type==='line' ? 'true' : 'false';
    const area = ctx.area && type==='line' ? `areaStyle: {},` : '';
    const stack = ctx.stack ? `stack: 'total',` : '';
    const yAxisIndex = (typeof (s as any).axisIndex === 'number' && (s as any).axisIndex! > 0) ? `yAxisIndex:${(s as any).axisIndex|0},` : '';
    const dataExpr = (type==='pie')
      ? `(function(){
        var ys = (${s.expr});
        // 若用户表达式已返回 {name, value} 数组，则直接使用
        if (Array.isArray(ys) && ys.length && typeof ys[0]==='object' && ys[0] && Object.prototype.hasOwnProperty.call(ys[0], 'value')) return ys;
        var xs = (${xExpr});
        var m = Math.min(xs.length, Array.isArray(ys)?ys.length:0);
        return xs.slice(0,m).map(function(n,i){ return { name: String(n), value: ys[i] }; });
      })()`
      : `(${s.expr})`;
    // 多饼图系列：分配同心环，避免重叠
    const pieExtra = (type==='pie' && pieCount_ctx>1) ? (function(){
      pieNo_ctx++;
      var ir0 = 0, or0 = 70; // SQL 模式默认 0%~70%
      var span = Math.max(1, or0 - ir0);
      var ring = span / pieCount_ctx;
      var r1 = Math.round(ir0 + ring*pieNo_ctx);
      var r2 = Math.round(ir0 + ring*(pieNo_ctx+1));
      if (r2 <= r1) r2 = r1 + 1;
      return `radius: ['${r1}%', '${r2}%'],`;
    })() : '';
    return `{
      name: ${name}, type: '${type}', ${stack} ${yAxisIndex} smooth: ${smooth}, ${area} ${pieExtra} z: 1,
      data: ${dataExpr}
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
    ${legendPatch}
    ${gridPatch}
    option.xAxis = [{ type: 'category', boundaryGap: ${ctx.boundaryGap ? 'true':'false'}, data: (${xExpr}), axisTick: { show:false }, axisLine: { show:false } }];
    option.yAxis = ${`[{
      type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { show: ${splitType!=='none' ? 'true' : 'false'}, lineStyle: { color: 'rgba(0, 0, 0, .38)', type: '${splitType==='solid' ? 'solid' : 'dashed'}' } }
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
 * 通过 AV API 获取数据并生成 ECharts IIFE。
 * - 以 getAttributeViewKeysByAvID + getAttributeViewPrimaryKeyValues 获取字段与行数据
 * - 在 IIFE 内部将原始行标准化为 { [keyName]: simpleValue } 结构，供 xDataExpr / seriesExprs 执行
 */
export interface EchartsAvTplCtx extends EchartsTplCtx {
  avID: string;
  viewID?: string;  // 可选：指定视图 ID，否则使用默认视图
  baseURL?: string;   // 例如 http://127.0.0.1:6806，留空表示同源
  page?: number;      // 默认 1
  pageSize?: number;  // 默认 -1 (全部)
  keyword?: string;   // 可选关键词过滤
}

export function buildIIFEFromAVCtx(ctx: EchartsAvTplCtx) {
  const legend = (ctx.legend && ctx.legend.length)
    ? ctx.legend
    : (ctx.seriesExprs || []).map(s=>s.name);
  const legendArr = JSON.stringify(legend || []);
  const xExpr = ctx.xDataExpr || 'rows.map((_,i)=>String(i+1))';
  const needDualAxis = (ctx.seriesExprs||[]).some(s => (s as any).axisIndex === 1);
  const isAllPie = (ctx.seriesExprs||[]).length>0 && (ctx.seriesExprs||[]).every(s => (s.type||'line')==='pie');
  const st: any = (ctx as any).chartSettings || {};
  // 兼容嵌套设置：{ bar: {...}, line: {...}, pie: {...} } 或平铺
  const stBar: any = (st && st.bar) ? st.bar : st;
  const stLine: any = (st && st.line) ? st.line : st;
  const stPie: any = (st && st.pie) ? st.pie : st;
  const stCommon: any = st && st.common ? st.common : {};
  const hasBar = (ctx.seriesExprs||[]).some(s => (s.type||'line')==='bar');
  const hasLine = (ctx.seriesExprs||[]).some(s => (s.type||'line')==='line');
  const pieCount = (ctx.seriesExprs||[]).filter(s => (s.type||'line')==='pie').length;
  let pieNo = -1;
  const seriesJs = (ctx.seriesExprs||[]).map(s=>{
    const type = s.type || 'line';
    const name = JSON.stringify(s.name);
    // 若提供统一设置，则以统一设置优先；在嵌套模式下按系列类型读取
    const smooth = ((type==='line') && ((typeof stLine.smooth === 'boolean' ? stLine.smooth : !!ctx.smooth))) ? 'true' : 'false';
    // 面积填充：优先读取嵌套 line.area，其次回退到 ctx.area
    const area = ((type==='line') && ((stLine && (stLine as any).area===true) || !!ctx.area)) ? `areaStyle: { normal: {} },` : '';
    const stack = ((type==='bar') && (typeof stBar.stack === 'boolean' ? stBar.stack : !!ctx.stack)) ? `stack: 'total',` : '';
    const yAxisIndex = (typeof (s as any).axisIndex === 'number' && (s as any).axisIndex! > 0) ? `yAxisIndex:${(s as any).axisIndex|0},` : '';
    const dataExpr = (type==='pie')
      ? `(function(){
        var ys = (${s.expr});
        // 若用户表达式已返回 {name, value} 数组，则直接使用
        if (Array.isArray(ys) && ys.length && typeof ys[0]==='object' && ys[0] && Object.prototype.hasOwnProperty.call(ys[0], 'value')) return ys;
        var xs = (${xExpr});
        var m = Math.min(xs.length, Array.isArray(ys)?ys.length:0);
        return xs.slice(0,m).map(function(n,i){ return { name: String(n), value: ys[i] }; });
      })()`
      : `(${s.expr})`;
    // 统一 label 设置：按系列类型读取（饼图取 pie.label）
    const label = (function(){
      let l: any;
      if (type==='bar') l = stBar && stBar.label;
      else if (type==='line') l = stLine && stLine.label;
      else if (type==='pie') l = stPie && stPie.label;
      return l ? `label: ${JSON.stringify(l)},` : '';
    })();
    // 饼图半径、玫瑰图
    const pieExtra = (type==='pie') ? (function(){
      const rose = (stPie && (stPie.roseType===false || stPie.roseType==='radius' || stPie.roseType==='area')) ? stPie.roseType : undefined;
      const parts: string[] = [];
      // 多饼图系列：把 [inner, outer] 区间分割为多条环带，避免重叠
      const irCfg = typeof stPie.innerRadius === 'number' ? Math.max(0, Math.min(100, stPie.innerRadius|0)) : 0;
      const orCfg = typeof stPie.outerRadius === 'number' ? Math.max(irCfg, Math.min(100, stPie.outerRadius|0)) : 70;
      if (pieCount > 1) {
        pieNo++;
        const span = Math.max(1, orCfg - irCfg);
        const ring = span / pieCount;
        let r1 = Math.round(irCfg + ring*pieNo);
        let r2 = Math.round(irCfg + ring*(pieNo+1));
        if (r2 <= r1) r2 = r1 + 1;
        parts.push(`radius: ['${r1}%', '${r2}%'],`);
      } else {
        parts.push(`radius: ['${irCfg}%', '${orCfg}%'],`);
      }
      if (rose!==undefined && rose!==false) parts.push(`roseType: '${rose}',`);
      return parts.join(' ');
    })() : '';
    return `{
      name: ${name}, type: '${type}', ${stack} ${yAxisIndex} smooth: ${smooth}, ${area} ${label} ${pieExtra} z: 1,
      data: ${dataExpr}
    }`;
  }).join(',\n');
  const baseURL = typeof ctx.baseURL === 'string' ? ctx.baseURL : '';
  const page = typeof ctx.page === 'number' ? (ctx.page|0) : 1;
  const pageSize = typeof ctx.pageSize === 'number' ? (ctx.pageSize|0) : -1;
  const keyword = ctx.keyword == null ? '' : String(ctx.keyword);
  const body = `(() => {
    // 调试：记录最近一次 AV 响应
    var __dbgLastAv = null;
    function getBase(){
      var explicit = ${JSON.stringify(baseURL)} || '';
      if (explicit) return explicit;
      try {
        var w = (window && window.parent) ? window.parent : window;
        if (w && w.location && /^https?:$/i.test(w.location.protocol)) return w.location.origin;
      } catch(e) { /* cross-origin */ }
      return 'http://127.0.0.1:6806';
    }
    function callAvSync(endpoint, payload){
      try{
        var xhr = new XMLHttpRequest();
        var base = getBase();
        // 包含凭据以传递同源/同站点 Cookie，减少偶发鉴权导致的失败
        try { xhr.withCredentials = true; } catch(e) { /* ignore */ }
        xhr.open('POST', base + '/api/av/' + endpoint, false);
        xhr.setRequestHeader('Content-Type','application/json');
        xhr.send(JSON.stringify(payload||{}));
        // 记录原始响应
        try { __dbgLastAv = { url: base + '/api/av/' + endpoint, status: xhr.status, responseText: xhr.responseText||'' }; } catch(e) { /* ignore */ }
        if (xhr.status>=200 && xhr.status<300){
          try{
            var res = JSON.parse(xhr.responseText||'{}');
            if (res && typeof res === 'object' && res.code === 0) return res.data;
          }catch(e){ /* ignore */ }
        }
      }catch(e){ /* ignore */ }
      return null;
    }
    function unwrapAttrVal(v){
      if (!v || typeof v !== 'object') return null;
      // 通用：若顶层存在 content 且为原始类型，直接返回
      if (Object.prototype.hasOwnProperty.call(v, 'content')) {
        var c = v.content; if (typeof c==='string' || typeof c==='number' || typeof c==='boolean') return c;
      }
      if (v.text && typeof v.text.content === 'string') return v.text.content;
      if (v.number && typeof v.number.content === 'number') return v.number.content;
      if (v.date && typeof v.date.content === 'number') return v.date.content;
      if (v.checkbox && typeof v.checkbox.checked === 'boolean') return v.checkbox.checked;
      if (v.url && typeof v.url.content === 'string') return v.url.content;
      if (v.email && typeof v.email.content === 'string') return v.email.content;
      if (v.phone && typeof v.phone.content === 'string') return v.phone.content;
      if (v.select && typeof v.select.content === 'string') return v.select.content;
      if (Array.isArray(v.mSelect)) return v.mSelect.map(function(it){ return it && it.content; });
      if (Array.isArray(v.relation)) return v.relation.map(function(it){ return it && (it.content || it.blockID); });
      if (v.created && typeof v.created.content === 'number') return v.created.content;
      if (v.updated && typeof v.updated.content === 'number') return v.updated.content;
      if (v.block) return v.block.content || v.block.id || null;
      return null;
    }
    // 使用 renderAttributeView 获取包含列定义与行值的完整数据
    var __payload = { id: ${JSON.stringify(ctx.avID)}, page: ${String(page)}, pageSize: ${String(pageSize)} };
    ${ctx.viewID ? `__payload.viewID = ${JSON.stringify(ctx.viewID)};` : ''}
    ${keyword ? `__payload.keyword = ${JSON.stringify(keyword)};` : ''}
    var rd = callAvSync('renderAttributeView', __payload) || {};
    var columns = (rd && rd.view && Array.isArray(rd.view.columns)) ? rd.view.columns : ((rd && Array.isArray(rd.columns)) ? rd.columns : []);
    var rowsRaw = (rd && rd.view && Array.isArray(rd.view.rows)) ? rd.view.rows : ((rd && Array.isArray(rd.rows)) ? rd.rows : []);
    // 分组视图兼容：从 rd.view.groups 扁平化 rows，并补充列定义
    var __groupCols = [];
    var __rowsFromGroupsLen = 0;
    (function __walkGroups(gs){ try{
      if (!gs || !Array.isArray(gs)) return;
      for (var gi=0; gi<gs.length; gi++){
        var g = gs[gi] || {};
        var gcols = Array.isArray(g.columns) ? g.columns : [];
        for (var k=0;k<gcols.length;k++){
          var gc = gcols[k] || {};
          var exists = false;
          for (var t=0;t<__groupCols.length;t++){ if (__groupCols[t] && __groupCols[t].id === gc.id) { exists = true; break; } }
          if (!exists) __groupCols.push(gc);
        }
        var grows = Array.isArray(g.rows) ? g.rows : [];
        if (grows.length){ __rowsFromGroupsLen += grows.length; rowsRaw = (rowsRaw || []).concat(grows); }
        if (Array.isArray(g.groups) && g.groups.length) __walkGroups(g.groups);
      }
    }catch(e){/* ignore */}})(rd && rd.view && rd.view.groups);
    if ((!columns || !columns.length) && __groupCols.length) columns = __groupCols;
    var id2Name = {};
    for (var i=0;i<columns.length;i++){ var c = columns[i]||{}; if (c && c.id) id2Name[c.id] = c.name || c.id; }
    for (var i2=0;i2<__groupCols.length;i2++){ var gc2 = __groupCols[i2]||{}; if (gc2 && gc2.id) id2Name[gc2.id] = gc2.name || gc2.id; }
    // 标准化行为按 keyName 命名的扁平对象（基于 cells[].value.keyID 映射到列名）
    var rows = rowsRaw.map(function(r){
      var o = { id: r && r.id };
      var cs = r && Array.isArray(r.cells) ? r.cells : [];
      for (var j=0;j<cs.length;j++){
        var cell = cs[j] || {}; var v = cell.value || {}; var keyID = v.keyID || '';
        var name = '';
        // 优先使用同索引列名
        if (columns[j] && (columns[j].name || columns[j].id)) name = columns[j].name || columns[j].id;
        // 其次尝试通过 keyID 映射
        if (!name && keyID) name = id2Name[keyID] || keyID;
        // 仍失败则兜底列名
        if (!name) name = 'C' + j;
        if (!name) continue;
        o[name] = unwrapAttrVal(v);
      }
      return o;
    });
    const option = {};
    option.title = { text: ${JSON.stringify(ctx.title || '')} };
    option.backgroundColor = 'transparent';
    option.tooltip = ${isAllPie ? `{ trigger: 'item' }` : `{ trigger: 'axis', axisPointer: { lineStyle: { width: 0 } } }`};
    option.legend = ${isAllPie ? `{ data: (${xExpr}) }` : `{ data: ${legendArr} }`};
    ${(function(){
      const pos = (stCommon && (stCommon.legendPos==='top'||stCommon.legendPos==='bottom'||stCommon.legendPos==='left'||stCommon.legendPos==='right')) ? stCommon.legendPos : null;
      if (!pos) return '';
      const orient = (pos==='left'||pos==='right') ? 'vertical' : 'horizontal';
      const extra = (pos==='left'||pos==='right') ? `option.legend.top = 'middle';` : '';
      return `try{ option.legend.orient='${orient}'; option.legend.${pos}=0; ${extra} }catch(e){}`;
    })()}
    ${(function(){
      try{
        const g = stCommon && stCommon.grid;
        if (g && [g.top,g.right,g.bottom,g.left].every((v: any)=>Number.isFinite(v))) {
          return `option.grid = { top: ${Number(stCommon.grid.top)||0}, right: ${Number(stCommon.grid.right)||0}, bottom: ${Number(stCommon.grid.bottom)||0}, left: ${Number(stCommon.grid.left)||0}, containLabel: true };`;
        }
      }catch(e){}
      return '';
    })()}
    ${!isAllPie ? `
    option.xAxis = [{ type: 'category', boundaryGap: ${(function(){
      if (typeof (ctx as any).boundaryGap === 'boolean') return (ctx as any).boundaryGap ? 'true' : 'false';
      if (st && (st.bar || st.line)) {
        if (hasBar && typeof stBar.boundaryGap === 'boolean') return stBar.boundaryGap ? 'true' : 'false';
        if (hasLine && typeof stLine.boundaryGap === 'boolean') return stLine.boundaryGap ? 'true' : 'false';
      }
      if (typeof st.boundaryGap === 'boolean') return st.boundaryGap ? 'true' : 'false';
      return 'false';
    })()}, data: (${xExpr}), axisTick: { show:false }, axisLine: { show:false }, axisLabel: { ${(function(){
      if (st && (st.bar || st.line)) {
        if (hasLine && typeof stLine.xLabelRotate === 'number') return `rotate: ${stLine.xLabelRotate|0}`;
        if (hasBar && typeof stBar.xLabelRotate === 'number') return `rotate: ${stBar.xLabelRotate|0}`;
      }
      if (typeof st.xLabelRotate === 'number') return `rotate: ${st.xLabelRotate|0}`;
      return '';
    })()} } }];
    option.yAxis = ${`[{
      type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { ${(function(){ const t = stCommon && stCommon.ySplitLine; const tp = (t==='solid'||t==='none')?t:'dashed'; return `show: ${tp!=='none' ? 'true' : 'false'}, lineStyle: { color: 'rgba(0, 0, 0, .38)', type: '${(tp==='solid')?'solid':'dashed'}' }`; })()} }
    }${needDualAxis ? ", { type: 'value', axisTick: { show:false }, axisLine: { show:false }, splitLine: { show:false } }" : ''}]`};
    ` : ''}
    option.series = [${seriesJs}];
    ${Array.isArray(ctx.colors) && ctx.colors.length ? `
    try{ (option.series||[]).forEach(function(s, i){ s.itemStyle = s.itemStyle || {}; s.itemStyle.color = ${JSON.stringify(ctx.colors)}[i] || s.itemStyle.color; }); }catch(e){}
    ` : ''}
    ${ctx.debug ? `
    try{
      var __N = ${Math.max(1, ctx.debugSampleSize || 5)};
      var xData = (option.xAxis && option.xAxis[0] && option.xAxis[0].data) ? option.xAxis[0].data : [];
      var seriesDbg = (option.series||[]).map(function(s){
        var d = Array.isArray(s.data)? s.data:[];
        var pairsSample = (function(){ var m=Math.min(__N, Math.min(d.length, xData.length)); var ps=[]; for(var i=0;i<m;i++){ ps.push({ x: xData[i], y: d[i] }); } return ps; })();
        return { name: s.name, type: s.type, yLen: d.length, ySample: d.slice(0, __N), pairsSample: pairsSample };
      });
      var cols = (columns||[]).map(function(c){ return c && c.name; }).filter(Boolean);
      var rawFirstCellKeys = (function(){ try{ var rr = Array.isArray(rowsRaw)? rowsRaw : []; if(!rr.length) return []; var c0 = rr[0] && Array.isArray(rr[0].cells) ? rr[0].cells : []; return c0.slice(0, Math.min(c0.length, __N)).map(function(ci){ var v = (ci||{}).value||{}; return Object.keys(v); }); }catch(e){ return []; } })();
      var rowsRawSample = (function(){ try{ var rr = Array.isArray(rowsRaw)? rowsRaw : []; return rr.slice(0, __N).map(function(r){ var cs = Array.isArray(r&&r.cells)? r.cells : []; return { id: r && r.id, cellsSample: cs.slice(0, Math.min(cs.length, __N)).map(function(ci){ var v=(ci||{}).value||{}; return { keyID: v.keyID||'', keys:Object.keys(v), content: unwrapAttrVal(v) }; }) }; }); }catch(e){ return []; } })();
      var net = (function(){
        try{
          var info = __dbgLastAv || {};
          var txt = String(info.responseText||'');
          var len = txt.length;
          var limit = 1200;
          var snippet = len<=limit ? txt : (txt.slice(0, limit) + '…(+' + (len-limit) + ')');
          var parsed = null; try { parsed = JSON.parse(txt||'null'); } catch(e) { parsed = null; }
          var topKeys = parsed && typeof parsed==='object' ? Object.keys(parsed) : [];
          return { url: info.url||null, status: info.status||null, textLength: len, textSnippet: snippet, jsonTopKeys: topKeys };
        }catch(e){ return null; }
      })();
      var dbg = {
        base: (function(){ try{ var w=(window&&window.parent)?window.parent:window; return (w&&w.location)?w.location.origin:null; }catch(e){ return null; } })(),
        payload: __payload,
        hasView: !!(rd && rd.view),
        rawColumnsLen: Array.isArray((rd&&rd.view&&rd.view.columns)?rd.view.columns:((rd&&rd.columns)||[])) ? ((rd&&rd.view&&rd.view.columns)?rd.view.columns.length:((rd&&rd.columns)||[]).length) : 0,
        rawRowsLen: Array.isArray((rd&&rd.view&&rd.view.rows)?rd.view.rows:((rd&&rd.rows)||[])) ? ((rd&&rd.view&&rd.view.rows)?rd.view.rows.length:((rd&&rd.rows)||[]).length) : 0,
        hasGroups: !!(rd && rd.view && Array.isArray(rd.view.groups) && rd.view.groups.length),
        rowsFromGroupsLen: __rowsFromGroupsLen,
        rawFirstCellKeys: rawFirstCellKeys,
        rowsRawSample: rowsRawSample, // 映射前：原始行样本（简化）
        columns: cols,
        rowsLen: Array.isArray(rows)? rows.length : 0,
        rowsSample: Array.isArray(rows)? rows.slice(0, __N) : [], // 映射后：已扁平化行样本
        xLen: Array.isArray(xData)? xData.length : 0,
        xSample: Array.isArray(xData)? xData.slice(0, __N) : [],
        series: seriesDbg, // 映射后：各系列的最终 data（含 x/y 对样本）
        network: net // 网络原始响应（截断）
      };
      console.log('[ECharts AV Debug]', dbg);
    }catch(e){}
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
