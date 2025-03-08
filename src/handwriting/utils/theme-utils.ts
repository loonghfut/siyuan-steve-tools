/**
 * 检查当前是否为深色模式
 * @returns {boolean} 是否为深色模式
 */
export function isDarkMode(): boolean {
  return document.querySelector('html')?.getAttribute('data-theme-mode') === 'dark';
}