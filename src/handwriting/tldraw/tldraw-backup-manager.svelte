<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { WhiteboardFileManager } from "./whiteboard-file-manager";
    import { showMessage } from "siyuan";
    import * as api from "@/api/api";

    // 接收初始画板ID（用于在打开面板时自动过滤到当前画板）
    export let initialDrawingId: string | null = null;
    // initialTitle 目前不需要显式传入

    // 添加搜索关键词
    let searchQuery: string = "";

    interface BackupFile {
        name: string;
        date: Date;
        path: string;
        drawingId: string;
        title?: string; // 添加标题字段
    }

    interface DrawingGroup {
        drawingId: string;
        title?: string;
        backups: BackupFile[];
    }

    let backupFiles: BackupFile[] = [];
    let drawingGroups: DrawingGroup[] = [];
    let filteredGroups: DrawingGroup[] = [];
    let loading = true;
    let refreshInterval: number;
    interface PreviewMeta {
        loading: boolean;
        data?: {
            shapeCount: number;
            pageCount: number;
            pageNames: string[];
            shapeSamples: string[];
            pagePreviews?: Array<{
                id?: string;
                name?: string;
                shapes: Array<{
                    id?: string;
                    type?: string;
                    x: number;
                    y: number;
                    w: number;
                    h: number;
                }>;
            }>;
        };
        error?: string;
        open: boolean;
    }

    let previewStates: Record<string, PreviewMeta> = {};

    // 加载备份文件列表
    async function loadBackups() {
        loading = true;
        try {
            const files = await WhiteboardFileManager.getBackupList();

            // 处理文件列表，提取画板ID
            backupFiles = files.map((file) => ({
                ...file,
                // drawingId 已经在 getBackupList 中提取
            }));

            // 按画板ID分组
            await groupBackupsByDrawingId();
            // 初始显示所有分组
            filteredGroups = [...drawingGroups];

            // 如果传入 initialDrawingId，则自动过滤聚焦到该画板
            if (initialDrawingId) {
                searchQuery = initialDrawingId;
                filteredGroups = drawingGroups.filter(
                    (g) => g.drawingId === initialDrawingId,
                );
            }
        } catch (error) {
            console.error("加载备份列表失败:", error);
            showMessage("加载备份列表失败");
        } finally {
            loading = false;
        }
    }

    // 搜索功能
    function filterGroups() {
        if (!searchQuery.trim()) {
            filteredGroups = [...drawingGroups];
            return;
        }

        const query = searchQuery.toLowerCase();
        filteredGroups = drawingGroups.filter(
            (group) =>
                group.title?.toLowerCase().includes(query) ||
                group.drawingId.toLowerCase().includes(query),
        );
    }

    // 监听搜索查询变化
    $: {
        if (drawingGroups.length > 0) {
            searchQuery; // 触发响应式更新
            filterGroups();
        }
    }

    // 获取画板标题并按ID分组
    async function groupBackupsByDrawingId() {
        // 创建一个Map来存储分组
        const groupMap = new Map<string, BackupFile[]>();

        // 将备份文件按画板ID分组
        backupFiles.forEach((file) => {
            if (!groupMap.has(file.drawingId)) {
                groupMap.set(file.drawingId, []);
            }
            groupMap.get(file.drawingId).push(file);
        });

        // 转换为数组并获取画板标题
        const groups: DrawingGroup[] = [];
        for (const [drawingId, backups] of groupMap.entries()) {
            // 按时间降序排列每组中的备份
            backups.sort((a, b) => b.date.getTime() - a.date.getTime());

            // 尝试获取画板标题
            let title = "原文档已删除";
            try {
                const blockData = await api.getBlockByID(drawingId);
                if (blockData) {
                    title =
                        blockData.content ||
                        `画板-${drawingId.substring(0, 8)}`;

                    // 更新每个备份文件的标题
                    backups.forEach((backup) => {
                        backup.title = title;
                    });
                }
            } catch (err) {
                console.warn(`获取画板 ${drawingId} 的标题失败:`, err);
            }

            groups.push({
                drawingId,
                title,
                backups,
            });
        }

        // 按最新备份时间排序分组
        drawingGroups = groups.sort((a, b) => {
            const latestA = a.backups[0]?.date.getTime() || 0;
            const latestB = b.backups[0]?.date.getTime() || 0;
            return latestB - latestA;
        });
    }

    // 格式化日期显示
    function formatDate(date: Date): string {
        return date.toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    function updatePreviewState(path: string, state: Partial<PreviewMeta>) {
        previewStates = {
            ...previewStates,
            [path]: {
                loading: false,
                data: state.data ?? previewStates[path]?.data,
                error: state.error ?? previewStates[path]?.error,
                open: state.open ?? previewStates[path]?.open ?? false,
                ...state,
            },
        };
    }

    // helper to compute bounds of shapes array
    function computeBounds(
        shapes: Array<{ x: number; y: number; w: number; h: number }>,
    ) {
        if (!shapes || shapes.length === 0)
            return {
                minX: 0,
                minY: 0,
                maxX: 300,
                maxY: 200,
                width: 300,
                height: 200,
            };
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const s of shapes) {
            const left = (typeof s.x === "number" ? s.x : 0) - (s.w || 0) / 2;
            const top = (typeof s.y === "number" ? s.y : 0) - (s.h || 0) / 2;
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + (s.w || 0));
            maxY = Math.max(maxY, top + (s.h || 0));
        }
        // fallback if degenerate
        if (
            !isFinite(minX) ||
            !isFinite(minY) ||
            !isFinite(maxX) ||
            !isFinite(maxY)
        )
            return {
                minX: 0,
                minY: 0,
                maxX: 300,
                maxY: 200,
                width: 300,
                height: 200,
            };
        const width = Math.max(maxX - minX, 1);
        const height = Math.max(maxY - minY, 1);
        return { minX, minY, maxX, maxY, width, height };
    }

    // scale shape into a 300x200 box with padding
    function scaleShape(
        shape: { x: number; y: number; w: number; h: number },
        shapes: any[],
    ) {
        const bounds = computeBounds(shapes as any);
        const viewW = 300 - 8; // padding
        const viewH = 200 - 8;
        const pad = 4;
        const sx = viewW / bounds.width;
        const sy = viewH / bounds.height;
        const sScale = Math.min(sx, sy);
        const tx = -bounds.minX * sScale + pad;
        const ty = -bounds.minY * sScale + pad;
        // shapes use center-based x/y in tldraw; transform to top-left for display
        const cx = shape.x || 0;
        const cy = shape.y || 0;
        const w = shape.w || 100;
        const h = shape.h || 60;
        const left = cx - w / 2;
        const top = cy - h / 2;
        return {
            x: left * sScale + tx,
            y: top * sScale + ty,
            w: Math.max(w * sScale, 1),
            h: Math.max(h * sScale, 1),
        };
    }

    async function togglePreview(path: string) {
        const current = previewStates[path];
        if (current?.open) {
            updatePreviewState(path, { open: false });
            return;
        }

        updatePreviewState(path, {
            loading: true,
            open: true,
            error: undefined,
        });

        try {
            const raw = await api.getFile(path);
            if (!raw) {
                throw new Error("备份文件为空");
            }
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            const doc = parsed?.document ?? parsed;

            // collect pages
            let pageEntries: any[] = [];
            if (doc?.pages && typeof doc.pages === "object") {
                pageEntries = Object.values(doc.pages);
            } else if (Array.isArray(doc?.pageStates)) {
                pageEntries = doc.pageStates;
            } else if (doc?.store && typeof doc.store === "object") {
                pageEntries = Object.entries(doc.store)
                    .filter(
                        ([k]) => typeof k === "string" && k.startsWith("page:"),
                    )
                    .map(([, v]) => v);
            } else if (doc?.session && Array.isArray(doc.session.pageStates)) {
                pageEntries = doc.session.pageStates;
            }

            // collect shapes
            let shapeEntries: Array<[string, any]> = [];
            if (doc?.shapes && typeof doc.shapes === "object") {
                shapeEntries = Object.entries(doc.shapes);
            } else if (doc?.store && typeof doc.store === "object") {
                shapeEntries = Object.entries(doc.store).filter(([k, v]) => {
                    if (typeof k === "string" && k.startsWith("shape:"))
                        return true;
                    const vv: any = v;
                    return !!(
                        vv &&
                        (vv.type === "shape" ||
                            vv.typeName === "shape" ||
                            typeof vv.type === "string")
                    );
                });
            }

            const pageNames = pageEntries
                .slice(0, 3)
                .map(
                    (page: any) =>
                        page?.name || page?.title || page?.id || "Page",
                );
            const shapeSamples = shapeEntries.slice(0, 3).map(([id, shape]) => {
                const type =
                    (shape && (shape.type || shape.typeName)) ||
                    (typeof id === "string" ? id.split(":")[0] : "shape");
                const label =
                    shape?.props?.name ||
                    shape?.props?.text ||
                    shape?.props?.label ||
                    shape?.name ||
                    "";
                return `${type}${label ? ` (${label})` : ""}`;
            });

            const shapeCount =
                shapeEntries.length ||
                pageEntries.reduce<number>(
                    (sum, page: any) =>
                        sum +
                        (Array.isArray(page?.shapes) ? page.shapes.length : 0),
                    0,
                );

            // Try to use datamanager's getBackupPreview for richer data when available.
            // We already computed shape/page arrays above, but to avoid re-implementing grouping here
            // we can call the helper function (if exists). However, still build pagePreviews locally
            // in case datamanager hasn't provided that info in older versions.

            // Build small pagePreviews (if present in the parsed doc via `store` layout we parsed earlier)
            const pagePreviews = [];
            // When doc.store layout exists we can reconstruct shape objects with x,y,w,h
            // Gather shape map
            const shapeMap = new Map<string, any>();
            shapeEntries.forEach(([id, shape]) =>
                shapeMap.set(typeof id === "string" ? id : shape?.id, shape),
            );

            const pageList = pageEntries.length
                ? pageEntries
                : [{ id: "page:page", name: "Page 1" }];
            for (const p of pageList) {
                const pid = p?.id ?? p?.pageId ?? "page:page";
                const shapesHere = [];
                for (const [sid, s] of shapeMap.entries()) {
                    try {
                        const parent = s?.parentId ?? s?.parent ?? null;
                        if (
                            !parent ||
                            parent === pid ||
                            parent === "page:page"
                        ) {
                            const px =
                                typeof s?.x === "number"
                                    ? s.x
                                    : (s?.props?.x ?? 0);
                            const py =
                                typeof s?.y === "number"
                                    ? s.y
                                    : (s?.props?.y ?? 0);
                            const w =
                                Number(
                                    s?.props?.w ??
                                        s?.props?.width ??
                                        s?.width ??
                                        0,
                                ) || 0;
                            const h =
                                Number(
                                    s?.props?.h ??
                                        s?.props?.height ??
                                        s?.height ??
                                        0,
                                ) || 0;
                            shapesHere.push({
                                id: sid,
                                type:
                                    s?.type ||
                                    s?.typeName ||
                                    sid?.split(":")?.[0] ||
                                    "shape",
                                x: px,
                                y: py,
                                w: w > 0 ? w : 100,
                                h: h > 0 ? h : 60,
                            });
                        }
                    } catch (e) {
                        // ignore
                    }
                }
                pagePreviews.push({
                    id: pid,
                    name: p?.name || p?.title || pid,
                    shapes: shapesHere,
                });
            }

            updatePreviewState(path, {
                loading: false,
                data: {
                    shapeCount,
                    pageCount: pageEntries.length,
                    pageNames,
                    shapeSamples,
                    pagePreviews,
                },
            });
        } catch (error) {
            console.error("加载备份预览失败", error);
            updatePreviewState(path, {
                loading: false,
                error: (error as Error).message || "预览失败",
            });
        }
    }

    // 下载备份文件
    async function downloadBackup(path: string, name: string) {
        try {
            const data = await api.getFile(path);
            if (!data) {
                throw new Error("备份文件内容为空");
            }

            // 如果 data 是对象，则序列化为 JSON 字符串
            let fileData: BlobPart;
            if (typeof data === "object" && !(data instanceof Blob)) {
                fileData = JSON.stringify(data, null, 2);
            } else {
                fileData = data;
            }
            const blob = new Blob([fileData], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);

            showMessage("备份文件下载成功");
        } catch (error) {
            console.error("下载备份文件失败:", error);
            showMessage("下载备份文件失败");
        }
    }

    // 恢复备份到原始画板
    async function restoreBackup(
        path: string,
        filename: string,
        drawingId: string,
        title: string,
    ) {
        const confirmed = confirm(
            `确定要将此备份${filename}恢复到画板 "${title || drawingId}" 吗？这将覆盖当前画板数据。`,
        );
        if (!confirmed) return;
        console.debug("恢复备份:", drawingId);
        const result = await WhiteboardFileManager.restoreBackupFile(
            path,
            drawingId,
        );
        if (result.success) {
            showMessage(`备份已恢复到画板 ${title || drawingId}`);
        }
        api.refresh();
    }

    // 删除备份
    async function deleteBackup(path: string, filename: string) {
        const confirmed = confirm(
            `确定要删除备份 ${filename} 吗？此操作不可撤销。`,
        );
        if (!confirmed) return;

        const result = await WhiteboardFileManager.deleteBackupFile(path);
        if (result.success) {
            showMessage("备份文件已删除");
            loadBackups();
        } else {
            showMessage("删除备份文件失败: " + result.error);
        }
    }

    // 生命周期钩子
    onMount(() => {
        loadBackups();

        // 每30秒自动刷新一次备份列表
        refreshInterval = window.setInterval(loadBackups, 30000);
    });

    async function deleteDrawingBackups(group: DrawingGroup) {
        const count = group.backups.length;
        const title = group.title || group.drawingId;

        const confirmed = confirm(
            `确定要删除画板 "${title}" 的全部 ${count} 个备份吗？此操作不可撤销。`,
        );
        if (!confirmed) return;

        let deleted = 0;
        let failed = 0;

        for (const backup of group.backups) {
            const result = await WhiteboardFileManager.deleteBackupFile(
                backup.path,
            );
            if (result.success) {
                deleted++;
            } else {
                failed++;
            }
        }

        if (failed === 0) {
            showMessage(`已删除 ${deleted} 个备份`);
        } else {
            showMessage(`已删除 ${deleted} 个备份，失败 ${failed} 个`);
        }
        loadBackups();
    }

    onDestroy(() => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });
</script>

<div class="tldraw-backup-manager">
    <div class="backup-header">
        <h3>画板备份管理</h3>
        <div class="backup-controls">
            <!-- 搜索框 -->
            <div class="search-container">
                <input
                    type="text"
                    class="b3-text-field"
                    placeholder="搜索画板标题或ID..."
                    bind:value={searchQuery}
                />
            </div>

            <button class="b3-button" on:click={loadBackups}>
                <svg class="b3-icon"><use xlink:href="#iconRefresh"></use></svg>
                刷新列表
            </button>
        </div>
    </div>

    <div class="backup-list-container">
        {#if loading}
            <div class="loading-indicator">加载中...</div>
        {:else if drawingGroups.length === 0}
            <div class="empty-state">暂无备份文件</div>
        {:else if filteredGroups.length === 0}
            <div class="empty-state">未找到匹配的画板</div>
        {:else}
            {#each filteredGroups as group}
                <div class="drawing-group">
                    <div class="group-header">
                        <h4 class="group-title">
                            {group.title ||
                                `画板-${group.drawingId.substring(0, 8)}`}
                        </h4>
                        <div class="group-id">{group.drawingId}</div>
                        <button
                            class="b3-button b3-button--outline b3-button--error"
                            on:click={() => deleteDrawingBackups(group)}
                            title="删除该画板的全部备份"
                        >
                            删除该画板全部备份
                        </button>
                    </div>

                    <table class="backup-list">
                        <thead>
                            <tr>
                                <th>备份时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each group.backups as file}
                                <tr>
                                    <td>{formatDate(file.date)}</td>
                                    <td class="backup-actions">
                                        <button
                                            class="b3-button b3-button--outline"
                                            on:click={() =>
                                                restoreBackup(
                                                    file.path,
                                                    file.name,
                                                    group.drawingId,
                                                    group.title,
                                                )}
                                        >
                                            恢复到此画板
                                        </button>
                                        <button
                                            class="b3-button b3-button--outline"
                                            on:click={() =>
                                                downloadBackup(
                                                    file.path,
                                                    file.name,
                                                )}
                                        >
                                            下载
                                        </button>
                                        <button
                                            class="b3-button b3-button--outline"
                                            on:click={() =>
                                                togglePreview(file.path)}
                                        >
                                            {previewStates[file.path]?.open
                                                ? "隐藏预览"
                                                : "预览"}
                                        </button>
                                        <button
                                            class="b3-button b3-button--outline b3-button--error"
                                            on:click={() =>
                                                deleteBackup(
                                                    file.path,
                                                    file.name,
                                                )}
                                        >
                                            删除
                                        </button>
                                    </td>
                                </tr>
                                {#if previewStates[file.path]?.open}
                                    <tr class="preview-row">
                                        <td colspan="2">
                                            {#if previewStates[file.path].loading}
                                                <div class="preview-loading">
                                                    加载中...
                                                </div>
                                            {:else if previewStates[file.path].error}
                                                <div class="preview-error">
                                                    {previewStates[file.path]
                                                        .error}
                                                </div>
                                            {:else}
                                                <div class="preview-grid">
                                                    <div>
                                                        <strong>页数</strong>: {previewStates[
                                                            file.path
                                                        ].data?.pageCount ?? 0}
                                                    </div>
                                                    <div>
                                                        <strong>形状数量</strong
                                                        >: {previewStates[
                                                            file.path
                                                        ].data?.shapeCount ?? 0}
                                                    </div>
                                                    <div>
                                                        <strong>页面</strong>: {previewStates[
                                                            file.path
                                                        ].data?.pageNames.join(
                                                            ", ",
                                                        ) || "无"}
                                                    </div>
                                                    <div>
                                                        <strong>示例形状</strong
                                                        >: {previewStates[
                                                            file.path
                                                        ].data?.shapeSamples.join(
                                                            ", ",
                                                        ) || "无"}
                                                    </div>

                                                    {#if previewStates[file.path].data?.pagePreviews?.length}
                                                        <div class="thumbnails">
                                                            {#each previewStates[file.path].data.pagePreviews as page, i}
                                                                <div
                                                                    class="thumbnail-card"
                                                                >
                                                                    <div
                                                                        class="thumbnail-title"
                                                                    >
                                                                        {page.name ||
                                                                            `Page ${i + 1}`}
                                                                    </div>
                                                                    <svg
                                                                        viewBox="0 0 300 200"
                                                                        class="thumbnail-svg"
                                                                        preserveAspectRatio="xMidYMid meet"
                                                                    >
                                                                        {#if page.shapes && page.shapes.length}
                                                                            {#each page.shapes as s}
                                                                                <rect
                                                                                    x={scaleShape(
                                                                                        s,
                                                                                        page.shapes,
                                                                                    )
                                                                                        .x}
                                                                                    y={scaleShape(
                                                                                        s,
                                                                                        page.shapes,
                                                                                    )
                                                                                        .y}
                                                                                    width={scaleShape(
                                                                                        s,
                                                                                        page.shapes,
                                                                                    )
                                                                                        .w}
                                                                                    height={scaleShape(
                                                                                        s,
                                                                                        page.shapes,
                                                                                    )
                                                                                        .h}
                                                                                    rx="3"
                                                                                    ry="3"
                                                                                    fill="rgba(20,120,220,0.08)"
                                                                                    stroke="rgba(20,120,220,0.6)"
                                                                                    stroke-width="1"
                                                                                />
                                                                            {/each}
                                                                            <!-- page border -->
                                                                            <rect
                                                                                x="0.5"
                                                                                y="0.5"
                                                                                width="299"
                                                                                height="199"
                                                                                fill="none"
                                                                                stroke="rgba(0,0,0,0.06)"
                                                                            />
                                                                        {:else}
                                                                            <rect
                                                                                x="20"
                                                                                y="20"
                                                                                width="260"
                                                                                height="160"
                                                                                fill="rgba(0,0,0,0.02)"
                                                                                stroke="rgba(0,0,0,0.03)"
                                                                            />
                                                                        {/if}
                                                                    </svg>
                                                                </div>
                                                            {/each}
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/if}
                                        </td>
                                    </tr>
                                {/if}
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/each}
        {/if}
    </div>
</div>

<style>
    .tldraw-backup-manager {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }

    .backup-header {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 8px 8px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .backup-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
    }

    .search-container {
        position: relative;
        flex-grow: 1;
    }

    .search-container input {
        width: 100%;
        padding-right: 30px;
    }

    /* .search-icon {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--b3-theme-on-surface-light);
    } */

    .backup-list-container {
        flex: 1;
        overflow: auto;
        padding: 8px;
    }

    .drawing-group {
        margin-bottom: 20px;
        background-color: var(--b3-theme-background);
        border-radius: 4px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .group-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        padding: 8px 16px;
        background-color: var(--b3-theme-surface-light);
        border-bottom: 1px solid var(--b3-border-color);
        border-radius: 4px 4px 0 0;
    }

    .group-title {
        margin: 0;
        font-size: 1.1em;
        font-weight: 500;
        margin-right: 16px;
    }

    .group-id {
        color: var(--b3-theme-on-surface-light);
        font-size: 0.9em;
        margin-right: auto;
    }

    .backup-list {
        width: 100%;
        border-collapse: collapse;
    }

    .backup-list th,
    .backup-list td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .backup-actions {
        display: flex;
        gap: 8px;
    }

    .preview-row {
        background: var(--b3-theme-surface);
    }

    .preview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        padding: 8px 0;
        font-size: 0.88em;
    }

    .thumbnails {
        display: flex;
        gap: 12px;
        margin-top: 8px;
        flex-wrap: wrap;
    }

    .thumbnail-card {
        width: 180px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: var(--b3-theme-surface-light);
        padding: 6px;
        border-radius: 6px;
        border: 1px solid rgba(0, 0, 0, 0.04);
    }

    .thumbnail-title {
        font-size: 0.8em;
        color: var(--b3-theme-on-surface-light);
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
    }

    .thumbnail-svg {
        width: 100%;
        height: 120px;
        background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.01),
            rgba(0, 0, 0, 0.02)
        );
        border-radius: 4px;
    }

    .preview-loading,
    .preview-error {
        padding: 8px 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 0.9em;
    }

    .loading-indicator,
    .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100px;
        color: var(--b3-theme-on-surface);
    }

    .b3-button--error {
        color: var(--b3-theme-error);
    }

    h3 {
        margin: 0;
    }
</style>
