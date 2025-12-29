/**
 * 文档大纲管理器
 * 用于跟踪哪些文档块已添加到白板
 */
import { api } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";

/** 已添加到白板的块ID集合 */
export interface DocOutlineData {
    version: number;
    addedBlocks: string[]; // 已添加到白板的块ID列表
}

const DOC_OUTLINE_STORAGE_PATH = '/data/storage/petal/sttools/doc-outline.json';

/**
 * 加载已添加的块ID列表
 */
export async function loadAddedBlocks(): Promise<DocOutlineData> {
    try {
        const data = await api.getFile(DOC_OUTLINE_STORAGE_PATH);
        if (data) {
            let parsed: any;
            if (typeof data === 'string') {
                parsed = JSON.parse(data);
            } else {
                parsed = data;
            }
            return {
                version: parsed?.version || 1,
                addedBlocks: Array.isArray(parsed?.addedBlocks) ? parsed.addedBlocks : []
            };
        }
    } catch (err) {
        console.debug('文档大纲文件不存在或读取失败，将创建新的记录');
    }
    return { version: 1, addedBlocks: [] };
}

/**
 * 保存已添加的块ID列表
 */
export async function saveAddedBlocks(data: DocOutlineData): Promise<void> {
    try {
        const jsonData = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        await api.putFile(DOC_OUTLINE_STORAGE_PATH, false, blob);
    } catch (err) {
        console.error('保存文档大纲数据失败:', err);
        throw err;
    }
}

/**
 * 添加块到已添加列表
 */
export async function addBlockToOutline(blockId: string): Promise<void> {
    const data = await loadAddedBlocks();
    if (!data.addedBlocks.includes(blockId)) {
        data.addedBlocks.push(blockId);
        await saveAddedBlocks(data);
        // 通知外部更新
        try {
            window.dispatchEvent(new CustomEvent('docOutline:updated', { detail: { blockId } }));
        } catch (e) {
            // ignore
        }
    }
}

/**
 * 从已添加列表移除块
 */
export async function removeBlockFromOutline(blockId: string): Promise<void> {
    const data = await loadAddedBlocks();
    const index = data.addedBlocks.indexOf(blockId);
    if (index !== -1) {
        data.addedBlocks.splice(index, 1);
        await saveAddedBlocks(data);
        // 通知外部更新
        try {
            window.dispatchEvent(new CustomEvent('docOutline:updated', { detail: { blockId } }));
        } catch (e) {
            // ignore
        }
    }
}

/**
 * 检查块是否已添加到白板
 */
export async function isBlockAdded(blockId: string): Promise<boolean> {
    const data = await loadAddedBlocks();
    return data.addedBlocks.includes(blockId);
}

/**
 * 批量检查块是否已添加
 */
export async function getAddedBlocks(): Promise<string[]> {
    const data = await loadAddedBlocks();
    return data.addedBlocks;
}

/**
 * 清除所有已添加的块记录
 */
export async function clearAddedBlocks(): Promise<void> {
    await saveAddedBlocks({ version: 1, addedBlocks: [] });
    try {
        window.dispatchEvent(new CustomEvent('docOutline:cleared', {}));
    } catch (e) {
        // ignore
    }
}

/**
 * 重置文档大纲面板位置到默认值
 */
export async function resetDocOutlinePanelPosition(): Promise<void> {
    try {
        const PANEL_POS_PATH = '/data/storage/petal/sttools/doc-outline-panel.json';
        const defaultPos = { left: 340, top: 60 };
        const jsonData = JSON.stringify(defaultPos, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        await api.putFile(PANEL_POS_PATH, false, blob);
        try {
            window.dispatchEvent(new CustomEvent('docOutline:posReset', { detail: defaultPos }));
        } catch (e) {
            // ignore
        }
        showMessage('文档大纲面板位置已重置');
    } catch (err) {
        console.warn('重置文档大纲面板位置失败', err);
        showMessage('重置面板位置失败', 3000, 'error');
    }
}
