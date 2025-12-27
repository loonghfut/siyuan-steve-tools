<script lang="ts">
    import { onMount } from 'svelte';
    import { showMessage } from 'siyuan';
    import { api } from "@frostime/siyuan-plugin-kits";
    import { triggerWhiteboardsRefresh } from '../whiteboards.store';
    import { closeTab } from '../tldraw-instance-manager';

    interface WhiteboardFile {
        name: string;       // 文件名 e.g., tldraw-data-2023...-xxxxxxx.json
        path: string;       // 文件完整路径
        drawingId: string;  // 提取出的画板ID (块ID)
        exists: boolean | null; // 对应的块是否存在 (null表示检查中)
        checking: boolean; // 是否正在检查块存在性
        associatedDocTitle: string | null; // 附属文档标题
    }

    let allWhiteboardFiles: WhiteboardFile[] = [];
    let displayedFiles: WhiteboardFile[] = [];
    let loading = true;
    let searchQuery: string = '';
    let showOnlyOrphaned = true; // 默认只显示无附属的

    // 加载并检查白板文件
    async function loadAndCheckWhiteboards() {
        loading = true;
        allWhiteboardFiles = []; // 清空旧列表
        displayedFiles = [];
        try {
            const files = await api.readDir('/data/storage/petal/sttools/');
            const whiteboardDataFiles = files.filter(file =>
                file.isDir === false &&
                file.name.endsWith('.json') &&
                file.name.startsWith('tldraw-data-')
            );

            if (whiteboardDataFiles.length === 0) {
                allWhiteboardFiles = [];
                applyFilters();
                return;
            }

            // 初始化文件列表
            allWhiteboardFiles = whiteboardDataFiles.map(file => {
                const drawingId = extractDrawingId(file.name);
                return {
                    name: file.name,
                    path: `/data/storage/petal/sttools/${file.name}`,
                    drawingId: drawingId,
                    exists: null,
                    checking: true,
                    associatedDocTitle: null, // 初始化标题为 null
                };
            });

            applyFilters(); // 先显示列表，状态为检查中

            // 并行检查所有白板ID对应的块是否存在并获取文档标题
            const checkPromises = allWhiteboardFiles.map(async (file) => {
                if (file.drawingId === '未知画板') {
                    file.exists = false;
                    file.checking = false;
                    file.associatedDocTitle = '无效ID';
                    return;
                }
                try {
                    const block = await api.getBlockByID(file.drawingId);
                    if (block) {
                        file.exists = true;
                        // 尝试获取文档标题
                        if (block.root_id) {
                            try {
                                const docBlock = await api.getBlockByID(block.root_id);
                                // 文档块的标题通常存储在 content 字段
                                file.associatedDocTitle = docBlock?.content || '获取标题失败';
                            } catch (docError) {
                                console.warn(`获取文档 ${block.root_id} 标题失败:`, docError);
                                file.associatedDocTitle = '获取标题出错';
                            }
                        } else {
                            file.associatedDocTitle = '无根文档ID'; // 可能吗？
                        }
                    } else {
                        file.exists = false;
                        file.associatedDocTitle = '无'; // 明确无附属
                    }
                } catch (error) {
                    // getBlockByID 在找不到块时可能会抛出错误或返回null/undefined
                    // console.warn(`检查块 ${file.drawingId} 时出错:`, error);
                    // 假设找不到块的错误意味着它不存在
                    file.exists = false;
                    file.associatedDocTitle = '无'; // 明确无附属
                } finally {
                    file.checking = false; // 标记检查完成
                    // 触发UI更新（如果需要实时更新）
                    displayedFiles = [...displayedFiles];
                }
            });

            await Promise.all(checkPromises);
            // 所有检查完成后，再次应用过滤器确保状态正确
            applyFilters();

        } catch (error) {
            console.error('加载白板列表失败:', error);
            showMessage('加载白板列表失败', 5000, 'error');
            allWhiteboardFiles = [];
            applyFilters();
        } finally {
            loading = false;
            // 确保所有检查状态都更新
            allWhiteboardFiles.forEach(f => f.checking = false);
            applyFilters(); // 最后再刷新一次确保UI正确
        }
    }

    // 提取画板ID
    function extractDrawingId(filename: string): string {
        // 匹配 tldraw-data-ID.json
        const match = filename.match(/^tldraw-data-(.+)\.json$/);
        // ID 格式通常是 2023...-xxxxxxx
        const idPattern = /^\d{14}-\w{7}$/;
        if (match && match[1] && idPattern.test(match[1])) {
            return match[1];
        }
        return '未知画板';
    }

    // 应用搜索和视图过滤
    function applyFilters() {
        let filtered = allWhiteboardFiles;

        // 1. 应用视图过滤器 (仅无附属 / 全部)
        if (showOnlyOrphaned) {
            // 只显示明确检查后不存在的，或者检查中但ID无效的
            filtered = filtered.filter(file => file.exists === false || (file.checking && file.drawingId === '未知画板'));
        }

        // 2. 应用搜索过滤器
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(file =>
                file.drawingId.toLowerCase().includes(query) ||
                file.name.toLowerCase().includes(query) || // 保留文件名搜索
                (file.associatedDocTitle && file.associatedDocTitle.toLowerCase().includes(query)) // 添加标题搜索
            );
        }

        // 按最后修改时间降序排序 (如果需要，需要获取文件mtime)
        // 暂时不排序

        displayedFiles = filtered;
    }

    // 监听搜索查询和视图切换的变化
    $: {
        searchQuery; // Svelte reactivity trigger
        showOnlyOrphaned; // Svelte reactivity trigger
        if (!loading) { // 避免在加载时触发过滤
             applyFilters();
        }
    }

    // 删除无附属白板的数据文件
    async function deleteOrphanedData(file: WhiteboardFile) {
        if (file.exists !== false) {
            showMessage('只能删除确认无附属的白板数据', 3000, 'error');
            return;
        }
        const confirmed = confirm(`确定要删除无附属白板 ${file.drawingId} 的数据文件 ${file.name} 吗？\n此操作不可撤销，且白板内容将永久丢失。`);
        if (!confirmed) return;

        try {
            // 关闭此白板的页签（如果存在），这将自动触发销毁回调
            closeTab(file.drawingId, 'user-delete');

            // 再删除白板文件
            await api.removeFile(file.path);
            showMessage(`已删除数据文件: ${file.name}`);
            // 从列表中移除已删除的文件
            allWhiteboardFiles = allWhiteboardFiles.filter(f => f.path !== file.path);
            applyFilters(); // 重新应用过滤器刷新列表
            // 触发白板卡片栏/已打开画板实例更新
            triggerWhiteboardsRefresh('delete', file.name, file.drawingId);

            // 为了应对 tldraw 的自动保存竞争问题，延迟 2 秒再尝试一次删除
            // 如果自动保存在同时写回文件，第二次删除会把它彻底移除
            setTimeout(async () => {
                try {
                    // 再次尝试删除（若文件已不存在则忽略错误）
                    await api.removeFile(file.path);
                    // 再次触发更新，确保所有打开的实例和列表都同步
                    triggerWhiteboardsRefresh('delete', file.name, file.drawingId);
                } catch (e) {
                    // 如果第二次删除失败，记录日志但不打扰用户
                    console.debug('延迟删除重试失败（可能已被移除）:', file.path, e);
                }
            }, 2000);
        } catch (error) {
            console.error(`删除文件 ${file.path} 失败:`, error);
            showMessage('删除数据文件失败', 5000, 'error');
        }
    }


     // 下载数据文件
    async function downloadData(path: string, name: string) {
        try {
            const data = await api.getFile(path); // getFile 现在应该能正确处理 Blob
            if (!data) {
                throw new Error('文件内容为空');
            }

            let blob: Blob;
            if (data instanceof Blob) {
                blob = data;
            } else if (typeof data === 'object') {
                 // 如果返回的是JSON对象，需要序列化
                const jsonData = JSON.stringify(data, null, 2);
                blob = new Blob([jsonData], { type: 'application/json' });
            }
             else if (typeof data === 'string') {
                 blob = new Blob([data], { type: 'application/octet-stream' }); // 或者根据实际内容调整类型
             }
            else {
                 throw new Error('无法处理的文件数据类型');
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);

            showMessage('数据文件下载成功');
        } catch (error) {
            console.error('下载数据文件失败:', error);
            showMessage(`下载数据文件失败: ${error.message}`, 5000, 'error');
        }
    }


    onMount(() => {
        loadAndCheckWhiteboards();
    });

</script>

<div class="orphan-manager">
    <div class="manager-header">
        <div class="title-switch-group"> <!-- 包裹元素 -->
            <h3 on:click={() => showOnlyOrphaned = !showOnlyOrphaned} style="cursor: pointer;" title="点击切换视图">
            {showOnlyOrphaned ? '无附属白板管理' : '所有白板管理'}
            </h3>
        </div>
        <div class="controls">
            <div class="search-container">
                <input
                    type="text"
                    class="b3-text-field"
                    placeholder="搜索白板ID、文件名或文档标题..."
                    bind:value={searchQuery}
                />
            </div>
            <button class="b3-button" on:click={loadAndCheckWhiteboards} title="刷新列表">
                <svg class="b3-icon"><use xlink:href="#iconRefresh"></use></svg>
                刷新
            </button>
        </div>
    </div>

    <div class="list-container">
        {#if loading && displayedFiles.length === 0}
            <div class="loading-indicator">加载并检查白板文件中...</div>
        {:else if allWhiteboardFiles.length === 0 && !loading}
             <div class="empty-state">未找到任何白板数据文件。</div>
        {:else if displayedFiles.length === 0 && !loading}
            <div class="empty-state">
                {#if showOnlyOrphaned}
                    { searchQuery ? '未找到匹配的无附属白板' : '没有发现无附属白板文件' }
                {:else}
                    { searchQuery ? '未找到匹配的白板文件' : '列表为空' }
                {/if}
            </div>
        {:else}
            <table class="b3-table">
                <thead>
                    <tr>
                        <th>白板 ID</th>
                        <th>附属文档标题</th>
                        <th>状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {#each displayedFiles as file (file.path)}
                        <tr>
                            <td>{file.drawingId}</td>
                            <td>
                                {#if file.checking}
                                    <span class="status-checking">查询中...</span>
                                {:else}
                                    {file.associatedDocTitle || '未知'}
                                {/if}
                            </td>
                            <td>
                                {#if file.checking}
                                    <span class="status-checking">检查中...</span>
                                {:else if file.exists === true}
                                    <span class="status-exists">存在</span>
                                {:else if file.exists === false}
                                    <span class="status-orphaned">无附属</span>
                                {:else}
                                    <span class="status-unknown">状态未知</span>
                                {/if}
                            </td>
                            <td class="actions">
                                 <button
                                    class="b3-button b3-button--outline"
                                    on:click={() => downloadData(file.path, file.name)}
                                    title="下载此白板的数据文件 ({file.name})"
                                >
                                    下载数据
                                </button>
                                {#if file.exists === false && !file.checking}
                                    <button
                                        class="b3-button b3-button--outline b3-button--error"
                                        on:click={() => deleteOrphanedData(file)}
                                        title="删除此无附属白板的数据文件 ({file.name})"
                                    >
                                        删除数据
                                    </button>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        {/if}
    </div>
</div>

<style>
/* ... existing styles ... */
    .orphan-manager {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 10px;
        box-sizing: border-box;
    }
    .manager-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--b3-border-color);
        margin-bottom: 10px;
    }
    .manager-header h3 {
        margin: 0;
    }
    .controls {
        display: flex;
        align-items: center;
        gap: 10px; /* Use gap for spacing */
    }
    .search-container {
        /* Adjust width as needed */
        min-width: 250px; /* Increased width for longer placeholder */
    }
    .list-container {
        flex-grow: 1;
        overflow-y: auto;
    }
    .b3-table {
        width: 100%;
        border-collapse: collapse;
    }
    .b3-table th, .b3-table td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid var(--b3-border-color);
        vertical-align: middle; /* Align cell content vertically */
    }
     .b3-table th {
        background-color: var(--b3-theme-surface-light);
        font-weight: 500;
        white-space: nowrap; /* Prevent header text wrapping */
    }
    .actions {
        display: flex;
        gap: 5px; /* Spacing between buttons */
        flex-wrap: nowrap; /* Prevent buttons from wrapping */
    }
    .actions button {
        white-space: nowrap; /* Prevent button text wrapping */
    }
    .loading-indicator, .empty-state {
        text-align: center;
        padding: 20px;
        color: var(--b3-theme-on-surface);
    }
    .status-checking {
        color: var(--b3-theme-on-surface-light);
        font-style: italic;
    }
    .status-exists {
        color: var(--b3-theme-primary); /* Or a green color */
    }
    .status-orphaned {
        color: var(--b3-theme-error); /* Or an orange/red color */
        font-weight: bold;
    }
    .status-unknown {
         color: var(--b3-theme-on-surface-light);
    }

    /* Ensure buttons fit well */
    .b3-button {
        padding: 4px 8px; /* Smaller padding for table buttons */
        font-size: 0.9em;
    }
    .b3-button svg {
        margin-right: 4px;
    }
</style>
