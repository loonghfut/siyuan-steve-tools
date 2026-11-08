import type { AggregateCursor } from '../echarts/types/types';

export type AggregateTarget = 'document' | 'database';

export interface AggregateTargetRunResult {
  target: AggregateTarget;
  queriedRows: number;
  insertedCount: number;
  skippedCount: number;
  cursor?: AggregateCursor;
  error?: string;
}

export interface AggregateRunResult {
  presetName: string;
  targets: AggregateTargetRunResult[];
  queryErrors: string[];
}
