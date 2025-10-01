export type ChartType = 'bar' | 'line' | 'scatter' | 'pie';

export interface PresetItem {
  name: string;
  sql: string;
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
  bar: { stack?: boolean; boundaryGap?: boolean; xLabelRotate?: number; label?: { show?: boolean; position?: string } };
  line: { smooth?: boolean; boundaryGap?: boolean; xLabelRotate?: number; label?: { show?: boolean; position?: string } };
  scatter: Record<string, unknown>; // 预留
  pie: { innerRadius?: number; outerRadius?: number; roseType?: 'radius' | 'area' | false; label?: { show?: boolean; position?: string } };
}

export interface VisualEchartsOptions {
  persistKey?: string;
  initialSQL?: string;
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>;
  onGotoSQL?: () => void;
}

/**
 * SQL 查询模式的配置选项
 */
export interface VisualEchartsSqlOptions {
  persistKey?: string;
  onChange?: () => void;
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>;
}

/**
 * 数据模式类型
 */
export type DataMode = 'database' | 'sql';

/**
 * SQL模式类型: 单SQL查询 或 多SQL预设对比
 */
export type SqlMode = 'single' | 'multi-preset';
