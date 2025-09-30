const STYLE_ID = 'visual-echarts-ui-style';

export function injectStyleOnce() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
      .ve-wrap{--fg: var(--b3-theme-on-background); --muted: var(--b3-theme-on-surface); --border: var(--b3-border-color); --bg: var(--b3-theme-surface); font-family: var(--b3-font-family); font-size: var(--b3-font-size);}
  .ve-card{border:1px solid var(--border); border-radius:10px; padding:12px; background: var(--bg); margin-bottom:12px; box-shadow: 0 6px 20px color-mix(in oklab, var(--b3-theme-on-background), transparent 92%)}
      .ve-legend{font-weight:600; color: var(--muted)}
  details > summary.ve-legend{display:flex; align-items:center; justify-content:space-between; gap:8px}
  .ve-legend-left{display:inline-flex; align-items:center; gap:6px}
      .ve-grid{display:grid; gap:8px}
      .ve-grid-2{grid-template-columns: 1fr 1fr}
  .ve-field{display:grid; gap:6px; font-size:13.5px; color: var(--fg)}
      .ve-label{font-size:12px; color: var(--muted)}
  .ve-legend{font-size:13.5px}
      .ve-input{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); border-radius:6px; padding:6px 8px; outline:none}
  .ve-field input[type="checkbox"]{accent-color: var(--b3-theme-primary); transform: scale(1.05);}
  .ve-inline{display:flex; align-items:center; gap:10px}
  /* Switch style */
  .ve-switch{position:relative; display:inline-flex; align-items:center}
  .ve-switch input{position:absolute; opacity:0; width:0; height:0}
  .ve-switch i{width:36px; height:20px; background: var(--b3-border-color); border-radius:999px; position:relative; transition:all .18s ease; box-shadow: inset 0 0 0 1px var(--b3-border-color)}
  .ve-switch i:before{content:""; position:absolute; left:2px; top:2px; width:16px; height:16px; border-radius:50%; background: var(--b3-theme-on-surface); transition:transform .18s ease}
  .ve-switch input:checked + i{background: var(--b3-theme-primary); box-shadow: inset 0 0 0 1px var(--b3-theme-primary)}
  .ve-switch input:checked + i:before{background: var(--b3-theme-on-primary); transform: translateX(16px)}
      .ve-row{display:flex; gap:8px; flex-wrap:wrap}
      .ve-btn{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); padding:6px 10px; border-radius:6px; cursor:pointer}
      .ve-btn.ve-ghost{background:transparent}
  .ve-btn.ve-small{padding:4px 8px; font-size:12px}
      .ve-actions{display:flex; gap:8px; margin:8px 0}
      .ve-output{white-space:pre-wrap; background: var(--b3-protyle-code-background, var(--b3-theme-background)); border:1px solid var(--border); border-radius:6px; padding:8px; font-family: var(--b3-font-family-code, ui-monospace,monospace); font-size:11px}
      .ve-result{border:1px solid var(--border); border-radius:8px; overflow:auto}
      .ve-placeholder{padding:10px; color: var(--muted)}
      .ve-table{width:100%; border-collapse:collapse; font-size:12px}
      .ve-table th,.ve-table td{border-bottom:1px solid var(--border); padding:6px 8px; text-align:left}
      .ve-icon{border:1px solid var(--border); background: var(--b3-theme-background); color: var(--muted); width:22px; height:22px; padding:0; border-radius:6px; cursor:pointer; margin-left:6px}
  .ve-icon.active{background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); border-color: var(--b3-theme-primary)}
      @media(max-width:980px){.ve-grid-2{grid-template-columns:1fr}}
      /* 预设模式样式 */
  .ve-preset-list{display:flex; flex-direction:column; gap:8px}
  .ve-type-settings{display:grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 10px 14px}
  @media(max-width:980px){.ve-type-settings{grid-template-columns: 1fr}}
    .ve-preset-item{border:1px solid var(--border); border-radius:8px; padding:8px; position:relative; background: var(--b3-theme-surface); cursor: move}
  .ve-preset-item.drag-over{outline: 2px dashed var(--b3-theme-primary)}
      .ve-chip{position:relative}
      .ve-chip input{position:absolute; opacity:0; pointer-events:none}
    .ve-chip span{display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid var(--border); color: var(--fg); background: var(--b3-theme-background); cursor:pointer; transition: all .15s ease}
    .ve-chip input:checked + span{background: var(--b3-theme-primary); border-color: var(--b3-theme-primary); color: var(--b3-theme-on-primary)}
    .ve-chip span:hover{border-color: var(--b3-theme-primary)}
    .ve-chip input:focus-visible + span{outline:2px solid color-mix(in oklab, var(--b3-theme-primary), transparent 60%); outline-offset:2px}
  .ve-chip-group{display:flex; gap:6px; flex-wrap:wrap}
  .ve-range{width:220px}
  .ve-range{appearance:none; height:4px; border-radius:999px; background: color-mix(in oklab, var(--b3-border-color), transparent 30%)}
  .ve-range::-webkit-slider-thumb{appearance:none; width:14px; height:14px; border-radius:50%; background: var(--b3-theme-primary); border: 2px solid var(--b3-theme-on-primary); margin-top:-5px}
  .ve-range::-moz-range-thumb{width:14px; height:14px; border-radius:50%; background: var(--b3-theme-primary); border: 2px solid var(--b3-theme-on-primary)}
  .ve-help{color: var(--muted); font-size: 12px}
  .ve-justify-end{justify-content: flex-end}
  /* collapse wrapper for smooth open/close */
  .ve-collapse{overflow:hidden; transition: height .24s cubic-bezier(0.4, 0, 0.2, 1)}
  /* color editor */
  .ve-color-editor{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
  .ve-color-row{align-items:center}
  .ve-color-palette{display:flex; gap:8px; flex-wrap:wrap}
  .ve-color-chip{position:relative; width:28px; height:28px}
  .ve-color-swatch{display:block; width:100%; height:100%; border-radius:6px; border:1px solid var(--border); box-shadow: inset 0 0 0 1px color-mix(in oklab, #000, transparent 85%)}
  .ve-color-del{position:absolute; right:-6px; top:-6px; width:18px; height:18px; border-radius:50%; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--muted); cursor:pointer; line-height:16px; font-size:12px; z-index:2}
  .ve-color-chip input[type="color"]{position:absolute; inset:0; opacity:0; cursor:pointer; z-index:1}
  .ve-color-empty{color: var(--muted); font-size:12px}
  /* Grouped sections */
  .ve-group{border:1px solid var(--border); border-radius:10px; padding:10px; background: color-mix(in oklab, var(--b3-theme-surface), var(--b3-theme-background) 30%)}
  .ve-group__title{font-weight:600; color: var(--muted); margin-bottom:6px}
  .ve-type-settings > .ve-group{grid-column: 1 / -1}
      .ve-modal-mask{position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:9999}
      .ve-modal{width:min(640px, 92vw); max-height:86vh; background: var(--b3-theme-surface); border:1px solid var(--border); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.35); display:flex; flex-direction:column}
      .ve-modal__head{display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--border)}
      .ve-modal__body{padding:12px; overflow:auto}
      .ve-modal__foot{display:flex; gap:8px; justify-content:flex-end; padding:10px 12px; border-top:1px solid var(--border)}
      .ve-preset-chooser{display:flex; flex-wrap:wrap; gap:6px}
      .ve-search{margin-bottom:8px}
      .ve-empty{color: var(--muted); font-size:12px; padding:4px 0}
  .ve-mode-tabs{display:flex; gap:6px}
      .ve-tab{appearance:none; border:1px solid var(--border); background: var(--b3-theme-background); color: var(--fg); padding:6px 10px; border-radius:999px; cursor:pointer}
      .ve-tab.active{background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); border-color: var(--b3-theme-primary)}
  /* 仅缩小预览顶部模式切换的两个按钮尺寸，不影响其它按钮 */
  .ve-mode-tabs .ve-tab{padding:3px 8px; font-size:12px}
  /* 预览置顶 */
  .ve-card.pinned{position: sticky; top: 0; z-index: 100}
  `;
  document.head.appendChild(st);
}
