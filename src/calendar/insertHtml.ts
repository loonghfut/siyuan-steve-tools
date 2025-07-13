import { generateSiyuanID } from "@/api/api";


export async function insertHtml() {
    const blockIdData = await generateSiyuanID(true) as {
        id: string,
        timestamp: string,
        randomStr: string,
    };
    const html = `
<div data-node-id="${blockIdData.id}" data-node-index="1" data-type="NodeHTMLBlock" class="render-node" updated="${blockIdData.timestamp}" data-subtype="block"><div class="protyle-icons"><span class="b3-tooltips__nw b3-tooltips protyle-icon protyle-icon--first protyle-action__edit" aria-label="编辑"><svg><use xlink:href="#iconEdit"></use></svg></span><span class="b3-tooltips__nw b3-tooltips protyle-icon protyle-action__menu protyle-icon--last" aria-label="更多"><svg><use xlink:href="#iconMore"></use></svg></span></div><div><protyle-html data-content="&amp;lt;div&amp;gt;
&amp;lt;div id=&amp;quot;calendar-2&amp;quot; class=&amp;quot;cal-${blockIdData.id}&amp;quot; &amp;gt;
ST看板
&amp;lt;/div&amp;gt;
&amp;lt;/div&amp;gt;"></protyle-html><span style="position: absolute">​</span></div><div class="protyle-attr" contenteditable="false">​</div></div>
    `;
    return { html: html, blockIdData: blockIdData };
}
/**
 * HTML 块中的脚本获取当前块相关信息
 * @params {string} customID 内部定义的 ID
 * @returns {string} id 当前 HTML 块 ID
 * @returns {HTMLElement} block 当前 HTML 块
 * @returns {HTMLElement} shadowRoot 当前 HTML 块 shadowRoot
 */
export async function THIS(customID) {
    let protyle = document.querySelector(`protyle-html[data-content*="${customID}"]`);
    if (protyle) {
        let block = protyle.parentElement.parentElement;
        return {
            id: block.dataset.nodeId,
            block: block,
            shadowRoot: protyle.shadowRoot,
        };
    } else return null;
}