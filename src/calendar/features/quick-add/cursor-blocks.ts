/** Formats a Date as `YYYY-MM-DDTHH:mm` using the host's local calendar/clock. */
export function formatLocalDateTimeInput(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function asElement(node: Node | Element | null | undefined): Element | null {
    if (!node) return null;
    if (typeof (node as Element).closest === 'function') {
        return node as Element;
    }
    return (node as Node).parentElement || null;
}

function isInsideRoot(el: Element | null, root?: Element | null): boolean {
    if (!el) return false;
    if (!root) return true;
    return el === root || root.contains(el);
}

/**
 * Resolves the enclosing SiYuan block ID from a DOM node/element inside an editor.
 * Prefers `.li` for list/task items, then `.protyle-title`, then `[data-type][data-node-id]`,
 * then `[data-node-id]`. Rejects matches outside `containerRoot` when provided.
 */
export function resolveBlockIdFromElement(
    node: Node | Element | null | undefined,
    containerRoot?: Element | null,
): string | null {
    const element = asElement(node);
    if (!element || !isInsideRoot(element, containerRoot)) {
        return null;
    }

    const candidates = [
        element.closest('.li[data-node-id]'),
        element.closest('.protyle-title[data-node-id]'),
        element.closest('[data-type][data-node-id]'),
        element.closest('[data-node-id]'),
    ];

    for (const candidate of candidates) {
        if (!candidate || !isInsideRoot(candidate, containerRoot)) {
            continue;
        }
        const id = candidate.getAttribute('data-node-id');
        if (id) {
            return id;
        }
    }

    return null;
}

/**
 * Resolves target SiYuan block IDs for editor-hotkey schedule creation:
 * 1. Explicit `.protyle-wysiwyg--select` block selection in `protyle.wysiwyg.element` (supports multi-block);
 * 2. Active `window.getSelection()` caret container bounded to `protyle.element` / `protyle.wysiwyg.element`;
 * 3. Fallback to `protyle.toolbar.range.startContainer` when DOM selection is absent or outside the editor.
 */
export function resolveTargetBlockIdsFromEditor(
    protyle?: any,
    selection?: Selection | null,
): string[] {
    const wysiwygEl: Element | null = protyle?.wysiwyg?.element || null;
    const editorRoot: Element | null = protyle?.element || wysiwygEl || null;

    if (wysiwygEl && typeof wysiwygEl.querySelectorAll === 'function') {
        const selected = wysiwygEl.querySelectorAll('.protyle-wysiwyg--select[data-node-id]');
        const selectedIds: string[] = [];
        const seen = new Set<string>();
        selected.forEach((el) => {
            const id = el.getAttribute('data-node-id');
            if (id && !seen.has(id)) {
                seen.add(id);
                selectedIds.push(id);
            }
        });
        if (selectedIds.length > 0) {
            return selectedIds;
        }
    }

    const selectionNode = selection && selection.rangeCount > 0
        ? selection.getRangeAt(0)?.startContainer
        : null;
    const fromSelection = resolveBlockIdFromElement(selectionNode, editorRoot);
    if (fromSelection) {
        return [fromSelection];
    }

    const toolbarRangeNode = protyle?.toolbar?.range?.startContainer || null;
    const fromToolbarRange = resolveBlockIdFromElement(toolbarRangeNode, editorRoot);
    if (fromToolbarRange) {
        return [fromToolbarRange];
    }

    return [];
}
