import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    formatLocalDateTimeInput,
    resolveBlockIdFromElement,
    resolveTargetBlockIdsFromEditor,
} from './cursor-blocks.ts';

interface FakeEl {
    attrs: Record<string, string>;
    classes: Set<string>;
    parentElement: FakeEl | null;
    children: FakeEl[];
    closest: (selector: string) => FakeEl | null;
    contains: (other: any) => boolean;
    getAttribute: (name: string) => string | null;
    querySelectorAll: (selector: string) => FakeEl[];
}

function makeEl(
    attrs: Record<string, string> = {},
    classes: string[] = [],
    parent: FakeEl | null = null,
): FakeEl {
    const classSet = new Set(classes);
    const el: FakeEl = {
        attrs,
        classes: classSet,
        parentElement: parent,
        children: [],
        getAttribute(name: string) {
            return name in this.attrs ? this.attrs[name] : null;
        },
        contains(other: any) {
            let cur: FakeEl | null = other?.nodeType === 3 ? other.parentElement : other;
            while (cur) {
                if (cur === this) return true;
                cur = cur.parentElement;
            }
            return false;
        },
        closest(selector: string) {
            let cur: FakeEl | null = this;
            while (cur) {
                if (matchesSelector(cur, selector)) return cur;
                cur = cur.parentElement;
            }
            return null;
        },
        querySelectorAll(selector: string) {
            const out: FakeEl[] = [];
            const walk = (node: FakeEl) => {
                for (const child of node.children) {
                    if (matchesSelector(child, selector)) {
                        out.push(child);
                    }
                    walk(child);
                }
            };
            walk(this);
            return out;
        },
    };
    if (parent) {
        parent.children.push(el);
    }
    return el;
}

function matchesSelector(el: FakeEl, selector: string): boolean {
    if (selector === '.li[data-node-id]') {
        return el.classes.has('li') && el.getAttribute('data-node-id') !== null;
    }
    if (selector === '.protyle-title[data-node-id]') {
        return el.classes.has('protyle-title') && el.getAttribute('data-node-id') !== null;
    }
    if (selector === '[data-type][data-node-id]') {
        return el.getAttribute('data-type') !== null && el.getAttribute('data-node-id') !== null;
    }
    if (selector === '[data-node-id]') {
        return el.getAttribute('data-node-id') !== null;
    }
    if (selector === '.protyle-wysiwyg--select[data-node-id]') {
        return el.classes.has('protyle-wysiwyg--select') && el.getAttribute('data-node-id') !== null;
    }
    return false;
}

describe('formatLocalDateTimeInput', () => {
    it('formats local year-month-day and hour:minute without UTC offset hardcoding', () => {
        const d = new Date(2026, 10, 12, 9, 5, 0);
        assert.equal(formatLocalDateTimeInput(d), '2026-11-12T09:05');
    });
});

describe('resolveBlockIdFromElement', () => {
    it('prefers enclosing .li block ID over inner paragraph block ID', () => {
        const wysiwyg = makeEl();
        const li = makeEl({ 'data-node-id': 'li-1', 'data-type': 'NodeListItem' }, ['li'], wysiwyg);
        const p = makeEl({ 'data-node-id': 'p-1', 'data-type': 'NodeParagraph' }, ['p'], li);
        const textNode = { nodeType: 3, parentElement: p } as unknown as Node;

        assert.equal(resolveBlockIdFromElement(textNode, wysiwyg as unknown as Element), 'li-1');
    });

    it('rejects elements outside the active editor container', () => {
        const editorA = makeEl();
        const editorB = makeEl();
        const otherBlock = makeEl({ 'data-node-id': 'outside-1', 'data-type': 'NodeParagraph' }, [], editorB);

        assert.equal(resolveBlockIdFromElement(otherBlock as unknown as Element, editorA as unknown as Element), null);
    });
});

describe('resolveTargetBlockIdsFromEditor', () => {
    it('returns selected .protyle-wysiwyg--select blocks even when DOM selection is empty', () => {
        const wysiwyg = makeEl();
        makeEl({ 'data-node-id': 'blk-1', 'data-type': 'NodeParagraph' }, ['protyle-wysiwyg--select'], wysiwyg);
        makeEl({ 'data-node-id': 'blk-2', 'data-type': 'NodeParagraph' }, ['protyle-wysiwyg--select'], wysiwyg);
        makeEl({ 'data-node-id': 'blk-3', 'data-type': 'NodeParagraph' }, [], wysiwyg);

        const protyle = { element: wysiwyg, wysiwyg: { element: wysiwyg } };
        const emptySelection = { rangeCount: 0 } as unknown as Selection;

        assert.deepEqual(resolveTargetBlockIdsFromEditor(protyle, emptySelection), ['blk-1', 'blk-2']);
    });

    it('falls back to protyle.toolbar.range when window selection is absent or outside editor', () => {
        const wysiwyg = makeEl();
        const p = makeEl({ 'data-node-id': 'blk-caret', 'data-type': 'NodeParagraph' }, [], wysiwyg);
        const outside = makeEl({ 'data-node-id': 'dock-item' });

        const protyle = {
            element: wysiwyg,
            wysiwyg: { element: wysiwyg },
            toolbar: { range: { startContainer: { nodeType: 3, parentElement: p } } },
        };
        const outsideSelection = {
            rangeCount: 1,
            getRangeAt: () => ({ startContainer: outside }),
        } as unknown as Selection;

        assert.deepEqual(resolveTargetBlockIdsFromEditor(protyle, outsideSelection), ['blk-caret']);
    });
});
