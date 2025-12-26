<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import { showMessage, openTab, Plugin, confirm } from 'siyuan';
    import { api } from '@frostime/siyuan-plugin-kits';
    import { whiteboardFilesUpdated } from './whiteboards.store';
    import { backupWhiteboardFiles, getBackupStats, WHITEBOARD_TRASH_DIR } from './backup-utils';

    export let plugin: Plugin;

    type PreviewShape = { id?: string; type?: string; x: number; y: number; w: number; h: number };

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

    interface TagGroup {
        name: string;
        items: WhiteboardItem[];
    }

    interface ContextMenuState {
        visible: boolean;
        x: number;
        y: number;
        item: WhiteboardItem | null;
    }

    

    let allItems: WhiteboardItem[] = [];
    let filteredItems: WhiteboardItem[] = [];
    let galleryItems: WhiteboardItem[] = [];
    let galleryGroups: TagGroup[] = [];
    let searchQuery = '';
    let showOnlyValid = true;
    let loading = true;
    let sortKey: 'blkUpdated-desc' | 'blkUpdated-asc' | 'blkCreated-desc' | 'blkCreated-asc' | 'title' | 'id' = 'blkUpdated-desc';
    let groupByTag = false;

    let availableTags: string[] = [];
    let selectedTagFilter = '';

    let contextMenu: ContextMenuState = { visible: false, x: 0, y: 0, item: null };

    let observer: IntersectionObserver;
    let unsubscribe: () => void;

    $: {
        searchQuery;
        showOnlyValid;
        sortKey;
        selectedTagFilter;
        applyFilters();
    }
    $: {
        filteredItems;
        groupByTag;
        buildGalleryData();
    }

    onMount(() => {
        loadWhiteboards();
    });

    onDestroy(() => {
        if (unsubscribe) unsubscribe();
        if (observer) {
            observer.disconnect();
        }
    });

    function parseSyTimestamp(value?: string | number | null): number {
        if (!value) return 0;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const digitsOnly = value.replace(/[^0-9]/g, '');
            if (digitsOnly.length >= 14) {
                const y = Number(digitsOnly.slice(0, 4));
                const m = Number(digitsOnly.slice(4, 6)) - 1;
                const d = Number(digitsOnly.slice(6, 8));
                const hh = Number(digitsOnly.slice(8, 10));
                const mm = Number(digitsOnly.slice(10, 12));
                const ss = Number(digitsOnly.slice(12, 14));
                return new Date(y, m, d, hh, mm, ss).getTime();
            }
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric;
        }
        return 0;
    }

    async function loadWhiteboards() {
        loading = true;
        allItems = [];
        try {
            const files: any[] = await api.readDir('/data/storage/petal/sttools/');
            const whiteboardFiles = files.filter(f => !f.isDir && f.name.startsWith('tldraw-data-') && f.name.endsWith('.json'));

            const items: WhiteboardItem[] = [];
            for (const file of whiteboardFiles) {
                const id = extractDrawingId(file.name);
                const item: WhiteboardItem = {
                    id,
                    fileName: file.name,
                    path: `/data/storage/petal/sttools/${file.name}`,
                    title: '未知白板',
                    exists: false,
                    blkCreated: 0,
                    blkUpdated: 0,
                    docCreated: 0,
                    docUpdated: 0,
                    docId: undefined,
                    mtime: parseSyTimestamp(file.mtime),
                    tags: [],
                    loadingPreview: false,
                    shapes: [],
                    previewError: undefined,
                };

                try {
                    const blk = await api.getBlockByID(id);
                    if (blk) {
                        item.exists = true;
                        item.blkCreated = parseSyTimestamp(blk.created);
                        item.blkUpdated = parseSyTimestamp(blk.updated);
                        item.tags = blk.tag ? blk.tag.split('#').filter((t: string) => t.trim()) : [];
                        item.docId = blk.root_id || undefined;

                        if (blk.root_id) {
                            const docBlk = await api.getBlockByID(blk.root_id);
                            if (docBlk) {
                                item.title = docBlk.fcontent || docBlk.content || '未命名文档';
                                item.docCreated = parseSyTimestamp(docBlk.created);
                                item.docUpdated = parseSyTimestamp(docBlk.updated);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`获取白板 ${id} 元数据失败:`, e);
                }

                items.push(item);
            }

            allItems = items;
            collectAvailableTags();
            applyFilters();
        } catch (e) {
            console.error('加载白板列表失败:', e);
            showMessage('加载白板列表失败', 4000, 'error');
        } finally {
            loading = false;
        }
    }

    function extractDrawingId(filename: string): string {
        const match = filename.match(/^tldraw-data-(.+)\.json$/);
        return match && match[1] ? match[1] : '未知画板';
    }

    function collectAvailableTags() {
        const tagSet = new Set<string>();
        allItems.forEach(item => item.tags.forEach(tag => tagSet.add(tag)));
        availableTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
    }

    function applyFilters() {
        let list = allItems.slice();

        if (showOnlyValid) {
            list = list.filter(item => item.exists);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(item =>
                item.id.toLowerCase().includes(q) ||
                item.title.toLowerCase().includes(q) ||
                item.fileName.toLowerCase().includes(q) ||
                item.tags.some(tag => tag.toLowerCase().includes(q))
            );
        }

        if (selectedTagFilter) {
            list = list.filter(item => item.tags.includes(selectedTagFilter));
        }

        switch (sortKey) {
            case 'blkUpdated-desc':
                list.sort((a, b) => b.blkUpdated - a.blkUpdated);
                break;
            case 'blkUpdated-asc':
                list.sort((a, b) => a.blkUpdated - b.blkUpdated);
                break;
            case 'blkCreated-desc':
                list.sort((a, b) => b.blkCreated - a.blkCreated);
                break;
            case 'blkCreated-asc':
                list.sort((a, b) => a.blkCreated - b.blkCreated);
                break;
            case 'title':
                list.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'id':
                list.sort((a, b) => a.id.localeCompare(b.id));
                break;
        }

        filteredItems = list;
    }

    function buildGalleryData() {
        if (groupByTag) {
            const tagMap = new Map<string, WhiteboardItem[]>();
            filteredItems.forEach(item => {
                if (item.tags.length === 0) {
                    const bucket = tagMap.get('未分组') || [];
                    bucket.push(item);
                    tagMap.set('未分组', bucket);
                } else {
                    item.tags.forEach(tag => {
                        const bucket = tagMap.get(tag) || [];
                        bucket.push(item);
                        tagMap.set(tag, bucket);
                    });
                }
            });
            galleryGroups = Array.from(tagMap.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([name, items]) => ({ name, items }));
            galleryItems = [];
        } else {
            galleryItems = filteredItems.slice();
            galleryGroups = [];
        }
    }

    function formatTime(ms: number): string {
        if (!ms || !Number.isFinite(ms) || ms <= 0) return '-';
        try {
            return new Date(ms).toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return '-';
        }
    }

    function getLatestUpdate(item: WhiteboardItem) {
        return item.blkUpdated || item.docUpdated || item.mtime;
    }

    async function openWhiteboard(item: WhiteboardItem) {
        if (!item.exists) {
            showMessage('该白板块不存在，无法打开', 3000, 'error');
            return;
        }
        try {
            await openTab({
                app: plugin.app,
                custom: {
                    id: plugin.name + 'steveTool-whiteboard',
                    title: item.title,
                    icon: 'iconSTWhiteboard',
                    data: {
                        text: 'steveTool-whiteboard' + item.id,
                        rootid: item.id,
                    },
                },
            });
        } catch (e) {
            console.error('打开白板失败:', e);
            showMessage('打开白板失败', 3000, 'error');
        }
    }

    async function openDocument(item: WhiteboardItem) {
        if (!item.docId) {
            showMessage('未找到关联文档', 3000, 'info');
            return;
        }
        try {
            await openTab({
                app: plugin.app,
                doc: {
                    id: item.docId,
                    action: ['cb-get-hl', 'cb-get-all'],
                    zoomIn: false,
                },
                keepCursor: false,
            });
        } catch (e) {
            console.error('打开文档失败:', e);
            showMessage('打开文档失败', 3000, 'error');
        }
    }

    // 多选相关逻辑已移除

    function confirmDelete(items: WhiteboardItem[]) {
        if (items.length === 0) return;
        confirm(
            '删除确认',
            `确定要删除 ${items.length} 个白板文件吗？此操作不可恢复！`,
            async (dialog) => {
                let successCount = 0;
                for (const item of items) {
                    try {
                        await api.removeFile(item.path);
                        successCount++;
                        whiteboardFilesUpdated.set({
                            action: 'delete',
                            fileName: item.fileName,
                            drawingId: item.id,
                            timestamp: Date.now(),
                        });
                    } catch (error) {
                        console.error(`删除 ${item.fileName} 失败:`, error);
                    }
                }

                showMessage(`成功删除 ${successCount}/${items.length} 个白板`, 3000, 'info');
                closeContextMenu();
                await loadWhiteboards();

                try {
                    dialog && (dialog as any).close && (dialog as any).close();
                } catch {}
            },
            (dialog) => {
                try {
                    dialog && (dialog as any).close && (dialog as any).close();
                } catch {}
            }
        );
    }

    // 批量删除已移除，保留单项删除（右键菜单）

    async function backupItems(items: WhiteboardItem[]) {
        if (items.length === 0) return;
        try {
            const sourcePaths = items.map(item => item.path);
            const results = await backupWhiteboardFiles(sourcePaths, {
                reason: '手动备份',
                includeTimestamp: true,
            });

            const stats = getBackupStats(results);
            if (stats.success > 0) {
                showMessage(
                    `成功备份 ${stats.success}/${items.length} 个白板到 ${WHITEBOARD_TRASH_DIR}`,
                    4000,
                    'info'
                );
            } else {
                showMessage('备份失败', 3000, 'error');
            }
        } catch (e) {
            console.error('备份失败:', e);
            showMessage('备份失败', 3000, 'error');
        }
    }

    // 批量备份已移除，保留单项备份（右键菜单）

    // 标签编辑、批量添加/移除与多选相关逻辑已移除

    function handleContextMenu(event: MouseEvent, item: WhiteboardItem) {
        event.preventDefault();
        const menuWidth = 180;
        const menuHeight = 200;
        const posX = Math.min(event.clientX, window.innerWidth - menuWidth);
        const posY = Math.min(event.clientY, window.innerHeight - menuHeight);
        contextMenu = { visible: true, x: posX, y: posY, item };
    }

    function closeContextMenu() {
        contextMenu = { visible: false, x: 0, y: 0, item: null };
    }

    function handleWindowClick(event: MouseEvent) {
        if (!contextMenu.visible) return;
        const target = event.target as HTMLElement;
        if (target && target.closest('.whiteboard-context-menu')) return;
        closeContextMenu();
    }

    function handleWindowKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && contextMenu.visible) {
            closeContextMenu();
        }
    }

    function handleWindowContextMenu(event: MouseEvent) {
        if (!event.defaultPrevented && contextMenu.visible) {
            closeContextMenu();
        }
    }

    function handleMenuAction(action: 'delete' | 'backup' | 'doc' | 'board') {
        const item = contextMenu.item;
        if (!item) return;
        switch (action) {
            case 'delete':
                confirmDelete([item]);
                break;
            case 'backup':
                void backupItems([item]).finally(() => closeContextMenu());
                break;
            case 'doc':
                openDocument(item).finally(() => closeContextMenu());
                break;
            case 'board':
                openWhiteboard(item).finally(() => closeContextMenu());
                break;
        }
    }

    function computeBounds(shapes: PreviewShape[]) {
        if (!shapes || shapes.length === 0) {
            return { minX: 0, minY: 0, width: 300, height: 200 };
        }
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        shapes.forEach(shape => {
            const left = (shape.x || 0) - (shape.w || 0) / 2;
            const top = (shape.y || 0) - (shape.h || 0) / 2;
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + (shape.w || 0));
            maxY = Math.max(maxY, top + (shape.h || 0));
        });
        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
            return { minX: 0, minY: 0, width: 300, height: 200 };
        }
        return { minX, minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
    }

    function projectShape(shape: PreviewShape, shapes: PreviewShape[]) {
        const bounds = computeBounds(shapes);
        const viewW = 300 - 12;
        const viewH = 180 - 12;
        const scale = Math.min(viewW / bounds.width, viewH / bounds.height);
        const pad = 6;
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

    async function loadPreview(item: WhiteboardItem) {
        if (item.loadingPreview || item.shapes.length > 0 || item.previewError) return;
        item.loadingPreview = true;
        try {
            const raw = await api.getFile(item.path);
            let json: any;
            if (typeof raw === 'string') {
                json = JSON.parse(raw);
            } else if (raw instanceof ArrayBuffer) {
                const text = new TextDecoder().decode(raw);
                json = JSON.parse(text);
            } else if (ArrayBuffer.isView(raw)) {
                const view = raw as ArrayBufferView;
                const typed = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
                const text = new TextDecoder().decode(typed);
                json = JSON.parse(text);
            } else {
                json = raw;
            }
            const doc = json?.document ?? json;
            let shapeEntries: Array<[string, any]> = [];
            if (doc?.shapes && typeof doc.shapes === 'object') {
                shapeEntries = Object.entries(doc.shapes);
            } else if (doc?.store && typeof doc.store === 'object') {
                shapeEntries = Object.entries(doc.store).filter(([key]) => key.startsWith('shape:'));
            }

            const shapes: PreviewShape[] = [];
            const sample = shapeEntries.length ? shapeEntries : Object.entries(doc || {}).slice(0, 120);
            for (const [sid, s] of sample.slice(0, 120)) {
                const data: any = s;
                const px = typeof data?.x === 'number' ? data.x : data?.props?.x || 0;
                const py = typeof data?.y === 'number' ? data.y : data?.props?.y || 0;
                const w = Number(data?.props?.w ?? data?.props?.width ?? data?.width ?? 0) || 120;
                const h = Number(data?.props?.h ?? data?.props?.height ?? data?.height ?? 0) || 80;
                shapes.push({ id: sid, type: data?.type, x: px, y: py, w, h });
            }

            item.shapes = shapes;
        } catch (e) {
            console.warn('缩略图加载失败:', e);
            item.previewError = '预览失败';
        } finally {
            item.loadingPreview = false;
            // trigger reactive updates for arrays used in template
            allItems = allItems;
            filteredItems = filteredItems;
            galleryItems = galleryItems;
            galleryGroups = galleryGroups;
            try { await tick(); } catch {}
        }
    }

    function setupObserver(node: HTMLElement, item: WhiteboardItem) {
        const rootEl = document.querySelector('.gallery-scroll') as Element | null;
        // If existing observer's root is different (e.g. after re-render/refresh), recreate it
        if (observer && observer.root !== (rootEl ?? null)) {
            try { observer.disconnect(); } catch {}
            observer = undefined as unknown as IntersectionObserver;
        }

        if (!observer) {
            observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const targetItem = (entry.target as any).__whiteboardItem as WhiteboardItem;
                        if (targetItem) {
                            loadPreview(targetItem);
                        }
                        try { observer.unobserve(entry.target); } catch {}
                    }
                });
            }, {
                root: rootEl ?? null,
                rootMargin: '320px 0px 320px 0px',
                threshold: 0.05,
            });
        }

        (node as any).__whiteboardItem = item;
        try { observer.observe(node); } catch {}

        return {
            update(newItem: WhiteboardItem) {
                (node as any).__whiteboardItem = newItem;
                try { observer.observe(node); } catch {}
            },
            destroy() {
                try { observer.unobserve(node); } catch {}
            },
        };
    }

    $: {
        if (!unsubscribe) {
            unsubscribe = whiteboardFilesUpdated.subscribe(({ action }) => {
                if (action === 'refresh' || action === 'delete') {
                    loadWhiteboards();
                }
            });
        }
    }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} on:contextmenu={handleWindowContextMenu} />

<div class="whiteboard-manager">
    <div class="block__icons toolbar">
        <div class="block__logo">
            <svg class="block__logoicon"><use xlink:href="#iconSettings"></use></svg>
            白板高级管理
        </div>
        <span class="counter" title="已加载/总数">{filteredItems.length}/{allItems.length}</span>
        <span class="fn__flex-1"></span>

        <input
            class="b3-text-field search-input"
            type="text"
            placeholder="搜索标题、ID、标签..."
            bind:value={searchQuery} />
        <span class="fn__space"></span>

        <select class="b3-select select-sort" bind:value={sortKey}>
            <option value="blkUpdated-desc">块更新时间↓</option>
            <option value="blkUpdated-asc">块更新时间↑</option>
            <option value="blkCreated-desc">块创建时间↓</option>
            <option value="blkCreated-asc">块创建时间↑</option>
            <option value="title">标题</option>
            <option value="id">ID</option>
        </select>
        <span class="fn__space"></span>

        {#if availableTags.length > 0}
            <select class="b3-select select-tag" bind:value={selectedTagFilter}>
                <option value="">全部标签</option>
                {#each availableTags as tag}
                    <option value={tag}>{tag}</option>
                {/each}
            </select>
            <span class="fn__space"></span>
        {/if}

        <button
            type="button"
            class="block__icon"
            class:block__icon--active={groupByTag}
            title={groupByTag ? '按标签分组 (已开启)' : '按标签分组'}
            aria-pressed={groupByTag}
            on:click={() => groupByTag = !groupByTag}>
            <svg><use xlink:href="#iconList"></use></svg>
        </button>
        <span class="fn__space"></span>

        <button
            type="button"
            class="block__icon"
            class:block__icon--active={showOnlyValid}
            title={showOnlyValid ? '显示全部' : '仅显示有效'}
            aria-pressed={showOnlyValid}
            on:click={() => showOnlyValid = !showOnlyValid}>
            <svg><use xlink:href={"#iconEye" + (showOnlyValid ? 'off' : '')}></use></svg>
        </button>
        <span class="fn__space"></span>

        

        <button
            type="button"
            class="block__icon"
            title="刷新"
            on:click={loadWhiteboards}>
            <svg><use xlink:href="#iconRefresh"></use></svg>
        </button>
    </div>

    

    {#if loading}
        <div class="loading">加载中...</div>
    {:else if filteredItems.length === 0}
        <div class="empty">暂无匹配白板</div>
    {:else}
        <div class="gallery-scroll">
            {#if groupByTag}
                {#each galleryGroups as group}
                    <section class="tag-group">
                        <header class="tag-group__header">
                            <span class="tag-group__name">{group.name}</span>
                            <span class="tag-group__count">{group.items.length}</span>
                        </header>
                        <div class="card-grid">
                            {#each group.items as item (item.id + group.name)}
                                <article
                                    class="whiteboard-card"
                                    class:invalid={!item.exists}
                                    on:contextmenu={(event) => handleContextMenu(event, item)}>
                                    
                                    <div class="card-preview" use:setupObserver={item}>
                                        <button class="preview-hit" type="button" on:click={() => openWhiteboard(item)}>
                                            {#if item.previewError}
                                                <div class="preview-fallback">{item.previewError}</div>
                                            {:else if item.loadingPreview}
                                                <div class="preview-fallback">生成预览...</div>
                                            {:else if item.shapes.length > 0}
                                                <svg viewBox="0 0 300 180" class="preview-canvas" preserveAspectRatio="xMidYMid meet">
                                                    {#each item.shapes as shape}
                                                        <rect
                                                            x={projectShape(shape, item.shapes).x}
                                                            y={projectShape(shape, item.shapes).y}
                                                            width={projectShape(shape, item.shapes).w}
                                                            height={projectShape(shape, item.shapes).h}
                                                            rx="3"
                                                            ry="3"
                                                            fill="rgba(61,142,255,0.08)"
                                                            stroke="rgba(61,142,255,0.35)"
                                                            stroke-width="1" />
                                                    {/each}
                                                    <rect x="1" y="1" width="298" height="178" fill="none" stroke="rgba(0,0,0,0.06)" />
                                                </svg>
                                            {:else}
                                                <div class="preview-empty">暂无预览</div>
                                            {/if}
                                        </button>
                                    </div>
                                    <div class="card-info">
                                        <div class="card-title" title={item.title}>
                                            {item.title}
                                            {#if !item.exists}
                                                <span class="badge badge-error">无效</span>
                                            {/if}
                                        </div>
                                        <!-- <div class="card-meta" title={item.id}>{item.id}</div>
                                        <div class="card-meta" title={item.fileName}>{item.fileName}</div> -->
                                        <div class="card-meta muted">{formatTime(getLatestUpdate(item))}</div>
                                        <div class="card-tags">
                                            {#if item.tags.length === 0}
                                                <span class="tag-empty">无标签</span>
                                            {/if}
                                            {#each item.tags as tag}
                                                <span class="tag-pill">{tag}</span>
                                            {/each}
                                        </div>
                                    </div>
                                </article>
                            {/each}
                        </div>
                    </section>
                {/each}
            {:else}
                <div class="card-grid">
                    {#each galleryItems as item (item.id)}
                        <article
                            class="whiteboard-card"
                            class:invalid={!item.exists}
                            on:contextmenu={(event) => handleContextMenu(event, item)}>
                            <div class="card-preview" use:setupObserver={item}>
                                <button class="preview-hit" type="button" on:click={() => openWhiteboard(item)}>
                                    {#if item.previewError}
                                        <div class="preview-fallback">{item.previewError}</div>
                                    {:else if item.loadingPreview}
                                        <div class="preview-fallback">生成预览...</div>
                                    {:else if item.shapes.length > 0}
                                        <svg viewBox="0 0 300 180" class="preview-canvas" preserveAspectRatio="xMidYMid meet">
                                            {#each item.shapes as shape}
                                                <rect
                                                    x={projectShape(shape, item.shapes).x}
                                                    y={projectShape(shape, item.shapes).y}
                                                    width={projectShape(shape, item.shapes).w}
                                                    height={projectShape(shape, item.shapes).h}
                                                    rx="3"
                                                    ry="3"
                                                    fill="rgba(61,142,255,0.08)"
                                                    stroke="rgba(61,142,255,0.35)"
                                                    stroke-width="1" />
                                            {/each}
                                            <rect x="1" y="1" width="298" height="178" fill="none" stroke="rgba(0,0,0,0.06)" />
                                        </svg>
                                    {:else}
                                        <div class="preview-empty">暂无预览</div>
                                    {/if}
                                </button>
                            </div>
                            <div class="card-info">
                                <div class="card-title" title={item.title}>
                                    {item.title}
                                    {#if !item.exists}
                                        <span class="badge badge-error">无效</span>
                                    {/if}
                                </div>
                                <!-- <div class="card-meta" title={item.id}>{item.id}</div>
                                <div class="card-meta" title={item.fileName}>{item.fileName}</div> -->
                                <div class="card-meta muted">{formatTime(getLatestUpdate(item))}</div>
                                <div class="card-tags">
                                    {#if item.tags.length === 0}
                                        <span class="tag-empty">无标签</span>
                                    {/if}
                                    {#each item.tags as tag}
                                        <span class="tag-pill">{tag}</span>
                                    {/each}
                                </div>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    {#if contextMenu.visible && contextMenu.item}
        <div
            class="whiteboard-context-menu"
            style={`left:${contextMenu.x}px;top:${contextMenu.y}px;`}
            on:click={(event) => event.stopPropagation()}>
            <button type="button" on:click={() => handleMenuAction('board')}>
                打开白板
            </button>
            <button type="button" on:click={() => handleMenuAction('doc')} disabled={!contextMenu.item.docId}>
                跳转文档
            </button>
            <button type="button" on:click={() => handleMenuAction('backup')}>
                备份
            </button>
            <button type="button" class="danger" on:click={() => handleMenuAction('delete')}>
                删除
            </button>
        </div>
    {/if}
</div>

<style>
.whiteboard-manager {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--b3-theme-background);
}

.toolbar {
    display: flex;
    align-items: center;
    padding: 8px;
    background: var(--b3-theme-surface);
    border-bottom: 1px solid var(--b3-border-color);
    flex-shrink: 0;
}

.block__logo {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    font-weight: 500;
}

.block__logoicon {
    width: 20px;
    height: 20px;
}

.counter {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    margin-left: 8px;
}

.search-input {
    width: 240px;
    max-width: 30%;
}

.select-sort,
.select-tag {
    font-size: 12px;
    padding: 4px 8px;
}


.gallery-scroll {
    flex: 1;
    overflow: auto;
    padding: 16px 20px 24px;
}

.card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
}

.whiteboard-card {
    position: relative;
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: 14px;
    box-shadow: 0 8px 24px rgba(15, 18, 46, 0.08);
    display: flex;
    flex-direction: column;
    transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

.whiteboard-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 30px rgba(15, 18, 46, 0.16);
    border-color: var(--b3-theme-primary);
}

.whiteboard-card.invalid {
    opacity: 0.7;
}

.card-preview {
    width: 100%;
    aspect-ratio: 5 / 3;
    border-bottom: 1px solid var(--b3-border-color);
    background: linear-gradient(135deg, rgba(72, 94, 255, 0.08), rgba(72, 94, 255, 0.02));
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

.tag-input {
    border: 1px solid var(--b3-border-color);
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
    min-width: 80px;
}

.tag-empty {
    font-size: 11px;
    color: var(--b3-theme-on-surface-light);
    opacity: 0.7;
}

.tag-group {
    margin-bottom: 24px;
}

.tag-group__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}

.tag-group__name {
    font-weight: 600;
}

.tag-group__count {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
}

.whiteboard-context-menu {
    position: fixed;
    z-index: 10;
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    overflow: hidden;
}

.whiteboard-context-menu button {
    border: none;
    background: none;
    padding: 10px 16px;
    text-align: left;
    font-size: 13px;
    cursor: pointer;
}

.whiteboard-context-menu button:hover {
    background: var(--b3-list-hover);
}

.whiteboard-context-menu button.danger {
    color: var(--b3-theme-error);
}

.whiteboard-context-menu button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.loading,
.empty {
    padding: 40px;
    text-align: center;
    color: var(--b3-theme-on-surface-light);
}

@media (max-width: 1200px) {
    .search-input {
        width: 180px;
    }
    .card-grid {
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }
}

@media (max-width: 800px) {
    .toolbar {
        flex-wrap: wrap;
        gap: 8px;
    }
    .search-input {
        width: 100%;
        max-width: 100%;
    }
}
</style>