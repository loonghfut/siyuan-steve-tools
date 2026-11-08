import { Dialog, showMessage } from 'siyuan';
import { VisualSqlUI } from './visual-sql-ui';

export interface SqlPresetWorkbenchOptions {
  loadPresets: () => Promise<Record<string, any>> | Record<string, any>;
  savePresets: (presets: Record<string, any>) => Promise<void> | void;
  previewColumns?: string | string[];
  previewColMaxWidth?: number;
  presetName?: string;
  /** 点击“使用此预设”后将最新 SQL 回传给当前宿主页面。 */
  onUse?: (result: { presetName: string; sql: string }) => Promise<void> | void;
}

/**
 * 在调用方当前页面上方打开 SQL 可视化预设工作台。
 * 它只负责编辑和选择同一份预设，不会跳转或打开 SQL 生成器页签。
 */
export async function openSqlPresetWorkbench(options: SqlPresetWorkbenchOptions): Promise<void> {
  const id = `sql-preset-workbench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let ui: VisualSqlUI | undefined;
  const dialog = new Dialog({
    title: 'SQL 可视化预设',
    content: `<div id="${id}" style="width:100%;max-height:78vh;overflow:auto;"></div>`,
    width: '76%',
    height: 'auto',
    disableClose: false,
    hideCloseIcon: true,
    resizeCallback: () => ui?.resize(),
  });

  const container = document.getElementById(id);
  if (!container) {
    dialog.destroy();
    throw new Error('无法初始化 SQL 可视化预设工作台');
  }

  ui = new VisualSqlUI(container, {
    previewColumns: options.previewColumns,
    previewColMaxWidth: options.previewColMaxWidth,
    loadPresets: options.loadPresets,
    savePresets: options.savePresets,
    showPresetControls: true,
    // 工作台只是当前页面的临时入口，不覆盖 SQL 生成器页签的草稿状态。
    persistKey: '',
    buttons: [{
      label: '使用此预设',
      title: '将当前 SQL 预设应用到打开此面板的功能',
      variant: 'primary',
      placement: 'before-reset',
      onClick: async ({ getSQL }) => {
        const presetName = ui?.getCurrentPresetName() || '';
        if (!presetName) {
          showMessage('请先保存当前筛选为预设，或点击“应用筛选”选择一个预设', 3000, 'info');
          return;
        }
        const sql = (getSQL() || '').trim();
        if (!sql) {
          showMessage('当前预设没有可用的 SQL', 3000, 'error');
          return;
        }
        await options.onUse?.({ presetName, sql });
        dialog.destroy();
      },
    }],
  });

  if (options.presetName) {
    const applied = await ui.applyPreset(options.presetName, { applyCollapse: true });
    if (!applied) showMessage(`未找到 SQL 预设：${options.presetName}`, 3000, 'error');
  }
  requestAnimationFrame(() => ui?.resize());
}
