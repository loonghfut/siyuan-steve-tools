<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { showMessage, openTab, Plugin, confirm } from 'siyuan';
    import { api } from '@frostime/siyuan-plugin-kits';
    import { whiteboardFilesUpdated } from '../whiteboards.store';
    import { closeTab } from '../tldraw-instance-manager';
    import { WhiteboardFileManager, WHITEBOARD_TRASH_DIR } from '../whiteboard-file-manager';
    import type { PreviewShape } from '../utils/whiteboard-utils';
    import { extractDrawingId, parseSyTimestamp, computeBounds, formatTime, projectShape, SVG_PAD, SHAPE_FILL, SHAPE_STROKE, BORDER_STROKE, SHAPE_RX } from '../utils/whiteboard-utils';

    // 父层传入 plugin 以便打开白板
    export let plugin: Plugin;

    interface WhiteboardCard {
        id: string;          // 画板ID (块ID)
        fileName: string;    // 数据文件名
        path: string;        // 文件路径
        title: string;       // 关联文档标题或占位
        exists: boolean;     // 块是否存在
        mtime: number;       // 文件修改时间 (用于排序)
        loadingPreview: boolean; // 缩略图是否加载中
        shapes: PreviewShape[]; // 用于缩略图
        error?: string;      // 预览错误
        docId?: string;      // 关联文档ID
        tags?: string[];     // 标签列表
    }

    interface ContextMenuState {
        visible: boolean;
        x: number;
        y: number;
        card: WhiteboardCard | null;
    }

    let allCards: WhiteboardCard[] = [];
    let filteredCards: WhiteboardCard[] = [];
    let searchQuery: string = '';
    let showOnlyValid = true; // true: 仅显示存在的块 (默认开启)
    let showSearch = false; // 控制搜索框显示
    let loading = true;
    let sortKey: string = 'mtime-desc'; // 默认按修改时间降序
    let searchInputRef: HTMLInputElement; // 搜索框引用
    // 新增：动态增量加载相关状态
    interface DirEntry { name: string; isDir: boolean; mtime?: number }
    interface FileMeta extends DirEntry {
        id?: string;
        blkInfo?: any;
        docBlkInfo?: any;
        title?: string;
        exists?: boolean;
        mtimeNum?: number; // derived from blk.updated/created or doc
        docId?: string;    // 关联文档ID
        tags?: string[];   // 标签列表
    }
    let allFileEntries: FileMeta[] = []; // 全部文件条目列表（扩展的元数据）
    let nextIndex = 0; // 下一个批次的起始索引
    const BATCH_SIZE = 40; // 每批加载的卡片数量
    let loadingList = false; // 正在加载文件列表
    let loadingBatch = false; // 正在加载一批卡片
    let allLoaded = false; // 是否所有文件都已转换为卡片
    let autoLoadingAll = false; // 搜索时自动加载全部
    let sentinel: HTMLDivElement; // 触底哨兵元素
    let cardsGridEl: HTMLDivElement; // 网格容器引用（用于滚动检测）
    let prevSortKey = sortKey;

    let contextMenu: ContextMenuState = { visible: false, x: 0, y: 0, card: null };

    // 原逻辑拆成两阶段：读取文件列表 + 分批构造卡片
    async function loadWhiteboards() {
        resetState();
        loading = true;
        loadingList = true;
        try {
            const files: any[] = await api.readDir('/data/storage/petal/sttools/');
            allFileEntries = files.filter(f => !f.isDir && f.name.startsWith('tldraw-data-') && f.name.endsWith('.json')) as FileMeta[];
            // attach id parsed from filename
            allFileEntries = allFileEntries.map(f => ({ ...f, id: extractDrawingId(f.name) }));
            nextIndex = 0;
            if (allFileEntries.length === 0) {
                allCards = [];
                applyFilters();
                allLoaded = true;
                return;
            }
            // 预取所有文件的块元数据（用于排序顺序），有限并发
            await fetchAllMetas(8);
            // 根据当前排序规则对 allFileEntries 排序
            sortAllFileEntries();
            // 初始加载第一批（按排序后的顺序）
            await loadNextBatch();
        } catch (e) {
            console.error('加载白板列表失败:', e);
            showMessage('加载白板列表失败', 4000, 'error');
        } finally {
            loadingList = false;
            loading = false;
        }
    }

    // 并发抓取元数据（blkInfo/docBlkInfo）以便排序
    async function fetchAllMetas(concurrency = 6) {
        if (!allFileEntries || allFileEntries.length === 0) return;
        loadingList = true;
        let i = 0;
        const total = allFileEntries.length;
        const workers: Promise<void>[] = [];
        for (let w = 0; w < concurrency; w++) {
            workers.push((async () => {
                while (i < total) {
                    const idx = i++;
                    const f = allFileEntries[idx];
                    try {
                        const id = f.id;
                        f.exists = false;
                        f.title = '未知白板';
                        f.blkInfo = null;
                        f.docBlkInfo = null;
                        if (id && id !== '未知画板') {
                            try {
                                const blk = await api.getBlockByID(id);
                                if (blk) {
                                    f.exists = true;
                                    f.blkInfo = blk;
                                    f.docId = blk.root_id || undefined;
                                    f.tags = blk.tag ? blk.tag.match(/#([^#]+)#/g)?.map(t => t.replace(/#/g, '')) || [] : [];
                                    if (blk.root_id) {
                                        try {
                                            const docBlk = await api.getBlockByID(blk.root_id);
                                            if (docBlk) {
                                                f.docBlkInfo = docBlk;
                                                f.title = docBlk.content || f.title;
                                            }
                                        } catch { /* ignore */ }
                                    }
                                } else {
                                    f.exists = false;
                                    f.title = '无关联块';
                                }
                            } catch {
                                f.exists = false;
                                f.title = '无关联块';
                            }
                        } else {
                            f.title = 'ID无法解析';
                        }

                        // compute mtimeNum from blk/doc
                        let blkUpdated = f.blkInfo && typeof f.blkInfo.updated === 'string' ? parseSyTimestamp(f.blkInfo.updated) : 0;
                        let docUpdated = f.docBlkInfo && typeof f.docBlkInfo.updated === 'string' ? parseSyTimestamp(f.docBlkInfo.updated) : 0;
                        let blkCreated = f.blkInfo && typeof f.blkInfo.created === 'string' ? parseSyTimestamp(f.blkInfo.created) : 0;
                        let docCreated = f.docBlkInfo && typeof f.docBlkInfo.created === 'string' ? parseSyTimestamp(f.docBlkInfo.created) : 0;

                        if (blkUpdated > 0) f.mtimeNum = blkUpdated;
                        else if (docUpdated > 0) f.mtimeNum = docUpdated;
                        else if (blkCreated > 0) f.mtimeNum = blkCreated;
                        else if (docCreated > 0) f.mtimeNum = docCreated;
                        else f.mtimeNum = 0;
                    } catch (e) {
                        console.warn('fetch meta fail', f.name, e);
                        // continue
                    }
                }
            })());
        }
        await Promise.all(workers);
        loadingList = false;
    }

    function sortAllFileEntries() {
        if (!allFileEntries || allFileEntries.length === 0) return;
        const order = sortKey;
        allFileEntries.sort((a,b) => {
            switch (order) {
                case 'mtime-desc': return (b.mtimeNum || 0) - (a.mtimeNum || 0);
                case 'mtime-asc': return (a.mtimeNum || 0) - (b.mtimeNum || 0);
                case 'title': return (a.title || '').localeCompare(b.title || '');
                case 'id': return (a.id || '').localeCompare(b.id || '');
                case 'exists': return Number(b.exists ? 1 : 0) - Number(a.exists ? 1 : 0);
            }
            return 0;
        });
    }

    function resetState() {
        allCards = [];
        filteredCards = [];
        allFileEntries = [];
        nextIndex = 0;
        loadingList = false;
        loadingBatch = false;
        allLoaded = false;
        autoLoadingAll = false;
    }

    // 构造单个文件的卡片元数据（使用已预取的 metas，避免重复网络请求）
    function buildCardMeta(f: FileMeta): WhiteboardCard {
        // use precomputed fields if available
        const id = f.id || extractDrawingId(f.name);
        const exists = !!f.exists;
        const title = f.title || '未知白板';
        const mtimeNum = f.mtimeNum || 0;

        return {
            id,
            fileName: f.name,
            path: `/data/storage/petal/sttools/${f.name}`,
            title,
            exists,
            mtime: mtimeNum,
            loadingPreview: false,
            shapes: [],
            docId: f.docId,
            tags: f.tags || [],
        } as WhiteboardCard;
    }

    async function loadNextBatch() {
        if (loadingBatch || allLoaded) return;
        loadingBatch = true;
        try {
            const slice = allFileEntries.slice(nextIndex, nextIndex + BATCH_SIZE);
            // buildCardMeta is synchronous now (uses pre-fetched meta)
            const metas = slice.map(buildCardMeta);
            allCards = [...allCards, ...metas];
            nextIndex += slice.length;
            if (nextIndex >= allFileEntries.length) {
                allLoaded = true;
            }
            applyFilters();
        } catch (e) {
            console.error('批次加载失败:', e);
            showMessage('批次加载失败', 3000, 'error');
        } finally {
            loadingBatch = false;
        }
    }

    // 当 sortKey 变化时，按照排序重排元数据并重置批次加载顺序
    $: if (allFileEntries.length > 0 && prevSortKey !== sortKey) {
        prevSortKey = sortKey;
        (async () => {
            sortAllFileEntries();
            // reset batch loading so subsequent batches follow new order
            allCards = [];
            filteredCards = [];
            nextIndex = 0;
            allLoaded = false;
            // load first batch under new order
            await loadNextBatch();
        })();
    }

// 滚动检测作为 IntersectionObserver 的补充（某些嵌套滚动环境下 IO 可能不触发）
    function handleGridScroll() {
        if (!cardsGridEl || loadingBatch || allLoaded) return;
        const nearBottom = cardsGridEl.scrollTop + cardsGridEl.clientHeight >= cardsGridEl.scrollHeight - 160; // 160px 预加载阈值
        if (nearBottom) loadNextBatch();
    }

    // 搜索时自动加载全部（避免未加载条目漏检）
    $: if (searchQuery.trim() && !allLoaded && !autoLoadingAll) {
        autoLoadingAll = true;
        // 递归批量加载直到全部完成
        (async () => {
            while (!allLoaded) {
                await loadNextBatch();
                // 小延迟避免 UI 卡顿
                await new Promise(r => setTimeout(r, 10));
            }
        })();
    }

    // 过滤逻辑
    function applyFilters() {
        let list = allCards;
        if (showOnlyValid) list = list.filter(c => c.exists);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(c => c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || c.fileName.toLowerCase().includes(q));
        }
        // 排序
        list = list.slice();
        switch (sortKey) {
            case 'mtime-desc':
                list.sort((a,b)=> b.mtime - a.mtime); break;
            case 'mtime-asc':
                list.sort((a,b)=> a.mtime - b.mtime); break;
            case 'title':
                list.sort((a,b)=> a.title.localeCompare(b.title)); break;
            case 'id':
                list.sort((a,b)=> a.id.localeCompare(b.id)); break;
            case 'exists':
                list.sort((a,b)=> Number(b.exists) - Number(a.exists)); break;
        }
        filteredCards = list;
    }

    $: { searchQuery; showOnlyValid; sortKey; applyFilters(); }

    // 排序切换
    function toggleSort() {
        const sortOrder = ['mtime-desc', 'mtime-asc', 'title', 'id', 'exists'];
        const currentIndex = sortOrder.indexOf(sortKey);
        sortKey = sortOrder[(currentIndex + 1) % sortOrder.length];
    }

    // 切换搜索框显示
    function toggleSearch() {
        showSearch = !showSearch;
        // 切换到隐藏时不清空查询，保留筛选；用户可按 Esc 或使用清除按钮主动清空
        if (showSearch) {
            // 显示后聚焦输入框
            setTimeout(() => searchInputRef?.focus(), 10);
        }
    }

    // 搜索框失焦处理：失去焦点时自动隐藏并清空输入（延迟以兼容点击其它控件）
    function handleSearchBlur() {
        // 延迟隐藏，避免点击搜索框内部或切换到其它控件时被误判
        setTimeout(() => {
            // 如果查询为空，则保持清空状态；如果有查询则隐藏输入但保留筛选
            if (!searchQuery || !searchQuery.trim()) {
                searchQuery = '';
            }
            showSearch = false;
        }, 150);
    }

    // 打开白板 Tab
    async function openWhiteboard(card: WhiteboardCard) {
        if (!card.exists) {
            showMessage('该白板块不存在，无法打开', 3000, 'error');
            return;
        }
        try {
            await openTab({
                app: plugin.app,
                custom: {
                    id: plugin.name + 'steveTool-whiteboard',
                    title: card.title || '画板-' + card.id.substring(0,8),
                    icon: 'iconSTWhiteboard',
                    data: { text: 'steveTool-whiteboard' + card.id, rootid: card.id }
                },
                // position: 'right'
            });
        } catch (e) {
            console.error('打开白板失败:', e);
            showMessage('打开白板失败', 3000, 'error');
        }
    }

    // ========== 右键菜单 ==========

    function handleContextMenu(event: MouseEvent, card: WhiteboardCard) {
        event.preventDefault();
        const menuWidth = 180;
        const menuHeight = 200;
        const posX = Math.min(event.clientX, window.innerWidth - menuWidth);
        const posY = Math.min(event.clientY, window.innerHeight - menuHeight);
        contextMenu = { visible: true, x: posX, y: posY, card };
    }

    function closeContextMenu() {
        contextMenu = { visible: false, x: 0, y: 0, card: null };
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

    function handleWindowCtxMenu(event: MouseEvent) {
        if (!event.defaultPrevented && contextMenu.visible) {
            closeContextMenu();
        }
    }

    async function openDocument(card: WhiteboardCard) {
        if (!card.docId) {
            showMessage('未找到关联文档', 3000, 'info');
            return;
        }
        try {
            await openTab({
                app: plugin.app,
                doc: {
                    id: card.docId,
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

    async function refreshCard(card: WhiteboardCard) {
        card.shapes = [];
        card.error = undefined;
        card.loadingPreview = false;
        allCards = allCards;
        filteredCards = [...filteredCards];
        await loadPreview(card);
        showMessage('预览已刷新', 1500, 'info');
    }

    async function backupCard(card: WhiteboardCard) {
        try {
            const results = await WhiteboardFileManager.batchBackupWhiteboards([card.id], {
                reason: '手动备份',
                includeTimestamp: true,
            });
            const stats = WhiteboardFileManager.getOperationStats(results);
            if (stats.success > 0) {
                showMessage(`已备份到 ${WHITEBOARD_TRASH_DIR}`, 3000, 'info');
            } else {
                showMessage('备份失败', 3000, 'error');
            }
        } catch (e) {
            console.error('备份失败:', e);
            showMessage('备份失败', 3000, 'error');
        }
    }

    function deleteCard(card: WhiteboardCard) {
        confirm(
            '删除确认',
            `确定要删除白板 "${card.title}" 的数据文件吗？此操作不可恢复！`,
            async (dialog) => {
                try {
                    closeTab(card.id, 'user-delete');
                    await api.removeFile(card.path);

                    whiteboardFilesUpdated.set({
                        action: 'delete',
                        fileName: card.fileName,
                        drawingId: card.id,
                        timestamp: Date.now(),
                    });

                    showMessage(`已删除: ${card.fileName}`, 3000, 'info');

                    setTimeout(async () => {
                        try {
                            await api.removeFile(card.path);
                        } catch (e) {
                            console.debug('延迟删除重试失败:', card.path, e);
                        }
                    }, 2000);
                } catch (error) {
                    console.error('删除失败:', error);
                    showMessage('删除失败', 3000, 'error');
                }
                try { dialog && (dialog as any).close && (dialog as any).close(); } catch {}
            },
            (dialog) => {
                try { dialog && (dialog as any).close && (dialog as any).close(); } catch {}
            }
        );
    }

    function handleMenuAction(action: 'board' | 'doc' | 'refresh' | 'backup' | 'delete') {
        const card = contextMenu.card;
        if (!card) return;
        switch (action) {
            case 'board':
                openWhiteboard(card).finally(() => closeContextMenu());
                break;
            case 'doc':
                openDocument(card).finally(() => closeContextMenu());
                break;
            case 'refresh':
                refreshCard(card).finally(() => closeContextMenu());
                break;
            case 'backup':
                backupCard(card).finally(() => closeContextMenu());
                break;
            case 'delete':
                deleteCard(card);
                closeContextMenu();
                break;
        }
    }

    // 解析文件生成缩略图数据
    async function loadPreview(card: WhiteboardCard) {
        if (card.loadingPreview || card.shapes.length > 0 || card.error) return; // 已加载或正在加载
        card.loadingPreview = true;
        try {
            const raw = await api.getFile(card.path);
            const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const doc = json?.document ?? json;
            // 收集形状 (兼容多种结构)
            let shapeEntries: Array<[string, any]> = [];
            if (doc?.shapes && typeof doc.shapes === 'object') {
                shapeEntries = Object.entries(doc.shapes);
            } else if (doc?.store && typeof doc.store === 'object') {
                shapeEntries = Object.entries(doc.store).filter(([k, v]) => {
                    if (typeof k === 'string' && k.startsWith('shape:')) return true;
                    const vv: any = v;
                    return !!(vv && (vv.type === 'shape' || vv.typeName === 'shape' || typeof vv.type === 'string'));
                });
            }
            const shapes: WhiteboardCard['shapes'] = [];
            for (const [sid, s] of shapeEntries.slice(0, 120)) { // 限制最多采样一定数量避免过大
                const px = typeof s?.x === 'number' ? s.x : (s?.props?.x ?? 0);
                const py = typeof s?.y === 'number' ? s.y : (s?.props?.y ?? 0);
                const w = Number(s?.props?.w ?? s?.props?.width ?? s?.width ?? 0) || 0;
                const h = Number(s?.props?.h ?? s?.props?.height ?? s?.height ?? 0) || 0;
                shapes.push({ id: sid, type: s?.type || s?.typeName || 'shape', x: px, y: py, w: w > 0 ? w : 100, h: h > 0 ? h : 60 });
            }
            // 如果没有在常见字段找到 shapes，则尝试深度搜索 document 中潜在的形状对象
            if (shapes.length === 0) {
                const fallback: Array<[string, any]> = [];
                const visit = (o: any) => {
                    if (!o || typeof o !== 'object') return;
                    for (const [k, v] of Object.entries(o)) {
                        const vv: any = v;
                        if (!vv || typeof vv !== 'object') continue;
                        // 识别含有尺寸或坐标的对象作为 shape 候选
                        if ((vv.props && (vv.props.w || vv.props.width || vv.props.h || vv.props.height)) || vv.x || vv.y || vv.width || vv.height) {
                            fallback.push([k, vv]);
                        } else {
                            visit(v);
                        }
                        if (fallback.length >= 120) break;
                    }
                };
                visit(doc);

                for (const [sid, s] of fallback) {
                    const ss: any = s;
                    const px = typeof ss?.x === 'number' ? ss.x : (ss?.props?.x ?? 0);
                    const py = typeof ss?.y === 'number' ? ss.y : (ss?.props?.y ?? 0);
                    const w = Number(ss?.props?.w ?? ss?.props?.width ?? ss?.width ?? 0) || 0;
                    const h = Number(ss?.props?.h ?? ss?.props?.height ?? ss?.height ?? 0) || 0;
                    shapes.push({ id: sid, type: s?.type || s?.typeName || 'shape', x: px, y: py, w: w > 0 ? w : 100, h: h > 0 ? h : 60 });
                }
            }

            card.shapes = shapes;
        } catch (e) {
            console.warn('缩略图加载失败:', e);
            card.error = '缩略图失败';
        } finally {
            card.loadingPreview = false;
            // 强制触发响应式更新
            allCards = allCards;
            filteredCards = [...filteredCards];
        }
    }

    // 懒加载缩略图：使用 IntersectionObserver
    let observer: IntersectionObserver;
    function setupObserver(node: HTMLElement, card: WhiteboardCard) {
        if (!observer) {
            // 增大 rootMargin 提前触发懒加载，降低滚动时空白缩略图的出现概率
            observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const targetCard = (entry.target as any).__card as WhiteboardCard;
                        if (targetCard) loadPreview(targetCard);
                        observer.unobserve(entry.target);
                    }
                }
            }, { root: null, rootMargin: '320px 0px 320px 0px', threshold: 0.05 });
        }
        (node as any).__card = card;
        // always try to observe even if previously observed — IntersectionObserver.observe is idempotent
        try { observer.observe(node); } catch { /* ignore */ }
        return {
            // update is called when the action parameter changes (e.g. card object updated/element reused)
            update(newCard: WhiteboardCard) {
                (node as any).__card = newCard;
                try { observer.observe(node); } catch { /* ignore */ }
            },
            destroy() {
                try { observer.unobserve(node); } catch { /* ignore */ }
            }
        };
    }

    onMount(() => { loadWhiteboards(); });

    // 触底哨兵观察器：滚动至底部自动加载下一批
    let batchObserver: IntersectionObserver;
    function initBatchObserver() {
        if (batchObserver || !sentinel) return;
        batchObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    loadNextBatch();
                }
            }
        }, { root: null, rootMargin: '200px 0px 200px 0px', threshold: 0.01 });
        batchObserver.observe(sentinel);
    }

    $: initBatchObserver();

    // 订阅白板文件更新事件（用于删除后自动刷新）
    let unsubscribe: () => void;
    $: {
        if (!unsubscribe) {
            unsubscribe = whiteboardFilesUpdated.subscribe(({ action, fileName, drawingId }) => {
                if (action === 'delete') {
                    const matchByFileName = (card: WhiteboardCard) => (fileName ? card.fileName !== fileName : true);
                    const matchByDrawingId = (card: WhiteboardCard) => (drawingId ? card.id !== drawingId : true);

                    // 删除对应的卡片条目（按 fileName / drawingId 任一匹配）
                    allCards = allCards.filter(card => matchByFileName(card) && matchByDrawingId(card));
                    allFileEntries = allFileEntries.filter(f => {
                        if (fileName && f.name === fileName) return false;
                        if (drawingId && (f as any).id === drawingId) return false;
                        return true;
                    });

                    applyFilters();
                } else if (action === 'refresh') {
                    // 完全刷新
                    loadWhiteboards();
                }
            });
        }
    }

    // 清理订阅
    onDestroy(() => {
        if (unsubscribe) unsubscribe();
    });

    // 打开高级管理 Tab
    async function openManagerTab() {
        try {
            await openTab({
                app: plugin.app,
                custom: {
                    id: plugin.name + "steveTool-whiteboard-manager",
                    title: "白板高级管理",
                    icon: "iconSettings",
                    data: {
                        text: "steveTool-whiteboard-manager",
                    },
                },
            });
        } catch (e) {
            console.error('打开白板管理 Tab 失败:', e);
            showMessage('打开白板管理失败', 3000, 'error');
        }
    }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} on:contextmenu={handleWindowCtxMenu} />

<div class="whiteboard-card-view">
    <div class="block__icons">
        <div class="block__logo">
            <svg class="block__logoicon"><use xlink:href="#iconSTWhiteboard"></use></svg>白板卡片
        </div>
        <span class="stcounter" title="已加载卡片/总文件">{filteredCards.length}/{allFileEntries.length || 0}</span>
        {#if loadingList}
            <span class="fn__space"></span>
            <span class="meta-loading">读取元数据…</span>
        {/if}
        <span class="fn__flex-1"></span>
        <span class="fn__space"></span>
        {#if showSearch}
                 <input class="b3-text-field search__label" 
                     placeholder="搜索ID/标题/文件名..." 
                     bind:value={searchQuery}
                     bind:this={searchInputRef}
                     on:blur={handleSearchBlur}
                     on:keydown={(e)=>{ if(e.key === 'Escape') { searchQuery = ''; showSearch = false; } }} />
            <span class="fn__space"></span>
        {/if}
          <span data-type="search" 
              class="block__icon b3-tooltips b3-tooltips__sw"
              class:block__icon--active={showSearch}
              aria-label={searchQuery && searchQuery.trim() ? `筛选：${searchQuery}` : '筛选'}
              role="button"
              tabindex="0"
              on:click={toggleSearch}
              on:keydown={(e)=>{ if(e.key==='Enter') toggleSearch(); }}>
            <svg><use xlink:href="#iconFilter"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span data-type="refresh" 
              class="block__icon b3-tooltips b3-tooltips__sw" 
              aria-label="刷新"
              role="button"
              tabindex="0"
              on:click={loadWhiteboards}
              on:keydown={(e)=>{ if(e.key==='Enter') loadWhiteboards(); }}>
            <svg><use xlink:href="#iconRefresh"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span data-type="sort" 
              class="block__icon b3-tooltips b3-tooltips__sw" 
              aria-label="排序: {sortKey === 'mtime-desc' ? '更新时间↓' : sortKey === 'mtime-asc' ? '更新时间↑' : sortKey === 'title' ? '标题' : sortKey === 'id' ? 'ID' : '存在性'}"
              role="button"
              tabindex="0"
              on:click={toggleSort}
              on:keydown={(e)=>{ if(e.key==='Enter') toggleSort(); }}>
            <svg><use xlink:href="#iconSort"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span data-type="filter-valid" 
              class="block__icon b3-tooltips b3-tooltips__sw"
              class:block__icon--active={showOnlyValid}
              aria-label="{showOnlyValid ? '显示全部' : '仅显示存在'}"
              role="button"
              tabindex="0"
              on:click={() => showOnlyValid = !showOnlyValid}
              on:keydown={(e)=>{ if(e.key==='Enter') showOnlyValid = !showOnlyValid; }}>
            <svg><use xlink:href="#iconEye{showOnlyValid ? 'off' : ''}"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span data-type="open-manager" 
              class="block__icon b3-tooltips b3-tooltips__sw"
              aria-label="打开高级管理"
              role="button"
              tabindex="0"
              on:click={openManagerTab}
              on:keydown={(e)=>{ if(e.key==='Enter') openManagerTab(); }}>
            <svg><use xlink:href="#iconSettings"></use></svg>
        </span>
    </div>

    {#if loading}
        <div class="loading">加载中...</div>
    {:else if filteredCards.length === 0}
        <div class="empty">暂无匹配白板</div>
    {:else}
        <div class="cards-grid" bind:this={cardsGridEl} on:scroll={handleGridScroll}>
            {#each filteredCards as card (card.path)}
                 <div class="card" role="button" tabindex="0"
                     on:click={() => openWhiteboard(card)}
                     on:contextmenu={(e) => handleContextMenu(e, card)}
                     on:keydown={(e)=>{ if(e.key==='Enter'|| e.key===' ') { e.preventDefault(); openWhiteboard(card);} }}>
                    <div class="preview-wrapper" use:setupObserver={card}>
                        {#if card.error}
                            <div class="preview-error">{card.error}</div>
                        {:else if card.loadingPreview && card.shapes.length === 0}
                            <div class="preview-loading">生成缩略图...</div>
                        {:else}
                            <svg viewBox="0 0 300 200" class="preview-svg" preserveAspectRatio="xMidYMid meet">
                                {#if card.shapes.length > 0}
                                    {@const bounds = computeBounds(card.shapes)}
                                    {@const viewW = 300 - SVG_PAD * 2}
                                    {@const viewH = 200 - SVG_PAD * 2}
                                    {@const scale = Math.min(viewW / bounds.width, viewH / bounds.height)}
                                    {#each card.shapes as s}
                                        {@const pos = projectShape(s, bounds, scale, SVG_PAD)}
                                        <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx={SHAPE_RX} ry={SHAPE_RX} fill={SHAPE_FILL} stroke={SHAPE_STROKE} stroke-width="1" />
                                    {/each}
                                    <rect x="1" y="1" width="298" height="198" fill="none" stroke={BORDER_STROKE} />
                                {:else}
                                    <rect x="20" y="20" width="260" height="160" fill="rgba(0,0,0,0.02)" stroke="rgba(0,0,0,0.03)" />
                                {/if}
                            </svg>
                        {/if}
                    </div>
                    <div class="meta">
                        <div class="title-line">
                            <span class="doc-title" title={card.title}>{card.title}</span>
                            {#if !card.exists}
                                <span class="badge badge-warn">无附属</span>
                            {/if}
                        </div>
                        <!-- <div class="id-line" title={card.id}>{card.id}</div>
                        <div class="file-line" title={card.fileName}>{card.fileName}</div> -->
                        {#if card.mtime}
                            <div class="mtime-line" title={new Date(card.mtime).toISOString()}>{formatTime(card.mtime)}</div>
                        {/if}
                    </div>
                    <!-- 移除操作按钮，整卡点击打开 -->
                </div>
            {/each}
            <!-- 触底哨兵，用于自动加载下一批 -->
            {#if !allLoaded}
                <div class="load-sentinel" bind:this={sentinel}>
                    {#if loadingBatch}
                        <span class="loading-batch">加载更多...</span>
                    {:else}
                        <span class="loading-batch" role="button" tabindex="0" aria-label="手动加载更多"
                              on:click={loadNextBatch}
                              on:keydown={(e)=>{ if(e.key==='Enter') loadNextBatch(); }}>
                            滚动或点击加载更多 ({allCards.length}/{allFileEntries.length})
                        </span>
                    {/if}
                </div>
            {:else}
                <div class="load-sentinel done">已全部加载 ({allCards.length})</div>
            {/if}
        </div>
    {/if}

    {#if contextMenu.visible && contextMenu.card}
        <div
            class="whiteboard-context-menu"
            role="menu"
            aria-label="白板菜单"
            tabindex="0"
            style={`left:${contextMenu.x}px;top:${contextMenu.y}px;`}
            on:click={(event) => event.stopPropagation()}
            on:keydown={(event) => event.stopPropagation()}>
            <button type="button" role="menuitem" on:click={() => handleMenuAction('board')}>
                打开白板
            </button>
            <button type="button" role="menuitem" on:click={() => handleMenuAction('doc')} disabled={!contextMenu.card.docId}>
                跳转文档
            </button>
            <button type="button" role="menuitem" on:click={() => handleMenuAction('refresh')}>
                刷新预览
            </button>
            <button type="button" role="menuitem" on:click={() => handleMenuAction('backup')}>
                备份
            </button>
            <button type="button" role="menuitem" class="danger" on:click={() => handleMenuAction('delete')}>
                删除
            </button>
        </div>
    {/if}
</div>

<style>
/* 容器 */
.whiteboard-card-view {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  height: 100%;
}

/* 顶栏 */
.whiteboard-card-view .block__icons {
  display: flex;
  align-items: center;
  padding: 5px 6px;
  background: var(--b3-theme-background);
  user-select: none;
  flex-shrink: 0;
  gap: 2px;
}

.whiteboard-card-view .block__logo {
  display: flex;
  align-items: center;
  color: var(--b3-theme-on-background);
  font-size: 13px;
  font-weight: 500;
  opacity: 0.85;
}

.whiteboard-card-view .block__logoicon {
  width: 18px;
  height: 18px;
  margin-right: 6px;
  fill: currentColor;
  opacity: 0.7;
}

.whiteboard-card-view .stcounter {
  color: var(--b3-theme-on-surface);
  font-size: 10px;
  opacity: 0.6;
}

.whiteboard-card-view .search__label {
  transition: all 0.2s ease;
  font-size: 0.76rem;
}

.whiteboard-card-view .block__icon {
  padding: 5px;
  cursor: pointer;
  border-radius: 6px;
  color: var(--b3-theme-on-background);
  opacity: 0.65;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.whiteboard-card-view .block__icon:hover {
  background-color: var(--b3-list-hover);
  opacity: 1;
}

.whiteboard-card-view .block__icon--active {
  color: var(--b3-theme-primary);
  opacity: 1;
}

/* 网格 */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(200px, 24%, 340px), 1fr));
  gap: 0.875rem;
  padding: 0.375rem 0.75rem 1rem;
  overflow-y: auto;
  flex: 1;
  align-items: start;
}

/* 卡片 */
.card {
  display: flex;
  flex-direction: column;
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  outline: none;
  height: fit-content;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  border-color: var(--b3-theme-primary-light);
}
.card:active {
  transform: translateY(0) scale(0.99);
}
.card:focus-visible {
  box-shadow: 0 0 0 2px var(--b3-theme-primary), 0 2px 8px rgba(0,0,0,0.08);
}

/* 缩略图区 */
.preview-wrapper {
  width: 100%;
  aspect-ratio: 3 / 2;
  background: var(--b3-theme-background);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px 10px 0 0;
  border-bottom: 1px solid var(--b3-border-color);
}
.preview-svg {
  width: 100%;
  height: 100%;
  display: block;
  user-select: none;
}
.preview-loading, .preview-error {
  font-size: 0.72rem;
  color: var(--b3-theme-on-surface);
  opacity: 0.5;
}
.preview-loading {
  animation: fadePulse 1.8s infinite;
}
.preview-error {
  color: var(--b3-theme-error);
  opacity: 0.7;
  animation: none;
}
@keyframes fadePulse {
  0%,100% { opacity: .3; }
  50% { opacity: .7; }
}

/* 元数据 */
.meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.55rem 0.7rem 0.65rem;
  font-size: 0.74rem;
}
.title-line {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  line-height: 1.3;
}
.doc-title {
  font-weight: 600;
  font-size: 0.78rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mtime-line {
    font-size: 0.64rem;
    color: var(--b3-theme-on-surface);
    opacity: 0.55;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.meta-loading { font-size: 0.68rem; color: var(--b3-theme-on-surface); opacity: 0.55; }

/* 徽章 */
.badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.56rem;
  padding: 0.12rem 0.35rem;
  border-radius: 4px;
  font-weight: 500;
  background: var(--b3-border-color);
  color: var(--b3-theme-on-surface);
  flex-shrink: 0;
}
.badge-warn {
  background: var(--b3-theme-error-background);
  color: var(--b3-theme-error);
}

/* 状态 */
.loading, .empty {
  padding: 1.5rem 1rem;
  font-size: 0.82rem;
  color: var(--b3-theme-on-surface);
  opacity: 0.5;
  text-align: center;
}

/* 触底哨兵 */
.load-sentinel {
    grid-column: 1 / -1;
    text-align: center;
    padding: 0.5rem 0.5rem 1.25rem;
    font-size: 0.68rem;
    color: var(--b3-theme-on-surface);
    opacity: .55;
}
.load-sentinel.done { opacity: .4; }
.loading-batch { animation: fadePulse 1.8s infinite; }

/* 小屏适配 */
@media (max-width: 900px) {
  .cards-grid { 
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
    padding: 0.5rem;
  }
}
@media (max-width: 600px) {
  .cards-grid { 
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); 
    gap: 0.75rem; 
    padding: 0.375rem;
  }
  .meta { padding: 0.45rem 0.55rem 0.55rem; }
  .doc-title { font-size: 0.74rem; }
  .whiteboard-card-view .search__label { min-width: 100px; }
}

/* 右键菜单 */
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
    color: var(--b3-theme-on-background);
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

/* 深色模式 */
@media (prefers-color-scheme: dark) {
  .card { box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
  .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
  .preview-wrapper { background: rgba(255,255,255,0.015); }
}
</style>
