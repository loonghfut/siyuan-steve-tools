// 可视化 SQL 生成器 UI：通过传入容器元素挂载渲染（仅 embedded 模式）
import { VisualSqlBuilder, BlockType, OrderDir } from './visual-sql-builder';

export interface VisualSqlUIButton {
  label: string; // 按钮文本
  title?: string; // 鼠标提示
  className?: string; // 追加的 class，例如 "vsb-btn vsb-primary"
  variant?: 'default' | 'primary' | 'ghost'; // 便捷皮肤
  attrs?: Record<string, string>; // 透传属性，如 { 'data-action': 'run' }
  onClick?: (ctx: { getSQL: () => string; builder: VisualSqlBuilder; container: HTMLElement; event: MouseEvent; }) => void;
}

export interface VisualSqlUIOptions {
  onSqlChange?: (sql: string) => void;
  buttons?: VisualSqlUIButton[]; // 自定义按钮
}

export class VisualSqlUI {
    private container: HTMLElement;
    private opts: VisualSqlUIOptions;
    private builder: VisualSqlBuilder;
  private resizeRaf?: number;

    // 控件引用
    private typeChecks!: NodeListOf<HTMLInputElement>;
    private subtypeChecks!: NodeListOf<HTMLInputElement>;
    private boxChecks!: NodeListOf<HTMLInputElement>;
    private rootIdInput!: HTMLInputElement;
    private parentIdInput!: HTMLInputElement;
    private pathLikeInput!: HTMLInputElement;
    private contentLikeInput!: HTMLInputElement;
    private mdLikeInput!: HTMLInputElement;
    private hpathLikeInput!: HTMLInputElement;
    private ialLikeInput!: HTMLInputElement;
    private tagInput!: HTMLInputElement;
    private createdDaysInput!: HTMLInputElement;
    private updatedDaysInput!: HTMLInputElement;
    private orderFieldSel!: HTMLSelectElement;
    private orderDirSel!: HTMLSelectElement;
    private limitInput!: HTMLInputElement;

  private outputPre!: HTMLPreElement;
  private copyBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private actionsEl!: HTMLElement;

    constructor(container: HTMLElement, options?: VisualSqlUIOptions) {
        this.container = container;
        this.opts = options || {};
        this.builder = new VisualSqlBuilder('embedded');
        this.render();
        this.rebuildSql();
    }

  /**
   * 当外部容器尺寸变化时调用，执行轻量布局刷新（防抖）。
   * 不改变筛选状态，仅根据可视区域更新布局细节。
   */
  public resize() {
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    this.resizeRaf = requestAnimationFrame(() => {
      // 根据容器宽度切换紧凑模式（与媒体查询互补，便于嵌入式场景下的手动控制）
      const w = this.container.clientWidth;
      if (w && w < 600) this.container.classList.add('vsb-compact');
      else this.container.classList.remove('vsb-compact');

      // 动态调整输出区域的最大高度，使其随视口高度变化而更合理
      if (this.outputPre) {
        const vpH = Math.max(320, window.innerHeight || 0);
        const maxH = Math.max(160, Math.min(420, Math.floor(vpH * 0.35)));
        this.outputPre.style.maxHeight = `${maxH}px`;
      }

      // 读取一次布局属性以确保浏览器完成重排（轻量“强制回流”）
      void this.container.offsetHeight;
    });
  }

    private html(strings: TemplateStringsArray, ...values: any[]) {
        return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
    }

    private render() {
        this.injectStyles();
        this.container.innerHTML = this.html`
      <div class="vsb-wrap">
        <fieldset class="vsb-card">
          <legend class="vsb-legend">常用筛选</legend>

          <div class="vsb-chips" aria-label="类型">
            ${([
                { v: 'd', n: '文档' },
                { v: 'h', n: '标题' },
                { v: 'm', n: '数学公式' },
                { v: 'c', n: '代码块' },
                { v: 't', n: '表格块' },
                { v: 'l', n: '列表块' },
                { v: 'b', n: '引述块' },
                { v: 's', n: '超级块' },
                { v: 'p', n: '段落块' },
                { v: 'av', n: '数据库' }
            ] as Array<{ v: BlockType; n: string }>).map(it =>
                `<label class="vsb-chip"><input type="checkbox" data-type value="${it.v}"/><span>${it.n}</span></label>`
            ).join('')}
          </div>

          <div class="vsb-grid vsb-grid-4">
            <div class="vsb-field" style="grid-column: 1 / -1;">
              <div style="font-size:12px; color: var(--vsb-muted,#4b5563); margin-bottom:6px;">子类型（可多选）</div>
              <div class="vsb-chips" aria-label="子类型">
                ${([
                { v: 'h1', n: '标题 H1' },
                { v: 'h2', n: '标题 H2' },
                { v: 'h3', n: '标题 H3' },
                { v: 'h4', n: '标题 H4' },
                { v: 'h5', n: '标题 H5' },
                { v: 'h6', n: '标题 H6' },
                { v: 'u', n: '无序列表' },
                { v: 't', n: '任务项' },
                { v: 'o', n: '有序列表' }
            ] as Array<{ v: string; n: string }>).map(it =>
                `<label class=\"vsb-chip\"><input type=\"checkbox\" data-subtype value=\"${it.v}\"/><span>${it.n}</span></label>`
            ).join('')}
              </div>
            </div>
            <div class="vsb-field" style="grid-column: 1 / -1;">
              <div style="font-size:12px; color: var(--vsb-muted,#4b5563); margin-bottom:6px;">笔记本（可多选）</div>
              <div class="vsb-chips" aria-label="笔记本">
                ${(() => {
                const nbs = (window as any)?.siyuan?.notebooks;
                if (!Array.isArray(nbs) || !nbs.length) {
                    return `<span style=\"color:#9ca3af\">无可用日记本</span>`;
                }
                return nbs.map((n: any) => `<label class=\"vsb-chip\"><input type=\"checkbox\" data-box-id value=\"${n.id}\"/><span>${n.name || n.id}</span></label>`).join('');
            })()}
              </div>
            </div>
            <label class="vsb-field">tag 包含<input class="vsb-input" data-tag type="text" placeholder="标签名（无 #）"/></label>
            <label class="vsb-field">markdown like<input class="vsb-input" data-md type="text" placeholder="* [ ] %"/></label>
            <label class="vsb-field">content like<input class="vsb-input" data-content type="text" placeholder="%关键字%"/></label>
            <label class="vsb-field">limit<input class="vsb-input" data-limit type="number" min="0" placeholder="默认64（未指定）"/></label>
          </div>
        </fieldset>

        <details class="vsb-card">
          <summary class="vsb-legend">更多筛选</summary>
          <div class="vsb-grid vsb-grid-4" style="margin-top:8px;">
            <label class="vsb-field">root_id（文档）<input class="vsb-input" data-root type="text" placeholder="文档块 ID"/></label>
            <label class="vsb-field">parent_id<input class="vsb-input" data-parent type="text" placeholder="父块 ID"/></label>
            <label class="vsb-field">path<input class="vsb-input" data-path type="text" placeholder="%/2020.../xxx.sy"/></label>
            <label class="vsb-field">hpath（人类可读路径）<input class="vsb-input" data-hpath type="text" placeholder="%/目录/子目录%"/></label>
            <label class="vsb-field">ial自定义属性要带custom-前缀<input class="vsb-input" data-ial type="text" placeholder="%name=\"value\"%"/></label>

            <label class="vsb-field">created 近 N 天<input class="vsb-input" data-created-days type="number" min="0" value="0"/></label>
            <label class="vsb-field">updated 近 N 天<input class="vsb-input" data-updated-days type="number" min="0" value="0"/></label>
            <label class="vsb-field">排序字段
              <select class="vsb-input" data-order-field>
                <option value="">不排序</option>
                <option value="updated">updated</option>
                <option value="created">created</option>
                <option value="sort">sort</option>
                <option value="length">length</option>
                <option value="random()">random()</option>
              </select>
            </label>
            <label class="vsb-field">排序方向
              <select class="vsb-input" data-order-dir>
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </label>
          </div>
        </details>

        <div class="vsb-actions">
          <button class="vsb-btn" data-copy>复制 SQL</button>
          <button class="vsb-btn vsb-ghost" data-reset>重置</button>
        </div>

        <pre class="vsb-output" data-output></pre>
      </div>
    `;

        // 绑定控件
        this.typeChecks = this.container.querySelectorAll('input[data-type]') as NodeListOf<HTMLInputElement>;
        this.subtypeChecks = this.container.querySelectorAll('input[data-subtype]') as NodeListOf<HTMLInputElement>;
        this.boxChecks = this.container.querySelectorAll('input[data-box-id]') as NodeListOf<HTMLInputElement>;
        this.rootIdInput = this.container.querySelector('input[data-root]') as HTMLInputElement;
        this.parentIdInput = this.container.querySelector('input[data-parent]') as HTMLInputElement;
        this.pathLikeInput = this.container.querySelector('input[data-path]') as HTMLInputElement;
        this.contentLikeInput = this.container.querySelector('input[data-content]') as HTMLInputElement;
        this.mdLikeInput = this.container.querySelector('input[data-md]') as HTMLInputElement;
        this.hpathLikeInput = this.container.querySelector('input[data-hpath]') as HTMLInputElement;
        this.ialLikeInput = this.container.querySelector('input[data-ial]') as HTMLInputElement;
        this.tagInput = this.container.querySelector('input[data-tag]') as HTMLInputElement;
        this.createdDaysInput = this.container.querySelector('input[data-created-days]') as HTMLInputElement;
        this.updatedDaysInput = this.container.querySelector('input[data-updated-days]') as HTMLInputElement;
        this.orderFieldSel = this.container.querySelector('select[data-order-field]') as HTMLSelectElement;
        this.orderDirSel = this.container.querySelector('select[data-order-dir]') as HTMLSelectElement;
        this.limitInput = this.container.querySelector('input[data-limit]') as HTMLInputElement;

  this.outputPre = this.container.querySelector('pre[data-output]') as HTMLPreElement;
  this.copyBtn = this.container.querySelector('button[data-copy]') as HTMLButtonElement;
  this.resetBtn = this.container.querySelector('button[data-reset]') as HTMLButtonElement;
  this.actionsEl = this.container.querySelector('.vsb-actions') as HTMLElement;

        // 事件
        const changeInputs = this.container.querySelectorAll('input, select');
        changeInputs.forEach(el => el.addEventListener('change', () => this.rebuildSql()));
    this.copyBtn.addEventListener('click', () => this.copySql());
    this.resetBtn.addEventListener('click', () => this.resetForm());

    // 渲染自定义按钮（如有）
    if (Array.isArray(this.opts.buttons) && this.opts.buttons.length && this.actionsEl) {
      const getSQL = () => this.builder.compile();
      const insertBeforeEl = this.actionsEl.firstElementChild || null; // 放在最左侧
      for (const cfg of this.opts.buttons) {
        const btn = document.createElement('button');
        // 计算 class
        const base = 'vsb-btn';
        const variantCls = cfg.variant === 'primary' ? 'vsb-primary' : cfg.variant === 'ghost' ? 'vsb-ghost' : '';
        btn.className = [base, variantCls, cfg.className].filter(Boolean).join(' ');
        btn.textContent = cfg.label;
        if (cfg.title) btn.title = cfg.title;
        if (cfg.attrs) {
          for (const [k, v] of Object.entries(cfg.attrs)) btn.setAttribute(k, String(v));
        }
        if (cfg.onClick) {
          btn.addEventListener('click', (event) => cfg.onClick!({ getSQL, builder: this.builder, container: this.container, event }));
        }
        this.actionsEl.insertBefore(btn, insertBeforeEl);
      }
    }
    }

    private rebuildSql() {
        // 重建 builder
        this.builder = new VisualSqlBuilder('embedded');

        // 基础条件
        const types = Array.from(this.typeChecks).filter(c => c.checked).map(c => c.value as BlockType);
        const subtypes = Array.from(this.subtypeChecks).filter(c => c.checked).map(c => c.value);

        this.builder.byTypes(types).bySubtypes(subtypes);
        const boxes = Array.from(this.boxChecks).filter(c => c.checked).map(c => c.value);
        if (boxes.length) {
            this.builder.addFilter({ field: 'box', op: 'in', value: boxes });
        }
        this.builder.inDoc(this.rootIdInput.value.trim());
        this.builder.parentIs(this.parentIdInput.value.trim());
        const pathLike = this.smartLike(this.pathLikeInput.value);
        const contentLike = this.smartLike(this.contentLikeInput.value);
        const mdLike = this.smartLike(this.mdLikeInput.value);
        const hpathLike = this.smartLike(this.hpathLikeInput?.value);
        const ialLike = this.smartLike(this.ialLikeInput?.value);
        if (pathLike) this.builder.pathLike(pathLike);
        if (contentLike) this.builder.contentLike(contentLike);
        if (mdLike) this.builder.markdownLike(mdLike);
        if (hpathLike) this.builder.addFilter({ field: 'hpath', op: 'like', value: hpathLike });
        if (ialLike) this.builder.addFilter({ field: 'ial', op: 'like', value: ialLike });
        const tagRaw = (this.tagInput.value || '').trim();
        const tag = tagRaw.replace(/^#+/, ''); // 去除开头的 #，避免重复
        this.builder.hasTag(tag);
        this.builder.createdSinceDays(Number(this.createdDaysInput.value || 0));
        this.builder.updatedSinceDays(Number(this.updatedDaysInput.value || 0));

        // 排序
        const orderExpr = this.orderFieldSel.value;
        const orderDir = this.orderDirSel.value as OrderDir;
        if (orderExpr) {
            // random() 不需要方向
            if (orderExpr === 'random()') this.builder.addOrder('random()');
            else this.builder.addOrder(orderExpr, orderDir);
        }

        // limit
        const limit = this.limitInput.value ? Number(this.limitInput.value) : undefined;
        this.builder.setLimit(limit);

        const sql = this.builder.compile();
        this.outputPre.textContent = sql;
        this.opts.onSqlChange?.(sql);
    }

    // 智能添加 %：
    // - 空值返回 undefined（不参与条件）
    // - 若已包含 % 或 _（LIKE 通配符），则按用户输入原样使用
    // - 否则自动包裹为 %值%
    private smartLike(v: string | undefined | null): string | undefined {
        const val = (v ?? '').trim();
        if (!val) return undefined;
        if (/[%_]/.test(val)) return val;
        return `%${val}%`;
    }

    private async copySql() {
        const sql = this.outputPre.textContent || '';
        try {
            await navigator.clipboard.writeText(sql);
            this.toast('已复制 SQL 到剪贴板');
        } catch {
            // 兼容不支持 clipboard 的环境
            const ta = document.createElement('textarea');
            ta.value = sql;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            this.toast('已复制 SQL（兼容模式）');
        }
    }

    private resetForm() {
        // 简单重置：清空所有 input/select 的值与勾选
        const els = this.container.querySelectorAll('input, select');
        els.forEach((el: any) => {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = false;
            } else if (el.tagName === 'SELECT') {
                el.selectedIndex = 0;
            } else {
                el.value = '';
            }
        });
        this.rebuildSql();
    }

    private toast(msg: string) {
        const tip = document.createElement('div');
        tip.textContent = msg;
        tip.style.cssText = 'position:fixed; right:16px; bottom:16px; background:#323232; color:#fff; padding:8px 12px; border-radius:4px; z-index:9999; opacity:0; transition:opacity .2s';
        document.body.appendChild(tip);
        requestAnimationFrame(() => tip.style.opacity = '1');
        setTimeout(() => {
            tip.style.opacity = '0';
            setTimeout(() => tip.remove(), 200);
        }, 1200);
    }

    private injectStyles() {
        const STYLE_ID = 'visual-sql-ui-style';
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
      .vsb-wrap{font:12.5px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji"; color: var(--vsb-fg, #1f2328)}
      .vsb-header{display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:8px}
      .vsb-title{font-weight:600; font-size:13px}
      .vsb-card{border:1px solid var(--vsb-border,#e5e7eb); padding:10px; border-radius:8px; background: var(--vsb-surface,#ffffff); box-shadow: 0 1px 2px rgba(0,0,0,.03); margin-bottom:10px}
      .vsb-legend{font-weight:600; color: var(--vsb-muted,#4b5563);}
      .vsb-grid{display:grid; gap:8px}
      .vsb-grid-4{grid-template-columns: repeat(4, minmax(160px,1fr))}
      .vsb-grid-3{grid-template-columns: repeat(3, minmax(200px,1fr))}
      .vsb-field{display:grid; gap:4px; font-size:12px; color: var(--vsb-muted,#4b5563)}
      .vsb-input{appearance:none; border:1px solid var(--vsb-input-border,#d0d7de); background: var(--vsb-input-bg,#fff); color: var(--vsb-fg,#1f2328); border-radius:6px; padding:6px 8px; outline:none}
      .vsb-input:focus{border-color:#4f46e5; box-shadow:0 0 0 2px rgba(79,70,229,.15)}
      .vsb-input::placeholder{color:#9ca3af}
      .vsb-seg{display:flex; gap:6px; background: var(--vsb-seg-bg,#f3f4f6); padding:4px; border-radius:10px; border:1px solid var(--vsb-border,#e5e7eb)}
      .vsb-seg-item{position:relative}
      .vsb-seg-item input{position:absolute; opacity:0; pointer-events:none}
      .vsb-seg-item span{display:inline-block; padding:6px 10px; border-radius:8px; cursor:pointer; color:#374151}
      .vsb-seg-item input:checked + span{background:#111827; color:#fff}
      .vsb-chips{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px}
      .vsb-chip{position:relative}
      .vsb-chip input{position:absolute; opacity:0; pointer-events:none}
      .vsb-chip span{display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid var(--vsb-border,#e5e7eb); color:#374151; background: var(--vsb-chip-bg,#fff); cursor:pointer; transition:.15s}
      .vsb-chip input:checked + span{background:#111827; border-color:#111827; color:#fff}
      .vsb-checkbox{align-items:center}
      .vsb-actions{display:flex; gap:8px; align-items:center; margin: 6px 0 10px}
      .vsb-btn{appearance:none; border:1px solid var(--vsb-border,#e5e7eb); background:#fff; color:#111827; padding:6px 10px; line-height:1; border-radius:6px; cursor:pointer; transition:.15s}
      .vsb-btn:hover{background:#f9fafb}
      .vsb-btn.vsb-primary{background:#111827; color:#fff; border-color:#111827}
      .vsb-btn.vsb-primary:hover{filter:brightness(1.05)}
      .vsb-btn.vsb-ghost{background:transparent}
      .vsb-output{white-space:pre-wrap; background:#0b1021; color:#e8eaf6; padding:10px; border-radius:8px; overflow:auto; max-height:260px; border:1px solid #11182722; font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:11px}
      details.vsb-card summary{cursor:pointer; list-style:none}
      details.vsb-card summary::marker, details.vsb-card summary::-webkit-details-marker{display:none}
      details.vsb-card[open]{box-shadow: 0 2px 5px rgba(0,0,0,.05)}

      /* 响应式布局 */
      @media (max-width: 1280px){
        .vsb-grid-4{grid-template-columns: repeat(3, minmax(160px,1fr))}
        .vsb-grid-3{grid-template-columns: repeat(2, minmax(200px,1fr))}
      }
      @media (max-width: 920px){
        .vsb-grid-4{grid-template-columns: repeat(2, minmax(160px,1fr))}
        .vsb-actions{flex-wrap:wrap}
        .vsb-output{max-height:240px}
      }
      @media (max-width: 600px){
        .vsb-grid-4,.vsb-grid-3{grid-template-columns: 1fr}
        .vsb-header{flex-direction:column; align-items:flex-start; gap:6px}
        .vsb-actions .vsb-btn{flex:1; min-width:0}
        .vsb-chips{gap:4px}
        .vsb-title{font-size:12px}
      }
  /* 允许通过容器 class 手动触发紧凑布局（与媒体查询互补） */
  .vsb-compact .vsb-grid-4, .vsb-compact .vsb-grid-3{grid-template-columns: 1fr}
  .vsb-compact .vsb-header{flex-direction:column; align-items:flex-start; gap:6px}
  .vsb-compact .vsb-actions .vsb-btn{flex:1; min-width:0}
  .vsb-compact .vsb-chips{gap:4px}
  .vsb-compact .vsb-title{font-size:12px}
      @media (prefers-color-scheme: dark){
        .vsb-wrap{color:#e5e7eb}
        .vsb-card{background:#161b22; border-color:#2d333b; box-shadow: none}
        .vsb-legend{color:#9aa4b2}
        .vsb-input{background:#0d1117; border-color:#30363d; color:#e5e7eb}
        .vsb-input::placeholder{color:#6b7280}
        .vsb-seg{background:#0d1117; border-color:#30363d}
        .vsb-seg-item span{color:#cbd5e1}
        .vsb-seg-item input:checked + span{background:#2563eb}
        .vsb-chip span{background:#0d1117; border-color:#30363d; color:#cbd5e1}
        .vsb-chip input:checked + span{background:#2563eb; border-color:#2563eb}
        .vsb-btn{background:#0d1117; color:#e5e7eb; border-color:#30363d}
        .vsb-btn:hover{background:#111827}
        .vsb-btn.vsb-primary{background:#2563eb; border-color:#2563eb}
        .vsb-output{background:#0b1021; border-color:#30363d}
      }
    `;
        document.head.appendChild(style);
    }
}