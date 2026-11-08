/**
 * 解析思源 protyle-html 元素里的链接。
 *
 * 思源两个版本对 data-content 的处理不同：
 * - 3.7 及更早：构造时用 `Lute.EscapeHTMLStr` 把内容**整体转义一层**再写回 data-content
 *   （app/stage/protyle/js/protyle-html.js），因此 data-content 里**没有真实标签**。
 * - 3.8 起：data-content 保留**原始 HTML 源码**，并用 open shadow root 承载
 *   思源自己净化后的渲染结果。
 *
 * 判定"是否存在真实标签"而不是"是否含实体"：3.8 正文里出现的 `&lt;a href&gt;`
 * 只是字面量，不能被解码成真链接。
 */

/** 是否含有真实 HTML 标签（转义过的内容里只有 `&lt;` 这类实体，没有 `<tag`）。 */
export function hasRealHtmlTag(text: string): boolean {
    return /<[a-zA-Z]/.test(text || "");
}

/** 解一层 HTML 实体转义。宿主没有 document 时原样返回。 */
export function decodeHtmlEntities(html: string): string {
    if (typeof document === 'undefined') return html;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
}

export interface ProtyleHtmlContent {
    /** 元素上的 data-content 属性值。 */
    dataContent: string;
    /** 元素 shadowRoot 的 innerHTML（3.8 起有内容，3.7 是转义后的）。 */
    shadowHtml: string;
}

/**
 * 选出应当用于解析链接的 HTML 源码。
 *
 * @param content 元素内容
 * @param decode 解码函数（可注入以便测试）
 */
export function pickProtyleHtmlSource(content: ProtyleHtmlContent, decode: (html: string) => string = decodeHtmlEntities): string {
    const dataContent = content?.dataContent || '';
    const shadowHtml = content?.shadowHtml || '';
    if (hasRealHtmlTag(shadowHtml)) {
        // 3.8：思源净化后的原始 HTML
        return shadowHtml;
    }
    if (hasRealHtmlTag(dataContent)) {
        // 3.8 但拿不到 shadowRoot
        return dataContent;
    }
    // 3.7：内容被整体转义过一层，解开才能看到真实标签
    return decode(dataContent);
}

/** 取出第一个 `<a>` 的链接地址（优先 data-link，其次 href）。 */
export function extractFirstAnchorUrl(html: string): string {
    const match = (html || '').match(/<a[^>]+?(?:data-link|href)="([^"]+)"/i);
    return match?.[1] || '';
}

/**
 * 一步到位：解析出 protyle-html 里的链接。
 * @returns 找到链接时返回 { url, html }，否则返回 null
 */
export function resolveProtyleHtmlLink(content: ProtyleHtmlContent, decode?: (html: string) => string): { url: string; html: string } | null {
    const html = pickProtyleHtmlSource(content, decode);
    const url = extractFirstAnchorUrl(html);
    return url ? { url, html } : null;
}
