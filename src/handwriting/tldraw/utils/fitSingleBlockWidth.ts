import { Editor } from '@tldraw/tldraw'
import { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'

// 与 SingleBlockShapeUtil 中保持一致的边框宽度
const BORDER_PX = 3
// 自适应宽度的上下限，避免内容过短/过长时尺寸异常
const MIN_WIDTH = 80
const MAX_WIDTH = 900

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
        const naturalWidth = measureNaturalWidth(contentEl, fontSize)
        if (!naturalWidth) continue

        // 内容区为容器宽度减去左右边框
        const borderPx = shape.props.transparentBackground ? 0 : BORDER_PX
        const nextWidth = Math.min(
            MAX_WIDTH,
            Math.max(MIN_WIDTH, naturalWidth + borderPx * 2)
        )

        if (Math.round(nextWidth) === Math.round(shape.props.w)) continue

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
