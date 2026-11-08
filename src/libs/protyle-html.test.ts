import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    extractFirstAnchorUrl,
    hasRealHtmlTag,
    pickProtyleHtmlSource,
    resolveProtyleHtmlLink,
} from "./protyle-html.ts";

/** 3.7 的整体转义：把真实标签里的 < > " 换成实体 */
const escapeAll = (html: string) =>
    html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

describe("hasRealHtmlTag", () => {
    it("识别真实标签", () => {
        assert.equal(hasRealHtmlTag("<a href=\"x\">y</a>"), true);
        assert.equal(hasRealHtmlTag("<div>text</div>"), true);
    });

    it("整体转义过的内容没有真实标签", () => {
        assert.equal(hasRealHtmlTag("&lt;a href=&quot;x&quot;&gt;y&lt;/a&gt;"), false);
    });

    it("空内容", () => {
        assert.equal(hasRealHtmlTag(""), false);
    });
});

describe("extractFirstAnchorUrl", () => {
    it("优先取 data-link", () => {
        assert.equal(extractFirstAnchorUrl('<a data-link="siyuan://x" href="https://y">t</a>'), "siyuan://x");
    });

    it("没有 data-link 时取 href", () => {
        assert.equal(extractFirstAnchorUrl('<a href="https://y">t</a>'), "https://y");
    });

    it("没有链接时返回空串", () => {
        assert.equal(extractFirstAnchorUrl("<div>t</div>"), "");
        assert.equal(extractFirstAnchorUrl(""), "");
    });
});

describe("pickProtyleHtmlSource", () => {
    const raw = '<div class="link-card-inner"><a data-link="https://real" href="https://real">t</a></div>';

    it("3.8：优先用 shadowRoot 的原始 HTML", () => {
        const source = pickProtyleHtmlSource({ dataContent: raw, shadowHtml: raw });
        assert.equal(source, raw);
    });

    it("3.8 但没有 shadowRoot 时用 data-content 原样", () => {
        const source = pickProtyleHtmlSource({ dataContent: raw, shadowHtml: "" });
        assert.equal(source, raw);
    });

    it("3.7：内容被整体转义，需要解一层", () => {
        const escaped = escapeAll(raw);
        const source = pickProtyleHtmlSource(
            { dataContent: escaped, shadowHtml: escaped },
            (html) => html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
        );
        assert.ok(source.includes('<a data-link="https://real"'), "应解出真实标签");
    });

    it("3.8 正文里的转义字面量不会被当成链接源", () => {
        // 3.8 的 data-content 是原始 HTML（含真实标签），即便正文里还有 &lt;a&gt; 字面量
        const content = '<p>示例 &lt;a href="https://fake"&gt;</p><a href="https://real">t</a>';
        const source = pickProtyleHtmlSource({ dataContent: content, shadowHtml: content });
        assert.equal(source, content, "不应解码");
        assert.equal(extractFirstAnchorUrl(source), "https://real");
    });
});

describe("resolveProtyleHtmlLink", () => {
    it("3.8 路径返回真实链接", () => {
        const raw = '<a href="https://real">t</a>';
        const resolved = resolveProtyleHtmlLink({ dataContent: raw, shadowHtml: raw });
        assert.equal(resolved?.url, "https://real");
    });

    it("3.7 路径解码后返回真实链接", () => {
        const escaped = escapeAll('<a href="https://real">t</a>');
        const resolved = resolveProtyleHtmlLink(
            { dataContent: escaped, shadowHtml: escaped },
            (html) => html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
        );
        assert.equal(resolved?.url, "https://real");
    });

    it("没有链接时返回 null", () => {
        assert.equal(resolveProtyleHtmlLink({ dataContent: "<p>x</p>", shadowHtml: "<p>x</p>" }), null);
    });
});
