/**
 * 子文档面板位置管理
 */
import { api } from '@frostime/siyuan-plugin-kits';

/**
 * 重置子文档面板位置到默认位置
 */
export function resetChildDocsPanelPosition() {
    const width = 260;
    const left = Math.max(12, window.innerWidth - 900);
    const top = 60;

    const event = new CustomEvent('childDocs:posReset', {
        detail: { left, top }
    });
    window.dispatchEvent(event);
}
