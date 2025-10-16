export type ChartType = 'bar' | 'line' | 'scatter' | 'pie';

export interface PresetItem {
  name: string;
  sql: string;
  targetDocId?: string;  // 绑定插入文档的 ID
  targetDatabaseId?: string; // 绑定插入数据库 (属性视图) 的 ID
  template?: string;     // 可选的独立模板
  lastInsertTime?: string; // 上次插入文档的时间戳(思源格式: YYYYMMDDHHmmss)
  
  // 定时更新相关配置
  timerEnabled?: boolean;  // 是否启用定时更新
  timerInterval?: number;  // 定时更新间隔(毫秒)
  timerUnit?: 'minutes' | 'hours' | 'days';  // 时间单位
  timerValue?: number;     // 时间值(如: 5 分钟, 2 小时, 1 天)
  lastExecuteTime?: number;  // 上次执行时间(时间戳)
  nextExecuteTime?: number;  // 下次执行时间(时间戳)
}

/**
 * 多SQL预设查询项
 */
export interface MultiSqlPresetItem {
  name: string;  // 预设名称
  sql: string;   // SQL查询语句
}

export interface CommonSettings {
  legendPos: 'top' | 'bottom' | 'left' | 'right';
  ySplitLine: 'dashed' | 'solid' | 'none';
  grid: { top: number; right: number; bottom: number; left: number };
}

export interface PerTypeSettings {
  bar: { stack?: boolean; boundaryGap?: boolean; xLabelRotate?: number };
  line: { smooth?: boolean; boundaryGap?: boolean; xLabelRotate?: number };
  scatter: Record<string, unknown>; // 预留
  pie: { innerRadius?: number; outerRadius?: number; roseType?: 'radius' | 'area' | false };
}

export interface VisualEchartsOptions {
  persistKey?: string;
  initialSQL?: string;
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>;
  saveSqlPresets?: (presets: Record<string, any>) => Promise<void> | void;
  loadEchartsPresets?: () => Promise<Record<string, any>> | Record<string, any>;
  saveEchartsPresets?: (presets: Record<string, any>) => Promise<void> | void;
  onGotoSQL?: () => void;
}

/**
 * SQL 查询模式的配置选项
 */
export interface VisualEchartsSqlOptions {
  persistKey?: string;
  onChange?: () => void;
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>;
  saveSqlPresets?: (presets: Record<string, any>) => Promise<void> | void;
  loadEchartsPresets?: () => Promise<Record<string, any>> | Record<string, any>;
  saveEchartsPresets?: (presets: Record<string, any>) => Promise<void> | void;
}

/**
 * 数据模式类型
 */
export type DataMode = 'database' | 'sql';

/**
 * SQL模式类型: 单SQL查询 或 多SQL预设对比
 */
export type SqlMode = 'single' | 'multi-preset';

export interface SQLRawRow {
  alias?: string;
  box?: string;                 // 通常是 notebook id
  content?: string;
  created?: string;             // 原始可能是 YYYYMMDDHHMMSS 格式或其它
  fcontent?: string;
  hash?: string;
  hpath?: string;
  ial?: string;                 // 原始 IAL 字符串 '{: id="..." updated="..."}'
  id?: string;
  length?: number;
  markdown?: string;
  memo?: string;
  name?: string;
  parent_id?: string;
  path?: string;
  root_id?: string;
  sort?: number;
  subtype?: string;
  tag?: string;
  type?: string;                // e.g. 'p', 'c', 's', 'query_embed'...
  updated?: string;
  // 允许存在任意额外字段（例如 ial_custom-time、custom-avs 等）
  [key: string]: unknown;
}