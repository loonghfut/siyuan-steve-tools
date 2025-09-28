/**
 * AV 渲染响应解析与标准化（运行时使用，不参与 IIFE 内联）。
 *
 * 目标：统一从多种响应形态中提取列（columns）与行（rows）信息，以兼容：
 * - 新格式：{ code, msg, data: { view: { columns, rows, groups }, columns, rows } }
 * - 旧格式：{ view: { columns, rows } } 或 { columns, rows }
 *
 * 注意：本文件仅提供 UI/逻辑层的响应解析，用于：
 * - 生成键名下拉（X 轴字段、Series 的 valueKey）
 * - 其他需要探查列定义的场景
 * 映射到 ECharts 的“行扁平化、值解包”等运行时代码仍在 IIFE 内执行，另见 av-iife-snippets.ts。
 */

export interface AvColumn {
  id: string;
  name: string;
  // 其余字段在 UI 获取键名时用不上，这里不展开
}

export interface AvRowCellValue {
  keyID?: string;
  // 其余结构按需扩展
}

export interface AvRow {
  id?: string;
  cells?: Array<{ value?: AvRowCellValue } | null>;
}

export interface AvViewLike {
  columns?: AvColumn[];
  rows?: AvRow[];
  groups?: any[]; // 分组结构在 UI 仅用于兜底列名拼装，类型从宽
}

export interface AvRenderResponseLike {
  code?: number;
  msg?: string;
  data?: {
    view?: AvViewLike;
    columns?: AvColumn[];
    rows?: AvRow[];
    // 一些视图（如 gallery）使用 fields 表示列定义
    fields?: AvColumn[];
  } | null;
  view?: AvViewLike;   // 旧形态
  columns?: AvColumn[]; // 旧形态
  rows?: AvRow[];       // 旧形态
  // 同样兼容顶层的 fields（部分接口/形态可能出现）
  fields?: AvColumn[];
}

/**
 * 从响应对象中提取列定义（columns）。
 * 优先级：data.view.columns -> data.columns -> view.columns -> columns。
 */
export function extractColumns(res: any): AvColumn[] {
  try {
    const r = res as AvRenderResponseLike;
    // 优先 columns
    if (r && r.data && r.data.view && Array.isArray(r.data.view.columns)) return r.data.view.columns as AvColumn[];
    if (r && r.data && Array.isArray(r.data.columns)) return r.data.columns as AvColumn[];
    if (r && r.view && Array.isArray(r.view.columns)) return r.view.columns as AvColumn[];
    if (r && Array.isArray((r as any).columns)) return (r as any).columns as AvColumn[];
    // 回退到 fields（例如 gallery 视图）
    if (r && r.data && r.data.view && Array.isArray((r.data.view as any).fields)) return (r.data.view as any).fields as AvColumn[];
    if (r && r.data && Array.isArray((r.data as any).fields)) return (r.data as any).fields as AvColumn[];
    if (r && r.view && Array.isArray((r.view as any).fields)) return (r.view as any).fields as AvColumn[];
    if (r && Array.isArray((r as any).fields)) return (r as any).fields as AvColumn[];
  } catch { /* ignore */ }
  return [];
}

/**
 * 从响应对象中提取行（rows）。
 * 优先级：data.view.rows -> data.rows -> view.rows -> rows。
 * 注：分组视图 rows 可能在 data.view.groups 内部，本函数不做扁平化（仅 UI 获取键名时不需要）。
 */
export function extractRows(res: any): AvRow[] {
  try {
    const r = res as AvRenderResponseLike;
    if (r && r.data && r.data.view && Array.isArray(r.data.view.rows)) return r.data.view.rows as AvRow[];
    if (r && r.data && Array.isArray(r.data.rows)) return r.data.rows as AvRow[];
    if (r && r.view && Array.isArray(r.view.rows)) return r.view.rows as AvRow[];
    if (r && Array.isArray((r as any).rows)) return (r as any).rows as AvRow[];
  } catch { /* ignore */ }
  return [];
}

/**
 * 生成列 id -> name 的映射，便于后续通过 keyID 反查列名。
 */
export function buildIdNameMap(columns: AvColumn[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of columns || []) {
    if (!c) continue;
    const id = String((c as any).id || '');
    if (!id) continue;
    map[id] = String((c as any).name || id);
  }
  return map;
}

/**
 * 提取供 UI 展示/选择的列名（键名）。
 * - 首选 columns[].name
 * - 不存在时回退到 columns[].id
 */
export function getFieldNamesForUI(res: any): string[] {
  const cols = extractColumns(res);
  const names = (cols || []).map(c => (c && (c.name || c.id)) as string).filter(Boolean);
  return names;
}
