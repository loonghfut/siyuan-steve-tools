/**
 * 生成 IIFE 片段（字符串），用于 ECharts IIFE 中处理 AV 响应：
 * - 兼容 { code, msg, data } 与旧格式
 * - 扁平化行 rowsRaw => rows
 * - 值解包 unwrapAttrVal
 *
 * 注意：这些函数返回的是“代码字符串”，用于拼接到内联 IIFE 里执行。
 */

/** 生成 unwrapAttrVal 函数字符串：将 AV cell.value 解包为简单值（string/number/boolean/array） */
export function genUnwrapAttrValFn() {
  return (
    "function unwrapAttrVal(v){\n" +
    "  if (!v || typeof v !== 'object') return null;\n" +
    "  if (Object.prototype.hasOwnProperty.call(v, 'content')) { var c=v.content; if (typeof c==='string'||typeof c==='number'||typeof c==='boolean') return c; }\n" +
    "  if (v.text && typeof v.text.content==='string') return v.text.content;\n" +
    "  if (v.number && typeof v.number.content==='number') return v.number.content;\n" +
    "  if (v.date && typeof v.date.content==='number') return v.date.content;\n" +
    "  if (v.checkbox && typeof v.checkbox.checked==='boolean') return v.checkbox.checked;\n" +
    "  if (v.url && typeof v.url.content==='string') return v.url.content;\n" +
    "  if (v.email && typeof v.email.content==='string') return v.email.content;\n" +
    "  if (v.phone && typeof v.phone.content==='string') return v.phone.content;\n" +
    "  if (v.select && typeof v.select.content==='string') return v.select.content;\n" +
    "  if (Array.isArray(v.mSelect)) { var arr=v.mSelect.map(function(it){return it&&it.content;}).filter(function(x){return x!=null;}); return arr; }\n" +
    "  if (v.relation && Array.isArray(v.relation.contents)) { return v.relation.contents.map(function(it){ if(!it||typeof it!=='object') return null; if(it.block&&(it.block.content||it.block.id)) return it.block.content||it.block.id; if(Object.prototype.hasOwnProperty.call(it,'content')) return it.content; if(it.text&&typeof it.text.content==='string') return it.text.content; if(it.number&&typeof it.number.content==='number') return it.number.content; return null; }); }\n" +
    "  if (Array.isArray(v.relation)) return v.relation.map(function(it){ return it && (it.content || it.blockID); });\n" +
    "  if (Array.isArray(v.mAsset)) return v.mAsset.length;\n" +
    "  if (v.template && (typeof v.template.content==='string' || typeof v.template.content==='number')) return v.template.content;\n" +
    "  if (v.rollup && v.rollup.contents && Array.isArray(v.rollup.contents)) { try { var vals=v.rollup.contents.map(function(it){ if(!it||typeof it!=='object') return null; if(it.number&&typeof it.number.content==='number') return it.number.content; if(it.text&&typeof it.text.content==='string') return it.text.content; if(it.date&&typeof it.date.content==='number') return it.date.content; if(it.checkbox&&typeof it.checkbox.checked==='boolean') return it.checkbox.checked; if(it.url&&typeof it.url.content==='string') return it.url.content; if(it.email&&typeof it.email.content==='string') return it.email.content; if(it.phone&&typeof it.phone.content==='string') return it.phone.content; if(it.block&&(it.block.content||it.block.id)) return it.block.content||it.block.id; return null; }).filter(function(x){ return x!=null; }); if(vals.length===0) return null; var allNum=vals.every(function(x){return typeof x==='number'&&isFinite(x);}); if(allNum){ var s=0; for(var i=0;i<vals.length;i++) s+=vals[i]; return s; } if(vals.length===1) return vals[0]; return vals; } catch(e){} }\n" +
    "  if (v.created && typeof v.created.content==='number') return v.created.content;\n" +
    "  if (v.updated && typeof v.updated.content==='number') return v.updated.content;\n" +
    "  if (v.block) return v.block.content || v.block.id || null;\n" +
    "  return null;\n" +
    "}"
  );
}

/** 生成将 data/view/groups 结构统一为 columns 与 rows 数组的代码片段 */
export function genNormalizeAvResponseSnippet() {
  return (
    // 优先 columns，回退到 fields（gallery）\n" +
    "var columns = (rd && rd.view && Array.isArray(rd.view.columns)) ? rd.view.columns : ((rd && Array.isArray(rd.columns)) ? rd.columns : ((rd && rd.view && Array.isArray(rd.view.fields)) ? rd.view.fields : ((rd && Array.isArray(rd.fields)) ? rd.fields : [])));\n" +
    // rows 原始（表格）\n" +
    "var rowsRaw = (rd && rd.view && Array.isArray(rd.view.rows)) ? rd.view.rows : ((rd && Array.isArray(rd.rows)) ? rd.rows : []);\n" +
    // cards 原始（画廊）\n" +
    "var cardsRaw = (rd && rd.view && Array.isArray(rd.view.cards)) ? rd.view.cards : ((rd && Array.isArray(rd.cards)) ? rd.cards : []);\n" +
    "var __groupCols = []; var __rowsFromGroupsLen = 0; var __cardsFromGroupsLen = 0;\n" +
    "(function __walkGroups(gs){ try{ if(!gs||!Array.isArray(gs)) return; for (var gi=0; gi<gs.length; gi++){ var g=gs[gi]||{}; var gcols=Array.isArray(g.columns)?g.columns:[]; var gfields=Array.isArray(g.fields)?g.fields:[]; var growCols = gcols.length?gcols:gfields; for (var k=0;k<growCols.length;k++){ var gc=growCols[k]||{}; var exists=false; for (var t=0;t<__groupCols.length;t++){ if(__groupCols[t] && __groupCols[t].id===gc.id){ exists=true; break; } } if(!exists) __groupCols.push(gc); } var grows=Array.isArray(g.rows)?g.rows:[]; if(grows.length){ __rowsFromGroupsLen += grows.length; rowsRaw=(rowsRaw||[]).concat(grows); } var gcards=Array.isArray(g.cards)?g.cards:[]; if(gcards.length){ __cardsFromGroupsLen += gcards.length; cardsRaw=(cardsRaw||[]).concat(gcards); } if(Array.isArray(g.groups)&&g.groups.length) __walkGroups(g.groups); } }catch(e){} })(rd && rd.view && rd.view.groups);\n" +
    "if ((!columns || !columns.length) && __groupCols.length) columns = __groupCols;\n"
  );
}

/** 生成基于 columns 与 rowsRaw 构建 rows（按列名扁平化）的代码片段 */
export function genBuildFlatRowsSnippet() {
  return (
    // 列 id→name 映射（兼容 columns/fields 与分组列）\n" +
    "var id2Name = {}; for (var i=0;i<columns.length;i++){ var c=columns[i]||{}; if(c&&c.id) id2Name[c.id] = c.name || c.id; } for (var i2=0;i2<__groupCols.length;i2++){ var gc2=__groupCols[i2]||{}; if(gc2&&gc2.id) id2Name[gc2.id] = gc2.name || gc2.id; }\n" +
    // 先尝试表格 rows 映射
    "var rows = [];\n" +
    "if (Array.isArray(rowsRaw) && rowsRaw.length){ rows = rowsRaw.map(function(r){ var o={ id: r && r.id }; var cs = r && Array.isArray(r.cells) ? r.cells : []; for (var j=0;j<cs.length;j++){ var cell = cs[j]||{}; var v = cell.value||{}; var keyID = v.keyID || ''; var name=''; if (columns[j] && (columns[j].name || columns[j].id)) name = columns[j].name || columns[j].id; if (!name && keyID) name = id2Name[keyID] || keyID; if (!name) name = 'C' + j; if (!name) continue; o[name] = unwrapAttrVal(v); } return o; }); }\n" +
    // 若无表格 rows，则尝试画廊 cards 映射
    "else if (Array.isArray(cardsRaw) && cardsRaw.length){ rows = cardsRaw.map(function(card){ var o={ id: (card && (card.id || (card.block && card.block.id))) || undefined }; var vs = (card && Array.isArray(card.values)) ? card.values : []; for (var k=0;k<vs.length;k++){ var ci = vs[k] || {}; var v = (ci && (ci.value || ci)) || {}; var keyID = v.keyID || v.blockID || ''; var name = keyID ? (id2Name[keyID] || keyID) : ''; if (!name) name = 'C' + k; o[name] = unwrapAttrVal(v); } return o; }); }\n"
  );
}
