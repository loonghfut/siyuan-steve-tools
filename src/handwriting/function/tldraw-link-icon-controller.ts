const TLDRAW_LINK_SELECTOR = '[custom-tldraw-link]';
const SEARCH_PREVIEW_SELECTOR = '#searchPreview, #searchUnRefPreview';
const ATTRIBUTE_BAR_CLASS = 'protyle-attr';
const ICON_CLASS = 'st-tldraw-link-icon';

/** Keeps tldraw-link block icons synchronized within normal and search Protyle views. */
export class TldrawLinkIconController {
    private protyleObserver?: MutationObserver;
    private searchDiscoveryObserver?: MutationObserver;
    private readonly searchPreviewObservers = new Map<HTMLElement, MutationObserver>();
    private pendingNodes = new Set<HTMLElement>();
    private flushHandle?: number;
    private flushUsesTimeout = false;

    watchProtyle(protyleEl: HTMLElement) {
        this.protyleObserver?.disconnect();
        if (!protyleEl) return;

        this.injectIcons(protyleEl);
        this.protyleObserver = this.createContentObserver();
        this.protyleObserver.observe(protyleEl, this.getContentObserverOptions());
    }

    watchSearchPreviews() {
        this.stopSearchPreviewWatchers();
        if (!document.body) return;

        this.refreshSearchPreviewObservers();
        this.searchDiscoveryObserver = new MutationObserver((mutations) => {
            if (this.hasSearchPreviewContainerChange(mutations)) {
                this.refreshSearchPreviewObservers();
            }
        });
        // Only discover search preview mounts. Link attributes are observed by scoped observers.
        this.searchDiscoveryObserver.observe(document.body, { childList: true, subtree: true });
    }

    destroy() {
        this.protyleObserver?.disconnect();
        this.protyleObserver = undefined;
        this.stopSearchPreviewWatchers();
        this.clearPendingNodes();
    }

    private getContentObserverOptions(): MutationObserverInit {
        return {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['custom-tldraw-link'],
        };
    }

    private createContentObserver() {
        return new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    this.queueNode(mutation.target as HTMLElement);
                    continue;
                }
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        this.queueRelevantNodes(node);
                    }
                });
            }
        });
    }

    private refreshSearchPreviewObservers() {
        for (const [container, observer] of this.searchPreviewObservers) {
            if (!container.isConnected) {
                observer.disconnect();
                this.searchPreviewObservers.delete(container);
            }
        }

        document.querySelectorAll<HTMLElement>(SEARCH_PREVIEW_SELECTOR).forEach((container) => {
            if (this.searchPreviewObservers.has(container)) return;

            this.injectIcons(container);
            const observer = this.createContentObserver();
            observer.observe(container, this.getContentObserverOptions());
            this.searchPreviewObservers.set(container, observer);
        });
    }

    private stopSearchPreviewWatchers() {
        this.searchDiscoveryObserver?.disconnect();
        this.searchDiscoveryObserver = undefined;
        this.searchPreviewObservers.forEach((observer) => observer.disconnect());
        this.searchPreviewObservers.clear();
    }

    private hasSearchPreviewContainerChange(mutations: MutationRecord[]) {
        for (const [container] of this.searchPreviewObservers) {
            if (!container.isConnected) return true;
        }

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement) || this.isInsideObservedSearchPreview(node)) continue;
                if (node.matches(SEARCH_PREVIEW_SELECTOR) || node.querySelector(SEARCH_PREVIEW_SELECTOR)) {
                    return true;
                }
            }
        }
        return false;
    }

    private isInsideObservedSearchPreview(node: HTMLElement) {
        for (const container of this.searchPreviewObservers.keys()) {
            if (container.contains(node)) return true;
        }
        return false;
    }

    private queueRelevantNodes(node: HTMLElement) {
        if (node.classList.contains(ICON_CLASS)) return;
        this.queueNodeIfRelevant(node);
        node.querySelectorAll<HTMLElement>(`${TLDRAW_LINK_SELECTOR}, .${ATTRIBUTE_BAR_CLASS}`).forEach((child) => {
            this.queueNodeIfRelevant(child);
        });
    }

    private queueNodeIfRelevant(node: HTMLElement) {
        if (node.hasAttribute('custom-tldraw-link')) {
            this.queueNode(node);
        }
        if (node.classList.contains(ATTRIBUTE_BAR_CLASS)) {
            const block = node.parentElement;
            if (block?.hasAttribute('custom-tldraw-link')) {
                this.queueNode(block);
            }
        }
    }

    private queueNode(node: HTMLElement) {
        this.pendingNodes.add(node);
        if (this.flushHandle !== undefined) return;

        const flush = () => {
            this.pendingNodes.forEach((pendingNode) => {
                if (pendingNode.isConnected) {
                    this.injectIconForNode(pendingNode);
                }
            });
            this.pendingNodes.clear();
            this.flushHandle = undefined;
        };

        if (typeof requestAnimationFrame === 'function') {
            this.flushHandle = requestAnimationFrame(flush);
            this.flushUsesTimeout = false;
        } else {
            this.flushHandle = window.setTimeout(flush, 16);
            this.flushUsesTimeout = true;
        }
    }

    private clearPendingNodes() {
        if (this.flushHandle !== undefined) {
            if (this.flushUsesTimeout) {
                clearTimeout(this.flushHandle);
            } else {
                cancelAnimationFrame(this.flushHandle);
            }
        }
        this.pendingNodes.clear();
        this.flushHandle = undefined;
    }

    private injectIcons(container: HTMLElement) {
        container.querySelectorAll<HTMLElement>(TLDRAW_LINK_SELECTOR).forEach((node) => {
            this.injectIconForNode(node);
        });
    }

    private injectIconForNode(node: HTMLElement) {
        const link = node.getAttribute('custom-tldraw-link');
        if (!link) return;

        const attributeBar = Array.from(node.children).find((child) =>
            (child as HTMLElement).classList.contains(ATTRIBUTE_BAR_CLASS)
        ) as HTMLElement | undefined;
        if (!attributeBar) return;

        const existingIcon = attributeBar.querySelector<HTMLElement>(`.${ICON_CLASS}`);
        if (existingIcon) {
            existingIcon.setAttribute('data-tldraw-link', link);
            return;
        }

        const icon = document.createElement('span');
        icon.className = `${ICON_CLASS} block__icon fn__flex-center`;
        icon.setAttribute('aria-label', '打开白板');
        icon.title = '打开白板';
        icon.style.opacity = '1';
        icon.innerHTML = '<svg class="item__graphic"><use xlink:href="#iconSTWhiteboard">🔗</use></svg>';
        icon.setAttribute('data-tldraw-link', link);
        attributeBar.appendChild(icon);
    }
}
