<script lang="ts">
    import { onMount } from 'svelte';
    import { showMessage, openTab, Plugin } from 'siyuan';
    import { api } from '@frostime/siyuan-plugin-kits';

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
        shapes: Array<{ id?: string; type?: string; x: number; y: number; w: number; h: number }>; // 用于缩略图
        error?: string;      // 预览错误
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
    let allFileEntries: DirEntry[] = []; // 全部文件条目列表（仅文件元数据）
    let nextIndex = 0; // 下一个批次的起始索引
    const BATCH_SIZE = 40; // 每批加载的卡片数量
    let loadingList = false; // 正在加载文件列表
    let loadingBatch = false; // 正在加载一批卡片
    let allLoaded = false; // 是否所有文件都已转换为卡片
    let autoLoadingAll = false; // 搜索时自动加载全部
    let sentinel: HTMLDivElement; // 触底哨兵元素
    let cardsGridEl: HTMLDivElement; // 网格容器引用（用于滚动检测）

    // 原逻辑拆成两阶段：读取文件列表 + 分批构造卡片
    async function loadWhiteboards() {
        resetState();
        loading = true;
        loadingList = true;
        try {
            const files: any[] = await api.readDir('/data/storage/petal/sttools/');
            allFileEntries = files.filter(f => !f.isDir && f.name.startsWith('tldraw-data-') && f.name.endsWith('.json'));
            nextIndex = 0;
            if (allFileEntries.length === 0) {
                allCards = [];
                applyFilters();
                allLoaded = true;
                return;
            }
            // 初始加载第一批
            await loadNextBatch();
        } catch (e) {
            console.error('加载白板列表失败:', e);
            showMessage('加载白板列表失败', 4000, 'error');
        } finally {
            loadingList = false;
            loading = false;
        }
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

    // 构造单个文件的卡片元数据（延迟）
    async function buildCardMeta(f: DirEntry): Promise<WhiteboardCard> {
        const id = extractDrawingId(f.name);
        let exists = false;
        let title = '未知白板';
        if (id !== '未知画板') {
            try {
                const blk = await api.getBlockByID(id);
                if (blk) {
                    exists = true;
                    if (blk.root_id) {
                        try {
                            const docBlk = await api.getBlockByID(blk.root_id);
                            title = docBlk?.content || title;
                        } catch { /* ignore */ }
                    }
                } else {
                    exists = false;
                    title = '无关联块';
                }
            } catch {
                exists = false;
                title = '无关联块';
            }
        } else {
            title = 'ID无法解析';
        }
        return {
            id,
            fileName: f.name,
            path: `/data/storage/petal/sttools/${f.name}`,
            title,
            exists,
            mtime: f.mtime || 0,
            loadingPreview: false,
            shapes: [],
        };
    }

    async function loadNextBatch() {
        if (loadingBatch || allLoaded) return;
        loadingBatch = true;
        try {
            const slice = allFileEntries.slice(nextIndex, nextIndex + BATCH_SIZE);
            const metas = await Promise.all(slice.map(buildCardMeta));
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

    function extractDrawingId(filename: string): string {
        const match = filename.match(/^tldraw-data-(.+)\.json$/);
        const idPattern = /^\d{14}-\w{7}$/;
        if (match && match[1] && idPattern.test(match[1])) return match[1];
        return '未知画板';
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

    // 计算整体边界
    function computeBounds(shapes: Array<{ x: number; y: number; w: number; h: number }>) {
        if (!shapes || shapes.length === 0) return { minX: 0, minY: 0, maxX: 300, maxY: 200, width: 300, height: 200 };
        let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
        for (const s of shapes) {
            const left = (s.x || 0) - (s.w || 0) / 2;
            const top = (s.y || 0) - (s.h || 0) / 2;
            minX = Math.min(minX, left); minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + (s.w || 0)); maxY = Math.max(maxY, top + (s.h || 0));
        }
        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return { minX: 0, minY: 0, maxX: 300, maxY: 200, width: 300, height: 200 };
        const width = Math.max(maxX - minX, 1); const height = Math.max(maxY - minY, 1);
        return { minX, minY, maxX, maxY, width, height };
    }

    function scaleShape(shape: { x: number; y: number; w: number; h: number }, shapes: any[]) {
        const bounds = computeBounds(shapes as any);
        const viewW = 300 - 8; const viewH = 200 - 8; const pad = 4;
        const sx = viewW / bounds.width; const sy = viewH / bounds.height; const sScale = Math.min(sx, sy);
        const tx = -bounds.minX * sScale + pad; const ty = -bounds.minY * sScale + pad;
        const cx = shape.x || 0; const cy = shape.y || 0; const w = shape.w || 100; const h = shape.h || 60;
        const left = cx - w / 2; const top = cy - h / 2;
        return { x: left * sScale + tx, y: top * sScale + ty, w: Math.max(w * sScale, 1), h: Math.max(h * sScale, 1) };
    }

    // 已移除下载功能按钮; 保留接口后续可扩展（当前不使用）

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
        observer.observe(node);
        return {
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
</script>

<div class="whiteboard-card-view">
    <div class="block__icons">
        <div class="block__logo">
            <svg class="block__logoicon"><use xlink:href="#iconSTWhiteboard"></use></svg>白板卡片
        </div>
        <span class="counter" title="已加载卡片/总文件">{filteredCards.length}/{allFileEntries.length || 0}</span>
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
                     on:keydown={(e)=>{ if(e.key==='Enter'|| e.key===' ') { e.preventDefault(); openWhiteboard(card);} }}>
                    <div class="preview-wrapper" use:setupObserver={card}>
                        {#if card.error}
                            <div class="preview-error">{card.error}</div>
                        {:else if card.loadingPreview && card.shapes.length === 0}
                            <div class="preview-loading">生成缩略图...</div>
                        {:else}
                            <svg viewBox="0 0 300 200" class="preview-svg" preserveAspectRatio="xMidYMid meet">
                                {#if card.shapes.length > 0}
                                    {#each card.shapes as s}
                                        <rect x={scaleShape(s, card.shapes).x} y={scaleShape(s, card.shapes).y} width={scaleShape(s, card.shapes).w} height={scaleShape(s, card.shapes).h} rx="3" ry="3" fill="rgba(20,120,220,0.08)" stroke="rgba(20,120,220,0.6)" stroke-width="1" />
                                    {/each}
                                    <rect x="0.5" y="0.5" width="299" height="199" fill="none" stroke="rgba(0,0,0,0.06)" />
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
                        <div class="id-line" title={card.id}>{card.id}</div>
                        <div class="file-line" title={card.fileName}>{card.fileName}</div>
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
</div>

<style>
/* 容器 */
.whiteboard-card-view {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
}

/* 顶栏 - 使用思源 block__icons 风格 */
.whiteboard-card-view .block__icons {
  display: flex;
  align-items: center;
  /* padding: 4px 8px; */
  background: var(--b3-theme-background);
  border-bottom: 1px solid var(--b3-border-color);
  user-select: none;
  flex-shrink: 0;
}

.whiteboard-card-view .block__logo {
  display: flex;
  align-items: center;
  /* padding: 0 8px; */
  color: var(--b3-theme-on-background);
  font-size: 14px;
  /* line-height: 20px; */
}

.whiteboard-card-view .block__logoicon {
  width: 20px;
  height: 20px;
  margin-right: 4px;
  fill: currentColor;
}

.whiteboard-card-view .counter {
  /* background-color: var(--b3-theme-surface-lighter); */
  color: var(--b3-theme-on-surface);
  /* padding: 2px 8px; */
  /* border-radius: 10px; */
  font-size: 10px;
  /* margin-left: 8px; */
}

.whiteboard-card-view .search__label {
  transition: all 0.15s cubic-bezier(0, 0, 0.2, 1) 0ms;
}

.whiteboard-card-view .block__icon {
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--b3-theme-on-background);
  transition: background-color 0.15s cubic-bezier(0, 0, 0.2, 1) 0ms;
  display: flex;
  align-items: center;
  justify-content: center;
}

.whiteboard-card-view .block__icon:hover {
  background-color: var(--b3-list-hover);
}


.whiteboard-card-view .block__icon--active {
  color: var(--b3-theme-primary);
}

/* 网格 */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(200px, 24%, 340px), 1fr));
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
  flex: 1;
}

/* 卡片 */
.card {
  display: flex;
  flex-direction: column;
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
  border-radius: 12px;
  box-shadow: 0 4px 12px -4px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.06);
  /* overflow: hidden; */
  cursor: pointer;
  transition: box-shadow .25s, transform .25s, border-color .25s;
  position: relative;
  outline: none;
  backdrop-filter: saturate(160%) blur(4px);
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px -6px rgba(0,0,0,0.15), 0 4px 8px -3px rgba(0,0,0,0.12);
  border-color: var(--b3-theme-primary);
}
.card:active {
  transform: translateY(-1px) scale(.98);
}
.card:focus-visible {
  box-shadow: 0 0 0 2px var(--b3-theme-primary), 0 6px 16px -6px rgba(0,0,0,0.16);
}

/* 缩略图区 */
.preview-wrapper {
  width: 100%;
  aspect-ratio: 3 / 2;
  background: linear-gradient(135deg, var(--b3-theme-background) 0%, var(--b3-theme-surface) 70%);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  /* overflow: hidden; */
  border-bottom: 1px solid var(--b3-border-color);
}
.preview-svg {
  width: 100%;
  height: 100%;
  display: block;
  user-select: none;
}
.preview-loading, .preview-error {
  font-size: 0.8rem;
  color: var(--b3-theme-secondary);
  animation: fadePulse 1.6s infinite;
}
.preview-error {
  color: var(--b3-theme-error);
  animation: none;
}
@keyframes fadePulse {
  0%,100% { opacity: .35; }
  50% { opacity: 1; }
}

/* 元数据 */
.meta {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.55rem 0.75rem 0.7rem;
  font-size: 0.76rem;
}
.title-line {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  line-height: 1.2;
}
.doc-title {
  font-weight: 600;
  font-size: 0.82rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.id-line, .file-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: .8;
}
.id-line { font-family: var(--b3-font-family-code, monospace); }
.file-line { opacity: .6; }

/* 徽章 */
.badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.58rem;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  letter-spacing: 0.5px;
  font-weight: 600;
  background: var(--b3-border-color);
  color: var(--b3-theme-on-surface);
  flex-shrink: 0;
}
.badge-warn {
  background: var(--b3-theme-error);
  color: #fff;
}

/* 状态 */
.loading, .empty {
  padding: 1.2rem 0.8rem;
  font-size: 0.9rem;
  color: var(--b3-theme-secondary);
  text-align: center;
}
.empty { opacity: .7; }

/* 触底哨兵 */
.load-sentinel {
    grid-column: 1 / -1;
    text-align: center;
    padding: 0.75rem 0.5rem 1.5rem;
    font-size: 0.7rem;
    color: var(--b3-theme-secondary);
    opacity: .8;
}
.load-sentinel.done { opacity: .5; }
.loading-batch { animation: fadePulse 1.6s infinite; }

/* 小屏适配 */
@media (max-width: 900px) {
  .cards-grid { 
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
    padding: 0.75rem;
  }
}
@media (max-width: 600px) {
  .cards-grid { 
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); 
    gap: 0.75rem; 
    padding: 0.5rem;
  }
  .meta { padding: 0.5rem 0.6rem 0.6rem; }
  .doc-title { font-size: 0.78rem; }
  .id-line, .file-line { font-size: 0.68rem; }
  .whiteboard-card-view .search__label { min-width: 100px; }
}

/* 深色模式微调 */
@media (prefers-color-scheme: dark) {
  .card { box-shadow: 0 4px 14px -6px rgba(0,0,0,0.55); }
  .card:hover { box-shadow: 0 10px 28px -10px rgba(0,0,0,0.7); }
  .preview-wrapper { background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)); }
}
</style>
