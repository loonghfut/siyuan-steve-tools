<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let group: string;
  export let key: string;
  export let value: any; // 格式: "名称1|URL1\n名称2|URL2"
  export let columns: string[] = ['名称', 'URL']; // 列配置
  export let separator: string = '|'; // 分隔符
  export let placeholder: string = ''; // 输入框占位符
  
  const dispatch = createEventDispatcher();
  
  type Row = string[];
  let rows: Row[] = [];
  
  // 解析初始值
  function parseInitial(): Row[] {
    if (!value) return [];
    const lines = String(value).split(/\r?\n/);
    const result: Row[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const parts = trimmed.split(separator);
      const row: Row = [];
      for (let i = 0; i < columns.length; i++) {
        row.push(parts[i]?.trim() || '');
      }
      result.push(row);
    }
    
    return result;
  }
  
  // 生成输出值
  function emitChange() {
    const lines = rows
      .filter(row => row.some(cell => cell.trim()))
      .map(row => row.join(separator));
    const newValue = lines.join('\n');
    value = newValue;
    dispatch('changed', { group, key, value: newValue });
  }
  
  // 添加新行
  function addRow() {
    const newRow: Row = [];
    for (let i = 0; i < columns.length; i++) {
      newRow.push('');
    }
    rows = [...rows, newRow];
  }
  
  // 删除行
  function removeRow(index: number) {
    rows = rows.filter((_, i) => i !== index);
    emitChange();
  }
  
  // 更新单元格
  function updateCell(rowIndex: number, colIndex: number, newValue: string) {
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = newValue;
    rows = [...rows];
    emitChange();
  }
  
  // 移动行
  function moveRow(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= rows.length) return;
    const newRows = [...rows];
    const [movedRow] = newRows.splice(fromIndex, 1);
    newRows.splice(toIndex, 0, movedRow);
    rows = newRows;
    emitChange();
  }
  
  // 初始化
  import { onMount } from 'svelte';
  
  onMount(() => {
    rows = parseInitial();
    if (rows.length === 0) {
      addRow();
    }
  });
</script>

<div class="list-editor">
  <div class="table-container">
    <table class="b3-table">
      <thead>
        <tr>
          {#each columns as column, colIndex}
            <th>{column}</th>
          {/each}
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, rowIndex}
          <tr>
            {#each row as cell, colIndex}
              <td>
                <input
                  class="b3-text-field"
                  placeholder={placeholder || `输入${columns[colIndex] || '内容'}`}
                  value={cell}
                  on:input={(e) => updateCell(rowIndex, colIndex, e.currentTarget.value)}
                />
              </td>
            {/each}
            <td class="actions-cell">
              <div class="row-actions">
                <button 
                  class="b3-button b3-button--outline b3-button--small"
                  on:click={() => moveRow(rowIndex, rowIndex - 1)}
                  disabled={rowIndex === 0}
                  title="上移"
                >
                  ↑
                </button>
                <button 
                  class="b3-button b3-button--outline b3-button--small"
                  on:click={() => moveRow(rowIndex, rowIndex + 1)}
                  disabled={rowIndex === rows.length - 1}
                  title="下移"
                >
                  ↓
                </button>
                <button 
                  class="b3-button b3-button--outline b3-button--small b3-button--error"
                  on:click={() => removeRow(rowIndex)}
                  title="删除"
                >
                  ×
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  
  <div class="actions">
    <button class="b3-button" on:click={addRow}>
      添加一行
    </button>
  </div>
  
  <div class="preview-section">
    <div class="preview-label">数据预览：</div>
    <div class="preview-content">
      {#each rows.filter(row => row.some(cell => cell.trim())) as row, index}
        <div class="preview-row">
          {#each row as cell, colIndex}
            <span class="preview-cell">
              {#if colIndex > 0}
                <span class="preview-separator">{separator}</span>
              {/if}
              {cell || '(空)'}
            </span>
          {/each}
        </div>
      {/each}
      {#if rows.filter(row => row.some(cell => cell.trim())).length === 0}
        <div class="preview-empty">暂无数据</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .list-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .table-container {
    overflow-x: auto;
  }
  
  .b3-table {
    width: 100%;
    border-collapse: collapse;
  }
  
  .b3-table th,
  .b3-table td {
    padding: 8px;
    border: 1px solid var(--b3-border-color);
    text-align: left;
  }
  
  .b3-table th {
    background: var(--b3-theme-background);
    font-weight: 600;
  }
  
  .b3-table input {
    width: 100%;
    box-sizing: border-box;
  }
  
  .actions-cell {
    width: 120px;
  }
  
  .row-actions {
    display: flex;
    gap: 4px;
  }
  
  .b3-button--small {
    padding: 2px 6px;
    font-size: 12px;
    min-width: 24px;
  }
  
  .actions {
    display: flex;
    justify-content: flex-start;
  }
  
  .preview-section {
    margin-top: 12px;
    padding: 12px;
    background: var(--b3-theme-background);
    border-radius: 8px;
    border: 1px solid var(--b3-border-color);
  }
  
  .preview-label {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    margin-bottom: 8px;
  }
  
  .preview-content {
    font-family: monospace;
    font-size: 12px;
  }
  
  .preview-row {
    margin-bottom: 4px;
  }
  
  .preview-cell {
    display: inline;
  }
  
  .preview-separator {
    color: var(--b3-theme-on-surface-light);
    margin: 0 2px;
  }
  
  .preview-empty {
    color: var(--b3-theme-on-surface-light);
    font-style: italic;
  }
</style>