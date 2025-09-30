export type ChartType = 'bar' | 'line' | 'scatter' | 'pie';

export interface PresetItem {
  name: string;
  sql: string;
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
