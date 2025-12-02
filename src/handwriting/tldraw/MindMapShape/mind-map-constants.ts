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
        nodeBg: '#ffffff',
        nodeText: '#333333',
        nodeBorder: '#cccccc',
        lineColor: '#888888',
        selectedBorder: '#4A90D9',
    },
    colorful: {
        rootBg: '#FF6B6B',
        rootText: '#ffffff',
        nodeBg: '#FFF3E0',
        nodeText: '#333333',
        nodeBorder: '#FFB74D',
        lineColor: '#FF9800',
        selectedBorder: '#E91E63',
    },
    minimal: {
        rootBg: '#333333',
        rootText: '#ffffff',
        nodeBg: '#f5f5f5',
        nodeText: '#333333',
        nodeBorder: '#e0e0e0',
        lineColor: '#999999',
        selectedBorder: '#333333',
    },
} as const

export type ThemeName = keyof typeof THEMES
export type ThemeColors = typeof THEMES[ThemeName]

// 颜色数组用于不同层级
export const LEVEL_COLORS = [
    '#4A90D9', '#52C41A', '#FA8C16', '#722ED1', '#EB2F96', '#13C2C2', '#F5222D'
]
