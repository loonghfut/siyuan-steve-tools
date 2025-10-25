// 思源可视化 SQL 查询构建器（仅 embedded 模式）
// - 主查询强制 "select * from blocks ..."
export type OrderDir = 'asc' | 'desc';
export type BlockType = 'd' | 'h' | 'm' | 'c' | 't' | 'l' | 'b' | 's' | 'p' | 'av';

export interface OrderBy {
  expr: string;    // 字段名或表达式，如 "updated" 或 "random()"
  dir?: OrderDir;  // asc/desc，表达式为函数时可省略
}

export interface Filter {
  field?: string;        // 字段名（embedded 仅限 blocks 字段）
  op?: string;           // =, !=, >, <, >=, <=, like, in, between, is null ...
  value?: any;           // 值/数组/[min,max]
  rawSql?: string;       // 原始条件片段，如 "id in (select ...)"
}

export interface BuilderConfig {
  filters?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
}

function quote(v: any): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}
function list(values: any[]): string {
  return `(${values.map(quote).join(', ')})`;
}

export class VisualSqlBuilder {
  private cfg: BuilderConfig;

  constructor(_mode: 'embedded' = 'embedded') {
    this.cfg = {
      filters: [],
      orderBy: [],
    };
  }
  addFilter(f: Filter) { this.cfg.filters!.push(f); return this; }
  addOrder(expr: string, dir?: OrderDir) { this.cfg.orderBy!.push({ expr, dir }); return this; }
  setLimit(n?: number) { this.cfg.limit = typeof n === 'number' ? n : undefined; return this; }
  setOffset(n?: number) { this.cfg.offset = typeof n === 'number' ? n : undefined; return this; }

  // 便捷方法
  byTypes(types: BlockType[]) { if (types.length) this.addFilter({ field: 'type', op: 'in', value: types }); return this; }
  bySubtypes(subtypes: string[]) { if (subtypes.length) this.addFilter({ field: 'subtype', op: 'in', value: subtypes }); return this; }
  inDoc(docId: string) { if (docId) this.addFilter({ field: 'root_id', op: '=', value: docId }); return this; }
  parentIs(pid: string) { if (pid) this.addFilter({ field: 'parent_id', op: '=', value: pid }); return this; }
  inBox(box: string) { if (box) this.addFilter({ field: 'box', op: '=', value: box }); return this; }
  pathLike(pattern: string) { if (pattern) this.addFilter({ field: 'path', op: 'like', value: pattern }); return this; }
  markdownLike(pattern: string) { if (pattern) this.addFilter({ field: 'markdown', op: 'like', value: pattern }); return this; }
  contentLike(pattern: string) { if (pattern) this.addFilter({ field: 'content', op: 'like', value: pattern }); return this; }
  hasTag(tag: string) { if (tag) this.addFilter({ field: 'tag', op: 'like', value: `%#${tag}%` }); return this; }

  createdSinceDays(days?: number) {
    if (!days || days <= 0) return this;
    this.addFilter({
      rawSql: `created > strftime('%Y%m%d%H%M%S', 'now', 'localtime', '-${days} day')`
    });
    return this;
  }
  updatedSinceDays(days?: number) {
    if (!days || days <= 0) return this;
    this.addFilter({
      rawSql: `updated > strftime('%Y%m%d%H%M%S', 'now', 'localtime', '-${days} day')`
    });
    return this;
  }

  /**
   * 通用：近 N 时间（分钟/小时/天）
   */
  createdSince(amount?: number, unit: 'minute' | 'hour' | 'day' = 'day') {
    const n = Math.floor(Number(amount || 0));
    if (!n || n <= 0) return this;
    const u = unit === 'minute' ? 'minute' : unit === 'hour' ? 'hour' : 'day';
    this.addFilter({ rawSql: `created > strftime('%Y%m%d%H%M%S', 'now', 'localtime', '-${n} ${u}')` });
    return this;
  }
  updatedSince(amount?: number, unit: 'minute' | 'hour' | 'day' = 'day') {
    const n = Math.floor(Number(amount || 0));
    if (!n || n <= 0) return this;
    const u = unit === 'minute' ? 'minute' : unit === 'hour' ? 'hour' : 'day';
    this.addFilter({ rawSql: `updated > strftime('%Y%m%d%H%M%S', 'now', 'localtime', '-${n} ${u}')` });
    return this;
  }

  /**
   * 今日创建（本地时区）：
   * created >= 今天 00:00:00 AND created < 明天 00:00:00
   */
  createdToday() {
    this.addFilter({
      rawSql: `created >= strftime('%Y%m%d%H%M%S','now','localtime','start of day') AND created < strftime('%Y%m%d%H%M%S','now','localtime','start of day','+1 day')`
    });
    return this;
  }

  /**
   * 今日更新（本地时区）：
   * updated >= 今天 00:00:00 AND updated < 明天 00:00:00
   */
  updatedToday() {
    this.addFilter({
      rawSql: `updated >= strftime('%Y%m%d%H%M%S','now','localtime','start of day') AND updated < strftime('%Y%m%d%H%M%S','now','localtime','start of day','+1 day')`
    });
    return this;
  }

  private buildWhere(): string {
    const parts: string[] = [];
    for (const f of this.cfg.filters || []) {
      if (f.rawSql) { parts.push(`(${f.rawSql})`); continue; }
      if (!f.field || !f.op) continue;
      const op = f.op.toLowerCase();
      if (op === 'is null' || op === 'is not null') {
        parts.push(`${f.field} ${op.toUpperCase()}`);
      } else if (op === 'between' && Array.isArray(f.value) && f.value.length === 2) {
        parts.push(`${f.field} BETWEEN ${quote(f.value[0])} AND ${quote(f.value[1])}`);
      } else if ((op === 'in' || op === 'not in') && Array.isArray(f.value)) {
        parts.push(`${f.field} ${op.toUpperCase()} ${list(f.value)}`);
      } else if (f.value !== undefined) {
        parts.push(`${f.field} ${op.toUpperCase()} ${quote(f.value)}`);
      }
    }
    return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
  }

  private buildOrder(): string {
    const obs = this.cfg.orderBy || [];
    if (!obs.length) return '';
    const s = obs.map(o => o.expr + (o.dir ? ' ' + o.dir.toUpperCase() : '')).join(', ');
    return ` ORDER BY ${s}`;
  }

  private buildLimitOffset(): string {
    const parts: string[] = [];
    if (typeof this.cfg.limit === 'number') parts.push(`LIMIT ${this.cfg.limit}`);
    if (typeof this.cfg.offset === 'number') parts.push(`OFFSET ${this.cfg.offset}`);
    return parts.length ? ' ' + parts.join(' ') : '';
  }

  compile(): string {
  const where = this.buildWhere();
  const order = this.buildOrder();
  const limit = this.buildLimitOffset();
  return `select * from blocks${where}${order}${limit}`;
  }
}