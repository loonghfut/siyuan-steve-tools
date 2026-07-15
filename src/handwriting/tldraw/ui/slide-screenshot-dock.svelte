<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { showMessage } from 'siyuan';
    import {
        SLIDE_SCREENSHOT_DRAG_TYPE,
        type SlideScreenshotRecord,
        type SlideScreenshotStore,
    } from '../SlideShape/slide-screenshot-store';

    export let store: SlideScreenshotStore;
    export let onOpen: (item: SlideScreenshotRecord) => void = () => undefined;

    let items: SlideScreenshotRecord[] = [];
    let unsubscribe: (() => void) | undefined;

    onMount(() => {
        unsubscribe = store.subscribe((nextItems) => {
            items = nextItems;
        });
    });

    onDestroy(() => unsubscribe?.());

    async function removeItem(item: SlideScreenshotRecord) {
        try {
            await store.remove(item.id);
        } catch (error) {
            console.error('删除 slide 截图暂存项失败', error);
            showMessage('删除截图失败', 3000, 'error');
        }
    }

    function handleDragStart(event: DragEvent, item: SlideScreenshotRecord) {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return;

        dataTransfer.effectAllowed = 'copy';
        dataTransfer.setData(SLIDE_SCREENSHOT_DRAG_TYPE, item.id);
        dataTransfer.setData('text/plain', item.name);
        dataTransfer.setData('text/html', `<img src="${item.dataUrl}" alt="${escapeHtml(item.name)}">`);

        try {
            const file = dataUrlToFile(item.dataUrl, `${safeFileName(item.name)}.png`);
            dataTransfer.items.add(file);
        } catch (error) {
            // 插件自己的 drop handler 仍可通过条目 ID读取 Data URL。
            console.debug('无法将 slide 截图加入原生拖拽文件列表', error);
        }

        const image = event.currentTarget instanceof HTMLElement
            ? event.currentTarget.querySelector('img')
            : null;
        if (image) dataTransfer.setDragImage(image, 12, 12);
    }

    function formatTime(timestamp: number): string {
        return new Date(timestamp).toLocaleString();
    }

    function safeFileName(value: string): string {
        return value.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 80) || 'slide';
    }

    function escapeHtml(value: string): string {
        return value.replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
    }

    function dataUrlToFile(dataUrl: string, name: string): File {
        const [header, encoded] = dataUrl.split(',', 2);
        if (!header || !encoded) throw new Error('invalid image data URL');
        const mime = header.match(/^data:([^;]+)/)?.[1] || 'image/png';
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        return new File([bytes], name, { type: mime });
    }
</script>

<div class="st-slide-screenshot-dock">
    {#if items.length === 0}
        <div class="st-slide-screenshot-empty">暂无暂存的 Slide 截图</div>
    {:else}
        <div class="st-slide-screenshot-list">
            {#each items as item (item.id)}
                <article
                    class="st-slide-screenshot-item"
                    draggable="true"
                    title="拖入思源文档，或点击跳转到白板"
                    on:dragstart={(event) => handleDragStart(event, item)}
                    on:click={() => onOpen(item)}
                >
                    <img class="st-slide-screenshot-image" src={item.dataUrl} alt={item.name} draggable="false" />
                    <div class="st-slide-screenshot-info">
                        <button class="st-slide-screenshot-name" type="button" on:click|stopPropagation={() => onOpen(item)}>
                            {item.name}
                        </button>
                        <span class="st-slide-screenshot-time">{formatTime(item.createdAt)}</span>
                    </div>
                    <button
                        class="st-slide-screenshot-delete"
                        type="button"
                        aria-label="删除截图"
                        title="删除截图"
                        on:click|stopPropagation={() => removeItem(item)}
                    >
                        ×
                    </button>
                </article>
            {/each}
        </div>
    {/if}
</div>

<style>
    .st-slide-screenshot-dock {
        width: 100%;
        height: 100%;
        overflow: auto;
        box-sizing: border-box;
        padding: 10px;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
    }

    .st-slide-screenshot-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .st-slide-screenshot-item {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 6px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        cursor: grab;
        background: var(--b3-theme-surface);
    }

    .st-slide-screenshot-item:active {
        cursor: grabbing;
    }

    .st-slide-screenshot-item:hover {
        border-color: var(--b3-theme-primary);
    }

    .st-slide-screenshot-image {
        display: block;
        width: 100%;
        max-height: 180px;
        object-fit: contain;
        background: var(--b3-theme-background);
    }

    .st-slide-screenshot-info {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-right: 22px;
    }

    .st-slide-screenshot-name {
        overflow: hidden;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--b3-theme-on-background);
        font-size: 13px;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
    }

    .st-slide-screenshot-time {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .st-slide-screenshot-delete {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 0;
        border-radius: 4px;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
        cursor: pointer;
    }

    .st-slide-screenshot-delete:hover {
        color: var(--b3-theme-error);
    }

    .st-slide-screenshot-empty {
        padding: 24px 8px;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        text-align: center;
    }
</style>
