<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let group: string;
  export let key: string;
  export let value: any; // 颜色值，支持 HEX, RGB, HSL, 颜色名
  export let showAlpha: boolean = false; // 是否显示透明度控制
  
  const dispatch = createEventDispatcher();
  
  // 预设颜色
  const presetColors = [
    '#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452',
    '#6DC8EC', '#945FB9', '#FF9845', '#1E9493', '#EE6666',
    '#73C0DE', '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC',
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  
  let isOpen = false;
  let inputValue = value || '';
  let alpha = 1;
  
  // 解析颜色值
  function parseColor(color: string): { hex: string; alpha: number } {
    if (!color) return { hex: '#000000', alpha: 1 };
    
    // 处理 HEX 格式
    if (color.startsWith('#')) {
      const hex = color.length === 4 
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
      return { hex: hex.slice(0, 7), alpha: 1 };
    }
    
    // 处理 RGB 格式
    const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      return { hex: rgbToHex(r, g, b), alpha: 1 };
    }
    
    // 处理 RGBA 格式
    const rgbaMatch = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1]);
      const g = parseInt(rgbaMatch[2]);
      const b = parseInt(rgbaMatch[3]);
      const a = parseFloat(rgbaMatch[4]);
      return { hex: rgbToHex(r, g, b), alpha: a };
    }
    
    // 处理 HSL 格式
    const hslMatch = color.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]);
      const s = parseInt(hslMatch[2]);
      const l = parseInt(hslMatch[3]);
      const { r, g, b } = hslToRgb(h, s, l);
      return { hex: rgbToHex(r, g, b), alpha: 1 };
    }
    
    return { hex: '#000000', alpha: 1 };
  }
  
  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  
  function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return {
      r: Math.round(f(0) * 255),
      g: Math.round(f(8) * 255),
      b: Math.round(f(4) * 255)
    };
  }
  
  // 更新颜色值
  function updateColor(hex: string, a: number = 1) {
    alpha = a;
    if (showAlpha && a < 1) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      inputValue = `rgba(${r}, ${g}, ${b}, ${a})`;
    } else {
      inputValue = hex;
    }
    value = inputValue;
    dispatch('changed', { group, key, value: inputValue });
  }
  
  // 选择预设颜色
  function selectPresetColor(color: string) {
    updateColor(color);
    isOpen = false;
  }
  
  // 处理输入变化
  function handleInputChange() {
    const parsed = parseColor(inputValue);
    updateColor(parsed.hex, parsed.alpha);
  }
  
  // 切换面板
  function togglePanel() {
    isOpen = !isOpen;
  }
  
  // 点击外部关闭
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.color-picker-container')) {
      isOpen = false;
    }
  }
  
  import { onMount, onDestroy } from 'svelte';
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    const parsed = parseColor(value);
    inputValue = value || '';
    alpha = parsed.alpha;
  });
  
  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="color-picker-container">
  <div class="color-picker-input-wrapper">
    <div 
      class="color-preview" 
      style="background-color: {inputValue || '#000000'};"
      on:click={togglePanel}
    ></div>
    <input
      class="b3-text-field fn__size200"
      type="text"
      bind:value={inputValue}
      on:change={handleInputChange}
      placeholder="输入颜色值，如 #FF0000"
    />
  </div>
  
  {#if isOpen}
    <div class="color-picker-panel">
      <div class="preset-colors">
        {#each presetColors as color}
          <div 
            class="preset-color" 
            style="background-color: {color};"
            on:click={() => selectPresetColor(color)}
            title={color}
          ></div>
        {/each}
      </div>
      
      <div class="color-input-section">
        <label>
          <input 
            type="color" 
            bind:value={inputValue}
            on:input={handleInputChange}
          />
          <span>选择颜色</span>
        </label>
        
        {#if showAlpha}
          <div class="alpha-control">
            <label>
              透明度: {Math.round(alpha * 100)}%
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                bind:value={alpha}
                on:input={() => updateColor(inputValue, alpha)}
              />
            </label>
          </div>
        {/if}
      </div>
      
      <div class="color-actions">
        <button class="b3-button" on:click={() => isOpen = false}>确定</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .color-picker-container {
    position: relative;
    display: inline-block;
  }
  
  .color-picker-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .color-preview {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    border: 1px solid var(--b3-border-color);
    cursor: pointer;
    transition: transform 0.2s;
  }
  
  .color-preview:hover {
    transform: scale(1.05);
  }
  
  .color-picker-panel {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1000;
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 280px;
    margin-top: 4px;
  }
  
  .preset-colors {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }
  
  .preset-color {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: transform 0.2s, border-color 0.2s;
  }
  
  .preset-color:hover {
    transform: scale(1.1);
    border-color: var(--b3-theme-primary);
  }
  
  .color-input-section {
    margin-bottom: 12px;
  }
  
  .color-input-section label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  
  .color-input-section input[type="color"] {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .alpha-control {
    margin-top: 8px;
  }
  
  .alpha-control input[type="range"] {
    width: 100%;
    margin-top: 4px;
  }
  
  .color-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>