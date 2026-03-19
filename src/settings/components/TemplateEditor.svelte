<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let group: string;
  export let key: string;
  export let value: any;
  export let placeholders: string[] = [];
  export let placeholderDescriptions: Record<string, string> = {};
  export let placeholderCategories: Record<string, string[]> = {};
  export let rows: number = 10;
  
  const dispatch = createEventDispatcher();
  
  let templateContent = value || '';
  let showPlaceholderPanel = true;
  let textareaRef: HTMLTextAreaElement;
  let activeCategory: string | null = null;
  
  function updateTemplate(newContent: string) {
    templateContent = newContent;
    value = newContent;
    dispatch('changed', { group, key, value: newContent });
  }
  
  function insertPlaceholder(placeholder: string) {
    if (!textareaRef) return;
    
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    const text = templateContent;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const newText = `${before}{{${placeholder}}}${after}`;
    
    updateTemplate(newText);
    
    setTimeout(() => {
      textareaRef.focus();
      const newPosition = start + placeholder.length + 4;
      textareaRef.setSelectionRange(newPosition, newPosition);
    }, 0);
  }
  
  function togglePlaceholderPanel() {
    showPlaceholderPanel = !showPlaceholderPanel;
  }
  
  function toggleCategory(category: string) {
    activeCategory = activeCategory === category ? null : category;
  }
  
  $: categories = Object.keys(placeholderCategories);
  
  $: if (categories.length > 0 && !activeCategory) {
    activeCategory = categories[0];
  }
</script>

<div class="template-editor">
  <div class="template-main">
    <div class="template-left">
      <div class="template-header">
        <div class="template-title">模板内容</div>
        <button 
          class="b3-button b3-button--outline b3-button--small"
          on:click={togglePlaceholderPanel}
        >
          {showPlaceholderPanel ? '隐藏变量' : '显示变量'}
        </button>
      </div>
      
      <textarea
        class="b3-text-field template-textarea"
        rows={rows}
        bind:this={textareaRef}
        bind:value={templateContent}
        on:input={(e) => updateTemplate(e.currentTarget.value)}
        placeholder={'输入模板内容，使用 {{变量名}} 插入动态内容'}
      ></textarea>
    </div>
    
    {#if showPlaceholderPanel && (placeholders.length > 0 || Object.keys(placeholderCategories).length > 0)}
      <div class="template-right">
        <div class="placeholder-panel">
          <div class="placeholder-title">可用变量</div>
          
          {#if categories.length > 0}
            <div class="category-tabs">
              {#each categories as category}
                <button 
                  class="category-tab"
                  class:active={activeCategory === category}
                  on:click={() => toggleCategory(category)}
                >
                  {category}
                </button>
              {/each}
            </div>
            
            {#if activeCategory && placeholderCategories[activeCategory]}
              <div class="placeholder-list">
                {#each placeholderCategories[activeCategory] as placeholder}
                  <button 
                    class="placeholder-item"
                    on:click={() => insertPlaceholder(placeholder)}
                    title={placeholderDescriptions[placeholder] || placeholder}
                  >
                    <code class="ph-code">{`{{${placeholder}}}`}</code>
                    {#if placeholderDescriptions[placeholder]}
                      <span class="ph-desc">{placeholderDescriptions[placeholder]}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          {:else}
            <div class="placeholder-list">
              {#each placeholders as placeholder}
                <button 
                  class="placeholder-item"
                  on:click={() => insertPlaceholder(placeholder)}
                  title={placeholderDescriptions[placeholder] || placeholder}
                >
                  <code class="ph-code">{`{{${placeholder}}}`}</code>
                  {#if placeholderDescriptions[placeholder]}
                    <span class="ph-desc">{placeholderDescriptions[placeholder]}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .template-editor {
    width: 100%;
  }
  
  .template-main {
    display: flex;
    gap: 16px;
  }
  
  .template-left {
    flex: 1;
    min-width: 0;
  }
  
  .template-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  
  .template-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
  }
  
  .b3-button--small {
    padding: 4px 12px;
    font-size: 12px;
  }
  
  .template-textarea {
    width: 100%;
    min-height: 150px;
    font-family: var(--b3-font-family-code);
    font-size: 13px;
    line-height: 1.6;
    resize: vertical;
    box-sizing: border-box;
  }
  
  .template-right {
    width: 260px;
    flex-shrink: 0;
  }
  
  .placeholder-panel {
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    padding: 12px;
    position: sticky;
    top: 0;
  }
  
  .placeholder-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    margin-bottom: 10px;
  }
  
  .category-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
  }
  
  .category-tab {
    padding: 3px 8px;
    font-size: 11px;
    border: 1px solid var(--b3-border-color);
    border-radius: 3px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .category-tab:hover {
    background: var(--b3-theme-primary-lightest);
    border-color: var(--b3-theme-primary-light);
  }
  
  .category-tab.active {
    background: var(--b3-theme-primary);
    color: var(--b3-theme-on-primary);
    border-color: var(--b3-theme-primary);
  }
  
  .placeholder-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 350px;
    overflow-y: auto;
  }
  
  .placeholder-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    width: 100%;
  }
  
  .placeholder-item:hover {
    background: var(--b3-theme-primary-lightest);
    border-color: var(--b3-theme-primary-light);
  }
  
  .ph-code {
    font-family: var(--b3-font-family-code);
    font-size: 11px;
    color: var(--b3-theme-primary);
    background: var(--b3-theme-surface);
    padding: 2px 6px;
    border-radius: 2px;
    border: 1px solid var(--b3-border-color);
    white-space: nowrap;
    flex-shrink: 0;
  }
  
  .ph-desc {
    font-size: 11px;
    color: var(--b3-theme-on-surface-light);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  @media (max-width: 768px) {
    .template-main {
      flex-direction: column;
    }
    
    .template-right {
      width: 100%;
    }
  }
</style>