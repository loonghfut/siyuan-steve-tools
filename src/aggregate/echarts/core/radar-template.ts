import { genUnwrapAttrValFn, genNormalizeAvResponseSnippet, genBuildFlatRowsSnippet } from '../av_data/av-iife-snippets';
import { EchartsAvTplCtx } from './option-templates';

/**
 * Radar IIFE builder
 * UI will pass ctx.radarIndicators and/or ctx.radarSeries when needed.
 */
export function buildRadarIIFEFromAVCtx(ctx: EchartsAvTplCtx & any) {
  const title = JSON.stringify(ctx.title || '');
  const baseURL = typeof ctx.baseURL === 'string' ? ctx.baseURL : '';
  const page = typeof ctx.page === 'number' ? (ctx.page | 0) : 1;
  const pageSize = typeof ctx.pageSize === 'number' ? (ctx.pageSize | 0) : 99999;

  const indicatorsJson = Array.isArray((ctx as any).radarIndicators) ? JSON.stringify((ctx as any).radarIndicators) : 'null';
  const xDataExprJson = typeof (ctx as any).xDataExpr === 'string' ? JSON.stringify((ctx as any).xDataExpr) : 'null';
  const radarSeriesJson = Array.isArray((ctx as any).radarSeries) ? JSON.stringify((ctx as any).radarSeries) : 'null';
  const fallbackSeriesExprs = Array.isArray(ctx.seriesExprs || []) ? JSON.stringify((ctx.seriesExprs || []).map((s: any) => ({ name: s.name, expr: s.expr }))) : '[]';
  const colorsJs = Array.isArray(ctx.colors) && ctx.colors.length ? JSON.stringify(ctx.colors) : 'null';
  const uniformMaxJs = (typeof (ctx as any).radarUniformMax === 'number' && Number.isFinite((ctx as any).radarUniformMax)) ? String((ctx as any).radarUniformMax) : 'null';
  const tooltipShowJs = (typeof (ctx as any).radarTooltipShow === 'boolean') ? String(!!(ctx as any).radarTooltipShow) : 'true';

  const body = `(() => {
    function getBase(){
      var explicit = ${JSON.stringify(baseURL)} || '';
      if (explicit) return explicit;
      try { var w = (window && window.parent) ? window.parent : window; if (w && w.location && /^https?:$/i.test(w.location.protocol)) return w.location.origin; } catch(e){}
      return 'http://127.0.0.1:6806';
    }
    function callAvSync(endpoint, payload){
      try{
        var xhr = new XMLHttpRequest();
        var base = getBase();
        try { xhr.withCredentials = true; } catch(e) {}
        xhr.open('POST', base + '/api/av/' + endpoint, false);
        xhr.setRequestHeader('Content-Type','application/json');
        xhr.send(JSON.stringify(payload||{}));
        if (xhr.status>=200 && xhr.status<300){
          try{ var res = JSON.parse(xhr.responseText||'{}'); if (res && typeof res === 'object' && res.code === 0) return res.data; } catch(e){}
        }
      }catch(e){}
      return null;
    }
    ${genUnwrapAttrValFn()}
    var __payload = { id: ${JSON.stringify(ctx.avID)}, page: ${String(page)}, pageSize: ${String(pageSize)} };
    ${ctx.viewID ? `__payload.viewID = ${JSON.stringify(ctx.viewID)};` : ''}
    var rd = callAvSync('renderAttributeView', __payload) || {};
    ${genNormalizeAvResponseSnippet()}
    ${genBuildFlatRowsSnippet()}

    // indicators: prefer explicit, otherwise derive from xDataExpr (X 轴映射)
    var indicators = ${indicatorsJson};
    if (!indicators) {
      try {
        var derived = [];
        try {
          var xexpr = ${xDataExprJson};
          if (typeof xexpr === 'string' && xexpr.trim().length) {
            try {
              var fnx = new Function('rows','columns','unwrapAttrVal','return (' + xexpr + ')');
              var xout = fnx(rows, columns, unwrapAttrVal);
              if (Array.isArray(xout)) {
                // normalize to string labels
                for (var xi=0; xi<xout.length; xi++) {
                  var lv = xout[xi];
                  derived.push(lv == null ? '' : String(lv));
                }
              }
            } catch(e) { /* ignore xexpr eval error */ }
          }
        } catch(e) { /* ignore */ }
        // unique preserve order
        var seen = Object.create(null);
        var uniq = [];
        for (var i=0;i<derived.length;i++){
          var v = String(derived[i] == null ? '' : derived[i]);
          if (!seen[v]) { seen[v] = 1; uniq.push(v); }
        }
        if (uniq.length) {
          indicators = uniq.map(function(l){ return { name: l }; });
        } else {
          // fallback to seriesExprs' names
          var fallback = ${fallbackSeriesExprs};
          if (Array.isArray(fallback) && fallback.length) {
            indicators = fallback.map(function(it){ return { name: String(it.name || ''), key: undefined }; });
          } else {
            indicators = [];
          }
        }
      } catch(e) { indicators = []; }
    }

    // series definitions
    var radarSeries = ${radarSeriesJson};
    if (!radarSeries) {
      try {
        var fser = ${fallbackSeriesExprs};
        radarSeries = (Array.isArray(fser) ? fser : []).map(function(it){ return { name: String(it.name||''), valuesExpr: it.expr }; });
      } catch(e) { radarSeries = []; }
    }

  var option = { title: { text: ${title} }, backgroundColor: 'transparent' };
    // build radar.indicator with optional max (will be filled by data scanning when missing)
  var indicatorOut = indicators.map(function(it, idx){ return { name: String(it && it.name ? it.name : ('指标' + (idx+1))), max: (typeof (it && it.max) === 'number' && isFinite(it.max)) ? it.max : undefined }; });
  var uniformMax = ${uniformMaxJs};

    // evaluate each series valuesExpr to produce number arrays
    var seriesData = [];
    for (var si=0; si<radarSeries.length; si++){
      var sdef = radarSeries[si];
      var vals = [];
      try {
        vals = (function(){
          try {
            if (!sdef || !sdef.valuesExpr) return [];
            var fn = new Function('rows','columns','unwrapAttrVal','return (' + sdef.valuesExpr + ')');
            var out = fn(rows, columns, unwrapAttrVal);
            return Array.isArray(out) ? out : [];
          } catch(e){ return []; }
        })();
      } catch(e) { vals = []; }
      // normalize to numeric values
      vals = Array.isArray(vals) ? vals.map(function(v){ var n = Number(v); return Number.isFinite(n) ? n : null; }) : [];
      seriesData.push(vals);
    }

    // fill missing max values by scanning data
    if (uniformMax != null && isFinite(uniformMax)) {
      for (var um=0; um<indicatorOut.length; um++) {
        indicatorOut[um].max = uniformMax;
      }
    } else {
      for (var j=0;j<indicatorOut.length;j++){
        if (indicatorOut[j].max == null) {
          var m = 0;
          for (var si2=0; si2<seriesData.length; si2++){
            var v = seriesData[si2] && seriesData[si2][j]; if (v == null) continue; var nv = Number(v); if (!Number.isFinite(nv)) continue; if (nv > m) m = nv;
          }
          indicatorOut[j].max = (m > 0) ? Math.ceil(m) : 100;
        }
      }
    }

    // assemble series option
    var outSeries = [];
    for (var k=0;k<seriesData.length;k++){
      outSeries.push({ name: radarSeries[k].name || ('系列'+(k+1)), type: 'radar', data: [ { value: seriesData[k], name: radarSeries[k].name || ('系列'+(k+1)) } ] });
    }
  option.radar = { indicator: indicatorOut };
  option.tooltip = { trigger: 'item', show: ${tooltipShowJs} };
    option.series = outSeries;
    option.legend = { data: radarSeries.map(function(s){ return s.name; }) };
    try{ 
      var _colors = ${colorsJs};
      if (Array.isArray(_colors) && _colors.length) option.color = _colors;
    }catch(e){}
    option.animation = false;
    return option;
  })()`;
  return body;
}