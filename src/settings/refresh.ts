// 集中管理需要触发插件整体刷新或重载行为的设置项 key
// 后续如有新增，只需在此处补充即可
export const refreshKeys = new Set<string>([
  // "cal-enable",
  // "sync-enable",
  // "ai-enable",
  // "handwriting-enable",
  // "img-compress-enable",
]);

export function needsRefresh(key: string): boolean {
  return refreshKeys.has(key);
}
