import { settingdata } from '@/index';

/**
 * 根据设置构建画板深链接
 * @param rootId 画板ID
 * @param blockId 块ID（可选）
 * @param title 标题（可选）
 * @param shapeId 形状ID（可选）
 * @returns 完整的深链接
 */
export function buildTldrawLink(
    rootId: string,
    blockId?: string,
    title?: string,
    shapeId?: string
): string {
    const scheme = (settingdata['tldraw-link-scheme'] as 'https' | 'siyuan') || 'https';
    const protocol = scheme === 'siyuan' ? 'siyuan://' : 'https://';
    
    const params = new URLSearchParams();
    params.set('rootid', rootId);
    if (blockId) params.set('blockid', blockId);
    if (title) params.set('title', title);
    if (shapeId) params.set('shapeid', shapeId);
    return `${protocol}plugins/siyuan-steve-tools/?${params.toString()}`;
}
