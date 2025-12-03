// ===== Markdown 到思维导图转换 =====

import { MindMapNode, createMindMapNode } from './mind-map-shape-types'

/**
 * Markdown 解析行的类型
 */
interface ParsedLine {
    level: number      // 层级（标题层级或列表缩进层级）
    text: string       // 文本内容
    type: 'heading' | 'list' | 'text'  // 类型
}

/**
 * 解析单行 Markdown 内容
 */
function parseLine(line: string): ParsedLine | null {
    const trimmedLine = line.trimEnd()
    if (!trimmedLine) return null

    // 匹配标题 (# ## ### etc)
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
        return {
            level: headingMatch[1].length,
            text: headingMatch[2].trim(),
            type: 'heading',
        }
    }

    // 匹配无序列表 (- * +)
    const unorderedListMatch = trimmedLine.match(/^(\s*)[-*+]\s+(.+)$/)
    if (unorderedListMatch) {
        const indent = unorderedListMatch[1].length
        // 每 2 个空格或 1 个 tab 算一个层级
        const level = Math.floor(indent / 2) + 1
        return {
            level,
            text: unorderedListMatch[2].trim(),
            type: 'list',
        }
    }

    // 匹配有序列表 (1. 2. etc)
    const orderedListMatch = trimmedLine.match(/^(\s*)\d+\.\s+(.+)$/)
    if (orderedListMatch) {
        const indent = orderedListMatch[1].length
        const level = Math.floor(indent / 2) + 1
        return {
            level,
            text: orderedListMatch[2].trim(),
            type: 'list',
        }
    }

    // 普通文本（作为续接内容处理）
    const textMatch = trimmedLine.match(/^(\s*)(.+)$/)
    if (textMatch) {
        const indent = textMatch[1].length
        return {
            level: Math.floor(indent / 2),
            text: textMatch[2].trim(),
            type: 'text',
        }
    }

    return null
}

/**
 * 清理 Markdown 文本中的格式标记
 * 移除加粗、斜体、代码、链接等标记，保留纯文本
 */
function cleanMarkdownText(text: string): string {
    return text
        // 移除加粗 **text** 或 __text__
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        // 移除斜体 *text* 或 _text_
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        // 移除行内代码 `code`
        .replace(/`(.+?)`/g, '$1')
        // 移除链接 [text](url) 保留文本
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        // 移除图片 ![alt](url)
        .replace(/!\[.*?\]\(.+?\)/g, '')
        // 移除删除线 ~~text~~
        .replace(/~~(.+?)~~/g, '$1')
        // 清理多余空格
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * 将 Markdown 内容解析为思维导图节点结构
 * 
 * 支持的格式：
 * 1. 标题模式：# 一级标题作为根节点，## 二级标题作为子节点，以此类推
 * 2. 列表模式：第一行作为根节点，列表项作为子节点，缩进表示层级
 * 3. 混合模式：标题和列表混合使用
 * 
 * @param markdown Markdown 文本内容
 * @returns 思维导图根节点
 */
export function parseMarkdownToMindMap(markdown: string): MindMapNode {
    const lines = markdown.split('\n')
    const parsedLines: ParsedLine[] = []

    // 解析所有行
    for (const line of lines) {
        const parsed = parseLine(line)
        if (parsed) {
            parsed.text = cleanMarkdownText(parsed.text)
            if (parsed.text) {
                parsedLines.push(parsed)
            }
        }
    }

    if (parsedLines.length === 0) {
        return createMindMapNode('空思维导图')
    }

    // 判断是否为标题模式
    const hasHeadings = parsedLines.some(l => l.type === 'heading')
    
    if (hasHeadings) {
        return parseHeadingMode(parsedLines)
    } else {
        return parseListMode(parsedLines)
    }
}

/**
 * 标题模式解析
 * 第一个标题作为根节点，后续标题根据层级作为子节点
 */
function parseHeadingMode(lines: ParsedLine[]): MindMapNode {
    // 找到第一个标题作为根节点
    const firstHeadingIndex = lines.findIndex(l => l.type === 'heading')
    if (firstHeadingIndex === -1) {
        return createMindMapNode('思维导图')
    }

    const rootLine = lines[firstHeadingIndex]
    const root = createMindMapNode(rootLine.text)
    const rootLevel = rootLine.level

    // 使用栈来跟踪每个层级的当前节点
    const stack: { node: MindMapNode; level: number }[] = [{ node: root, level: rootLevel }]
    
    // 当前标题的层级（用于计算列表项的相对层级）
    let currentHeadingLevel = rootLevel

    for (let i = firstHeadingIndex + 1; i < lines.length; i++) {
        const line = lines[i]

        if (line.type === 'heading') {
            // 处理标题
            const newNode = createMindMapNode(line.text)
            currentHeadingLevel = line.level

            // 找到合适的父节点
            while (stack.length > 1 && stack[stack.length - 1].level >= line.level) {
                stack.pop()
            }

            const parent = stack[stack.length - 1].node
            parent.children.push(newNode)
            stack.push({ node: newNode, level: line.level })

        } else if (line.type === 'list') {
            // 处理列表项
            const newNode = createMindMapNode(line.text)
            
            // 列表层级相对于当前标题的层级
            const listLevel = currentHeadingLevel + line.level

            // 找到合适的父节点
            while (stack.length > 1 && stack[stack.length - 1].level >= listLevel) {
                stack.pop()
            }

            const parent = stack[stack.length - 1].node
            parent.children.push(newNode)
            stack.push({ node: newNode, level: listLevel })
        }
    }

    return root
}

/**
 * 列表模式解析
 * 第一行作为根节点，列表项根据缩进层级作为子节点
 */
function parseListMode(lines: ParsedLine[]): MindMapNode {
    if (lines.length === 0) {
        return createMindMapNode('思维导图')
    }

    // 第一个非列表项或第一个顶级列表项作为根节点
    let rootText = '思维导图'
    let startIndex = 0

    if (lines[0].type === 'text' || (lines[0].type === 'list' && lines[0].level === 1)) {
        rootText = lines[0].text
        startIndex = 1
    }

    const root = createMindMapNode(rootText)
    const stack: { node: MindMapNode; level: number }[] = [{ node: root, level: 0 }]

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i]
        const newNode = createMindMapNode(line.text)
        const level = line.type === 'list' ? line.level : line.level + 1

        // 找到合适的父节点
        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop()
        }

        const parent = stack[stack.length - 1].node
        parent.children.push(newNode)
        stack.push({ node: newNode, level })
    }

    return root
}

/**
 * 将思维导图节点结构导出为 Markdown
 * 
 * @param node 思维导图节点
 * @param useHeadings 是否使用标题格式（默认 true）
 * @returns Markdown 文本
 */
export function exportMindMapToMarkdown(node: MindMapNode, useHeadings: boolean = true): string {
    const lines: string[] = []

    if (useHeadings) {
        exportAsHeadings(node, 1, lines)
    } else {
        exportAsList(node, 0, lines)
    }

    return lines.join('\n')
}

/**
 * 以标题格式导出
 */
function exportAsHeadings(node: MindMapNode, level: number, lines: string[]): void {
    // 限制标题层级最多 6 级
    if (level <= 6) {
        const prefix = '#'.repeat(level)
        lines.push(`${prefix} ${node.text}`)
    } else {
        // 超过 6 级使用列表格式
        const indent = '  '.repeat(level - 7)
        lines.push(`${indent}- ${node.text}`)
    }

    lines.push('') // 空行

    for (const child of node.children) {
        exportAsHeadings(child, level + 1, lines)
    }
}

/**
 * 以列表格式导出
 */
function exportAsList(node: MindMapNode, level: number, lines: string[]): void {
    if (level === 0) {
        lines.push(node.text)
        lines.push('')
    } else {
        const indent = '  '.repeat(level - 1)
        lines.push(`${indent}- ${node.text}`)
    }

    for (const child of node.children) {
        exportAsList(child, level + 1, lines)
    }
}

/**
 * 验证 Markdown 内容是否可以转换为思维导图
 * 返回验证结果和预估的节点数量
 */
export function validateMarkdownForMindMap(markdown: string): {
    valid: boolean
    nodeCount: number
    message: string
} {
    const lines = markdown.split('\n')
    let nodeCount = 0
    let hasContent = false

    for (const line of lines) {
        const parsed = parseLine(line)
        if (parsed && cleanMarkdownText(parsed.text)) {
            nodeCount++
            hasContent = true
        }
    }

    if (!hasContent) {
        return {
            valid: false,
            nodeCount: 0,
            message: '没有找到可转换的内容',
        }
    }

    if (nodeCount > 500) {
        return {
            valid: false,
            nodeCount,
            message: `节点数量过多 (${nodeCount})，建议减少内容或拆分为多个思维导图`,
        }
    }

    return {
        valid: true,
        nodeCount,
        message: `可以转换，预计生成 ${nodeCount} 个节点`,
    }
}
