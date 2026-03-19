<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let group: string;
  export let key: string;
  export let value: any; // 格式: "标签1=颜色1\n标签2=颜色2"
  
  const dispatch = createEventDispatcher();
  
  type TagColorPair = { tag: string; color: string };
  let pairs: TagColorPair[] = [];
  
  // 预设颜色
  const presetColors = [
    '#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452',
    '#6DC8EC', '#945FB9', '#FF9845', '#1E9493', '#EE6666',
    '#73C0DE', '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC'
  ];
  
  // 解析初始值
  function parseInitial(): TagColorPair[] {
    if (!value) return [];
    const lines = String(value).split(/\r?\n/);
    const result: TagColorPair[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const match = trimmed.split(/[:=]/);
      if (match.length >= 2) {
        const tag = match[0].trim();
        const color = match.slice(1).join('=').trim();
        if (tag && color) {
          result.push({ tag, color });
        }
      }
    }
    
    return result;
  }
  
  // 生成输出值
  function emitChange() {
    const lines = pairs
      .filter(p => p.tag.trim() && p.color.trim())
      .map(p => `${p.tag.trim()}=${p.color.trim()}`);
    const newValue = lines.join('\n');
    value = newValue;
    dispatch('changed', { group, key, value: newValue });
  }
  
  // 添加新行
  function addRow() {
    pairs = [...pairs, { tag: '', color: presetColors[pairs.length % presetColors.length] }];
  }
  
  // 删除行
  function removeRow(index: number) {
    pairs = pairs.filter((_, i) => i !== index);
    emitChange();
  }
  
  // 更新标签
  function updateTag(index: number, newTag: string) {
    pairs[index] = { ...pairs[index], tag: newTag };
    pairs = [...pairs];
    emitChange();
  }
  
  // 更新颜色
  function updateColor(index: number, newColor: string) {
    pairs[index] = { ...pairs[index], color: newColor };
    pairs = [...pairs];
    emitChange();
  }
  
  // 选择预设颜色
  function selectPresetColor(index: number, color: string) {
    updateColor(index, color);
  }
  
  // 初始化
  import { onMount } from 'svelte';
  
  onMount(() => {
    pairs = parseInitial();
    if (pairs.length === 0) {
      addRow();
    }
  });
</script>

<div class="tag-color-map-editor">
  <div class="pairs-container">
    {#each pairs as pair, index}
      <div class="pair-row">
        <input
          class="b3-text-field"
          placeholder="输入标签名称"
          value={pair.tag}
          on:input={(e) => updateTag(index, e.currentTarget.value)}
        />
        
        <div class="color-section">
          <div 
            class="color-preview" 
            style="background-color: {pair.color || '#000000'};"
          ></div>
          
          <input
            class="b3-text-field color-input"
            type="color"
            value={pair.color || '#000000'}
            on:input={(e) => updateColor(index, e.currentTarget.value)}
          />
          
          <input
            class="b3-text-field color-text-input"
            placeholder="#FF0000"
            value={pair.color}
            on:input={(e) => updateColor(index, e.currentTarget.value)}
          />
        </div>
        
        <button 
          class="b3-button b3-button--outline"
          on:click={() => removeRow(index)}
        >
          删除
        </button>
      </div>
    {/each}
  </div>
  
  <div class="preset-colors">
    <span class="preset-label">快速选择：</span>
    {#each presetColors as color}
      <div 
        class="preset-color" 
        style="background-color: {color};"
        on:click={() => {
          if (pairs.length > 0) {
            updateColor(pairs.length - 1, color);
          }
        }}
        title={color}
      ></div>
    {/each}
  </div>
  
  <div class="actions">
    <button class="b3-button" on:click={addRow}>
      添加标签颜色映射
    </button>
  </div>
  
  <div class="preview-section">
    <div class="preview-label">预览效果：</div>
    <div class="preview-tags">
      {#each pairs.filter(p => p.tag && p.color) as pair}
        <span 
          class="preview-tag"
          style="background-color: {pair.color}; color: {guessTextColor(pair.color)};"
        >
          {pair.tag}
        </span>
      {/each}
    </div>
  </div>
</div>

<script context="module" lang="ts">
  // 猜测文本颜色（深色背景用白色文字，浅色背景用黑色文字）
  function guessTextColor(bgColor: string): string {
    if (!bgColor) return 'black';
    
    // 处理 HEX 格式
    if (bgColor.startsWith('#')) {
      const hex = bgColor.length === 4 
        ? `#${bgColor[1]}${bgColor[1]}${bgColor[2]}${bgColor[2]}${bgColor[3]}${bgColor[3]}`
        : bgColor;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? 'black' : 'white';
    }
    
    return 'black';
  }
</script>

<style>
  .tag-color-map-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .pairs-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .pair-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .pair-row input:first-child {
    flex: 1;
    min-width: 120px;
  }
  
  .color-section {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .color-preview {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    border: 1px solid var(--b3-border-color);
  }
  
  .color-input {
    width: 40px;
    height: 32px;
    padding: 0;
    border: none;
    cursor: pointer;
  }
  
  .color-text-input {
    width: 100px;
  }
  
  .preset-colors {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .preset-label {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
  }
  
  .preset-color {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: transform 0.2s, border-color 0.2s;
  }
  
  .preset-color:hover {
    transform: scale(1.1);
    border-color: var(--b3-theme-primary);
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
  
  .preview-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .preview-tag {
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 500;
  }
</style>