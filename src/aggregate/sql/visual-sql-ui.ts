// 可视化 SQL 生成器 UI：通过传入容器元素挂载渲染（仅 embedded 模式）
import { VisualSqlBuilder, BlockType, OrderDir } from './visual-sql-builder';
import { VisualSqlAdvancedUI } from './visual-sql-advanced-ui';
import { getalltages } from '@/api/api3';
import { sql as runSql } from '@/api/api';

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
  /**
   * 状态持久化键名。若未提供则使用默认键启用持久化。
   * 如需隔离不同实例可传入自定义键名。
   */
  persistKey?: string;
  /**
   * 结果预览列（优先级高于自动推断）。
   * 可以是用逗号/空格分隔的字符串，或列名数组。
   */
  previewColumns?: string | string[];
  /**
   * 预览区不限制高度（用于 Tab 模式）。
   * 为 true 时，结果预览区域随内容自增高，由外层滚动容器承载滚动。
   */
  noPreviewHeightLimit?: boolean;
  /**
   * 显示筛选预设（保存/应用）控制，仅 Tab 模式启用。
   */
  showPresetControls?: boolean;
  /**
   * 筛选预设存储键。不同项目可配置独立键。
   */
  presetsKey?: string;
  /**
   * 读取预设的回调；若提供则优先使用（可返回 Promise）。
   */
  loadPresets?: () => Promise<Record<string, any>> | Record<string, any>;
  /**
   * 保存预设的回调；若提供则优先使用（可返回 Promise）。
   */
  savePresets?: (obj: Record<string, any>) => Promise<void> | void;
}

export class VisualSqlUI {
  private container: HTMLElement;
  private opts: VisualSqlUIOptions;
  private builder: VisualSqlBuilder;
  private resizeRaf?: number;
  private storageKey?: string;
  private previewCols?: string[];

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
  private tagInput!: HTMLInputElement; // 使用带 datalist 的单一输入
  private tagsDatalist!: HTMLDataListElement;
  private recentTagsKey = 'siyuan-steve-tools:recent-tags';
  private createdDaysInput!: HTMLInputElement;
  private updatedDaysInput!: HTMLInputElement;
  private createdOpSel!: HTMLSelectElement;
  private createdAtInput!: HTMLInputElement;
  private updatedOpSel!: HTMLSelectElement;
  private updatedAtInput!: HTMLInputElement;
  private orderFieldSel!: HTMLSelectElement;
  private orderDirSel!: HTMLSelectElement;
  private limitInput!: HTMLInputElement;

  private outputPre!: HTMLPreElement;
  private copyBtn!: HTMLButtonElement;
  private copyEmbedBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private actionsEl!: HTMLElement;
  private advSqlFragment: string = '';
  private resultsEl!: HTMLElement;
  private queryDelayTimer?: number;
  private lastQuerySeq = 0;
  private tooltipEl?: HTMLElement;
  private tipDocClick?: (e: MouseEvent) => void;
  private tipKeydown?: (e: KeyboardEvent) => void;
  private tipScroll?: () => void;
  private presetsKey?: string;
  private currentPresetName?: string;
  private currentPresetEl?: HTMLElement;

  constructor(container: HTMLElement, options?: VisualSqlUIOptions) {
    this.container = container;
    this.opts = options || {};
    this.builder = new VisualSqlBuilder('embedded');
    this.storageKey = this.opts.persistKey ?? 'siyuan-steve-tools:visual-sql-ui';
    this.presetsKey = this.opts.presetsKey ?? 'siyuan-steve-tools:visual-sql-presets';
    this.previewCols = this.normalizePreviewColumns(this.opts.previewColumns);
    this.render();
    // 恢复上次状态并生成 SQL
    this.restoreState();
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
        <details class="vsb-card" open data-section="filters">
          <summary class="vsb-legend">筛选与 SQL <span class="vsb-preset-tag" data-current-preset></span></summary>
          <fieldset class="vsb-card" style="margin-top:8px;">
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
            <label class="vsb-field">tag 包含
              <input class="vsb-input" data-tag list="vsb-tags-list" placeholder="选择或搜索标签" />
              <datalist id="vsb-tags-list"></datalist>
            </label>
            <label class="vsb-field">markdown like<input class="vsb-input" data-md type="text" placeholder="* [ ] %"/></label>
            <label class="vsb-field">content like<input class="vsb-input" data-content type="text" placeholder="%关键字%"/></label>
            <label class="vsb-field">limit<input class="vsb-input" data-limit type="number" min="0" max="999" placeholder="默认64（未指定，最大999）"/></label>
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
            <label class="vsb-field">created 时间比较
              <div class="vsb-seg" style="background:transparent; border:none; padding:0; gap:6px;">
                <select class="vsb-input" data-created-op style="width:26px;">
                  <option value=">">></option>
                  <option value="<"><</option>
                </select>
                <input class="vsb-input" data-created-at type="datetime-local" style="width:140px;" />
              </div>
            </label>
            <label class="vsb-field">updated 时间比较
              <div class="vsb-seg" style="background:transparent; border:none; padding:0; gap:6px;">
                <select class="vsb-input" data-updated-op style="width:26px;">
                  <option value=">">></option>
                  <option value="<"><</option>
                </select>
                <input class="vsb-input" data-updated-at type="datetime-local" style="width:140px;" />
              </div>
            </label>
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
            <button class="vsb-btn" data-adv-open>高级筛选</button>
            <button class="vsb-btn" data-copy>复制 SQL</button>
            <button class="vsb-btn" data-copy-embed>复制嵌入块</button>
            <button class="vsb-btn vsb-ghost" data-reset>重置</button>
          </div>

          <pre class="vsb-output" data-output></pre>
        </details>

        <details class="vsb-card" open data-section="preview" style="margin-top:8px;">
          <summary class="vsb-legend">结果预览</summary>
          <div class="vsb-result" data-result>
            <div class="vsb-result__placeholder">变更筛选后将实时显示查询结果</div>
          </div>
        </details>
      </div>
    `;

    // 根据选项切换预览区高度限制
    if (this.opts.noPreviewHeightLimit) {
      const wrap = this.container.querySelector('.vsb-wrap') as HTMLElement | null;
      wrap?.classList.add('vsb-no-limit-preview');
    }

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
    this.tagsDatalist = this.container.querySelector('#vsb-tags-list') as HTMLDataListElement;
    this.createdDaysInput = this.container.querySelector('input[data-created-days]') as HTMLInputElement;
    this.updatedDaysInput = this.container.querySelector('input[data-updated-days]') as HTMLInputElement;
    this.createdOpSel = this.container.querySelector('select[data-created-op]') as HTMLSelectElement;
    this.createdAtInput = this.container.querySelector('input[data-created-at]') as HTMLInputElement;
    this.updatedOpSel = this.container.querySelector('select[data-updated-op]') as HTMLSelectElement;
    this.updatedAtInput = this.container.querySelector('input[data-updated-at]') as HTMLInputElement;
    this.orderFieldSel = this.container.querySelector('select[data-order-field]') as HTMLSelectElement;
    this.orderDirSel = this.container.querySelector('select[data-order-dir]') as HTMLSelectElement;
    this.limitInput = this.container.querySelector('input[data-limit]') as HTMLInputElement;

    this.outputPre = this.container.querySelector('pre[data-output]') as HTMLPreElement;
    this.resultsEl = this.container.querySelector('div[data-result]') as HTMLElement;
    this.copyBtn = this.container.querySelector('button[data-copy]') as HTMLButtonElement;
  this.copyEmbedBtn = this.container.querySelector('button[data-copy-embed]') as HTMLButtonElement;
    this.resetBtn = this.container.querySelector('button[data-reset]') as HTMLButtonElement;
    this.actionsEl = this.container.querySelector('.vsb-actions') as HTMLElement;
    const advOpenBtn = this.container.querySelector('button[data-adv-open]') as HTMLButtonElement;
  const filtersSection = this.container.querySelector('details[data-section="filters"]') as HTMLDetailsElement | null;
  const previewSection = this.container.querySelector('details[data-section="preview"]') as HTMLDetailsElement | null;
    this.currentPresetEl = this.container.querySelector('[data-current-preset]') as HTMLElement;
    this.updateCurrentPresetLabel();
  this.currentPresetEl?.addEventListener('click', (e) => this.openPresetQuickMenu(e));


    // 异步加载标签下拉
    this.populateTags();

    // 事件
    const changeInputs = this.container.querySelectorAll('input, select');
    const onUserChange = () => {
      if (this.currentPresetName) {
        this.currentPresetName = undefined;
        this.updateCurrentPresetLabel();
      }
      this.rebuildSql();
    };
    changeInputs.forEach(el => el.addEventListener('change', onUserChange));
    this.tagInput.addEventListener('change', () => {
      const v = (this.tagInput.value || '').trim();
      if (v) this.pushRecentTags([v]);
    });
    this.copyBtn.addEventListener('click', () => this.copySql());
    this.copyEmbedBtn.addEventListener('click', () => this.copyEmbedSql());
    this.resetBtn.addEventListener('click', () => this.resetForm());
    advOpenBtn?.addEventListener('click', () => this.openAdvancedModal());
  // 折叠状态变更时持久化
  filtersSection?.addEventListener('toggle', () => this.saveState());
  previewSection?.addEventListener('toggle', () => this.saveState());


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

    // Tab 模式：筛选预设控制
    if (this.opts.showPresetControls && this.actionsEl) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'vsb-btn';
      saveBtn.textContent = '保存筛选';
      saveBtn.title = '保存当前筛选为预设';
      saveBtn.addEventListener('click', () => this.savePresetFlow());
      const applyBtn = document.createElement('button');
      applyBtn.className = 'vsb-btn';
      applyBtn.textContent = '应用筛选';
      applyBtn.title = '从预设中选择并应用';
      applyBtn.addEventListener('click', () => this.openPresetModal());
      // 插到最左侧
      const insertBeforeEl = this.actionsEl.firstElementChild || null;
      this.actionsEl.insertBefore(applyBtn, insertBeforeEl);
      this.actionsEl.insertBefore(saveBtn, applyBtn);
    }
  }

  private updateCurrentPresetLabel() {
    if (!this.currentPresetEl) return;
    const name = (this.currentPresetName || '').trim();
    this.currentPresetEl.textContent = name ? `预设：${name}` : '';
  }

  // ===== 预设快速切换 Popover =====
  private presetPopoverEl?: HTMLElement;
  private presetPopHandlers?: { onDocClick: (e: MouseEvent) => void; onKey: (e: KeyboardEvent) => void; onScroll: () => void };

  private async openPresetQuickMenu(ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!this.currentPresetEl) return;
    // 若已存在则切换为关闭
    if (this.presetPopoverEl) { this.closePresetQuickMenu(); return; }
    // 注入样式（一次）
    this.ensurePopoverStyle();
    // 拉取预设
    const maybe = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
    const presets = maybe || {};
    const names = Object.keys(presets).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    // 构建 DOM
    const pop = document.createElement('div');
    pop.className = 'vsb-popover vsb-preset-popover';
    if (!names.length) {
      pop.innerHTML = `<div class="vsb-popover__empty">暂无预设</div>`;
    } else {
      pop.innerHTML = `
        <div class="vsb-popover__list">
          ${names.map(n => `<div class="vsb-popover__item" data-name="${this.escapeHtml(n)}">${this.escapeHtml(n)}</div>`).join('')}
        </div>
      `;
    }
    document.body.appendChild(pop);
    // 定位到标签元素附近
    const rect = this.currentPresetEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const maxW = Math.min(320, vw - 16);
    pop.style.maxWidth = `${maxW}px`;
    // 先置隐形测量
    pop.style.visibility = 'hidden';
    pop.style.left = '0px';
    pop.style.top = '0px';
    const ph = pop.getBoundingClientRect();
    let left = Math.min(rect.left, vw - ph.width - 8);
    left = Math.max(8, left);
    let top = rect.bottom + 6;
    if (top + ph.height + 8 > vh) top = Math.max(8, rect.top - ph.height - 6);
    pop.style.left = `${Math.floor(left)}px`;
    pop.style.top = `${Math.floor(top)}px`;
    pop.style.visibility = 'visible';
    this.presetPopoverEl = pop;
    // 绑定事件：点击项应用、外点关闭、ESC 关闭、滚动关闭
    if (names.length) {
      pop.querySelectorAll('.vsb-popover__item').forEach(el => {
        el.addEventListener('click', async () => {
          const name = (el as HTMLElement).getAttribute('data-name') || '';
          const p = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
          const s = p[name];
          if (!s) return;
          this.currentPresetName = name;
          this.hydrateState(s, { applyCollapse: false });
          this.rebuildSql();
          this.toast('已应用预设');
          this.closePresetQuickMenu();
        });
      });
    }
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (this.presetPopoverEl && !this.presetPopoverEl.contains(t) && !this.currentPresetEl!.contains(t)) {
        this.closePresetQuickMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.closePresetQuickMenu(); };
    const body = this.resultsEl?.querySelector?.('.vsb-result__body');
    const onScroll = () => this.closePresetQuickMenu();
    setTimeout(()=> document.addEventListener('click', onDocClick), 0);
    document.addEventListener('keydown', onKey);
    if (body) body.addEventListener('scroll', onScroll);
    this.presetPopHandlers = { onDocClick, onKey, onScroll };
  }

  private closePresetQuickMenu() {
    if (this.presetPopoverEl) {
      this.presetPopoverEl.remove();
      this.presetPopoverEl = undefined;
    }
    if (this.presetPopHandlers) {
      document.removeEventListener('click', this.presetPopHandlers.onDocClick);
      document.removeEventListener('keydown', this.presetPopHandlers.onKey);
      const body = this.resultsEl?.querySelector?.('.vsb-result__body') as HTMLElement | undefined;
      if (body) body.removeEventListener('scroll', this.presetPopHandlers.onScroll);
      this.presetPopHandlers = undefined;
    }
  }

  private ensurePopoverStyle() {
    const ID = 'visual-sql-preset-popover-style';
    if (document.getElementById(ID)) return;
    const st = document.createElement('style');
    st.id = ID;
    st.textContent = `
      .vsb-popover{position:fixed; z-index:99999; background: var(--b3-theme-surface); border:1px solid var(--b3-border-color); border-radius:6px; box-shadow:0 6px 18px rgba(0,0,0,.2); overflow:hidden; font-size:12px}
      .vsb-preset-popover{min-width:160px}
      .vsb-popover__list{max-height:40vh; overflow:auto}
      .vsb-popover__item{padding:4px 8px; cursor:pointer; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; border-bottom:1px solid var(--b3-border-color); line-height:1.35}
      .vsb-popover__item:last-child{border-bottom:none}
      .vsb-popover__item:hover{background: var(--b3-list-hover)}
      .vsb-popover__empty{padding:8px; color: var(--vsb-muted); font-size:12px}
    `;
    document.head.appendChild(st);
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
    // 时间：若设置了具体时间比较，则优先使用；否则使用“近 N 天”
    const createdAt = (this.createdAtInput?.value || '').trim();
    if (createdAt) {
      const ts = this.datetimeLocalToTS(createdAt);
      if (ts) this.builder.addFilter({ field: 'created', op: this.createdOpSel?.value || '>', value: ts });
    } else {
      this.builder.createdSinceDays(Number(this.createdDaysInput.value || 0));
    }
    const updatedAt = (this.updatedAtInput?.value || '').trim();
    if (updatedAt) {
      const ts = this.datetimeLocalToTS(updatedAt);
      if (ts) this.builder.addFilter({ field: 'updated', op: this.updatedOpSel?.value || '>', value: ts });
    } else {
      this.builder.updatedSinceDays(Number(this.updatedDaysInput.value || 0));
    }

    // 排序
    const orderExpr = this.orderFieldSel.value;
    const orderDir = this.orderDirSel.value as OrderDir;
    if (orderExpr) {
      // random() 不需要方向
      if (orderExpr === 'random()') this.builder.addOrder('random()');
      else this.builder.addOrder(orderExpr, orderDir);
    }

    // limit（最大 999）
    let limit: number | undefined = this.limitInput.value ? Number(this.limitInput.value) : undefined;
    if (limit !== undefined && !Number.isNaN(limit)) {
      if (limit > 999) {
        limit = 999;
        // 反馈到 UI，避免与实际使用不一致
        this.limitInput.value = '999';
      }
    }
    this.builder.setLimit(limit);

    // 附加高级筛选片段（来自独立高级筛选页面/组件）
    if (this.advSqlFragment && this.advSqlFragment.trim()) {
      this.builder.addFilter({ rawSql: this.advSqlFragment.trim() });
    }

    const sql = this.builder.compile();
    this.outputPre.textContent = sql;
    this.opts.onSqlChange?.(sql);
    this.saveState();
    this.scheduleQuery(sql);
  }

  // ===== 实时查询 =====
  private scheduleQuery(sql: string) {
    // 记录本次查询序号，避免竞态导致旧结果覆盖新结果
    const token = ++this.lastQuerySeq;
    // 取消前一次防抖
    if (this.queryDelayTimer) {
      clearTimeout(this.queryDelayTimer);
    }
    // 轻微防抖，减少频繁请求
    this.queryDelayTimer = window.setTimeout(() => {
      this.queryNow(token, sql).catch(() => {/* 已在内部兜底渲染错误 */ });
    }, 300);
  }

  private async queryNow(token: number, sql: string) {
    if (!this.resultsEl) return;
    // 若用户未勾选任何类型等，依然允许查询，但有个默认 LIMIT
    const stmt = this.ensureLimit(sql);
    this.renderLoading(stmt);
    const started = performance.now();
    try {
      const res = await runSql(stmt);
      // 若期间又触发了新查询，丢弃旧结果
      if (token !== this.lastQuerySeq) return;
      const elapsed = Math.max(0, performance.now() - started);
      if (!Array.isArray(res)) throw new Error('SQL 结果异常');
      this.renderResultTable(res, stmt, elapsed);
    } catch (e: any) {
      if (token !== this.lastQuerySeq) return;
      const msg = (e && e.message) ? e.message : '查询失败';
      this.renderError(msg);
    }
  }

  private ensureLimit(sql: string): string {
    // 已设置 LIMIT 则尊重；否则默认限制 64 行，避免卡顿
    if (/\blimit\b/i.test(sql)) return sql;
    return sql + ' LIMIT 64';
  }

  private renderLoading(stmt: string) {
    this.hideTooltip();
    // 优雅加载：保留当前内容，叠加骨架屏与淡化
    const head = this.resultsEl.querySelector('.vsb-result__head');
    const body = this.resultsEl.querySelector('.vsb-result__body') as HTMLElement | null;
    if (head && body) {
      head.innerHTML = `<div>正在查询…</div><div class="vsb-small">${this.escapeHtml(stmt)}</div>`;
      this.resultsEl.classList.add('is-loading');
      if (!body.querySelector('.vsb-skeleton')) {
        body.appendChild(this.createSkeleton());
      }
    } else {
      // 首次渲染或无内容时，构造基本结构 + 骨架屏
      this.resultsEl.innerHTML = `
        <div class="vsb-result__head">
          <div>正在查询…</div>
          <div class="vsb-small">${this.escapeHtml(stmt)}</div>
        </div>
        <div class="vsb-result__body"></div>
      `;
      const b = this.resultsEl.querySelector('.vsb-result__body') as HTMLElement;
      b.appendChild(this.createSkeleton());
      this.resultsEl.classList.add('is-loading');
    }
  }

  private renderError(msg: string) {
    this.hideTooltip();
    this.resultsEl.innerHTML = `
      <div class="vsb-result__head">
        <div>查询出错</div>
      </div>
      <div class="vsb-result__body">
        <div class="vsb-error">${this.escapeHtml(msg)}</div>
      </div>
    `;
    this.resultsEl.classList.remove('is-loading');
    // 淡入过渡
    const body = this.resultsEl.querySelector('.vsb-result__body') as HTMLElement | null;
    body?.classList.add('vsb-fade-in');
  }

  private renderResultTable(rows: any[], stmt: string, elapsedMs: number) {
    const total = rows.length;
    if (!total) {
      this.resultsEl.innerHTML = `
        <div class="vsb-result__head">
          <div>0 条结果</div>
          <div class="vsb-small">${this.escapeHtml(stmt)} · ${Math.round(elapsedMs)}ms</div>
        </div>
        <div class="vsb-result__body">
          <div class="vsb-result__placeholder">无结果</div>
        </div>
      `;
      return;
    }

    // 列选择：若用户指定了预览列则按之显示；否则自动推断（最多 12 列）
    let cols: string[];
    if (this.previewCols && this.previewCols.length) {
      cols = this.previewCols;
    } else {
      const colSet = new Set<string>();
      for (const r of rows) {
        if (r && typeof r === 'object') {
          Object.keys(r).forEach(k => colSet.add(k));
        }
        if (colSet.size > 24) break; // 粗略上限，稍后截断
      }
      cols = Array.from(colSet).slice(0, 12);
    }

    const thead = `<thead><tr>${cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r => {
      if (!r || typeof r !== 'object') return `<tr><td colspan="${cols.length}">${this.escapeHtml(String(r))}</td></tr>`;
      return `<tr>${cols.map(c => `<td>${this.escapeHtml(this.formatCell(r[c]))}</td>`).join('')}</tr>`;
    }).join('')}</tbody>`;

    // 先渲染基础结构
    this.hideTooltip();
    this.resultsEl.innerHTML = `
      <div class="vsb-result__head">
        <div>${total} 条结果</div>
        <div class="vsb-small">${this.escapeHtml(stmt)} · ${Math.round(elapsedMs)}ms</div>
      </div>
      <div class="vsb-result__body">
        <table class="vsb-table">${thead}${tbody}</table>
      </div>
    `;
    this.resultsEl.classList.remove('is-loading');
    // 淡入过渡
    const body = this.resultsEl.querySelector('.vsb-result__body') as HTMLElement | null;
    body?.classList.add('vsb-fade-in');

    // 列宽自适应：基于内容测量，设置 colgroup
    const tbl = this.resultsEl.querySelector('table.vsb-table') as HTMLTableElement | null;
    if (tbl) {
      const widths = this.measureColumnWidths(tbl);
      const cg = document.createElement('colgroup');
      widths.forEach(w => {
        const col = document.createElement('col');
        col.style.width = w + 'px';
        cg.appendChild(col);
      });
      tbl.insertBefore(cg, tbl.firstChild);

      // 添加 header 拖拽调宽
      const ths = Array.from(tbl.querySelectorAll('thead th')) as HTMLTableCellElement[];
      ths.forEach((th, idx) => this.attachColResizer(th, idx, tbl));
      // 单元格点击预览
      this.attachCellTooltip(tbl);
    }
  }

  // 解析设置中的列列表
  private normalizePreviewColumns(v?: string | string[] | null): string[] | undefined {
    if (!v) return undefined;
    if (Array.isArray(v)) {
      const arr = v.map(s => (s ?? '').toString().trim()).filter(Boolean);
      return arr.length ? arr : undefined;
    }
    const s = (v || '').trim();
    if (!s) return undefined;
    const parts = s.split(/[\s,，]+/).map(x => x.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  }

  private measureColumnWidths(tbl: HTMLTableElement): number[] {
    const ths = Array.from(tbl.querySelectorAll('thead th')) as HTMLTableCellElement[];
    const rows = Array.from(tbl.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
    const ctx = document.createElement('canvas').getContext('2d');
    const style = window.getComputedStyle(tbl);
    const font = `${style.getPropertyValue('font-weight')} ${style.getPropertyValue('font-size')} ${style.getPropertyValue('font-family')}`;
    if (ctx) ctx.font = font;
    const padding = 16; // 左右 padding 合计
    const minW = 60, maxW = 480;
    const widths = ths.map(th => Math.min(maxW, Math.max(minW, th.textContent ? (th.textContent.length * 8 + padding) : minW)));
    rows.slice(0, 200).forEach(tr => {
      const tds = Array.from(tr.cells) as HTMLTableCellElement[];
      tds.forEach((td, i) => {
        const text = td.textContent || '';
        let w = text.length * 8 + padding;
        if (ctx) {
          try { w = ctx.measureText(text).width + padding; } catch { }
        }
        widths[i] = Math.min(maxW, Math.max(widths[i] || minW, Math.ceil(w)));
      });
    });
    return widths;
  }

  private attachColResizer(th: HTMLTableCellElement, colIndex: number, tbl: HTMLTableElement) {
    // 防止重复添加
    if (th.querySelector('.vsb-col-resizer')) return;
    th.style.position = 'relative';
    const handle = document.createElement('div');
    handle.className = 'vsb-col-resizer';
    th.appendChild(handle);

    let startX = 0;
    let startW = 0;
    const cg = tbl.querySelector('colgroup');
    if (!cg) return;
    const cols = Array.from(cg.children) as HTMLTableColElement[];
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const newW = Math.max(40, startW + dx);
      if (cols[colIndex]) cols[colIndex].style.width = newW + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      const cur = cols[colIndex];
      startW = cur ? (parseInt(cur.style.width || '0') || th.getBoundingClientRect().width) : th.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  private attachCellTooltip(tbl: HTMLTableElement) {
    // 事件委托绑定到表上
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const td = target.closest('td') as HTMLTableCellElement | null;
      if (!td) return;
      const text = td.textContent || '';
      if (!text) return;
      const rect = td.getBoundingClientRect();
      this.showTooltip(text, rect);
      e.stopPropagation();
    };
    // 仅绑定表内单击，文档/滚动/键盘在 showTooltip 中注册与清理
    tbl.addEventListener('click', onClick);
  }

  private showTooltip(text: string, anchorRect: DOMRect) {
    this.hideTooltip();
    const tip = document.createElement('div');
    tip.className = 'vsb-tooltip';
    tip.innerHTML = `<div class="vsb-tooltip__body"><pre></pre></div>`;
    const pre = tip.querySelector('pre') as HTMLPreElement;
    pre.textContent = text;
    document.body.appendChild(tip);
    // 先测量尺寸
    const vw = window.innerWidth, vh = window.innerHeight;
    const maxW = Math.min(720, vw - 24);
    const maxH = Math.min(0.6 * vh, vh - 24);
    tip.style.maxWidth = `${Math.floor(maxW)}px`;
    tip.style.maxHeight = `${Math.floor(maxH)}px`;
    tip.style.visibility = 'hidden';
    tip.style.left = '0px';
    tip.style.top = '0px';
    // 强制布局以获取尺寸
    const th = tip.getBoundingClientRect();
    // 计算定位：优先放在单元格下方，右侧对齐，越界时调整
    let left = Math.min(anchorRect.left, vw - th.width - 8);
    left = Math.max(8, left);
    let top = anchorRect.bottom + 6;
    if (top + th.height + 8 > vh) {
      top = Math.max(8, anchorRect.top - th.height - 6);
    }
    tip.style.left = `${Math.floor(left)}px`;
    tip.style.top = `${Math.floor(top)}px`;
    tip.style.visibility = 'visible';
    this.tooltipEl = tip;

    // 外部点击 / ESC / 滚动关闭：在 tooltip 生命周期内注册，hide 时清理
    this.tipDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (this.tooltipEl && !this.tooltipEl.contains(el)) this.hideTooltip();
    };
    this.tipKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') this.hideTooltip(); };
    this.tipScroll = () => this.hideTooltip();
    // 避免与触发展示的同一次点击冲突，延迟注册
    setTimeout(() => {
      document.addEventListener('click', this.tipDocClick!);
    }, 0);
    document.addEventListener('keydown', this.tipKeydown!);
    const body = this.resultsEl.querySelector('.vsb-result__body');
    if (body) body.addEventListener('scroll', this.tipScroll!);
  }

  private hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = undefined;
    }
    if (this.tipDocClick) { document.removeEventListener('click', this.tipDocClick); this.tipDocClick = undefined; }
    if (this.tipKeydown) { document.removeEventListener('keydown', this.tipKeydown); this.tipKeydown = undefined; }
    const body = this.resultsEl?.querySelector?.('.vsb-result__body') as HTMLElement | undefined;
    if (this.tipScroll && body) { body.removeEventListener('scroll', this.tipScroll); }
    this.tipScroll = undefined;
  }

  private formatCell(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  }

  private escapeHtml(s: string): string {
    return (s || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch]);
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

  // 将 datetime-local 值转换为 YYYYMMDDHHMMSS 字符串
  private datetimeLocalToTS(v: string): string {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return '';
    const [_, y, mo, d, h, mi, se] = m;
    return `${y}${mo}${d}${h}${mi}${se ?? '00'}`;
  }

  private async copySql() {
    const sql = (this.outputPre.textContent || '').trim();
    await this.copyText(sql, '已复制 SQL 到剪贴板');
  }

  private async copyEmbedSql() {
    const sql = (this.outputPre.textContent || '').trim();
    const wrapped = sql ? `{{${sql}}}` : '';
    await this.copyText(wrapped, '已复制嵌入块到剪贴板');
  }

  private async copyText(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast(okMsg);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.toast(okMsg + '（兼容模式）');
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
    // 清空当前预设显示
    if (this.currentPresetName) {
      this.currentPresetName = undefined;
      this.updateCurrentPresetLabel();
    }
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
      /* 将 VS UI 变量映射到思源主题变量 */
      .vsb-wrap{
        --vsb-fg: var(--b3-theme-on-background);
        --vsb-muted: var(--b3-theme-on-surface);
        --vsb-border: var(--b3-border-color);
        --vsb-surface: var(--b3-theme-surface);
        --vsb-input-bg: var(--b3-theme-background);
        --vsb-input-border: var(--b3-border-color);
        --vsb-seg-bg: var(--b3-theme-background-light);
        --vsb-chip-bg: var(--b3-theme-background);
        --vsb-primary: var(--b3-theme-primary);
        --vsb-on-primary: var(--b3-theme-on-primary);
        font-family: var(--b3-font-family);
        font-size: var(--b3-font-size);
        line-height: 1.5;
        color: var(--vsb-fg);
      }
  /* 单列上下布局，去除双栏样式 */

      .vsb-header{display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:8px}
      .vsb-title{font-weight:600; font-size:13px}
      .vsb-card{border:1px solid var(--vsb-border); padding:10px; border-radius:8px; background: var(--vsb-surface); box-shadow: 0 1px 2px rgba(0,0,0,.03); margin-bottom:10px}
      .vsb-legend{font-weight:600; color: var(--vsb-muted);}
  .vsb-legend .vsb-preset-tag{margin-left:8px; font-weight:400; font-size:11px; color: var(--vsb-muted); background: var(--b3-theme-background-light); border:1px solid var(--b3-border-color); padding:2px 6px; border-radius:999px}
  details.vsb-card > summary.vsb-legend{cursor:pointer; list-style:none}
  details.vsb-card > summary.vsb-legend::marker, details.vsb-card > summary.vsb-legend::-webkit-details-marker{display:none}
  details.vsb-card[open]{box-shadow: 0 2px 5px rgba(0,0,0,.05)}
      .vsb-grid{display:grid; gap:8px}
      .vsb-grid-4{grid-template-columns: repeat(4, minmax(160px,1fr))}
      .vsb-grid-3{grid-template-columns: repeat(3, minmax(200px,1fr))}
      .vsb-field{display:grid; gap:4px; font-size:12px; color: var(--vsb-muted)}
      .vsb-input{appearance:none; border:1px solid var(--vsb-input-border); background: var(--vsb-input-bg); color: var(--vsb-fg); border-radius:6px; padding:6px 3px; outline:none}
      .vsb-input:focus{border-color: var(--vsb-primary); box-shadow:0 0 0 2px var(--b3-theme-primary-light)}
      .vsb-input::placeholder{color: var(--b3-theme-on-surface-light)}
      .vsb-seg{display:flex; gap:6px; background: var(--vsb-seg-bg); padding:4px; border-radius:10px; border:1px solid var(--vsb-border)}
      .vsb-seg-item{position:relative}
      .vsb-seg-item input{position:absolute; opacity:0; pointer-events:none}
      .vsb-seg-item span{display:inline-block; padding:6px 10px; border-radius:8px; cursor:pointer; color: var(--vsb-fg)}
      .vsb-seg-item input:checked + span{background: var(--vsb-primary); color: var(--vsb-on-primary)}
      .vsb-chips{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px}
      .vsb-chip{position:relative}
      .vsb-chip input{position:absolute; opacity:0; pointer-events:none}
      .vsb-chip span{display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid var(--vsb-border); color: var(--vsb-fg); background: var(--vsb-chip-bg); cursor:pointer; transition:.15s}
      .vsb-chip input:checked + span{background: var(--vsb-primary); border-color: var(--vsb-primary); color: var(--vsb-on-primary)}
      .vsb-checkbox{align-items:center}
      .vsb-actions{display:flex; gap:8px; align-items:center; margin: 6px 0 10px}
      .vsb-btn{appearance:none; border:1px solid var(--vsb-border); background: var(--b3-theme-background); color: var(--vsb-fg); padding:6px 10px; line-height:1; border-radius:6px; cursor:pointer; transition:.15s}
      .vsb-btn:hover{background: var(--b3-list-hover)}
      .vsb-btn.vsb-primary{background: var(--vsb-primary); color: var(--vsb-on-primary); border-color: var(--vsb-primary)}
      .vsb-btn.vsb-primary:hover{filter:brightness(1.05)}
      .vsb-btn.vsb-ghost{background:transparent}
      .vsb-output{white-space:pre-wrap; background: var(--b3-protyle-code-background, var(--b3-theme-background)); color: var(--b3-theme-on-surface); padding:10px; border-radius:8px; overflow:auto; max-height:260px; border:1px solid var(--b3-border-color); font-family: var(--b3-font-family-code, ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace); font-size:11px}
  .vsb-result{margin-top:8px; border:1px solid var(--b3-border-color); border-radius:8px; overflow:hidden;}
  .vsb-result__placeholder{padding:10px; color: var(--vsb-muted); font-size:12px;}
  .vsb-result__head{display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background: var(--b3-theme-surface); border-bottom:1px solid var(--b3-border-color); font-size:12px; color: var(--vsb-muted)}
  .vsb-result__body{height: var(--vsb-result-height, 360px); overflow:auto; position:relative}
  /* 在 Tab 模式可关闭固定高度，由外层容器负责滚动 */
  .vsb-wrap.vsb-no-limit-preview .vsb-result__body{height:auto; max-height:none; overflow-y:visible; overflow-x:auto}
  .vsb-result__body .vsb-table{width: 100%}
  /* 加载态与骨架屏 */
  .vsb-result.is-loading .vsb-result__body > *:not(.vsb-skeleton){
    opacity:.45; filter: blur(.3px); transition: opacity .15s ease, filter .15s ease;
  }
  .vsb-skeleton{position:absolute; inset:0; padding:10px; overflow:hidden; pointer-events:none}
  .vsb-skel-line{height:12px; border-radius:6px; background: var(--b3-theme-background-light); margin:10px 0; position:relative; overflow:hidden}
  .vsb-skel-line::after{content:""; position:absolute; inset:0; width:40%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent); transform: translateX(-100%); animation: vsbShimmer 1.2s infinite}
  @keyframes vsbShimmer{0%{transform: translateX(-100%)}100%{transform: translateX(200%)}}
  /* 淡入动画 */
  .vsb-fade-in{animation: vsbFadeIn .18s ease}
  @keyframes vsbFadeIn{from{opacity:0; transform: translateY(2px)} to{opacity:1; transform: translateY(0)}}
  .vsb-table{width:100%; border-collapse:separate; border-spacing:0; font-size:12px}
  .vsb-table th,.vsb-table td{padding:6px 8px; border-bottom:1px solid var(--b3-border-color); vertical-align:top}
  .vsb-table thead{position: sticky; top: 0; z-index: 3; background: var(--b3-theme-surface)}
  .vsb-table th{position:sticky; top:0; background: var(--b3-theme-surface); text-align:left; color: var(--vsb-muted); z-index:3; box-shadow: 0 1px 0 var(--b3-border-color)}
  /* 列自适应 + 拖拽调整支持 */
  .vsb-table{table-layout: fixed}
  .vsb-table th{position: sticky; top:0}
  .vsb-table th,.vsb-table td{white-space: nowrap; overflow:hidden; text-overflow: ellipsis}
  .vsb-col-resizer{position:absolute; right:0; top:0; width:6px; height:100%; cursor:col-resize; user-select:none}
  .vsb-small{color: var(--vsb-muted); font-size:11px}
  .vsb-error{padding:10px; color:#b71c1c}
  .vsb-loading{padding:10px; color: var(--vsb-muted)}
  /* tooltip 预览 */
  .vsb-tooltip{position:fixed; z-index:99999; background: var(--b3-theme-surface); border:1px solid var(--b3-border-color); box-shadow:0 10px 30px rgba(0,0,0,.25); border-radius:8px; overflow:hidden}
  .vsb-tooltip__head{display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--b3-border-color)}
  .vsb-tooltip__title{font-size:12px; font-weight:600}
  .vsb-tooltip__actions{display:flex; gap:6px}
  .vsb-tooltip__body{max-height:60vh; overflow:auto}
  .vsb-tooltip__body pre{margin:0; padding:10px; white-space:pre-wrap; word-break:break-word; font-family: var(--b3-font-family-code, ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace); font-size:12px}
      details.vsb-card{overflow:hidden; transition:max-height .4s ease; max-height:3em}
      details.vsb-card summary{cursor:pointer; list-style:none}
      details.vsb-card summary::marker, details.vsb-card summary::-webkit-details-marker{display:none}
      details.vsb-card[open]{max-height:1000px; box-shadow: 0 2px 5px rgba(0,0,0,.05)}

  /* Tag 搜索输入（datalist 绑定）配色适配 */
  input.vsb-input[data-tag]{ background: var(--vsb-input-bg); color: var(--vsb-fg); caret-color: var(--vsb-primary); }
  input.vsb-input[data-tag]::placeholder{ color: var(--b3-theme-on-surface-light); }

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
    `;
    document.head.appendChild(style);
  }

  private createSkeleton(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'vsb-skeleton';
    // 生成若干条骨架行
    const count = 8;
    for (let i = 0; i < count; i++) {
      const line = document.createElement('div');
      line.className = 'vsb-skel-line';
      // 行宽错落更自然
      const w = 80 - (i % 4) * 10; // 80%,70%,60%,50% 循环
      line.style.width = w + '%';
      wrap.appendChild(line);
    }
    return wrap;
  }

  // ========== 持久化 ==========
  private saveState() {
    if (!this.storageKey) return;
    try {
      const state = this.getStateSnapshot();
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (e) {
      // 忽略可能的异常（如无痕模式或配额问题）
      console.debug('[VisualSqlUI] saveState failed', e);
    }
  }

  private getStateSnapshot() {
    return {
      types: Array.from(this.typeChecks || []).filter(c => c.checked).map(c => c.value),
      subtypes: Array.from(this.subtypeChecks || []).filter(c => c.checked).map(c => c.value),
      boxes: Array.from(this.boxChecks || []).filter(c => c.checked).map(c => c.value),
      rootId: this.rootIdInput?.value ?? '',
      parentId: this.parentIdInput?.value ?? '',
      path: this.pathLikeInput?.value ?? '',
      content: this.contentLikeInput?.value ?? '',
      md: this.mdLikeInput?.value ?? '',
      hpath: this.hpathLikeInput?.value ?? '',
      ial: this.ialLikeInput?.value ?? '',
      tag: this.tagInput?.value ?? '',
      createdDays: this.createdDaysInput?.value ?? '',
      updatedDays: this.updatedDaysInput?.value ?? '',
      createdOp: this.createdOpSel?.value ?? '>',
      createdAt: this.createdAtInput?.value ?? '',
      updatedOp: this.updatedOpSel?.value ?? '>',
      updatedAt: this.updatedAtInput?.value ?? '',
      orderField: this.orderFieldSel?.value ?? '',
      orderDir: this.orderDirSel?.value ?? 'desc',
      limit: this.limitInput?.value ?? '',
      advSqlFragment: this.advSqlFragment || '',
      currentPresetName: this.currentPresetName || '',
      // 折叠状态
      filtersOpen: (this.container.querySelector('details[data-section="filters"]') as HTMLDetailsElement | null)?.open ?? true,
      previewOpen: (this.container.querySelector('details[data-section="preview"]') as HTMLDetailsElement | null)?.open ?? true,
    };
  }

  private restoreState() {
    if (!this.storageKey) return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const s = JSON.parse(raw) as any;
      this.hydrateState(s, { applyCollapse: true });

    } catch (e) {
      console.debug('[VisualSqlUI] restoreState failed', e);
    }
  }

  // 生成用于预设去重比较的精简快照（不含折叠状态、当前预设名等 UI 元信息）
  private getPresetComparableSnapshot(raw?: any) {
    const s = raw ?? this.getStateSnapshot();
    const pick = (k: string, d: any = '') => (s?.[k] ?? d);
    const normStr = (v: any) => (v == null ? '' : String(v).trim());
    const normArr = (v: any[]) => Array.isArray(v) ? Array.from(new Set(v.map(x => String(x)))).sort() : [] as string[];
    return {
      types: normArr(pick('types', [])),
      subtypes: normArr(pick('subtypes', [])),
      boxes: normArr(pick('boxes', [])),
      rootId: normStr(pick('rootId')),
      parentId: normStr(pick('parentId')),
      path: normStr(pick('path')),
      content: normStr(pick('content')),
      md: normStr(pick('md')),
      hpath: normStr(pick('hpath')),
      ial: normStr(pick('ial')),
      tag: normStr(pick('tag')),
      createdDays: normStr(pick('createdDays')),
      updatedDays: normStr(pick('updatedDays')),
      createdOp: normStr(pick('createdOp', '>')),
      createdAt: normStr(pick('createdAt')),
      updatedOp: normStr(pick('updatedOp', '>')),
      updatedAt: normStr(pick('updatedAt')),
      orderField: normStr(pick('orderField')),
      orderDir: normStr(pick('orderDir', 'desc')),
      limit: normStr(pick('limit')),
      advSqlFragment: normStr(pick('advSqlFragment')),
    };
  }

  private isSamePreset(a: any, b: any): boolean {
    try {
      const ca = this.getPresetComparableSnapshot(a);
      const cb = this.getPresetComparableSnapshot(b);
      return JSON.stringify(ca) === JSON.stringify(cb);
    } catch { return false; }
  }

  private findDuplicatePresetName(presets: Record<string, any>, snap: any): string | undefined {
    try {
      for (const [name, val] of Object.entries(presets || {})) {
        if (this.isSamePreset(val, snap)) return name;
      }
    } catch {}
    return undefined;
  }

  private hydrateState(s: any, opts?: { applyCollapse?: boolean }) {
    try {
      if (Array.isArray(s?.types) && this.typeChecks) {
        const set = new Set<string>(s.types);
        this.typeChecks.forEach(c => c.checked = set.has(c.value));
      }
      if (Array.isArray(s?.subtypes) && this.subtypeChecks) {
        const set = new Set<string>(s.subtypes);
        this.subtypeChecks.forEach(c => c.checked = set.has(c.value));
      }
      if (Array.isArray(s?.boxes) && this.boxChecks) {
        const set = new Set<string>(s.boxes);
        this.boxChecks.forEach(c => c.checked = set.has(c.value));
      }
      if (this.rootIdInput) this.rootIdInput.value = s?.rootId ?? '';
      if (this.parentIdInput) this.parentIdInput.value = s?.parentId ?? '';
      if (this.pathLikeInput) this.pathLikeInput.value = s?.path ?? '';
      if (this.contentLikeInput) this.contentLikeInput.value = s?.content ?? '';
      if (this.mdLikeInput) this.mdLikeInput.value = s?.md ?? '';
      if (this.hpathLikeInput) this.hpathLikeInput.value = s?.hpath ?? '';
      if (this.ialLikeInput) this.ialLikeInput.value = s?.ial ?? '';
      if (this.tagInput) this.tagInput.value = s?.tag ?? '';
      if (this.createdDaysInput) this.createdDaysInput.value = String(s?.createdDays ?? '');
      if (this.updatedDaysInput) this.updatedDaysInput.value = String(s?.updatedDays ?? '');
      if (this.createdOpSel) this.createdOpSel.value = s?.createdOp ?? '>';
      if (this.createdAtInput) this.createdAtInput.value = s?.createdAt ?? '';
      if (this.updatedOpSel) this.updatedOpSel.value = s?.updatedOp ?? '>';
      if (this.updatedAtInput) this.updatedAtInput.value = s?.updatedAt ?? '';
      if (this.orderFieldSel) this.orderFieldSel.value = s?.orderField ?? '';
      if (this.orderDirSel) this.orderDirSel.value = s?.orderDir ?? 'desc';
      if (this.limitInput) this.limitInput.value = String(s?.limit ?? '');
      this.advSqlFragment = s?.advSqlFragment || '';
      if (typeof s?.currentPresetName === 'string' && s.currentPresetName.trim()) {
        this.currentPresetName = s.currentPresetName.trim();
      }
      this.updateCurrentPresetLabel();
      if (opts?.applyCollapse) {
        const filtersSection = this.container.querySelector('details[data-section="filters"]') as HTMLDetailsElement | null;
        const previewSection = this.container.querySelector('details[data-section="preview"]') as HTMLDetailsElement | null;
        if (filtersSection) filtersSection.open = s?.filtersOpen !== false;
        if (previewSection) previewSection.open = s?.previewOpen !== false;
      }
    } catch {}
  }

  private loadPresets(): Record<string, any> {
    if (this.opts.loadPresets) {
      try {
        const res = (this.opts.loadPresets() as any);
        // 支持同步或异步
        if (res && typeof res.then === 'function') {
          // 异步版本无法在同步 API 返回；暂缓存为空，调用方使用 openPresetModal 渲染时会再次获取
          // 为简化处理，这里阻塞不合适，改为由 openPresetModal 内部再次调用 loadPresets（已如此实现）
          console.debug('[VisualSqlUI] loadPresets called synchronously, async provider will be awaited at call sites');
          return {};
        }
        return (res as Record<string, any>) || {};
      } catch { return {}; }
    }
    try {
      const raw = localStorage.getItem(this.presetsKey!);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  private savePresets(obj: Record<string, any>) {
    if (this.opts.savePresets) {
      try { (this.opts.savePresets(obj) as any); } catch {}
      return;
    }
    try { localStorage.setItem(this.presetsKey!, JSON.stringify(obj)); } catch {}
  }

  private async savePresetFlow() {
    // 先做内容去重校验：若已存在相同筛选，则阻止保存
    const presets = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
    const snap = this.getStateSnapshot();
    const dup = this.findDuplicatePresetName(presets, snap);
    if (dup) {
      this.toast(`存在相同筛选（预设：${dup}），未保存`);
      return;
    }

    const nameRaw = await this.openInputModal({ title: '保存为预设', label: '名称', placeholder: '输入预设名称' });
    const name = (nameRaw || '').trim();
    if (!name) return;
    if (presets[name]) {
      const ok = await this.openConfirmModal('同名预设已存在，是否覆盖？');
      if (!ok) return;
    }
    presets[name] = snap;
    await (this.opts.savePresets ? this.opts.savePresets(presets) : (async () => this.savePresets(presets))());
    this.toast('已保存筛选预设');
  }

  private openPresetModal() {
    // 统一样式注入
    this.ensureModalStyle();

    const overlay = document.createElement('div');
    overlay.className = 'vsb-modal-mask';
    const dialog = document.createElement('div');
    dialog.className = 'vsb-modal vsb-preset';
    dialog.innerHTML = `
      <div class="vsb-modal-header">
        <div class="vsb-modal-title">筛选预设</div>
        <button class="vsb-btn vsb-ghost" data-close>×</button>
      </div>
      <div class="vsb-modal-body">
        <div class="vsb-preset-head">
          <input class="vsb-input vsb-search" data-search placeholder="搜索预设..." />
          <span class="vsb-badge" data-count>0</span>
        </div>
        <div class="vsb-list" data-list></div>
      </div>
      <div class="vsb-modal-footer">
        <button class="vsb-btn" data-close2>关闭</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', close);
    (dialog.querySelector('[data-close2]') as HTMLButtonElement).addEventListener('click', close);

    const listEl = dialog.querySelector('[data-list]') as HTMLElement;
    const searchEl = dialog.querySelector('[data-search]') as HTMLInputElement;
    const countEl = dialog.querySelector('[data-count]') as HTMLElement;
    const render = async () => {
      const maybe = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
      const presets = maybe || {};
      const q = (searchEl?.value || '').trim().toLowerCase();
      const names = Object.keys(presets).sort((a,b)=>a.localeCompare(b,'zh-CN'))
        .filter(n => !q || n.toLowerCase().includes(q));
      if (!names.length) {
        listEl.innerHTML = `<div class="vsb-item"><div class="vsb-item-name" style="color: var(--vsb-muted)">暂无预设</div></div>`;
        if (countEl) countEl.textContent = '0';
        return;
      }
      if (countEl) countEl.textContent = String(names.length);
      listEl.innerHTML = names.map(n => `
        <div class="vsb-item" data-name="${this.escapeHtml(n)}">
          <div class="vsb-item-name">${this.escapeHtml(n)}</div>
          <div class="vsb-item-actions">
            <button class="vsb-btn" data-apply>应用</button>
            <button class="vsb-btn" data-rename>重命名</button>
            <button class="vsb-btn vsb-btn--danger" data-delete>删除</button>
          </div>
        </div>
      `).join('');
      // 绑定事件
      listEl.querySelectorAll('.vsb-item').forEach(item => {
        const name = (item as HTMLElement).getAttribute('data-name') || '';
        const apply = item.querySelector('[data-apply]') as HTMLButtonElement;
        const rename = item.querySelector('[data-rename]') as HTMLButtonElement;
        const del = item.querySelector('[data-delete]') as HTMLButtonElement;
        apply.addEventListener('click', async () => {
          const p = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
          const s = p[name];
          if (!s) return;
          this.currentPresetName = name;
          this.hydrateState(s, { applyCollapse: false });
          this.rebuildSql();
          this.toast('已应用预设');
          close();
        });
        // 双击整行也可应用
        (item as HTMLElement).addEventListener('dblclick', async () => {
          const p = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
          const s = p[name];
          if (!s) return;
          this.currentPresetName = name;
          this.hydrateState(s, { applyCollapse: false });
          this.rebuildSql();
          this.toast('已应用预设');
          close();
        });
        rename.addEventListener('click', async () => {
          const p = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
          const cur = p[name];
          if (!cur) return;
          const newNameRaw = await this.openInputModal({ title: '重命名预设', label: '新名称', defaultValue: name });
          const newName = (newNameRaw || '').trim();
          if (!newName || newName === name) return;
          if (p[newName] && newName !== name) {
            const ok = await this.openConfirmModal('同名预设已存在，是否覆盖？');
            if (!ok) return;
          }
          p[newName] = cur;
          if (newName !== name) delete p[name];
          await (this.opts.savePresets ? this.opts.savePresets(p) : (async () => this.savePresets(p))());
          render();
        });
        del.addEventListener('click', async () => {
          const ok = await this.openConfirmModal({
            message: `删除预设 “${name}”？`,
            title: '删除确认',
            okText: '删除',
            cancelText: '取消',
            danger: true
          });
          if (!ok) return;
          const p2 = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
          delete p2[name];
          await (this.opts.savePresets ? this.opts.savePresets(p2) : (async () => this.savePresets(p2))());
          render();
        });
      });
    };
    searchEl?.addEventListener('input', () => { render(); });
    render();
  }

  private ensureModalStyle() {
    const STYLE_ID = 'visual-sql-adv-modal-style';
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = `
        .vsb-modal-mask{position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:9999}
        .vsb-modal{width:min(720px, 92vw); max-height:86vh; background: var(--b3-theme-surface); border:1px solid var(--b3-border-color); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.35); display:flex; flex-direction:column}
        .vsb-modal-header{display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--b3-border-color)}
        .vsb-modal-title{font-weight:600}
        .vsb-modal-body{padding:12px; overflow:auto}
        .vsb-modal-footer{display:flex; gap:8px; justify-content:flex-end; padding:10px 12px; border-top:1px solid var(--b3-border-color)}
        .vsb-modal .vsb-input{appearance:none; border:1px solid var(--b3-border-color); background: var(--b3-theme-background); color: var(--b3-theme-on-background); border-radius:6px; padding:6px 8px; outline:none;}
        .vsb-modal .vsb-input:focus{border-color: var(--b3-theme-primary); box-shadow:0 0 0 2px var(--b3-theme-primary-light)}
        .vsb-modal .vsb-field{display:grid; gap:6px}
        .vsb-modal .vsb-label{font-size:12px; color: var(--b3-theme-on-surface)}
  /* Preset modal */
  .vsb-modal .vsb-preset .vsb-preset-head,
  .vsb-modal.vsb-preset .vsb-preset-head{display:flex; align-items:center; gap:8px; margin-bottom:10px}
  .vsb-modal .vsb-preset .vsb-search,
  .vsb-modal.vsb-preset .vsb-search{max-width: 260px; width:auto}
  .vsb-modal .vsb-preset .vsb-badge,
  .vsb-modal.vsb-preset .vsb-badge{display:inline-block; min-width:22px; padding:2px 6px; border-radius:999px; background: var(--b3-theme-background-light); color: var(--b3-theme-on-surface); font-size:12px; text-align:center; border:1px solid var(--b3-border-color)}
        .vsb-modal .vsb-list{display:flex; flex-direction:column; gap:8px}
        .vsb-modal .vsb-item{display:flex; align-items:center; justify-content:space-between; border:1px solid var(--b3-border-color); border-radius:8px; padding:8px 10px; background: var(--b3-theme-background); transition: background .15s, border-color .15s}
        .vsb-modal .vsb-item:hover{background: var(--b3-list-hover)}
        .vsb-modal .vsb-item-name{font-size:13px; font-weight:500}
        .vsb-modal .vsb-item-actions{display:flex; gap:8px}
        .vsb-modal .vsb-btn--danger{background: #b71c1c; color:#fff; border-color:#b71c1c}
        .vsb-modal .vsb-btn--danger:hover{filter:brightness(1.05)}

        /* Scoped tweaks for input modal only */
        .vsb-modal.vsb-modal--input{width:min(520px, 92vw)}
        .vsb-modal.vsb-modal--input .vsb-modal-footer{justify-content:flex-end}
        .vsb-modal.vsb-modal--input .vsb-modal-footer .vsb-btn[data-cancel]{order:1}
        .vsb-modal.vsb-modal--input .vsb-modal-footer .vsb-btn[data-ok]{order:2}

        /* Scoped tweaks for confirm modal only */
        .vsb-modal.vsb-modal--confirm{width:min(480px, 92vw)}
        .vsb-modal.vsb-modal--confirm .vsb-modal-footer{justify-content:flex-end}
        .vsb-modal.vsb-modal--confirm .vsb-modal-footer .vsb-btn[data-cancel]{order:1}
        .vsb-modal.vsb-modal--confirm .vsb-modal-footer .vsb-btn[data-ok]{order:2}
        .vsb-modal.vsb-modal--confirm.vsb-modal--danger .vsb-modal-footer .vsb-btn[data-ok]{background:#b71c1c; color:#fff; border-color:#b71c1c}
        .vsb-modal.vsb-modal--confirm.vsb-modal--danger .vsb-modal-footer .vsb-btn[data-ok]:hover{filter:brightness(1.05)}
      `;
      document.head.appendChild(st);
    }
  }

  private openInputModal(opts: { title: string; label?: string; defaultValue?: string; placeholder?: string; confirmText?: string; cancelText?: string; }): Promise<string | null> {
    this.ensureModalStyle();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'vsb-modal-mask';
      const dialog = document.createElement('div');
      dialog.className = 'vsb-modal vsb-modal--input';
      dialog.innerHTML = `
        <div class="vsb-modal-header">
          <div class="vsb-modal-title">${this.escapeHtml(opts.title)}</div>
          <button class="vsb-btn vsb-ghost" data-close>×</button>
        </div>
        <div class="vsb-modal-body">
          <div class="vsb-field">
            ${opts.label ? `<label class="vsb-label">${this.escapeHtml(opts.label)}</label>` : ''}
            <input class="vsb-input" data-input placeholder="${this.escapeHtml(opts.placeholder || '')}" />
          </div>
        </div>
        <div class="vsb-modal-footer">
          <button class="vsb-btn" data-ok>${this.escapeHtml(opts.confirmText || '确定')}</button>
          <button class="vsb-btn vsb-ghost" data-cancel>${this.escapeHtml(opts.cancelText || '取消')}</button>
        </div>
      `;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      const input = dialog.querySelector('[data-input]') as HTMLInputElement;
      const close = (val: string | null) => { overlay.remove(); resolve(val); };
      (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', () => close(null));
      (dialog.querySelector('[data-cancel]') as HTMLButtonElement).addEventListener('click', () => close(null));
      (dialog.querySelector('[data-ok]') as HTMLButtonElement).addEventListener('click', () => close(input.value || ''));
      input.value = opts.defaultValue || '';
      input.focus();
      input.select();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') close(input.value || '');
      };
      overlay.addEventListener('keydown', onKey);
      // 允许点击遮罩关闭
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }

  private openConfirmModal(opts: string | { message: string; title?: string; okText?: string; cancelText?: string; danger?: boolean; modalClass?: string; }): Promise<boolean> {
    this.ensureModalStyle();
    return new Promise(resolve => {
      const o = typeof opts === 'string' ? { message: opts } : opts;
      const title = (o.title || '确认');
      const message = o.message || '';
      const okText = (o.okText || '确定');
      const cancelText = (o.cancelText || '取消');
      const danger = !!o.danger;
      const extraClass = o.modalClass ? ' ' + o.modalClass : '';
      const overlay = document.createElement('div');
      overlay.className = 'vsb-modal-mask';
      const dialog = document.createElement('div');
      dialog.className = 'vsb-modal vsb-modal--confirm' + (danger ? ' vsb-modal--danger' : '') + extraClass;
      dialog.innerHTML = `
        <div class="vsb-modal-header">
          <div class="vsb-modal-title">${this.escapeHtml(title)}</div>
          <button class="vsb-btn vsb-ghost" data-close>×</button>
        </div>
        <div class="vsb-modal-body">
          <div>${this.escapeHtml(message)}</div>
        </div>
        <div class="vsb-modal-footer">
          <button class="vsb-btn" data-ok>${this.escapeHtml(okText)}</button>
          <button class="vsb-btn vsb-ghost" data-cancel>${this.escapeHtml(cancelText)}</button>
        </div>
      `;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      const close = (val: boolean) => { overlay.remove(); resolve(val); };
      (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', () => close(false));
      (dialog.querySelector('[data-cancel]') as HTMLButtonElement).addEventListener('click', () => close(false));
      (dialog.querySelector('[data-ok]') as HTMLButtonElement).addEventListener('click', () => close(true));
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter') close(true);
      };
      overlay.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
  }

  //（高级模式已迁移至独立页面/组件）

  // 加载标签并填充到下拉框
  private async populateTags() {
    try {
      const tags = await getalltages();
      if (!this.tagInput || !this.tagsDatalist) return;
      const ordered = this.orderTagsWithRecents(tags);
      this.tagsDatalist.innerHTML = '';
      for (const t of ordered) {
        const opt = document.createElement('option');
        opt.value = t;
        this.tagsDatalist.appendChild(opt);
      }
    } catch (e) {
      // 静默失败：保持 datalist 为空
      console.debug('[VisualSqlUI] populateTags failed', e);
    }
  }

  private getRecentTags(): string[] {
    try {
      const raw = localStorage.getItem(this.recentTagsKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
    } catch { return []; }
  }
  private pushRecentTags(tags: string[]) {
    if (!Array.isArray(tags) || !tags.length) return;
    const cur = this.getRecentTags();
    const set = new Set<string>();
    const merged = [...tags, ...cur].filter(t => { if (set.has(t)) return false; set.add(t); return true; });
    localStorage.setItem(this.recentTagsKey, JSON.stringify(merged.slice(0, 20)));
  }
  private orderTagsWithRecents(all: string[]): string[] {
    const rec = this.getRecentTags();
    const inAll = rec.filter(r => all.includes(r));
    const rest = all.filter(a => !inAll.includes(a));
    return [...inAll, ...rest];
  }

  // ===== 高级筛选弹窗 =====
  private openAdvancedModal() {
    // 注入一次简单样式
    const STYLE_ID = 'visual-sql-adv-modal-style';
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = `
        .vsb-modal-mask{position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:9999}
        .vsb-modal{width:min(880px, 92vw); max-height:86vh; background: var(--b3-theme-surface); border:1px solid var(--b3-border-color); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.35); display:flex; flex-direction:column}
        .vsb-modal-header{display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--b3-border-color)}
        .vsb-modal-title{font-weight:600}
        .vsb-modal-body{padding:12px; overflow:auto}
        .vsb-modal-footer{display:flex; gap:8px; justify-content:flex-end; padding:10px 12px; border-top:1px solid var(--b3-border-color)}
      `;
      document.head.appendChild(st);
    }

    const overlay = document.createElement('div');
    overlay.className = 'vsb-modal-mask';
    const dialog = document.createElement('div');
    dialog.className = 'vsb-modal';
    dialog.innerHTML = `
      <div class="vsb-modal-header">
        <div class="vsb-modal-title">高级筛选</div>
        <button class="vsb-btn vsb-ghost" data-close>×</button>
      </div>
      <div class="vsb-modal-body"><div data-adv-container></div></div>
      <div class="vsb-modal-footer">
        <button class="vsb-btn" data-apply>应用</button>
        <button class="vsb-btn vsb-ghost" data-cancel>取消</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const advContainer = dialog.querySelector('[data-adv-container]') as HTMLElement;
    let frag = this.advSqlFragment;
    new VisualSqlAdvancedUI(advContainer, {
      persistKey: 'siyuan-steve-tools:visual-sql-advanced-ui',
      onChangeSql: (f) => { frag = f; }
    });

    const close = () => overlay.remove();
    (dialog.querySelector('[data-close]') as HTMLButtonElement).addEventListener('click', close);
    (dialog.querySelector('[data-cancel]') as HTMLButtonElement).addEventListener('click', close);
    (dialog.querySelector('[data-apply]') as HTMLButtonElement).addEventListener('click', () => {
      this.advSqlFragment = frag || '';
      this.rebuildSql();
      close();
    });
  }
}