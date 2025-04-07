<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as tldata from './datamanager';
    import { showMessage } from 'siyuan';
    import * as api from '@/api';

    // 添加搜索关键词
    let searchQuery: string = '';
    
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

    // 加载备份文件列表
    async function loadBackups() {
        loading = true;
        try {
            const files = await tldata.getBackupList();
            
            // 处理文件列表，提取画板ID
            backupFiles = files.map(file => {
                const drawingId = extractDrawingId(file.name);
                return {
                    ...file,
                    drawingId
                };
            });
            
            // 按画板ID分组
            await groupBackupsByDrawingId();
            // 初始显示所有分组
            filteredGroups = [...drawingGroups];
        } catch (error) {
            console.error('加载备份列表失败:', error);
            showMessage('加载备份列表失败');
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
        filteredGroups = drawingGroups.filter(group => 
            group.title?.toLowerCase().includes(query) || 
            group.drawingId.toLowerCase().includes(query)
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
        backupFiles.forEach(file => {
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
            let title = '未命名画板';
            try {
                const blockData = await api.getBlockByID(drawingId);
                if (blockData) {
                    title = blockData.content || `画板-${drawingId.substring(0, 8)}`;
                    
                    // 更新每个备份文件的标题
                    backups.forEach(backup => {
                        backup.title = title;
                    });
                }
            } catch (err) {
                console.warn(`获取画板 ${drawingId} 的标题失败:`, err);
            }
            
            groups.push({
                drawingId,
                title,
                backups
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
        return date.toLocaleString('zh-CN', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    }
    
    // 提取画板ID
    function extractDrawingId(filename: string): string {
        // Match IDs like 20250308145324-1pyvr3u
        const match = filename.match(/tldraw-data-([\d]+-[a-zA-Z0-9]+)(?:-|\.)/);
        return match ? match[1] : '未知画板';
    }

    // 下载备份文件
    async function downloadBackup(path: string, name: string) {
        try {
            const data = await api.getFile(path);
            if (!data) {
                throw new Error('备份文件内容为空');
            }
            
            const blob = new Blob([data], { type: 'application/json' });
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
            
            showMessage('备份文件下载成功');
        } catch (error) {
            console.error('下载备份文件失败:', error);
            showMessage('下载备份文件失败');
        }
    }

    // 恢复备份到原始画板
    async function restoreBackup(path: string, filename: string, drawingId: string, title: string) {

        const confirmed = confirm(`确定要将此备份${filename}恢复到画板 "${title || drawingId}" 吗？这将覆盖当前画板数据。`);
        if (!confirmed) return;
        console.log('恢复备份:', drawingId);
        const success = await tldata.restoreBackup(path, drawingId);
        if (success) {
            showMessage(`备份已恢复到画板 ${title || drawingId}`);
        }
        api.refresh();
    }

    // 删除备份
    async function deleteBackup(path: string, filename: string) {
        const confirmed = confirm(`确定要删除备份 ${filename} 吗？此操作不可撤销。`);
        if (!confirmed) return;
        
        const success = await tldata.deleteBackup(path);
        if (success) {
            showMessage('备份文件已删除');
            loadBackups();
        } else {
            showMessage('删除备份文件失败');
        }
    }
    
    // 生命周期钩子
    onMount(() => {
        loadBackups();
        
        // 每30秒自动刷新一次备份列表
        refreshInterval = window.setInterval(loadBackups, 30000);
    });
    
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
                >
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
                            {group.title || `画板-${group.drawingId.substring(0, 8)}`}
                        </h4>
                        <div class="group-id">{group.drawingId}</div>
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
                                            on:click={() => restoreBackup(file.path, file.name, group.drawingId, group.title)}
                                        >
                                            恢复到此画板
                                        </button>
                                        <button 
                                            class="b3-button b3-button--outline" 
                                            on:click={() => downloadBackup(file.path, file.name)}
                                        >
                                            下载
                                        </button>
                                        <button 
                                            class="b3-button b3-button--outline b3-button--error" 
                                            on:click={() => deleteBackup(file.path, file.name)}
                                        >
                                            删除
                                        </button>
                                    </td>
                                </tr>
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
    
    .search-icon {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--b3-theme-on-surface-light);
    }
    
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
    
    .backup-list th, .backup-list td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid var(--b3-border-color);
    }
    
    .backup-actions {
        display: flex;
        gap: 8px;
    }
    
    .loading-indicator, .empty-state {
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