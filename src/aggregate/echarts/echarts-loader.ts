export async function ensureEcharts(): Promise<void> {
  if ((window as any).echarts) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('无法加载 ECharts'));
    document.head.appendChild(s);
  });
}
