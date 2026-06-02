<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { H6_STYLE_DEFAULTS, type H6StyleConfig } from '@/settings/style-h6';

  export let group: string;
  export let value: any;

  const dispatch = createEventDispatcher();

  function parseValue(val: any): H6StyleConfig {
    if (!val || typeof val !== 'object') return { ...H6_STYLE_DEFAULTS };
    return { ...H6_STYLE_DEFAULTS, ...val };
  }

  let cfg: H6StyleConfig = parseValue(value);

  function emitChange() {
    value = { ...cfg };
    dispatch('changed', { group, key: 'style-h6-config', value });
  }

  function resetDefaults() {
    cfg = parseValue(null);
    emitChange();
  }

  $: previewStyle = `
    background-color: ${cfg.backgroundColor};
    color: ${cfg.color};
    font-size: ${cfg.fontSize}px;
    line-height: ${cfg.lineHeight}px;
    padding: ${cfg.paddingV}px ${cfg.paddingH}px;
    min-height: ${cfg.minHeight}px;
    max-height: ${cfg.maxHeight}px;
    border-radius: ${cfg.borderRadius}px;
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    white-space: nowrap;
    text-overflow: ellipsis;
  `.trim();
</script>

<div class="style-editor">
  <div class="style-editor-layout">
    <div class="style-controls">
      <div class="style-section">
        <div class="style-section-title">颜色</div>
        <div class="style-row">
           <span class="style-label">背景色</span>
          <div class="style-color-input">
            <input type="color" bind:value={cfg.backgroundColor} on:input={emitChange} />
            <input class="b3-text-field style-text-small" type="text" bind:value={cfg.backgroundColor} on:change={emitChange} />
          </div>
        </div>
        <div class="style-row">
           <span class="style-label">文字色</span>
          <div class="style-color-input">
            <input type="color" bind:value={cfg.color} on:input={emitChange} />
            <input class="b3-text-field style-text-small" type="text" bind:value={cfg.color} on:change={emitChange} />
          </div>
        </div>
      </div>

      <div class="style-section">
        <div class="style-section-title">文字</div>
        <div class="style-row">
           <span class="style-label">字号 <span class="style-value">{cfg.fontSize}px</span></span>
          <input class="b3-slider style-slider" type="range" min="8" max="32" step="1" bind:value={cfg.fontSize} on:input={emitChange} />
        </div>
        <div class="style-row">
           <span class="style-label">行高 <span class="style-value">{cfg.lineHeight}px</span></span>
          <input class="b3-slider style-slider" type="range" min="10" max="48" step="1" bind:value={cfg.lineHeight} on:input={emitChange} />
        </div>
      </div>

      <div class="style-section">
        <div class="style-section-title">内边距</div>
        <div class="style-row">
           <span class="style-label">上下 <span class="style-value">{cfg.paddingV}px</span></span>
          <input class="b3-slider style-slider" type="range" min="0" max="24" step="1" bind:value={cfg.paddingV} on:input={emitChange} />
        </div>
        <div class="style-row">
           <span class="style-label">左右 <span class="style-value">{cfg.paddingH}px</span></span>
          <input class="b3-slider style-slider" type="range" min="0" max="32" step="1" bind:value={cfg.paddingH} on:input={emitChange} />
        </div>
      </div>

      <div class="style-section">
        <div class="style-section-title">尺寸</div>
        <div class="style-row">
           <span class="style-label">最小高度 <span class="style-value">{cfg.minHeight}px</span></span>
          <input class="b3-slider style-slider" type="range" min="10" max="60" step="1" bind:value={cfg.minHeight} on:input={emitChange} />
        </div>
        <div class="style-row">
           <span class="style-label">最大高度 <span class="style-value">{cfg.maxHeight}px</span></span>
          <input class="b3-slider style-slider" type="range" min="10" max="80" step="1" bind:value={cfg.maxHeight} on:input={emitChange} />
        </div>
        <div class="style-row">
           <span class="style-label">圆角 <span class="style-value">{cfg.borderRadius}px</span></span>
          <input class="b3-slider style-slider" type="range" min="0" max="24" step="1" bind:value={cfg.borderRadius} on:input={emitChange} />
        </div>
      </div>

      <div class="style-actions">
        <button class="b3-button b3-button--outline" on:click={resetDefaults}>恢复默认</button>
      </div>
    </div>

    <div class="style-preview-area">
      <div class="style-section-title">实时预览</div>
      <div class="style-preview-canvas">
        <div class="style-preview-label">画板 h6 标题块效果：</div>
        <div class="style-preview-protyle">
          <div class="style-preview-h6" style={previewStyle}>
            这是一个 h6 标题块
          </div>
        </div>
        <div class="style-preview-label" style="margin-top: 16px;">多行对比：</div>
        <div class="style-preview-protyle style-preview-multi">
          <div class="style-preview-h6" style={previewStyle}>标题一</div>
          <span style="margin: 0 4px;"></span>
          <div class="style-preview-h6" style={previewStyle}>另一个较长的标题文本</div>
          <span style="margin: 0 4px;"></span>
          <div class="style-preview-h6" style={previewStyle}>短</div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .style-editor {
    width: 100%;
  }

  .style-editor-layout {
    display: flex;
    gap: 24px;
    align-items: flex-start;
  }

  .style-controls {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .style-preview-area {
    width: 300px;
    flex-shrink: 0;
    position: sticky;
    top: 0;
  }

  .style-section {
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 8px;
  }

  .style-section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .style-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .style-row:last-child {
    margin-bottom: 0;
  }

  .style-label {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    min-width: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .style-value {
    color: var(--b3-theme-primary);
    font-weight: 500;
    font-family: var(--b3-font-family-code, monospace);
    font-size: 11px;
  }

  .style-color-input {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  .style-color-input input[type="color"] {
    width: 32px;
    height: 28px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    cursor: pointer;
    padding: 1px;
    background: none;
  }

  .style-text-small {
    width: 100px;
    font-size: 12px;
    font-family: var(--b3-font-family-code, monospace);
  }

  .style-slider {
    flex: 1;
    min-width: 0;
  }

  .style-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .style-preview-canvas {
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    padding: 16px;
  }

  .style-preview-label {
    font-size: 11px;
    color: var(--b3-theme-on-surface-light);
    margin-bottom: 8px;
  }

  .style-preview-protyle {
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    padding: 12px;
    min-height: 48px;
    display: flex;
    align-items: center;
  }

  .style-preview-multi {
    flex-wrap: wrap;
    gap: 4px;
  }

  .style-preview-h6 {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  @media (max-width: 900px) {
    .style-editor-layout {
      flex-direction: column;
    }
    .style-preview-area {
      width: 100%;
      position: static;
    }
  }
</style>
