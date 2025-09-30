import type { ChartType, CommonSettings, PerTypeSettings } from '../types/types';

export function html(strings: TemplateStringsArray, ...values: any[]) {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 200) {
  let timer: number | undefined;
  return ((...args: Parameters<T>) => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, wait) as unknown as number;
  }) as T;
}

export function escapeHtml(s: any) {
  const str = s == null ? '' : String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toast(msg: string) {
  const tip = document.createElement('div');
  tip.textContent = msg;
  tip.style.cssText = 'position:fixed; right:16px; bottom:16px; background:#323232; color:#fff; padding:8px 12px; border-radius:4px; z-index:9999; opacity:0; transition:opacity .2s';
  document.body.appendChild(tip);
  requestAnimationFrame(() => (tip.style.opacity = '1'));
  setTimeout(() => {
    tip.style.opacity = '0';
    setTimeout(() => tip.remove(), 200);
  }, 1200);
}

export function setDeepSetting(
  common: CommonSettings,
  perType: PerTypeSettings,
  path: string,
  value: any,
  onSave?: () => void,
) {
  const segs = path.split('.');
  if (segs[0] === 'common') {
    let cur: any = common as any;
    for (let i = 1; i < segs.length - 1; i++) {
      const k = segs[i];
      if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
      cur = cur[k];
    }
    cur[segs[segs.length - 1]] = value;
  } else {
    let cur: any = perType as any;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = segs[i];
      if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
      cur = cur[k];
    }
    cur[segs[segs.length - 1]] = value;
  }
  onSave?.();
}

export function buildSettingsPayloadFor(
  t: ChartType,
  common: CommonSettings,
  perType: PerTypeSettings,
) {
  if (t === 'line' || t === 'scatter') return { line: perType.line, common } as any;
  if (t === 'pie') return { pie: perType.pie, common } as any;
  return { bar: perType.bar, common } as any;
}
