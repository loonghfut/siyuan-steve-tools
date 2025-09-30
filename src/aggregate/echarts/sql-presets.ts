export type LoadSqlPresets = () => Promise<Record<string, any>> | Record<string, any>;

export async function getSqlPresets(loadSqlPresetsProvider?: LoadSqlPresets): Promise<Record<string, any>> {
  try {
    if (loadSqlPresetsProvider) {
      const maybe = loadSqlPresetsProvider();
      // @ts-ignore 支持 Promise 与同步对象
      return typeof maybe?.then === 'function' ? await (maybe as Promise<Record<string, any>>) : ((maybe as Record<string, any>) || {});
    }
    const raw = localStorage.getItem('siyuan-steve-tools:visual-sql-presets');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function safeCompileSqlFromSnapshot(s: any): string {
  try {
    const v = s || {};
    const quote = (x: any) => (x == null ? 'NULL' : typeof x === 'number' ? String(x) : `'${String(x).replace(/'/g, "''")}'`);
    const list = (arr: any[]) => `(${arr.map(quote).join(', ')})`;
    const parts: string[] = [];
    const push = (p: string) => {
      if (p) parts.push(p);
    };
    if (Array.isArray(v.types) && v.types.length) push(`type IN ${list(v.types)}`);
    if (Array.isArray(v.subtypes) && v.subtypes.length) push(`subtype IN ${list(v.subtypes)}`);
    if (Array.isArray(v.boxes) && v.boxes.length) push(`box IN ${list(v.boxes)}`);
    if (v.rootId) push(`root_id = ${quote(v.rootId)}`);
    if (v.parentId) push(`parent_id = ${quote(v.parentId)}`);
    if (v.path) push(`path LIKE ${quote(v.path.includes('%') || v.path.includes('_') ? v.path : '%' + v.path + '%')}`);
    if (v.content) push(`content LIKE ${quote(v.content.includes('%') || v.content.includes('_') ? v.content : '%' + v.content + '%')}`);
    if (v.md) push(`markdown LIKE ${quote(v.md.includes('%') || v.md.includes('_') ? v.md : '%' + v.md + '%')}`);
    if (v.hpath) push(`hpath LIKE ${quote(v.hpath.includes('%') || v.hpath.includes('_') ? v.hpath : '%' + v.hpath + '%')}`);
    if (v.ial) push(`ial LIKE ${quote(v.ial.includes('%') || v.ial.includes('_') ? v.ial : '%' + v.ial + '%')}`);
    if (v.tag) push(`tag LIKE ${quote('%#' + String(v.tag).replace(/^#+/, '') + '%')}`);
    let where = parts.length ? ' WHERE ' + parts.join(' AND ') : '';
    let order = '';
    if (v.orderField) order = ' ORDER BY ' + v.orderField + (v.orderDir ? ' ' + String(v.orderDir).toUpperCase() : '');
    let limit = '';
    if (v.limit) limit = ' LIMIT ' + Math.min(999, Math.max(0, Number(v.limit) || 0));
    return `select * from blocks${where}${order}${limit}`;
  } catch {
    return '';
  }
}
