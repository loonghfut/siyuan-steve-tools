// ===== 思维导图常量定义 =====

// 尺寸常量
export const PADDING = 20 // 内边距
export const MIN_WIDTH = 1
export const MIN_HEIGHT = 1
export const MIN_NODE_WIDTH = 60 // 节点最小宽度
export const MAX_NODE_WIDTH = 300 // 节点最大宽度
export const NODE_PADDING_H = 24 // 节点水平内边距（左右各12px）
export const COLLAPSE_BUTTON_SIZE = 16 // 折叠按钮大小
export const COLLAPSE_BUTTON_GAP = 4 // 折叠按钮与节点的间距

// 节点颜色预设（仅纯色，不含"无填充"）
export const NODE_COLORS = [
    '#4A90D9', '#52C41A', '#FA8C16', '#722ED1', 
    '#EB2F96', '#13C2C2', '#F5222D', '#FAAD14',
    '#2F54EB', '#A0D911', '#FA541C', '#1890FF',
    '#ffffff', '#f5f5f5', '#d9d9d9', '#333333',
]

// 主题颜色配置
export const THEMES = {
    default: {
        rootBg: '#4A90D9',
        rootText: '#ffffff',
        nodeBg: 'transparent',
        nodeText: 'var(--b3-theme-on-background, #333333)',
        nodeBorder: '#cccccc',
        lineColor: '#888888',
        selectedBorder: '#4A90D9',
        nodeStyle: 'box' as const, // 'box' | 'underline' | 'none'
    },
    noBorder: {
        rootBg: '#4A90D9',
        rootText: '#ffffff',
        nodeBg: 'transparent',
        nodeText: 'var(--b3-theme-on-background, #333333)',
        nodeBorder: 'transparent',
        lineColor: 'var(--b3-theme-on-surface, #888888)',
        selectedBorder: '#4A90D9',
        nodeStyle: 'none' as const,
    },
    underline: {
        rootBg: '#4A90D9',
        rootText: '#ffffff',
        nodeBg: 'transparent',
        nodeText: 'var(--b3-theme-on-background, #333333)',
        nodeBorder: '#4A90D9',
        lineColor: '#4A90D9',
        selectedBorder: '#FF6B6B',
        nodeStyle: 'underline' as const,
    },
} as const

export type ThemeName = keyof typeof THEMES
export type ThemeColors = typeof THEMES[ThemeName]
export type NodeStyle = 'box' | 'underline' | 'none'

// 颜色数组用于不同层级
export const LEVEL_COLORS = [
    '#4A90D9', '#52C41A', '#FA8C16', '#722ED1', '#EB2F96', '#13C2C2', '#F5222D'
]
