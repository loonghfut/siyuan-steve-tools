/**
 * 将思源的 protyle-html 元素（data-content 属性内的 HTML）解码并替换为普通 DOM
 * 支持处理：
 * - data-content 中可能存在的 HTML 实体编码（单层或多层）
 * - 某些浏览器/环境中 protyle-html 可能已经带有 <template> shadowroot 内容
 * - 保留原始 protyle-html 的位置与样式
 */
export function convertProtyleHtmlToDom(root: HTMLElement | Element) {
  if (!root) return

  const nodes = Array.from(root.querySelectorAll('protyle-html')) as HTMLElement[]
  if (nodes.length === 0) return

  nodes.forEach((ph) => {
    try {
      // 优先使用 template 内的内容（如果存在）
      const tpl = ph.querySelector('template')
      let htmlText: string | null = null
      if (tpl && tpl.innerHTML && tpl.innerHTML.trim().length > 0) {
        htmlText = tpl.innerHTML
      } else {
        // 从 data-content 读取，可能是实体编码（例如 &lt;div&gt; 等）或双重实体
        const dc = ph.getAttribute('data-content') || ''
        if (!dc) {
          htmlText = ''
        } else {
          // 逐步解码 HTML 实体，最多尝试 3 次以处理双重编码
          htmlText = dc
          for (let i = 0; i < 3; i++) {
            const decoded = decodeHtml(htmlText)
            if (decoded === htmlText) break
            htmlText = decoded
          }
        }
      }

      // 创建容器并将解码后的 HTML 转为节点
      const wrapper = document.createElement('div')
      // 保留 protyle-wysiwyg 类的默认容器样式，如果父节点为 protyle-wysiwyg 则不额外包一层
      wrapper.innerHTML = htmlText || ''

      // 将 wrapper 的子节点替换到 protyle-html 的父容器中，保持原来结构
      const parent = ph.parentElement
      if (!parent) return

      // 插入前先尝试复制一些必要的 aria/role/样式
      // 如果 protyle-html 自身有样式或属性需要保留，可在此复制

      // Replace protyle-html with decoded nodes
      const fragment = document.createDocumentFragment()
      while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild)

      // 如果 fragment 为空，插入一个空 div 以保持结构一致性
      if (fragment.childNodes.length === 0) {
        const empty = document.createElement('div')
        empty.innerHTML = ''
        fragment.appendChild(empty)
      }

      parent.replaceChild(fragment, ph)
    } catch (err) {
      // 出错时保留原始元素，避免破坏页面
      // eslint-disable-next-line no-console
      console.warn('convertProtyleHtmlToDom error', err)
    }
  })
}

// 简单的 HTML 解码器，创建一个文本节点并读取 innerHTML 解码实体。
function decodeHtml(html: string): string {
  // 如果环境中没有 document（如 SSR），直接返回原文
  if (typeof document === 'undefined') return html
  const txt = document.createElement('textarea')
  txt.innerHTML = html
  return txt.value
}
