import type { AggregateCursor, SQLRawRow } from '../echarts/types/types';

export function normalizeCursor(value?: string | AggregateCursor): AggregateCursor | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    return /^\d{14}$/.test(value) ? { time: value } : undefined;
  }
  if (!/^\d{14}$/.test(value.time || '')) return undefined;
  return { time: value.time, blockId: value.blockId || undefined };
}

export function getRowCursor(row: SQLRawRow, timeField: string, idField = 'id'): AggregateCursor | undefined {
  const time = String(row[timeField] ?? '').trim();
  if (!/^\d{14}$/.test(time)) return undefined;
  const blockId = String(row[idField] ?? row.id ?? '').trim() || undefined;
  return { time, blockId };
}

export function maxCursor(rows: SQLRawRow[], timeField: string, idField = 'id'): AggregateCursor | undefined {
  let result: AggregateCursor | undefined;
  for (const row of rows) {
    const candidate = getRowCursor(row, timeField, idField);
    if (!candidate || !result || compareCursor(candidate, result) > 0) result = candidate || result;
  }
  return result;
}

export function compareCursor(left: AggregateCursor, right: AggregateCursor): number {
  if (left.time !== right.time) return left.time > right.time ? 1 : -1;
  const leftId = left.blockId || '';
  const rightId = right.blockId || '';
  if (leftId === rightId) return 0;
  return leftId > rightId ? 1 : -1;
}
