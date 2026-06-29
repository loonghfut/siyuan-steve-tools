import { Editor } from '@tldraw/tldraw'
import { settingdata } from '@/index'
import { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'

// 与 SingleBlockShapeUtil 中保持一致的边框宽度
const BORDER_PX = 3
// 自适应宽度的上下限，避免内容过短/过长时尺寸异常
const MIN_WIDTH = 80
const MAX_WIDTH = 900
const FIT_GUARD_PX = 4
const MEASURABLE_ELEMENT_SELECTOR = [
    'img',
    'svg',
    'canvas',
    'video',
    'iframe',
    'mjx-container',
    '.katex',
    '.mermaid',
].join(',')

function getNumberStyle(style: CSSStyleDeclaration, prop: string): number {
    const value = Number.parseFloat(style.getPropertyValue(prop))
    return Number.isFinite(value) ? value : 0
}

function isVisibleElement(el: Element): boolean {
    const style = window.getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden'
}

function getRenderedScaleX(contentEl: HTMLElement, rootRect: DOMRect): number {
    const layoutWidth = contentEl.offsetWidth || contentEl.clientWidth
    if (!layoutWidth || !rootRect.width) return 1
    const scale = rootRect.width / layoutWidth
    return Number.isFinite(scale) && scale > 0 ? scale : 1
}

function getRightEdgeInLocalPx(rect: DOMRect, rootRect: DOMRect, scaleX: number): number {
    return (rect.right - rootRect.left) / scaleX
}

/**
 * 测量当前真实布局中可见内容的最右边界。
 *
 * 思源块内很多 block 元素会天然占满父容器；如果直接量这些容器的
 * scrollWidth / bounding rect，会把右侧空白也算进去。这里改为量文本
 * Range 和图片、公式等实际内容节点，更接近“视觉上需要的宽度”。
 */
function measureRenderedContentWidth(contentEl: HTMLElement): number {
    const rootRect = contentEl.getBoundingClientRect()
    if (!rootRect.width) return 0

    const scaleX = getRenderedScaleX(contentEl, rootRect)
    let maxRight = 0

    const walker = document.createTreeWalker(
        contentEl,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT
                const parent = node.parentElement
                if (!parent || !contentEl.contains(parent)) return NodeFilter.FILTER_REJECT
                return isVisibleElement(parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
            },
        }
    )

    let textNode = walker.nextNode()
    while (textNode) {
        const range = document.createRange()
        range.selectNodeContents(textNode)
        for (const rect of Array.from(range.getClientRects())) {
            if (rect.width <= 0 || rect.height <= 0) continue
            maxRight = Math.max(maxRight, getRightEdgeInLocalPx(rect, rootRect, scaleX))
        }
        range.detach()
        textNode = walker.nextNode()
    }

    for (const el of Array.from(contentEl.querySelectorAll(MEASURABLE_ELEMENT_SELECTOR))) {
        if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) continue
        if (!isVisibleElement(el)) continue
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        maxRight = Math.max(maxRight, getRightEdgeInLocalPx(rect, rootRect, scaleX))
    }

    if (!maxRight) return 0

    const style = window.getComputedStyle(contentEl)
    return Math.ceil(maxRight + getNumberStyle(style, 'padding-right') + FIT_GUARD_PX)
}

/**
 * 测量内容元素在不换行约束下的自然宽度。
 * 通过离屏克隆 + width:max-content 获取内容真实需要的宽度。
 */
function measureNaturalWidth(contentEl: HTMLElement, fontSize: number): number {
    const clone = contentEl.cloneNode(true) as HTMLElement
    clone.style.position = 'absolute'
    clone.style.left = '-99999px'
    clone.style.top = '0'
    clone.style.visibility = 'hidden'
    clone.style.width = 'max-content'
    clone.style.maxWidth = 'none'
    clone.style.height = 'auto'
    clone.style.maxHeight = 'none'
    clone.style.overflow = 'visible'
    clone.style.fontSize = `${fontSize}px`
    clone.style.pointerEvents = 'none'

    document.body.appendChild(clone)
    // scrollWidth 反映内容不换行时所需的宽度
    const width = Math.ceil(clone.scrollWidth || clone.offsetWidth || 0)
    document.body.removeChild(clone)
    return width
}

/**
 * 在给定 shape 的 DOM 中找到用于测量的内容元素。
 */
function findContentElement(shape: ISingleBlockShape): HTMLElement | null {
    const host = document.getElementById(shape.id as string)
    if (!host) return null
    const container = (host.querySelector('[blockid]') as HTMLElement) || host
    return (container.querySelector('.protyle-wysiwyg') as HTMLElement) || container
}

/**
 * 将选中的 single-block 形状的宽度自适应调整为内容所需宽度。
 * 高度由 useSingleBlockSize hook 在宽度变化后自动重新测量。
 */
export function fitSingleBlockWidth(editor: Editor, shapes: ISingleBlockShape[]) {
    if (!shapes.length) return

    const updates: { id: ISingleBlockShape['id']; type: 'single-block'; props: { w: number } }[] = []

    for (const shape of shapes) {
        const contentEl = findContentElement(shape)
        if (!contentEl) continue

        const fontSize = shape.props.fontSize || 16
        const contentWidth = measureRenderedContentWidth(contentEl) || measureNaturalWidth(contentEl, fontSize)
        if (!contentWidth) continue

        // 内容区为容器宽度减去左右边框
        const borderPx = settingdata["showCardBorder"] !== false && !shape.props.transparentBackground ? BORDER_PX : 0
        const nextWidth = Math.min(
            MAX_WIDTH,
            Math.max(MIN_WIDTH, contentWidth + borderPx * 2)
        )

        // 只收缩、不增宽：仅当内容所需宽度小于当前宽度时才调整
        if (Math.round(nextWidth) >= Math.round(shape.props.w)) continue

        updates.push({
            id: shape.id,
            type: 'single-block',
            props: { w: nextWidth },
        })
    }

    if (!updates.length) return

    editor.run(() => {
        editor.updateShapes(updates)
    })
}
