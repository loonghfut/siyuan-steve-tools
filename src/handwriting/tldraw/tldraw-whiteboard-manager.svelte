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
        selected: boolean;
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

    interface TagEditorState {
        itemId: string;
        mode: 'edit' | 'add';
        index: number;
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

    let selectedCount = 0;
    let isSelectMode = false;

    let availableTags: string[] = [];
    let selectedTagFilter = '';
    let showTagManager = false;
    let newTag = '';

    let contextMenu: ContextMenuState = { visible: false, x: 0, y: 0, item: null };
    let tagEditor: TagEditorState | null = null;
    let tagEditorValue = '';
    let tagEditorInput: HTMLInputElement | null = null;

    let observer: IntersectionObserver;
    let unsubscribe: () => void;

    $: selectedCount = allItems.filter(item => item.selected).length;
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
                    selected: false,
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

    function toggleSelectMode() {
        isSelectMode = !isSelectMode;
        if (!isSelectMode) {
            allItems.forEach(item => (item.selected = false));
            allItems = allItems;
        }
    }

    function selectAll() {
        const allSelected = filteredItems.every(item => item.selected);
        filteredItems.forEach(item => (item.selected = !allSelected));
        allItems = allItems;
    }

    function toggleItemSelection(item: WhiteboardItem) {
        item.selected = !item.selected;
        allItems = allItems;
    }

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

    async function deleteSelected() {
        const selected = allItems.filter(item => item.selected);
        if (selected.length === 0) {
            showMessage('请先选择要删除的白板', 3000, 'info');
            return;
        }
        confirmDelete(selected);
    }

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

    async function backupSelected() {
        const selected = allItems.filter(item => item.selected);
        if (selected.length === 0) {
            showMessage('请先选择要备份的白板', 3000, 'info');
            return;
        }
        await backupItems(selected);
    }

    async function addTagToSelected() {
        if (!newTag.trim()) {
            showMessage('请输入标签名称', 2000, 'info');
            return;
        }

        const selected = allItems.filter(item => item.selected && item.exists);
        if (selected.length === 0) {
            showMessage('请先选择有效的白板', 3000, 'info');
            return;
        }

        const tag = newTag.trim();
        let successCount = 0;

        for (const item of selected) {
            const nextTags = item.tags.includes(tag) ? item.tags : [...item.tags, tag];
            const saved = await persistTags(item, nextTags);
            if (saved) successCount++;
        }

        showMessage(`成功为 ${successCount}/${selected.length} 个白板添加标签`, 3000, 'info');
        newTag = '';
        collectAvailableTags();
        allItems = allItems;
    }

    async function removeTagFromSelected(tag: string) {
        const selected = allItems.filter(item => item.selected && item.exists && item.tags.includes(tag));
        if (selected.length === 0) {
            showMessage('没有选中包含该标签的白板', 3000, 'info');
            return;
        }

        let successCount = 0;
        for (const item of selected) {
            const nextTags = item.tags.filter(t => t !== tag);
            const saved = await persistTags(item, nextTags);
            if (saved) successCount++;
        }

        showMessage(`成功从 ${successCount}/${selected.length} 个白板移除标签`, 3000, 'info');
        collectAvailableTags();
        allItems = allItems;
    }

    async function persistTags(item: WhiteboardItem, tags: string[]): Promise<boolean> {
        try {
            const tagString = tags.map(t => `#${t}#`).join('');
            await fetch('/api/attr/setBlockAttrs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: item.id,
                    attrs: { tags: tagString },
                }),
            });

            item.tags = tags;
            return true;
        } catch (e) {
            console.error(`更新 ${item.id} 标签失败:`, e);
            showMessage('更新标签失败', 2000, 'error');
            return false;
        }
    }

    function isEditingTag(itemId: string, index: number) {
        return !!tagEditor && tagEditor.itemId === itemId && tagEditor.mode === 'edit' && tagEditor.index === index;
    }

    function isAddingTag(itemId: string) {
        return !!tagEditor && tagEditor.itemId === itemId && tagEditor.mode === 'add';
    }

    async function startTagEdit(event: MouseEvent, item: WhiteboardItem, index: number) {
        event.stopPropagation();
        tagEditor = { itemId: item.id, mode: 'edit', index };
        tagEditorValue = item.tags[index] || '';
        await tick();
        tagEditorInput?.focus();
        tagEditorInput?.select();
    }

    async function startTagAdd(event: MouseEvent, item: WhiteboardItem) {
        event.stopPropagation();
        tagEditor = { itemId: item.id, mode: 'add', index: item.tags.length };
        tagEditorValue = '';
        await tick();
        tagEditorInput?.focus();
    }

    async function commitTagEditor() {
        if (!tagEditor) return;
        const target = allItems.find(item => item.id === tagEditor.itemId);
        if (!target) {
            cancelTagEditor();
            return;
        }

        const value = tagEditorValue.trim();
        let nextTags = [...target.tags];

        if (tagEditor.mode === 'edit') {
            if (!value) {
                nextTags.splice(tagEditor.index, 1);
            } else {
                nextTags[tagEditor.index] = value;
            }
        } else {
            if (!value) {
                showMessage('标签不能为空', 2000, 'info');
                return;
            }
            if (!nextTags.includes(value)) {
                nextTags.push(value);
            }
        }

        const saved = await persistTags(target, nextTags);
        if (saved) {
            collectAvailableTags();
            allItems = allItems;
            cancelTagEditor();
        }
    }

    function cancelTagEditor() {
        tagEditor = null;
        tagEditorValue = '';
    }

    function handleTagEditorKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            void commitTagEditor();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelTagEditor();
        }
    }

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
            allItems = allItems;
        }
    }

    function setupObserver(node: HTMLElement, item: WhiteboardItem) {
        if (!observer) {
            observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const targetItem = (entry.target as any).__whiteboardItem as WhiteboardItem;
                        if (targetItem) {
                            loadPreview(targetItem);
                        }
                        observer.unobserve(entry.target);
                    }
                });
            }, {
                root: null,
                rootMargin: '200px 0px 200px 0px',
                threshold: 0.1,
            });
        }

        (node as any).__whiteboardItem = item;
        observer.observe(node);

        return {
            update(newItem: WhiteboardItem) {
                (node as any).__whiteboardItem = newItem;
                observer.observe(node);
            },
            destroy() {
                observer.unobserve(node);
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
            class:block__icon--active={isSelectMode}
            title="多选模式"
            aria-pressed={isSelectMode}
            on:click={toggleSelectMode}>
            <svg><use xlink:href="#iconSelect"></use></svg>
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

    {#if isSelectMode && selectedCount > 0}
        <div class="batch-actions">
            <span class="selected-info">已选择 {selectedCount} 项</span>
            <span class="fn__flex-1"></span>
            <button class="b3-button b3-button--text" on:click={selectAll}>
                {filteredItems.every(i => i.selected) ? '取消全选' : '全选'}
            </button>
            <button class="b3-button b3-button--text" on:click={() => showTagManager = !showTagManager}>
                标签管理
            </button>
            <button class="b3-button b3-button--text" on:click={backupSelected}>
                备份
            </button>
            <button class="b3-button b3-button--error" on:click={deleteSelected}>
                删除
            </button>
        </div>

        {#if showTagManager}
            <div class="tag-manager">
                <div class="tag-input-group">
                    <input
                        class="b3-text-field"
                        type="text"
                        placeholder="输入新标签名..."
                        bind:value={newTag}
                        on:keydown={(e) => e.key === 'Enter' && addTagToSelected()} />
                    <button class="b3-button b3-button--primary" on:click={addTagToSelected}>
                        添加标签
                    </button>
                </div>
                {#if availableTags.length > 0}
                    <div class="tag-list">
                        <span class="tag-list-label">已有标签：</span>
                        {#each availableTags as tag}
                            <span class="tag-chip">
                                {tag}
                                <span class="tag-remove" on:click={() => removeTagFromSelected(tag)}>×</span>
                            </span>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    {/if}

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
                                    class:selected={item.selected}
                                    class:invalid={!item.exists}
                                    on:contextmenu={(event) => handleContextMenu(event, item)}>
                                    {#if isSelectMode}
                                        <label class="card-select">
                                            <input
                                                type="checkbox"
                                                checked={item.selected}
                                                on:change={() => toggleItemSelection(item)} />
                                        </label>
                                    {/if}
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
                                        <div class="card-meta" title={item.id}>{item.id}</div>
                                        <div class="card-meta" title={item.fileName}>{item.fileName}</div>
                                        <div class="card-meta muted">{formatTime(getLatestUpdate(item))}</div>
                                        <div class="card-tags">
                                            {#if item.tags.length === 0 && !isAddingTag(item.id)}
                                                <span class="tag-empty">无标签</span>
                                            {/if}
                                            {#each item.tags as tag, index}
                                                {#if isEditingTag(item.id, index)}
                                                    <input
                                                        class="tag-input"
                                                        bind:this={tagEditorInput}
                                                        bind:value={tagEditorValue}
                                                        on:keydown={handleTagEditorKeydown}
                                                        on:blur={commitTagEditor}
                                                        placeholder="编辑标签" />
                                                {:else}
                                                    <button
                                                        type="button"
                                                        class="tag-pill"
                                                        on:click={(event) => startTagEdit(event, item, index)}>
                                                        {tag}
                                                    </button>
                                                {/if}
                                            {/each}
                                            {#if isAddingTag(item.id)}
                                                <input
                                                    class="tag-input"
                                                    bind:this={tagEditorInput}
                                                    bind:value={tagEditorValue}
                                                    on:keydown={handleTagEditorKeydown}
                                                    on:blur={commitTagEditor}
                                                    placeholder="输入新标签" />
                                            {:else}
                                                <button
                                                    class="tag-pill tag-pill--add"
                                                    type="button"
                                                    on:click={(event) => startTagAdd(event, item)}>
                                                    + 标签
                                                </button>
                                            {/if}
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
                            class:selected={item.selected}
                            class:invalid={!item.exists}
                            on:contextmenu={(event) => handleContextMenu(event, item)}>
                            {#if isSelectMode}
                                <label class="card-select">
                                    <input
                                        type="checkbox"
                                        checked={item.selected}
                                        on:change={() => toggleItemSelection(item)} />
                                </label>
                            {/if}
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
                                <div class="card-meta" title={item.id}>{item.id}</div>
                                <div class="card-meta" title={item.fileName}>{item.fileName}</div>
                                <div class="card-meta muted">{formatTime(getLatestUpdate(item))}</div>
                                <div class="card-tags">
                                    {#if item.tags.length === 0 && !isAddingTag(item.id)}
                                        <span class="tag-empty">无标签</span>
                                    {/if}
                                    {#each item.tags as tag, index}
                                        {#if isEditingTag(item.id, index)}
                                            <input
                                                class="tag-input"
                                                bind:this={tagEditorInput}
                                                bind:value={tagEditorValue}
                                                on:keydown={handleTagEditorKeydown}
                                                on:blur={commitTagEditor}
                                                placeholder="编辑标签" />
                                        {:else}
                                            <button
                                                type="button"
                                                class="tag-pill"
                                                on:click={(event) => startTagEdit(event, item, index)}>
                                                {tag}
                                            </button>
                                        {/if}
                                    {/each}
                                    {#if isAddingTag(item.id)}
                                        <input
                                            class="tag-input"
                                            bind:this={tagEditorInput}
                                            bind:value={tagEditorValue}
                                            on:keydown={handleTagEditorKeydown}
                                            on:blur={commitTagEditor}
                                            placeholder="输入新标签" />
                                    {:else}
                                        <button
                                            class="tag-pill tag-pill--add"
                                            type="button"
                                            on:click={(event) => startTagAdd(event, item)}>
                                            + 标签
                                        </button>
                                    {/if}
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

.batch-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--b3-theme-primary-lightest);
    border-bottom: 1px solid var(--b3-border-color);
}

.selected-info {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-primary);
}

.tag-manager {
    padding: 12px;
    background: var(--b3-theme-surface-lighter);
    border-bottom: 1px solid var(--b3-border-color);
}

.tag-input-group {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}

.tag-input-group input {
    flex: 1;
}

.tag-list {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.tag-list-label {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
}

.tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--b3-theme-primary-light);
    border-radius: 12px;
    font-size: 12px;
    color: var(--b3-theme-primary);
}

.tag-remove {
    cursor: pointer;
    font-weight: bold;
    opacity: 0.7;
    transition: opacity 0.2s;
}

.tag-remove:hover {
    opacity: 1;
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

.whiteboard-card.selected {
    border-color: var(--b3-theme-primary);
    box-shadow: 0 0 0 2px rgba(61, 142, 255, 0.2);
}

.whiteboard-card.invalid {
    opacity: 0.7;
}

.card-select {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 999px;
    padding: 4px 6px;
    z-index: 2;
}

.card-select input {
    width: 16px;
    height: 16px;
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

.tag-pill--add {
    background: transparent;
    border: 1px dashed var(--b3-border-color);
    color: var(--b3-theme-on-surface-light);
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