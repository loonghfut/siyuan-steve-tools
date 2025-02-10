import { generateSiyuanID } from "@/api";


export async function insertHtml() {
    const blockIdData = await generateSiyuanID(true) as {
        id: string,
        timestamp: string,
        randomStr: string,
    };
    const html = `
<div data-node-id="${blockIdData.id}" data-node-index="1" data-type="NodeHTMLBlock" class="render-node" updated="${blockIdData.timestamp}" data-subtype="block"><div class="protyle-icons"><span class="b3-tooltips__nw b3-tooltips protyle-icon protyle-icon--first protyle-action__edit" aria-label="编辑"><svg><use xlink:href="#iconEdit"></use></svg></span><span class="b3-tooltips__nw b3-tooltips protyle-icon protyle-action__menu protyle-icon--last" aria-label="更多"><svg><use xlink:href="#iconMore"></use></svg></span></div><div><protyle-html data-content="&amp;lt;div&amp;gt;
&amp;lt;div id=&amp;quot;calendar-${blockIdData.id}&amp;quot; class=&amp;quot;cal-note-container&amp;quot; &amp;gt;
ST看板
&amp;lt;/div&amp;gt;
&amp;lt;/div&amp;gt;"></protyle-html><span style="position: absolute">​</span></div><div class="protyle-attr" contenteditable="false">​</div></div>
    `;
    return {html: html, blockIdData: blockIdData};
}