<script lang="ts">
    import { createEventDispatcher } from "svelte";
    // import type { WhiteboardItem } from './tldraw-whiteboard-manager.svelte';
    interface WhiteboardItem {
        id: string;
        fileName: string;
        path: string;
        title: string;
        exists: boolean;
        blkCreated: number;
        blkUpdated: number;
        docCreated: number;
        docUpdated: number;
        docId?: string;
        mtime: number;
        tags: string[];
        loadingPreview: boolean;
        shapes: PreviewShape[];
        previewError?: string;
    }

    export let item: WhiteboardItem;
    export let selectedIds: Set<string>;
    export let setupObserver: (
        node: HTMLElement,
        item: WhiteboardItem,
    ) => { update(newItem: WhiteboardItem): void; destroy(): void };

    type PreviewShape = {
        id?: string;
        type?: string;
        x: number;
        y: number;
        w: number;
        h: number;
    };

    function computeBounds(shapes: PreviewShape[]) {
        if (!shapes || shapes.length === 0) {
            return { minX: 0, minY: 0, width: 300, height: 200 };
        }
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        shapes.forEach((shape) => {
            const left = (shape.x || 0) - (shape.w || 0) / 2;
            const top = (shape.y || 0) - (shape.h || 0) / 2;
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + (shape.w || 0));
            maxY = Math.max(maxY, top + (shape.h || 0));
        });
        if (
            !isFinite(minX) ||
            !isFinite(minY) ||
            !isFinite(maxX) ||
            !isFinite(maxY)
        ) {
            return { minX: 0, minY: 0, width: 300, height: 200 };
        }
        return {
            minX,
            minY,
            width: Math.max(maxX - minX, 1),
            height: Math.max(maxY - minY, 1),
        };
    }

    function projectShape(
        shape: PreviewShape,
        _shapes: PreviewShape[],
        bounds: ReturnType<typeof computeBounds>,
        scale: number,
        pad: number,
    ) {
        void _shapes;
        const cx = shape.x || 0;
        const cy = shape.y || 0;
        const w = shape.w || 60;
        const h = shape.h || 40;
        const left = cx - w / 2;
        const top = cy - h / 2;
        return {
            x: (left - bounds.minX) * scale + pad,
            y: (top - bounds.minY) * scale + pad,
            w: Math.max(w * scale, 1),
            h: Math.max(h * scale, 1),
        };
    }

    function formatTime(ms: number): string {
        if (!ms || !Number.isFinite(ms) || ms <= 0) return "-";
        try {
            return new Date(ms).toLocaleString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return "-";
        }
    }

    function getLatestUpdate(item: WhiteboardItem) {
        return item.blkUpdated || item.docUpdated || item.mtime;
    }

    const dispatch = createEventDispatcher<{
        contextmenu: { item: WhiteboardItem; originalEvent: MouseEvent };
        select: { item: WhiteboardItem; checked: boolean; shiftKey: boolean };
        openboard: { item: WhiteboardItem };
        opendoc: { item: WhiteboardItem };
        edittags: { item: WhiteboardItem };
    }>();

    function handleSelectChange(event: Event) {
        event.stopPropagation();
        const target = event.currentTarget as HTMLInputElement;
        dispatch("select", {
            item,
            checked: target.checked,
            shiftKey: (event as MouseEvent).shiftKey,
        });
    }

    function handleContextMenu(event: MouseEvent) {
        event.preventDefault();
        dispatch("contextmenu", { item, originalEvent: event });
    }

    function openWhiteboard() {
        dispatch("openboard", { item });
    }

    function openDocument() {
        if (!item.docId) return;
        dispatch("opendoc", { item });
    }

    function startEditTags() {
        dispatch("edittags", { item });
    }
</script>

<article
    class="whiteboard-card"
    class:invalid={!item.exists}
    class:selected={selectedIds.has(item.id)}
    on:contextmenu={handleContextMenu}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === "Enter" && openWhiteboard()}
>
    <label class="card-select" aria-label="选择白板">
        <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            on:change={handleSelectChange}
        />
    </label>

    <div class="card-preview" use:setupObserver={item}>
        <button class="preview-hit" type="button" on:click={openWhiteboard}>
            {#if item.previewError}
                <div class="preview-fallback">{item.previewError}</div>
            {:else if item.loadingPreview}
                <div class="preview-fallback">生成预览...</div>
            {:else if item.shapes.length > 0}
                {@const bounds = computeBounds(item.shapes)}
                {@const viewW = 300 - 12}
                {@const viewH = 180 - 12}
                {@const scale = Math.min(
                    viewW / bounds.width,
                    viewH / bounds.height,
                )}
                {@const pad = 6}
                <svg
                    viewBox="0 0 300 180"
                    class="preview-canvas"
                    preserveAspectRatio="xMidYMid meet"
                >
                    {#each item.shapes as shape}
                        {@const pos = projectShape(
                            shape,
                            item.shapes,
                            bounds,
                            scale,
                            pad,
                        )}
                        <rect
                            x={pos.x}
                            y={pos.y}
                            width={pos.w}
                            height={pos.h}
                            rx="3"
                            ry="3"
                            fill="rgba(61,142,255,0.08)"
                            stroke="rgba(61,142,255,0.35)"
                            stroke-width="1"
                        />
                    {/each}
                    <rect
                        x="1"
                        y="1"
                        width="298"
                        height="178"
                        fill="none"
                        stroke="rgba(0,0,0,0.06)"
                    />
                </svg>
            {:else}
                <div class="preview-empty">暂无预览</div>
            {/if}
        </button>
    </div>

    <div class="card-info">
        <div class="card-title" title={item.title}>
            <button
                type="button"
                class="title-link"
                on:click={openDocument}
                disabled={!item.docId}
            >
                {item.title}
            </button>
            {#if !item.exists}
                <span class="badge badge-error">无效</span>
            {/if}
        </div>
        <div class="card-meta muted">{formatTime(getLatestUpdate(item))}</div>
        <div class="card-tags">
            {#if item.tags.length === 0}
                <span class="tag-empty">无标签</span>
            {/if}
            {#each item.tags as tag}
                <span class="tag-pill">{tag}</span>
            {/each}
            <button
                type="button"
                class="tag-edit-btn"
                title="编辑标签"
                on:click|stopPropagation={startEditTags}
            >
                <svg width="12" height="12" viewBox="0 0 24 24"
                    ><path
                        fill="currentColor"
                        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    /></svg
                >
            </button>
        </div>
    </div>
</article>

<style>
    .whiteboard-card {
        position: relative;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 14px;
        box-shadow: 0 8px 24px rgba(15, 18, 46, 0.08);
        display: flex;
        flex-direction: column;
        transition:
            transform 0.25s ease,
            box-shadow 0.25s ease,
            border-color 0.25s ease;
    }

    .whiteboard-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 16px 30px rgba(15, 18, 46, 0.16);
        border-color: var(--b3-theme-primary);
    }

    .whiteboard-card.invalid {
        opacity: 0.7;
    }

    .whiteboard-card.selected {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 16px 32px rgba(61, 142, 255, 0.18);
    }

    .card-select {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 2;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 3px;
        display: inline-flex;
        align-items: center;
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .card-select:hover {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 2px 6px rgba(61, 142, 255, 0.2);
    }

    .card-select input {
        width: 16px;
        height: 16px;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        border: 0.5px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-background);
        transition: all 0.15s ease;
        position: relative;
        flex-shrink: 0;
    }

    .card-select input:checked {
        background: var(--b3-theme-primary);
        border-color: var(--b3-theme-primary);
    }

    .card-select input:checked::after {
        content: "";
        position: absolute;
        left: 5px;
        top: 2px;
        width: 4px;
        height: 8px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
    }

    .card-select input:hover {
        transform: scale(1.1);
        border-color: var(--b3-theme-primary);
    }

    .card-preview {
        width: 100%;
        aspect-ratio: 5 / 3;
        border-bottom: 1px solid var(--b3-border-color);
        background: linear-gradient(
            135deg,
            rgba(72, 94, 255, 0.08),
            rgba(72, 94, 255, 0.02)
        );
        border-radius: 14px 14px 0 0;
        overflow: hidden;
    }

    .preview-hit {
        width: 100%;
        height: 100%;
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
    }

    .preview-canvas {
        width: 100%;
        height: 100%;
        display: block;
    }

    .preview-fallback,
    .preview-empty {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        opacity: 0.8;
    }

    .card-info {
        padding: 12px 14px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .card-title {
        font-weight: 600;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .title-link {
        border: none;
        background: transparent;
        padding: 0;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .title-link:hover:not(:disabled) {
        color: var(--b3-theme-primary);
    }

    .title-link:disabled {
        cursor: default;
        opacity: 0.7;
    }

    .card-meta {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .card-meta.muted {
        color: var(--b3-theme-on-surface-light);
    }

    .badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 600;
    }

    .badge-error {
        background: var(--b3-theme-error);
        color: #fff;
    }

    .card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
    }

    .tag-pill {
        border: none;
        background: rgba(61, 142, 255, 0.12);
        color: var(--b3-theme-primary);
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 11px;
        cursor: pointer;
    }

    .tag-empty {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        opacity: 0.7;
    }

    .tag-edit-btn {
        border: none;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        padding: 2px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
    }

    .tag-edit-btn:hover {
        background: rgba(61, 142, 255, 0.12);
        color: var(--b3-theme-primary);
    }
</style>
