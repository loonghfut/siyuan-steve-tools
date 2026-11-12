import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasAvContextFilterInIal, selectPreferredAvBlock } from "./av-block.ts";

describe("hasAvContextFilterInIal", () => {
    it("recognizes active custom-sy-av-context-filter in SiYuan IAL", () => {
        const ial = '{: id="20251029-aaa" custom-sy-av-context-filter="{&quot;spec&quot;:1,&quot;keyID&quot;:&quot;k1&quot;}" updated="20261112"}';
        assert.equal(hasAvContextFilterInIal(ial), true);
    });

    it("treats missing or cleared custom-sy-av-context-filter as unfiltered", () => {
        assert.equal(hasAvContextFilterInIal(""), false);
        assert.equal(hasAvContextFilterInIal('{: id="20251029-aaa" name="日程"}'), false);
        assert.equal(hasAvContextFilterInIal('{: id="20251029-aaa" custom-sy-av-context-filter=""}'), false);
        assert.equal(hasAvContextFilterInIal('{: id="20251029-aaa" custom-sy-av-context-filter="   "}'), false);
    });
});

describe("selectPreferredAvBlock", () => {
    it("does not warn for ordinary mirror blocks without context filter", () => {
        const res = selectPreferredAvBlock([
            { id: "mirror-newer", name: "", ial: '{: id="mirror-newer"}' },
            { id: "mirror-named", name: "日程", ial: '{: id="mirror-named" name="日程"}' },
            { id: "mirror-older", name: "", ial: '{: id="mirror-older"}' },
        ], ["日程", "周期"]);

        assert.equal(res.id, "mirror-named");
        assert.deepEqual(res.ids, ["mirror-newer", "mirror-named", "mirror-older"]);
        assert.equal(res.selectedHasContextFilter, false);
        assert.equal(res.hasMixedContextFilters, false);
        assert.equal(res.shouldWarnAmbiguousContext, false);
    });

    it("prefers an unfiltered block even when a context-filtered mirror was updated more recently", () => {
        const res = selectPreferredAvBlock([
            {
                id: "doc-mirror-filtered",
                name: "",
                ial: '{: id="doc-mirror-filtered" custom-sy-av-context-filter="{&quot;spec&quot;:1,&quot;keyID&quot;:&quot;k1&quot;}"}',
            },
            {
                id: "main-unfiltered",
                name: "",
                ial: '{: id="main-unfiltered"}',
            },
        ]);

        assert.equal(res.id, "main-unfiltered");
        assert.equal(res.selectedHasContextFilter, false);
        assert.equal(res.hasMixedContextFilters, true);
        assert.equal(res.shouldWarnAmbiguousContext, false);
    });

    it("warns only when multiple blocks exist and even the chosen block has context filter", () => {
        const res = selectPreferredAvBlock([
            {
                id: "mirror-1",
                name: "项目视图",
                ial: '{: id="mirror-1" custom-sy-av-context-filter="{&quot;spec&quot;:1,&quot;keyID&quot;:&quot;k1&quot;}"}',
            },
            {
                id: "mirror-2",
                name: "日程",
                ial: '{: id="mirror-2" name="日程" custom-sy-av-context-filter="{&quot;spec&quot;:1,&quot;keyID&quot;:&quot;k2&quot;}"}',
            },
        ], ["日程", "周期"]);

        assert.equal(res.id, "mirror-2");
        assert.equal(res.selectedHasContextFilter, true);
        assert.equal(res.shouldWarnAmbiguousContext, true);
    });
});
