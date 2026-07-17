/**
 * 搜索面板位置管理
 * 负责面板位置的持久化与重置
 */
import { api } from '@frostime/siyuan-plugin-kits'
import { showMessage } from 'siyuan'

const PANEL_POS_PATH = '/data/storage/petal/sttools/search-panel.json'
const DEFAULT_POS = { left: 40, top: 60 }

export interface SearchPanelPos {
    left: number
    top: number
}

/** 计算默认位置：靠右上，避开快捷操作区 */
export function getSearchPanelDefaultPos(): SearchPanelPos {
    const width = 360
    const right = 16
    const left = Math.max(12, window.innerWidth - right - width)
    return { left, top: 60 }
}

/** 从插件存储加载面板位置，失败返回 null */
export async function loadSearchPanelPosition(): Promise<SearchPanelPos | null> {
    try {
        const data = await api.getFile(PANEL_POS_PATH)
        if (data) {
            let parsed: any = data
            if (typeof data === 'string') parsed = JSON.parse(data)
            if (parsed && typeof parsed.left === 'number' && typeof parsed.top === 'number') {
                return { left: parsed.left, top: parsed.top }
            }
        }
    } catch (err) {
        // ignore
    }
    return null
}

/** 保存面板位置到插件存储 */
export async function saveSearchPanelPosition(pos: SearchPanelPos): Promise<void> {
    try {
        const jsonData = JSON.stringify(pos, null, 2)
        const blob = new Blob([jsonData], { type: 'application/json' })
        await api.putFile(PANEL_POS_PATH, false, blob)
    } catch (e) {
        console.warn('保存搜索面板位置失败:', e)
    }
}

/**
 * 重置搜索面板位置到默认值
 */
export async function resetSearchPanelPosition(): Promise<void> {
    try {
        const jsonData = JSON.stringify(DEFAULT_POS, null, 2)
        const blob = new Blob([jsonData], { type: 'application/json' })
        await api.putFile(PANEL_POS_PATH, false, blob)
        try {
            window.dispatchEvent(new CustomEvent('searchPanel:posReset', { detail: DEFAULT_POS }))
        } catch (e) {
            // ignore
        }
        showMessage('搜索面板位置已重置')
    } catch (err) {
        console.warn('重置搜索面板位置失败', err)
        showMessage('重置面板位置失败', 3000, 'error')
    }
}
