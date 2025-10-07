/**
 * SQL 查询模式下的数据映射逻辑(纯函数)
 * 将可视化选择(xKey、排序、合并/非合并、系列聚合)映射为 x 轴与各系列的表达式字符串
 */

import { FilterCondition, buildFilterExpression } from '../ui/filter-manager';

export type SortOrder = 'none' | 'asc' | 'desc';
export type SeriesAgg = 'raw' | 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface SeriesItem {
  name: string;
  expr: string;
  type?: 'line' | 'bar' | 'scatter' | 'pie';
  axisIndex?: number;
  valueKey?: string;
  agg?: SeriesAgg;
  filters?: FilterCondition[];  // 数据筛选条件
}

export interface MappingInput {
  visualMode: boolean;
  mergeMode: boolean;
  sort: SortOrder;
  xKey: string;
  bucket?: 'none' | 'year' | 'month' | 'day' | 'hour';
  series: SeriesItem[];
}

export interface MappingOutput {
  xExpr: string;
  series: SeriesItem[];
}

/**
 * 基于可视化配置构建 x 轴表达式与每个系列的数据表达式
 * 保持与 db-data-mapping 一致的字符串模板(包括 toNum 与排序逻辑)
 */
export function buildSqlMappingExpressions(input: MappingInput): MappingOutput {
  const { visualMode, mergeMode, sort, xKey, series } = input;
  const bucket = input.bucket || 'none';

  // 将时间戳/日期字符串转为桶键与可读标签
  const bucketFns = {
    year: `function __bucketKey(v){ var n=Number(v); if(!isFinite(n)){ var d=new Date(String(v)); if(isNaN(+d)) return null; n=d.getTime(); } var d=new Date(n); return String(d.getFullYear()); };
           function __bucketLabel(k){ return k; }`,
    month: `function __bucketKey(v){ var n=Number(v); if(!isFinite(n)){ var d=new Date(String(v)); if(isNaN(+d)) return null; n=d.getTime(); } var d=new Date(n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
             function __bucketLabel(k){ return k; }`,
    day: `function __bucketKey(v){ var n=Number(v); if(!isFinite(n)){ var d=new Date(String(v)); if(isNaN(+d)) return null; n=d.getTime(); } var d=new Date(n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
           function __bucketLabel(k){ return k; }`,
    hour: `function __bucketKey(v){ var n=Number(v); if(!isFinite(n)){ var d=new Date(String(v)); if(isNaN(+d)) return null; n=d.getTime(); } var d=new Date(n); return String(d.getHours()).padStart(2,'0'); };
      function __bucketLabel(k){ return String(k).padStart(2,'0')+':00'; }`
  } as const;

  if (!visualMode) {
    // 可视化关闭时不改写表达式，沿用原 series.expr 与外部 xExpr
    return { xExpr: '', series: series.slice() };
  }

  if (mergeMode) {
    const bucketPrelude = bucket === 'none' ? '' : bucketFns[bucket as 'year' | 'month' | 'day' | 'hour'];
    // 合并模式：唯一化并聚合
    const xExprRaw = (!xKey)
      ? 'rows.map((_, i) => String(i+1))'
      : (bucket === 'none'
        ? `Array.from(new Set(rows.map(function(r){ var xv = r[${JSON.stringify(xKey)}]; return String(xv); })))`
        : `(()=>{ ${bucketPrelude} var set = new Set(); rows.forEach(function(r){ var xv=r[${JSON.stringify(xKey)}]; var k=__bucketKey(xv); if(k!=null) set.add(k); }); return Array.from(set); })()`);

    const xExprSorted = (() => {
      if (sort === 'none') return xExprRaw;
      const asc = sort === 'asc';
      return `(()=>{ var arr = (${xExprRaw}).slice(); arr.sort(function(a,b){ if(a===b) return 0; return (a>b?1:-1)*${asc ? 1 : -1}; }); return arr; })()`;
    })();

    const catsDef = (bucket === 'none')
      ? `(function(){ var cats = (${xExprSorted}); return cats; })()`
      : `(function(){ var raw=(${xExprSorted}); ${bucketPrelude} return raw.map(function(k){ return __bucketLabel(k); }); })()`;

    const mapped = series.map((s) => {
      const key = s.valueKey || xKey;
      const agg = s.agg || 'count';
      
      // 构建筛选表达式
      const filterExpr = buildFilterExpression(s.filters);
      
      let dataExpr = '';
      
      if (!key) {
        dataExpr = `${catsDef}.map(()=>0)`;
      } else if (agg === 'count') {
        if (bucket === 'none') {
          const baseFilter = `function(r){ return String(r[${JSON.stringify(xKey)}])===c; }`;
          const combinedFilter = filterExpr 
            ? `function(r){ return String(r[${JSON.stringify(xKey)}])===c && (${filterExpr}); }` 
            : baseFilter;
          dataExpr = `${catsDef}.map(function(c){ return rows.filter(${combinedFilter}).length; })`;
        } else {
          const filterCheck = filterExpr ? ` && (${filterExpr})` : '';
          dataExpr = `(function(){ ${bucketPrelude} var cats = (${xExprSorted}); return cats.map(function(k){ var cnt=0; rows.forEach(function(r){ var xv=r[${JSON.stringify(xKey)}]; if(__bucketKey(xv)===k${filterCheck}) cnt++; }); return cnt; }); })()`;
        }
      } else if (agg === 'sum') {
        if (bucket === 'none') {
          const baseFilter = `function(r){ return String(r[${JSON.stringify(xKey)}])===c; }`;
          const combinedFilter = filterExpr 
            ? `function(r){ return String(r[${JSON.stringify(xKey)}])===c && (${filterExpr}); }` 
            : baseFilter;
          dataExpr = `(function(){ var cats = (${xExprSorted}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(c){ return rows.filter(${combinedFilter}).reduce(function(a,b){ var n=toNum(b[${JSON.stringify(key)}]); return a + (n==null?0:n); },0); }); })()`;
        } else {
          const filterCheck = filterExpr ? ` && (${filterExpr})` : '';
          dataExpr = `(function(){ ${bucketPrelude} var cats = (${xExprSorted}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(k){ var sum=0; rows.forEach(function(r){ var xv=r[${JSON.stringify(xKey)}]; if(__bucketKey(xv)===k${filterCheck}){ var n=toNum(r[${JSON.stringify(key)}]); sum += (n==null?0:n); } }); return sum; }); })()`;
        }
      } else if (agg === 'avg') {
        if (bucket === 'none') {
          const baseFilter = `function(r){ return String(r[${JSON.stringify(xKey)}])===c; }`;
          const combinedFilter = filterExpr 
            ? `function(r){ return String(r[${JSON.stringify(xKey)}])===c && (${filterExpr}); }` 
            : baseFilter;
          dataExpr = `(function(){ var cats = (${xExprSorted}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(c){ var arr = rows.filter(${combinedFilter}).map(function(b){ return toNum(b[${JSON.stringify(key)}]); }).filter(function(v){ return v!=null; }); return arr.length? (arr.reduce(function(a,b){return a+b;},0)/arr.length):0; }); })()`;
        } else {
          const filterCheck = filterExpr ? ` && (${filterExpr})` : '';
          dataExpr = `(function(){ ${bucketPrelude} var cats = (${xExprSorted}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(k){ var arr = []; rows.forEach(function(r){ var xv=r[${JSON.stringify(xKey)}]; if(__bucketKey(xv)===k${filterCheck}){ var n=toNum(r[${JSON.stringify(key)}]); if(n!=null) arr.push(n); } }); return arr.length? (arr.reduce(function(a,b){return a+b;},0)/arr.length):0; }); })()`;
        }
      } else if (agg === 'min') {
        if (bucket === 'none') {
          const baseFilter = `function(r){ return String(r[${JSON.stringify(xKey)}])===c; }`;
          const combinedFilter = filterExpr 
            ? `function(r){ return String(r[${JSON.stringify(xKey)}])===c && (${filterExpr}); }` 
            : baseFilter;
          dataExpr = `(function(){ var cats = (${xExprSorted}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(c){ var arr = rows.filter(${combinedFilter}).map(function(b){ return toNum(b[${JSON.stringify(key)}]); }).filter(function(v){ return v!=null; }); return arr.length? Math.min.apply(null, arr):0; }); })()`;
        } else {
          const filterCheck = filterExpr ? ` && (${filterExpr})` : '';
          dataExpr = `(function(){ ${bucketPrelude} var cats = (${xExprSorted}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(k){ var arr = []; rows.forEach(function(r){ var xv=r[${JSON.stringify(xKey)}]; if(__bucketKey(xv)===k${filterCheck}){ var n=toNum(r[${JSON.stringify(key)}]); if(n!=null) arr.push(n); } }); return arr.length? Math.min.apply(null, arr):0; }); })()`;
        }
      } else if (agg === 'max') {
        if (bucket === 'none') {
          const baseFilter = `function(r){ return String(r[${JSON.stringify(xKey)}])===c; }`;
          const combinedFilter = filterExpr 
            ? `function(r){ return String(r[${JSON.stringify(xKey)}])===c && (${filterExpr}); }` 
            : baseFilter;
          dataExpr = `(function(){ var cats = (${xExprSorted}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(c){ var arr = rows.filter(${combinedFilter}).map(function(b){ return toNum(b[${JSON.stringify(key)}]); }).filter(function(v){ return v!=null; }); return arr.length? Math.max.apply(null, arr):0; }); })()`;
        } else {
          const filterCheck = filterExpr ? ` && (${filterExpr})` : '';
          dataExpr = `(function(){ ${bucketPrelude} var cats = (${xExprSorted}); function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); return isNaN(n)?null:n; } return cats.map(function(k){ var arr = []; rows.forEach(function(r){ var xv=r[${JSON.stringify(xKey)}]; if(__bucketKey(xv)===k${filterCheck}){ var n=toNum(r[${JSON.stringify(key)}]); if(n!=null) arr.push(n); } }); return arr.length? Math.max.apply(null, arr):0; }); })()`;
        }
      } else {
        // 原值在合并模式下不提供
        dataExpr = `${catsDef}.map(()=>0)`;
      }
      return { ...s, expr: dataExpr } as SeriesItem;
    });

    return { xExpr: xExprSorted, series: mapped };
  }

  // 非合并模式：逐行(原值),支持排序时的重排
  const mapped = series.map((s) => {
    const key = s.valueKey || xKey;
    
    // 构建筛选表达式
    const filterExpr = buildFilterExpression(s.filters);
    const rowsExpr = filterExpr 
      ? `rows.filter(function(r){ try { return ${filterExpr}; } catch(e) { return true; } })` 
      : 'rows';
    
    const baseArr = (!xKey)
      ? `${rowsExpr}.map((_, i) => String(i+1))`
      : (bucket === 'none'
        ? `${rowsExpr}.map(function(r){ var xv = r[${JSON.stringify(xKey)}]; return String(xv); })`
        : `(()=>{ ${bucketFns[bucket as 'year' | 'month' | 'day' | 'hour']} return ${rowsExpr}.map(function(r){ var xv=r[${JSON.stringify(xKey)}]; var k=__bucketKey(xv); return k==null?'':k; }); })()`);

    let xExprFinal = baseArr;
    let idxsExpr = '';
    if (sort !== 'none') {
      const asc = sort === 'asc';
      idxsExpr = `(()=>{ var a = (${baseArr}); var idx = a.map(function(_,i){return i}); idx.sort(function(i,j){ var x=a[i], y=a[j]; if(x===y) return 0; return (x>y?1:-1)*${asc ? 1 : -1}; }); return idx; })()`;
      xExprFinal = `(()=>{ var a = (${baseArr}); var idx = ${idxsExpr}; return idx.map(function(i){ return a[i]; }); })()`;
    }

    const catsDef = (bucket === 'none')
      ? `(function(){ var cats = (${xExprFinal}); return cats; })()`
      : `(function(){ var raw = (${xExprFinal}); ${bucketFns[bucket as 'year' | 'month' | 'day' | 'hour']} return (raw||[]).map(function(k){ return __bucketLabel(k); }); })()`;
    
    let dataExpr = '';
    if (!key) {
      dataExpr = `${catsDef}.map(()=>0)`;
    } else if (idxsExpr) {
      dataExpr = `(function(){ var filteredRows = ${rowsExpr}; var idx = ${idxsExpr}; function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); if(!isNaN(n)) return n; var m2=s.match(/-?\\d+(?:\\.\\d+)?/); return m2?parseFloat(m2[0]):null; } return idx.map(function(i){ var v = filteredRows[i][${JSON.stringify(key)}]; var n=toNum(v); return n==null?0:n; }); })()`;
    } else {
      dataExpr = `(function(){ var filteredRows = ${rowsExpr}; function toNum(x){ if(x==null) return null; if(typeof x==='number') return isFinite(x)?x:null; if(typeof x==='boolean') return x?1:0; var s=String(x).trim(); if(!s) return null; s=s.replace(/,/g,''); var m=s.match(/^(-?\\d+(?:\\.\\d+)?)(%)$/); if(m) return parseFloat(m[1])/100; var n=Number(s); if(!isNaN(n)) return n; var m2=s.match(/-?\\d+(?:\\.\\d+)?/); return m2?parseFloat(m2[0]):null; } return filteredRows.map(function(r){ var n=toNum(r[${JSON.stringify(key)}]); return n==null?0:n; }); })()`;
    }
    return { ...s, agg: 'raw', expr: dataExpr } as SeriesItem;
  });

  // 使用第一个系列的筛选条件作为 X 轴的筛选（如果有）
  const firstSeriesFilter = series[0]?.filters;
  const xFilterExpr = buildFilterExpression(firstSeriesFilter);
  const xRowsExpr = xFilterExpr 
    ? `rows.filter(function(r){ try { return ${xFilterExpr}; } catch(e) { return true; } })` 
    : 'rows';
  
  const baseArr = (!xKey)
    ? `${xRowsExpr}.map((_, i) => String(i+1))`
    : (bucket === 'none'
      ? `${xRowsExpr}.map(function(r){ var xv = r[${JSON.stringify(xKey)}]; return String(xv); })`
      : `(()=>{ ${bucketFns[bucket as 'year' | 'month' | 'day' | 'hour']} return ${xRowsExpr}.map(function(r){ var xv=r[${JSON.stringify(xKey)}]; var k=__bucketKey(xv); return k==null?'':k; }); })()`);

  let xExprFinal = baseArr;
  let idxsExpr = '';
  if (sort !== 'none') {
    const asc = sort === 'asc';
    idxsExpr = `(()=>{ var a = (${baseArr}); var idx = a.map(function(_,i){return i}); idx.sort(function(i,j){ var x=a[i], y=a[j]; if(x===y) return 0; return (x>b?1:-1)*${asc ? 1 : -1}; }); return idx; })()`;
    xExprFinal = `(()=>{ var a = (${baseArr}); var idx = ${idxsExpr}; return idx.map(function(i){ return a[i]; }); })()`;
  }

  return { xExpr: xExprFinal, series: mapped };
}
