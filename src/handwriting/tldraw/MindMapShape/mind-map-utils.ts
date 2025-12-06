// ===== 思维导图工具函数 =====

import { MIN_NODE_WIDTH, NODE_PADDING_H } from './mind-map-constants'

/**
 * 计算颜色亮度，用于决定文本颜色
 */
export const getLuminance = (hexColor: string): number => {
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16) / 255
    const g = parseInt(hex.substr(2, 2), 16) / 255
    const b = parseInt(hex.substr(4, 2), 16) / 255
    // 使用相对亮度公式
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * 根据背景色获取合适的文本颜色
 */
export const getContrastTextColor = (bgColor: string): string => {
    try {
        const luminance = getLuminance(bgColor)
        return luminance > 0.5 ? '#333333' : '#ffffff'
    } catch {
        return '#333333'
    }
}

/**
 * 测量文本宽度的辅助函数
 */
export const measureTextWidth = (text: string, fontSize: number, fontWeight: string = 'normal'): number => {
    // 使用 canvas 测量文本宽度
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return text.length * fontSize * 0.6 // fallback
    ctx.font = `${fontWeight} ${fontSize}px sans-serif`
    return ctx.measureText(text).width
}

/**
 * 根据文本计算节点宽度
 */
export const calculateNodeWidth = (text: string, level: number, fontSize: number): number => {
    const fs = level === 0 ? fontSize * 1.2 : fontSize
    const fw = level === 0 ? 'bold' : 'normal'
    // 支持多行文本 - 以最长一行为宽度
    const lines = text.split(/\r?\n/)
    let textWidth = 0
    for (const line of lines) {
        const w = measureTextWidth(line, fs, fw)
        if (w > textWidth) textWidth = w
    }
    // 添加水平内边距，不再使用最大宽度限制，保证完整显示
    const calculatedWidth = textWidth + NODE_PADDING_H
    const minW = level === 0 ? MIN_NODE_WIDTH * 1.2 : MIN_NODE_WIDTH
    return Math.max(minW, calculatedWidth)
}

/**
 * 根据文本计算节点高度（支持多行）
 */
export const calculateNodeHeight = (text: string, level: number, fontSize: number, baseHeight: number): number => {
    const fs = level === 0 ? fontSize * 1.2 : fontSize
    const lines = text.split(/\r?\n/).length
    const lineHeight = fs * 1.2
    const computedHeight = lines * lineHeight + 12 // 内边距: 6px top + 6px bottom
    return Math.max(baseHeight, computedHeight)
}

/**
 * 截断过长的文本
 */
// 以前用于截断文本的工具函数 - 现在改为多行换行显示，保留注释以备未来引用
