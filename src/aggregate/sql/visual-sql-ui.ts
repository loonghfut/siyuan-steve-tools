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
  /**
   * 按钮插入位置：
   * - 'start'（默认）：插入到操作区最左侧
   * - 'before-reset'：插入到“重置”按钮左侧
   */
  placement?: 'start' | 'before-reset';
  onClick?: (ctx: { getSQL: () => string; builder: VisualSqlBuilder; container: HTMLElement; event: MouseEvent; }) => void;
}

export interface VisualSqlUIOptions {
  onSqlChange?: (sql: string) => void;
  buttons?: VisualSqlUIButton[]; // 自定义按钮
  /**
   * 结果预览中单列最大宽度（像素）。
   * 若未提供则默认为 480。
   */
  previewColMaxWidth?: number;
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
  /**
   * 分段嵌入配置：基于 created 时间将查询拆分为多段，并复制多段嵌入块。
   */
  segmentEmbed?: {
    start?: string; // YYYYMMDDHHmmss 或 "YYYY-MM-DD HH:mm"（秒缺省00）
    end?: string;   // 同上
    intervalDays?: number; // 间隔天数（>0）
  };
}

export class VisualSqlUI {
  private container: HTMLElement;
  private opts: VisualSqlUIOptions;
  private builder: VisualSqlBuilder;
  private resizeRaf?: number;
  private storageKey?: string;
  private previewCols?: string[];
  private previewMode: 'normal' | 'segment' = 'normal';

  // 控件引用
  private typeChecks!: NodeListOf<HTMLInputElement>;
  private subtypeChecks!: NodeListOf<HTMLInputElement>;
  private boxChecks!: NodeListOf<HTMLInputElement>;
  private rootIdInput!: HTMLInputElement;
  private parentIdInput!: HTMLInputElement;
  private pathLikeInput!: HTMLInputElement;
  private contentLikeInput!: HTMLInputElement;
  private contentOpSel!: HTMLSelectElement;
  private mdLikeInput!: HTMLInputElement;
  private mdOpSel!: HTMLSelectElement;
  private hpathLikeInput!: HTMLInputElement;
  private ialLikeInput!: HTMLInputElement;
  private tagInput!: HTMLInputElement; // 使用带 datalist 的单一输入
  private tagsDatalist!: HTMLDataListElement;
  private recentTagsKey = 'siyuan-steve-tools:recent-tags';
  private createdDaysInput!: HTMLInputElement;
  private updatedDaysInput!: HTMLInputElement;
  private createdTodayCheck!: HTMLInputElement;
  private updatedTodayCheck!: HTMLInputElement;
  private createdUnitSel!: HTMLSelectElement;
  private updatedUnitSel!: HTMLSelectElement;
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
  private copySegmentEmbedBtn!: HTMLButtonElement;
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
  private lastAppliedPresetName?: string;
  private multiOutsideCloser?: (e: MouseEvent) => void;

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
          <div class="vsb-inline-group">
            <div class="vsb-inline-item">
              <div style="font-size:12px; color: var(--vsb-muted,#4b5563); margin-bottom:6px;">类型（可多选）</div>
              <div class="vsb-multi" data-multi="type">
                <button type="button" class="vsb-input vsb-multi__btn" data-multi-btn aria-haspopup="listbox" aria-expanded="false">选择类型</button>
                <div class="vsb-multi__panel" role="listbox" aria-multiselectable="true">
                  <div class="vsb-chips" aria-label="类型">
                    ${(([
        { v: 'd', n: '文档块' },
        { v: 'h', n: '标题块' },
        { v: 'l', n: '列表块' },
        { v: 'i', n: '列表项' },
        { v: 'b', n: '引述块' },
        { v: 's', n: '超级块' },
        { v: 'p', n: '段落块' },
        { v: 'c', n: '代码块' },
        { v: 'm', n: '数学公式' },
        { v: 't', n: '表格块' },
        { v: 'tb', n: '分隔线' },
        { v: 'av', n: '数据库块' },
        { v: 'query_embed', n: '嵌入块' },
        { v: 'video', n: '视频块' },
        { v: 'audio', n: '音频块' },
        { v: 'widget', n: '挂件块' },
        { v: 'iframe', n: 'IFrame 块' },
        { v: 'html', n: 'HTML 块' }
      ] as Array<{ v: BlockType; n: string }>).map(it =>
        `<label class=\"vsb-chip\"><input type=\"checkbox\" data-type value=\"${it.v}\"/><span>${it.n}</span></label>`
      ).join(''))}
                  </div>
                  <div class="vsb-multi__footer">
                    <button class="vsb-btn vsb-ghost" type="button" data-multi-clear>清空</button>
                    <button class="vsb-btn" type="button" data-multi-ok>完成</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="vsb-inline-item">
              <div style="font-size:12px; color: var(--vsb-muted,#4b5563); margin-bottom:6px;">子类型（可多选）</div>
              <div class="vsb-multi" data-multi="subtype">
                <button type="button" class="vsb-input vsb-multi__btn" data-multi-btn aria-haspopup="listbox" aria-expanded="false">选择子类型</button>
                <div class="vsb-multi__panel" role="listbox" aria-multiselectable="true">
                  <div class="vsb-chips" aria-label="子类型">
                    ${(([
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
      ).join(''))}
                  </div>
                  <div class="vsb-multi__footer">
                    <button class="vsb-btn vsb-ghost" type="button" data-multi-clear>清空</button>
                    <button class="vsb-btn" type="button" data-multi-ok>完成</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="vsb-inline-item">
              <div style="font-size:12px; color: var(--vsb-muted,#4b5563); margin-bottom:6px;">笔记本（可多选）</div>
              <div class="vsb-multi" data-multi="box">
                <button type="button" class="vsb-input vsb-multi__btn" data-multi-btn aria-haspopup="listbox" aria-expanded="false">选择笔记本</button>
                <div class="vsb-multi__panel" role="listbox" aria-multiselectable="true">
                  <div class="vsb-chips" aria-label="笔记本">
                    ${(() => {
        const nbs = (window as any)?.siyuan?.notebooks;
        if (!Array.isArray(nbs) || !nbs.length) {
          return `<span style=\"color:#9ca3af\">无可用日记本</span>`;
        }
        return nbs.map((n: any) => `<label class=\"vsb-chip\"><input type=\"checkbox\" data-box-id value=\"${n.id}\"/><span>${n.name || n.id}</span></label>`).join('');
      })()}
                  </div>
                  <div class="vsb-multi__footer">
                    <button class="vsb-btn vsb-ghost" type="button" data-multi-clear>清空</button>
                    <button class="vsb-btn" type="button" data-multi-ok>完成</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="vsb-grid vsb-grid-4">
            <label class="vsb-field">tag 包含
              <input class="vsb-input" data-tag list="vsb-tags-list" placeholder="选择或搜索标签" />
              <datalist id="vsb-tags-list"></datalist>
            </label>
            <label class="vsb-field">markdown
              <div style="display:flex; gap:6px; align-items:center;">
                <select class="vsb-input" data-md-op>
                  <option value="like">LIKE</option>
                  <option value="regexp">REGEXP</option>
                </select>
                <input class="vsb-input" data-md type="text" placeholder="* [ ] % 或 正则表达式"/>
              </div>
            </label>
            <label class="vsb-field">content
              <div style="display:flex; gap:6px; align-items:center;">
                <select class="vsb-input" data-content-op>
                  <option value="like">LIKE</option>
                  <option value="regexp">REGEXP</option>
                </select>
                <input class="vsb-input" data-content type="text" placeholder="%关键字% 或 正则表达式"/>
              </div>
            </label>
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

            <label class="vsb-field">created 近 N
              <div style="display:flex; gap:6px; align-items:center;">
                <input class="vsb-input" data-created-days type="number" min="0" value="0" style="width:80px;"/>
                <select class="vsb-input" data-created-unit style="width:84px;">
                  <option value="day" selected>天</option>
                  <option value="hour">小时</option>
                  <option value="minute">分钟</option>
                </select>
              </div>
            </label>
            <label class="vsb-field">created 今天
              <div class="vsb-seg" style="background:transparent; border:none; padding:0; gap:6px; align-items:center;">
                <input type="checkbox" data-created-today />
                <span style="font-size:12px;color:var(--vsb-muted)">仅限本地时区的今天</span>
              </div>
            </label>
            <label class="vsb-field">updated 近 N
              <div style="display:flex; gap:6px; align-items:center;">
                <input class="vsb-input" data-updated-days type="number" min="0" value="0" style="width:80px;"/>
                <select class="vsb-input" data-updated-unit style="width:84px;">
                  <option value="day" selected>天</option>
                  <option value="hour">小时</option>
                  <option value="minute">分钟</option>
                </select>
              </div>
            </label>
            <label class="vsb-field">updated 今天
              <div class="vsb-seg" style="background:transparent; border:none; padding:0; gap:6px; align-items:center;">
                <input type="checkbox" data-updated-today />
                <span style="font-size:12px;color:var(--vsb-muted)">仅限本地时区的今天</span>
              </div>
            </label>
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
            <button class="vsb-btn" data-copy-embed>嵌入块</button>
            <button class="vsb-btn" data-copy-seg-embed title="按设置的 created 起止与间隔，生成分段嵌入">分段嵌入</button>
            <button class="vsb-btn vsb-ghost" data-reset>重置</button>
          </div>

          <pre class="vsb-output" data-output></pre>
        </details>

        <details class="vsb-card" open data-section="preview" style="margin-top:8px;">
          <summary class="vsb-legend">结果预览
            <button class="vsb-icon-btn" type="button" data-preview-seg-embed title="分段嵌入预览" aria-label="分段嵌入预览">▦</button>
            <button class="vsb-icon-btn" type="button" data-preview-refresh title="刷新预览" aria-label="刷新预览">⟳</button>
          </summary>
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
    this.contentOpSel = this.container.querySelector('select[data-content-op]') as HTMLSelectElement;
    this.mdOpSel = this.container.querySelector('select[data-md-op]') as HTMLSelectElement;
    this.hpathLikeInput = this.container.querySelector('input[data-hpath]') as HTMLInputElement;
    this.ialLikeInput = this.container.querySelector('input[data-ial]') as HTMLInputElement;
    this.tagInput = this.container.querySelector('input[data-tag]') as HTMLInputElement;
    this.tagsDatalist = this.container.querySelector('#vsb-tags-list') as HTMLDataListElement;
    this.createdDaysInput = this.container.querySelector('input[data-created-days]') as HTMLInputElement;
    this.updatedDaysInput = this.container.querySelector('input[data-updated-days]') as HTMLInputElement;
  this.createdTodayCheck = this.container.querySelector('input[data-created-today]') as HTMLInputElement;
  this.updatedTodayCheck = this.container.querySelector('input[data-updated-today]') as HTMLInputElement;
  this.createdUnitSel = this.container.querySelector('select[data-created-unit]') as HTMLSelectElement;
  this.updatedUnitSel = this.container.querySelector('select[data-updated-unit]') as HTMLSelectElement;
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
    this.copySegmentEmbedBtn = this.container.querySelector('button[data-copy-seg-embed]') as HTMLButtonElement;
    this.resetBtn = this.container.querySelector('button[data-reset]') as HTMLButtonElement;
    this.actionsEl = this.container.querySelector('.vsb-actions') as HTMLElement;
    const advOpenBtn = this.container.querySelector('button[data-adv-open]') as HTMLButtonElement;
    const filtersSection = this.container.querySelector('details[data-section="filters"]') as HTMLDetailsElement | null;
    const previewSection = this.container.querySelector('details[data-section="preview"]') as HTMLDetailsElement | null;
    const previewRefreshBtn = this.container.querySelector('button[data-preview-refresh]') as HTMLButtonElement | null;
    const previewSegEmbedBtn = this.container.querySelector('button[data-preview-seg-embed]') as HTMLButtonElement | null;
    this.currentPresetEl = this.container.querySelector('[data-current-preset]') as HTMLElement;
    this.updateCurrentPresetLabel();
    this.currentPresetEl?.addEventListener('click', (e) => this.openPresetQuickMenu(e));


    // 异步加载标签下拉
    this.populateTags();
    // 初始化下拉多选交互
    this.initMultiSelectDropdowns();

    // 事件
    const changeInputs = this.container.querySelectorAll('input, select');
    const onUserChange = () => {
      // 不在此处清空当前预设名，改为在 rebuild 后按内容自动判定
      this.rebuildSql();
    };
    changeInputs.forEach(el => el.addEventListener('change', onUserChange));
    // “今天”复选框切换时，禁用/启用相关时间输入
    const updateTimeControlsDisabled = () => {
      const cToday = !!this.createdTodayCheck?.checked;
      const uToday = !!this.updatedTodayCheck?.checked;
      if (this.createdDaysInput) this.createdDaysInput.disabled = cToday;
      if (this.createdUnitSel) this.createdUnitSel.disabled = cToday;
      if (this.createdOpSel) this.createdOpSel.disabled = cToday;
      if (this.createdAtInput) this.createdAtInput.disabled = cToday;
      if (this.updatedDaysInput) this.updatedDaysInput.disabled = uToday;
      if (this.updatedUnitSel) this.updatedUnitSel.disabled = uToday;
      if (this.updatedOpSel) this.updatedOpSel.disabled = uToday;
      if (this.updatedAtInput) this.updatedAtInput.disabled = uToday;
    };
    this.createdTodayCheck?.addEventListener('change', () => updateTimeControlsDisabled());
    this.updatedTodayCheck?.addEventListener('change', () => updateTimeControlsDisabled());
    // 初始更新禁用态
    updateTimeControlsDisabled();
    this.tagInput.addEventListener('change', () => {
      const v = (this.tagInput.value || '').trim();
      if (v) this.pushRecentTags([v]);
    });
    this.copyBtn.addEventListener('click', () => this.copySql());
    this.copyEmbedBtn.addEventListener('click', () => this.copyEmbedSql());
    this.copySegmentEmbedBtn.addEventListener('click', () => this.copySegmentedEmbed());
    this.resetBtn.addEventListener('click', () => this.resetForm());
    advOpenBtn?.addEventListener('click', () => this.openAdvancedModal());
    // 刷新按钮：刷新当前模式
    previewRefreshBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        this.saveState();
        if (this.previewMode === 'segment') {
          this.openSegmentedEmbedPreview();
        } else {
          const sql = this.outputPre?.textContent || this.builder.compile();
          const token = ++this.lastQuerySeq;
          this.queryNow(token, this.ensureLimit(sql));
        }
        this.toast('已刷新预览');
      } catch { }
    });
    // 分段按钮：切换模式（normal ↔ segment）并渲染
    previewSegEmbedBtn?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.previewMode = this.previewMode === 'segment' ? 'normal' : 'segment';
      this.saveState();
      if (this.previewMode === 'segment') this.openSegmentedEmbedPreview();
      else {
        const sql = this.outputPre?.textContent || this.builder.compile();
        const token = ++this.lastQuerySeq;
        this.queryNow(token, this.ensureLimit(sql));
      }
    });
    // 折叠状态变更时持久化
    filtersSection?.addEventListener('toggle', () => this.saveState());
    previewSection?.addEventListener('toggle', () => this.saveState());


    // 渲染自定义按钮（如有）
    if (Array.isArray(this.opts.buttons) && this.opts.buttons.length && this.actionsEl) {
      const getSQL = () => this.builder.compile();
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
        const targetBefore = (cfg.placement === 'before-reset')
          ? (this.resetBtn as HTMLElement | null)
          : (this.actionsEl.firstElementChild as HTMLElement | null);
        this.actionsEl.insertBefore(btn, targetBefore || null);
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
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'));
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
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
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
    const contentRaw = (this.contentLikeInput.value || '').trim();
    const mdRaw = (this.mdLikeInput.value || '').trim();
    const contentLike = contentRaw ? (this.contentOpSel?.value === 'regexp' ? contentRaw : this.smartLike(contentRaw)) : undefined;
    const mdLike = mdRaw ? (this.mdOpSel?.value === 'regexp' ? mdRaw : this.smartLike(mdRaw)) : undefined;
    const hpathLike = this.smartLike(this.hpathLikeInput?.value);
    const ialLike = this.smartLike(this.ialLikeInput?.value);
    if (pathLike) this.builder.pathLike(pathLike);
    if (contentLike) {
      if (this.contentOpSel?.value === 'regexp') this.builder.addFilter({ field: 'content', op: 'regexp', value: contentLike });
      else this.builder.contentLike(contentLike);
    }
    if (mdLike) {
      if (this.mdOpSel?.value === 'regexp') this.builder.addFilter({ field: 'markdown', op: 'regexp', value: mdLike });
      else this.builder.markdownLike(mdLike);
    }
    if (hpathLike) this.builder.addFilter({ field: 'hpath', op: 'like', value: hpathLike });
    if (ialLike) this.builder.addFilter({ field: 'ial', op: 'like', value: ialLike });
    const tagRaw = (this.tagInput.value || '').trim();
    const tag = tagRaw.replace(/^#+/, ''); // 去除开头的 #，避免重复
    this.builder.hasTag(tag);
    // 时间：若设置了具体时间比较，则优先使用；否则使用“近 N 天”
    const createdAt = (this.createdAtInput?.value || '').trim();
    if (this.createdTodayCheck?.checked) {
      this.builder.createdToday();
    } else if (createdAt) {
      const ts = this.datetimeLocalToTS(createdAt);
      if (ts) this.builder.addFilter({ field: 'created', op: this.createdOpSel?.value || '>', value: ts });
    } else {
      const n = Number(this.createdDaysInput.value || 0);
      const u = (this.createdUnitSel?.value as any) || 'day';
      if (n > 0) (this.builder as any).createdSince?.(n, u) || this.builder.createdSinceDays(n);
    }
    const updatedAt = (this.updatedAtInput?.value || '').trim();
    if (this.updatedTodayCheck?.checked) {
      this.builder.updatedToday();
    } else if (updatedAt) {
      const ts = this.datetimeLocalToTS(updatedAt);
      if (ts) this.builder.addFilter({ field: 'updated', op: this.updatedOpSel?.value || '>', value: ts });
    } else {
      const n = Number(this.updatedDaysInput.value || 0);
      const u = (this.updatedUnitSel?.value as any) || 'day';
      if (n > 0) (this.builder as any).updatedSince?.(n, u) || this.builder.updatedSinceDays(n);
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
    if (this.previewMode === 'segment') {
      this.openSegmentedEmbedPreview();
    } else {
      this.scheduleQuery(sql);
    }
    // 重建后根据当前筛选与已保存预设的内容一致性，自动更新“当前预设”标签
    this.refreshCurrentPresetByContent().catch(() => { });
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

    const thead = `<thead><tr><th class="vsb-th-rownumber">#</th>${cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map((r, idx) => {
      const rowNo = `<td class="vsb-rownumber">${idx + 1}</td>`;
      if (!r || typeof r !== 'object') {
        const txt = this.escapeHtml(String(r));
        return `<tr>${rowNo}<td colspan="${Math.max(1, cols.length)}">${txt}</td></tr>`;
      }
      const cells = cols.map(c => `<td>${this.escapeHtml(this.formatCell(r[c]))}</td>`).join('');
      return `<tr>${rowNo}${cells}</tr>`;
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

  // 根据状态快照生成 SQL（仅用于展示/预览）
  private compileSqlFromSnapshot(s: any): string {
    const b = new VisualSqlBuilder('embedded');
    const types = Array.isArray(s?.types) ? s.types : [];
    const subtypes = Array.isArray(s?.subtypes) ? s.subtypes : [];
    b.byTypes(types as BlockType[]).bySubtypes(subtypes as string[]);
    if (Array.isArray(s?.boxes) && s.boxes.length) {
      b.addFilter({ field: 'box', op: 'in', value: s.boxes });
    }
    const smartLike = (v: any) => {
      const val = (v ?? '').toString().trim();
      if (!val) return undefined;
      if (/%|_/.test(val)) return val;
      return `%${val}%`;
    };
    b.inDoc((s?.rootId || '').trim());
    b.parentIs((s?.parentId || '').trim());
    const pathLike = smartLike(s?.path);
    const contentRaw = (s?.content || '').toString().trim();
    const mdRaw = (s?.md || '').toString().trim();
    const contentLike = contentRaw ? ((s?.contentOp === 'regexp') ? contentRaw : smartLike(contentRaw)) : undefined;
    const mdLike = mdRaw ? ((s?.mdOp === 'regexp') ? mdRaw : smartLike(mdRaw)) : undefined;
    const hpathLike = smartLike(s?.hpath);
    const ialLike = smartLike(s?.ial);
    if (pathLike) b.pathLike(pathLike);
    if (contentLike) {
      if (s?.contentOp === 'regexp') b.addFilter({ field: 'content', op: 'regexp', value: contentLike });
      else b.contentLike(contentLike);
    }
    if (mdLike) {
      if (s?.mdOp === 'regexp') b.addFilter({ field: 'markdown', op: 'regexp', value: mdLike });
      else b.markdownLike(mdLike);
    }
    if (hpathLike) b.addFilter({ field: 'hpath', op: 'like', value: hpathLike });
    if (ialLike) b.addFilter({ field: 'ial', op: 'like', value: ialLike });
    const tagRaw = (s?.tag || '').toString().trim();
    const tag = tagRaw.replace(/^#+/, '');
    b.hasTag(tag);
    // 时间优先级：今天 > 具体时间比较 > 近 N 天
    const toTS = (v: string) => {
      const m = (v || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
      if (m) return `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6] ?? '00'}`;
      return '';
    };
    if (s?.createdToday) {
      (b as any).createdToday?.() || b.addFilter({ rawSql: `created >= strftime('%Y%m%d%H%M%S','now','localtime','start of day') AND created < strftime('%Y%m%d%H%M%S','now','localtime','start of day','+1 day')` });
    } else if (s?.createdAt) {
      const ts = toTS(s.createdAt);
      if (ts) b.addFilter({ field: 'created', op: (s?.createdOp || '>') as any, value: ts });
    } else if (s?.createdDays) {
      const n = Number(s.createdDays || 0);
      const u = (s?.createdUnit || 'day') as any;
      if ((b as any).createdSince) (b as any).createdSince(n, u); else b.createdSinceDays(n);
    }
    if (s?.updatedToday) {
      (b as any).updatedToday?.() || b.addFilter({ rawSql: `updated >= strftime('%Y%m%d%H%M%S','now','localtime','start of day') AND updated < strftime('%Y%m%d%H%M%S','now','localtime','start of day','+1 day')` });
    } else if (s?.updatedAt) {
      const ts = toTS(s.updatedAt);
      if (ts) b.addFilter({ field: 'updated', op: (s?.updatedOp || '>') as any, value: ts });
    } else if (s?.updatedDays) {
      const n = Number(s.updatedDays || 0);
      const u = (s?.updatedUnit || 'day') as any;
      if ((b as any).updatedSince) (b as any).updatedSince(n, u); else b.updatedSinceDays(n);
    }
    const orderExpr = (s?.orderField || '').toString();
    const orderDir = (s?.orderDir || 'desc') as OrderDir;
    if (orderExpr) {
      if (orderExpr === 'random()') b.addOrder('random()');
      else b.addOrder(orderExpr, orderDir);
    }
    const limit = s?.limit ? Number(s.limit) : undefined;
    if (limit !== undefined && !Number.isNaN(limit)) {
      b.setLimit(Math.min(999, Math.max(0, limit)));
    }
    const adv = (s?.advSqlFragment || '').toString().trim();
    if (adv) b.addFilter({ rawSql: adv });
    return b.compile();
  }

  private safeCompileSqlFromSnapshot(s: any): string {
    try { return this.compileSqlFromSnapshot(s); } catch { return ''; }
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
    const minW = 60;
    const maxW = this.getPreviewColMaxWidth();
    const widths = ths.map((th, idx) => {
      const base = th.textContent ? (th.textContent.length * 8 + padding) : minW;
      const colMin = idx === 0 ? 40 : minW; // 行号列更窄一些
      return Math.min(maxW, Math.max(colMin, base));
    });
    rows.slice(0, 200).forEach(tr => {
      const tds = Array.from(tr.cells) as HTMLTableCellElement[];
      tds.forEach((td, i) => {
        const text = td.textContent || '';
        let w = text.length * 8 + padding;
        if (ctx) {
          try { w = ctx.measureText(text).width + padding; } catch { }
        }
        const colMin = i === 0 ? 40 : minW;
        widths[i] = Math.min(maxW, Math.max(widths[i] || colMin, Math.ceil(w)));
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
      const maxW = this.getPreviewColMaxWidth();
      const newW = Math.min(maxW, Math.max(40, startW + dx));
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

  private getPreviewColMaxWidth(): number {
    const v = Number(this.opts?.previewColMaxWidth);
    const def = 480;
    const n = Number.isFinite(v) && v > 0 ? v : def;
    // 合理夹取，避免异常值
    return Math.min(2000, Math.max(120, Math.floor(n)));
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
    if (this.tipDocClick) {
      document.removeEventListener('click', this.tipDocClick);
      this.tipDocClick = undefined;
    }
    if (this.tipKeydown) {
      document.removeEventListener('keydown', this.tipKeydown);
      this.tipKeydown = undefined;
    }
    if (this.tipScroll) {
      const body = this.resultsEl?.querySelector?.('.vsb-result__body') as HTMLElement | undefined;
      if (body) body.removeEventListener('scroll', this.tipScroll);
      this.tipScroll = undefined;
    }
  }

  private tsToDate(ts: string): Date | null {
    const m = ts.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!m) return null;
    const [_, y, mo, d, h, mi, se] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
    return isNaN(dt.getTime()) ? null : dt;
  }

  private dateToTs(d: Date): string {
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  private addDays(d: Date, days: number): Date {
    const nd = new Date(d.getTime());
    nd.setDate(nd.getDate() + days);
    return nd;
  }

  private buildWithCreatedCond(sqlBase: string, cond: string): string {
    // 在原 SQL 的 WHERE 后追加 AND (cond)；若原本无 WHERE，则添加 WHERE (cond)
    const hasWhere = /\bwhere\b/i.test(sqlBase);
    const seg = `(${cond})`;
    if (hasWhere) {
      return sqlBase.replace(/\border\b|\blimit\b|$/i, (m) => ` AND ${seg} ${m}`);
    }
    return sqlBase.replace(/\border\b|\blimit\b|$/i, (m) => ` WHERE ${seg} ${m}`);
  }

  private computeSegmentedEmbeds(): { parts: string[]; text: string; segments: Array<{ sql: string; start: Date; end: Date; inclusiveEnd: boolean; label: string; }> } | null {
    const opt = this.opts.segmentEmbed || {};
    const intervalDays = Math.max(1, Math.floor(Number(opt.intervalDays || 0) || 7));
    const startTs = this.parseAnyTs(opt.start);
    const endTs = this.parseAnyTs(opt.end);
    if (!startTs || !endTs) {
      this.toast('请在设置中填写有效的分段开始/结束时间');
      return null;
    }
    const start = this.tsToDate(startTs);
    const end = this.tsToDate(endTs);
    if (!start || !end || start.getTime() >= end.getTime()) {
      this.toast('分段开始/结束时间不合法');
      return null;
    }
    const baseSql = (this.outputPre.textContent || this.builder.compile()).trim();
    if (!baseSql) { this.toast('当前无 SQL'); return null; }
    const parts: string[] = [];
    const segments: Array<{ sql: string; start: Date; end: Date; inclusiveEnd: boolean; label: string; }> = [];
    let cur = new Date(start.getTime());
    while (cur.getTime() < end.getTime()) {
      const next = this.addDays(cur, intervalDays);
      const segStartTs = this.dateToTs(cur);
      const realNext = next.getTime() < end.getTime() ? next : end;
      const segEndTs = this.dateToTs(realNext);
      const cond = (realNext.getTime() < end.getTime())
        ? `created >= '${segStartTs.replace(/'/g, "''")}' AND created < '${segEndTs.replace(/'/g, "''")}'`
        : `created >= '${segStartTs.replace(/'/g, "''")}' AND created <= '${segEndTs.replace(/'/g, "''")}'`;
      const segSql = this.buildWithCreatedCond(baseSql, cond);
      parts.push(`{{${segSql}}}`);
      const inclusiveEnd = !(realNext.getTime() < end.getTime());
      segments.push({
        sql: segSql,
        start: new Date(cur.getTime()),
        end: new Date(realNext.getTime()),
        inclusiveEnd,
        label: this.formatRangeLabel(cur, realNext, inclusiveEnd),
      });
      cur = next;
    }
    return { parts, text: parts.join('\n'), segments };
  }

  private async copySegmentedEmbed() {
    const res = this.computeSegmentedEmbeds();
    if (!res) return;
    const segs = res.segments;
    if (!segs.length) { this.toast('无可用分段'); return; }
    // 并发探测每段是否有结果（强制 LIMIT 1），仅保留有结果的段
    const include: boolean[] = new Array(segs.length).fill(false);
    let cursor = 0;
    const maxConc = Math.min(3, segs.length);
    const runner = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= segs.length) return;
        try {
          const probe = this.forceLimit(segs[idx].sql, 1);
          const rows = await runSql(probe);
          if (Array.isArray(rows) && rows.length > 0) include[idx] = true;
        } catch { /* 忽略探测异常，视为无结果 */ }
      }
    };
    await Promise.all(new Array(maxConc).fill(0).map(() => runner()));
    const parts = segs.map((seg, i) => include[i] ? `{{${seg.sql}}}` : '').filter(Boolean);
    if (!parts.length) { this.toast('所有分段均无结果，未复制'); return; }
    await this.copyText(parts.join('\n'), `已复制 ${parts.length} 段（已过滤空段）`);
  }

  // 将 SQL 的 LIMIT 强制为指定数值；若无 LIMIT 则追加
  private forceLimit(sql: string, n: number): string {
    const s = (sql || '').trim().replace(/;\s*$/, '');
    const re = /limit\s+\d+(\s+offset\s+\d+)?/i;
    if (re.test(s)) return s.replace(re, `LIMIT ${Math.max(0, Math.floor(n))}`);
    return `${s} LIMIT ${Math.max(0, Math.floor(n))}`;
  }

  private openSegmentedEmbedPreview() {
    // 在结果预览区渲染分段列表；仅在滚动时懒加载可见项（并发 2）
    const res = this.computeSegmentedEmbeds();
    if (!res || !this.resultsEl) return;
    const headerEl = document.createElement('div');
    headerEl.className = 'vsb-result__head';
    headerEl.innerHTML = `<div>分段结果预览 · 共 ${res.segments.length} 段</div>`;
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'vsb-result__body';
    const list = document.createElement('div');
    list.className = 'vsb-segprev-list';
    list.innerHTML = res.segments.map((seg, i) => `
      <div class="vsb-segprev-item" data-idx="${i}">
        <div class="vsb-segprev-head">
          <div class="vsb-segprev-title">第 ${i + 1} 段：${this.escapeHtml(seg.label)}</div>
        </div>
        <div class="vsb-segprev-body"><div class="vsb-loading">等待加载…</div></div>
      </div>
    `).join('');
    bodyWrap.appendChild(list);
    this.resultsEl.innerHTML = '';
    this.resultsEl.appendChild(headerEl);
    this.resultsEl.appendChild(bodyWrap);

    const rootEl = bodyWrap;
    const maxConcurrency = 2;
    let running = 0;
    const queued = new Set<number>();
    const loaded = new Set<number>();
    const pending: Array<() => Promise<void>> = [];

    const updateHeaderCount = () => {
      const remain = list.querySelectorAll('.vsb-segprev-item').length;
      const left = headerEl.querySelector('div:first-child');
      if (left) left.textContent = `分段结果预览 · 共 ${remain} 段`;
    };

    const pump = () => {
      if (!pending.length) return;
      while (running < maxConcurrency && pending.length) {
        const task = pending.shift()!;
        running++;
        task().finally(() => { running--; pump(); });
      }
    };

    const enqueue = (idx: number, el: HTMLElement, sql: string) => {
      if (loaded.has(idx) || queued.has(idx)) return;
      queued.add(idx);
      pending.push(async () => {
        const body = el.querySelector('.vsb-segprev-body') as HTMLElement;
        try {
          const rows = await this.loadSegmentRows(sql);
          if (!Array.isArray(rows) || rows.length === 0) {
            el.remove();
            updateHeaderCount();
            return;
          }
          body.innerHTML = this.buildSegmentTableHtml(rows);
          this.applyTableBehaviors(body);
        } catch (e: any) {
          body.innerHTML = `<div class=\"vsb-error\">${this.escapeHtml(e?.message || '加载失败')}</div>`;
        } finally {
          loaded.add(idx);
        }
      });
      pump();
    };

    const items = Array.from(list.querySelectorAll('.vsb-segprev-item')) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const el = en.target as HTMLElement;
          const idx = Number(el.getAttribute('data-idx'));
          const sql = res.segments[idx].sql;
          enqueue(idx, el, sql);
          io.unobserve(el);
        }
      });
    }, { root: rootEl, threshold: 0.1 });
    items.forEach(el => io.observe(el));
  }


  private buildSegmentTableHtml(rows: any[]): string {
    const total = rows.length;
    if (!total) return `<div class="vsb-result__placeholder">无结果</div>`;
    // 列选择与主预览一致
    let cols: string[];
    if (this.previewCols && this.previewCols.length) {
      cols = this.previewCols.slice(0, 12);
    } else {
      const colSet = new Set<string>();
      for (const r of rows) {
        if (r && typeof r === 'object') Object.keys(r).forEach(k => colSet.add(k));
        if (colSet.size > 24) break;
      }
      cols = Array.from(colSet).slice(0, 12);
    }
    const thead = `<thead><tr><th class=\"vsb-th-rownumber\">#</th>${cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map((r, idx) => {
      const rowNo = `<td class=\"vsb-rownumber\">${idx + 1}</td>`;
      if (!r || typeof r !== 'object') return `<tr>${rowNo}<td colspan=\"${Math.max(1, cols.length)}\">${this.escapeHtml(String(r))}</td></tr>`;
      const cells = cols.map(c => `<td>${this.escapeHtml(this.formatCell(r[c]))}</td>`).join('');
      return `<tr>${rowNo}${cells}</tr>`;
    }).join('')}</tbody>`;
    return `<table class="vsb-table">${thead}${tbody}</table>`;
  }

  private applyTableBehaviors(scope: HTMLElement) {
    const tbl = scope.querySelector('table.vsb-table') as HTMLTableElement | null;
    if (!tbl) return;
    const widths = this.measureColumnWidths(tbl);
    const cg = document.createElement('colgroup');
    widths.forEach(w => { const col = document.createElement('col'); col.style.width = w + 'px'; cg.appendChild(col); });
    tbl.insertBefore(cg, tbl.firstChild);
    const ths = Array.from(tbl.querySelectorAll('thead th')) as HTMLTableCellElement[];
    ths.forEach((th, idx) => this.attachColResizer(th, idx, tbl));
    this.attachCellTooltip(tbl);
    const wrap = scope.closest('.vsb-result__body') as HTMLElement | null;
    wrap?.classList.add('vsb-fade-in');
  }

  private async loadSegmentRows(sql: string) {
    const stmt = this.ensureLimit(sql);
    return await runSql(stmt);
  }


  private formatRangeLabel(start: Date, end: Date, inclusiveEnd: boolean): string {
    const f = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    return inclusiveEnd ? `${f(start)} ~ ${f(end)}（闭）` : `${f(start)} ~ ${f(end)}（开）`;
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

  // ===== 辅助方法缺失修复 =====
  private escapeHtml(s: any): string {
    const str = (s == null ? '' : String(s));
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private smartLike(v: any): string | undefined {
    const val = (v ?? '').toString().trim();
    if (!val) return undefined;
    if (/%|_/.test(val)) return val; // 已包含通配符
    return `%${val}%`;
  }

  private datetimeLocalToTS(v: string): string {
    const s = (v || '').trim();
    if (!s) return '';
    // 允许 "YYYY-MM-DDTHH:mm" / "YYYY-MM-DD HH:mm" / 可带秒
    const digits = s.replace(/\D/g, '');
    if (digits.length === 14) return digits;
    if (digits.length === 12) return digits + '00';
    if (digits.length === 8) return digits + '000000';
    return '';
  }

  private parseAnyTs(v?: string): string {
    const s = (v || '').trim();
    if (!s) return '';
    // 接受纯 14 位，或包含分隔符的日期时间
    const digits = /^(\d{14})$/.test(s) ? s : s.replace(/\D/g, '');
    if (digits.length === 14) return digits;
    if (digits.length === 12) return digits + '00';
    if (digits.length === 8) return digits + '000000';
    return '';
  }

  private formatCell(v: any): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { return JSON.stringify(v); } catch { return String(v); }
  }

  private async copySql() {
    const sql = (this.outputPre?.textContent || this.builder.compile());
    await this.copyText(sql, '已复制 SQL');
  }

  private async copyEmbedSql() {
    const sql = (this.outputPre?.textContent || this.builder.compile());
    await this.copyText(`{{${sql}}}`, '已复制嵌入块');
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
    this.updateAllMultiSummaries();
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
      /* legend 右侧小图标按钮（仅用于 details > summary 处） */
      details.vsb-card > summary.vsb-legend{display:flex; align-items:center; justify-content:space-between; gap:6px}
  details.vsb-card > summary.vsb-legend .vsb-icon-btn{margin-left:auto; appearance:none; border:1px solid var(--vsb-border); background: var(--b3-theme-background); color: var(--vsb-muted); width:22px; height:22px; line-height:20px; text-align:center; border-radius:6px; cursor:pointer; font-size:12px; padding:0}
      details.vsb-card > summary.vsb-legend .vsb-icon-btn:hover{background: var(--b3-list-hover)}
  /* 保证多个图标按钮相邻展示 */
  details.vsb-card > summary.vsb-legend .vsb-icon-btn + .vsb-icon-btn{margin-left:6px}
      
  /* 分段预览样式 */
  .vsb-segprev-list{display:flex; flex-direction:column; gap:10px}
  .vsb-segprev-item{border:1px solid var(--b3-border-color); border-radius:8px; overflow:hidden}
  .vsb-segprev-head{display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background: var(--b3-theme-surface); border-bottom:1px solid var(--b3-border-color)}
  .vsb-segprev-title{font-size:12px; color: var(--vsb-muted)}
  .vsb-segprev-body{padding:8px; overflow:auto}
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
  /* 横向分组，空间不够再换行（仅常用筛选区域内） */
  .vsb-wrap details[data-section="filters"] .vsb-inline-group{display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start; margin-bottom:6px}
  .vsb-wrap details[data-section="filters"] .vsb-inline-group .vsb-inline-item{min-width:260px; flex:1 1 260px}
  /* 下拉多选样式（仅常用筛选区域内生效） */
  .vsb-wrap details[data-section="filters"] .vsb-multi{position:relative; display:inline-block; min-width:220px}
  .vsb-wrap details[data-section="filters"] .vsb-multi__btn{display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; font-size:12px}
  .vsb-wrap details[data-section="filters"] .vsb-multi__btn::after{content:"▾"; font-size:10px; color: var(--vsb-muted)}
  .vsb-wrap details[data-section="filters"] .vsb-multi__panel{position:absolute; top:calc(100% + 6px); left:0; min-width:280px; max-width:min(420px, 80vw); max-height:50vh; overflow:auto; z-index:9998; background: var(--b3-theme-surface); border:1px solid var(--b3-border-color); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.35); padding:10px; display:none}
  .vsb-wrap details[data-section="filters"] .vsb-multi.is-open .vsb-multi__panel{display:block}
  .vsb-wrap details[data-section="filters"] .vsb-multi__footer{display:flex; gap:8px; justify-content:flex-end; padding-top:8px; margin-top:8px; border-top:1px solid var(--b3-border-color)}
  /* 下拉面板底部按钮更紧凑，仅筛选区域 */
  .vsb-wrap details[data-section="filters"] .vsb-multi__panel .vsb-btn{padding:4px 8px; font-size:12px}
  /* 更紧凑的下拉项：仅在筛选下拉面板内 */
  .vsb-wrap details[data-section="filters"] .vsb-multi__panel .vsb-chips{gap:4px}
  .vsb-wrap details[data-section="filters"] .vsb-multi__panel .vsb-chip span{padding:3px 6px; font-size:12px}
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
  /* 在“无限高”模式下，仍保留一个合理的最大高度以允许局部滚动 */
  .vsb-wrap.vsb-no-limit-preview .vsb-result__body{height:auto; max-height: var(--vsb-result-max-height, 80vh); overflow-y:auto; overflow-x:auto}
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
  /* 行号列样式 */
  .vsb-table th.vsb-th-rownumber, .vsb-table td.vsb-rownumber{color: var(--vsb-muted); text-align:right; width: 1%; white-space:nowrap}
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
      contentOp: this.contentOpSel?.value ?? 'like',
      md: this.mdLikeInput?.value ?? '',
      mdOp: this.mdOpSel?.value ?? 'like',
      hpath: this.hpathLikeInput?.value ?? '',
      ial: this.ialLikeInput?.value ?? '',
      tag: this.tagInput?.value ?? '',
      createdDays: this.createdDaysInput?.value ?? '',
      updatedDays: this.updatedDaysInput?.value ?? '',
  createdUnit: this.createdUnitSel?.value ?? 'day',
  updatedUnit: this.updatedUnitSel?.value ?? 'day',
  createdToday: this.createdTodayCheck?.checked ?? false,
  updatedToday: this.updatedTodayCheck?.checked ?? false,
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
      previewMode: this.previewMode,
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
      contentOp: normStr(pick('contentOp', 'like')),
      md: normStr(pick('md')),
      mdOp: normStr(pick('mdOp', 'like')),
      hpath: normStr(pick('hpath')),
      ial: normStr(pick('ial')),
      tag: normStr(pick('tag')),
      createdDays: normStr(pick('createdDays')),
      updatedDays: normStr(pick('updatedDays')),
  createdUnit: normStr(pick('createdUnit','day')),
  updatedUnit: normStr(pick('updatedUnit','day')),
  createdToday: !!pick('createdToday', false),
  updatedToday: !!pick('updatedToday', false),
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
    } catch { }
    return undefined;
  }

  // 根据当前筛选状态，自动匹配并展示对应的预设名
  private async refreshCurrentPresetByContent() {
    try {
      const presets = this.opts.loadPresets ? await this.opts.loadPresets() : this.loadPresets();
      const snap = this.getStateSnapshot();
      const matched = this.findDuplicatePresetName(presets, snap);
      const prev = this.currentPresetName || '';
      const next = matched || '';
      if (prev !== next) {
        this.currentPresetName = matched;
        this.updateCurrentPresetLabel();
      }
    } catch { }
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
      if (this.contentOpSel) this.contentOpSel.value = s?.contentOp ?? 'like';
      if (this.mdLikeInput) this.mdLikeInput.value = s?.md ?? '';
      if (this.mdOpSel) this.mdOpSel.value = s?.mdOp ?? 'like';
      if (this.hpathLikeInput) this.hpathLikeInput.value = s?.hpath ?? '';
      if (this.ialLikeInput) this.ialLikeInput.value = s?.ial ?? '';
      if (this.tagInput) this.tagInput.value = s?.tag ?? '';
      if (this.createdDaysInput) this.createdDaysInput.value = String(s?.createdDays ?? '');
      if (this.updatedDaysInput) this.updatedDaysInput.value = String(s?.updatedDays ?? '');
  if (this.createdTodayCheck) this.createdTodayCheck.checked = !!s?.createdToday;
  if (this.updatedTodayCheck) this.updatedTodayCheck.checked = !!s?.updatedToday;
      // 同步禁用态
      if (this.createdTodayCheck) {
        const cToday = !!this.createdTodayCheck.checked;
        if (this.createdDaysInput) this.createdDaysInput.disabled = cToday;
        if (this.createdOpSel) this.createdOpSel.disabled = cToday;
        if (this.createdAtInput) this.createdAtInput.disabled = cToday;
      }
      if (this.updatedTodayCheck) {
        const uToday = !!this.updatedTodayCheck.checked;
        if (this.updatedDaysInput) this.updatedDaysInput.disabled = uToday;
        if (this.updatedUnitSel) this.updatedUnitSel.disabled = uToday;
        if (this.updatedOpSel) this.updatedOpSel.disabled = uToday;
        if (this.updatedAtInput) this.updatedAtInput.disabled = uToday;
      }
      if (this.createdUnitSel) this.createdUnitSel.value = s?.createdUnit ?? 'day';
      if (this.updatedUnitSel) this.updatedUnitSel.value = s?.updatedUnit ?? 'day';
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
        this.lastAppliedPresetName = this.currentPresetName;
      }
      this.updateCurrentPresetLabel();
      this.updateAllMultiSummaries();
      if (opts?.applyCollapse) {
        const filtersSection = this.container.querySelector('details[data-section="filters"]') as HTMLDetailsElement | null;
        const previewSection = this.container.querySelector('details[data-section="preview"]') as HTMLDetailsElement | null;
        if (filtersSection) filtersSection.open = s?.filtersOpen !== false;
        if (previewSection) previewSection.open = s?.previewOpen !== false;
      }
      const pm = (s?.previewMode || '').toString();
      this.previewMode = pm === 'segment' ? 'segment' : 'normal';
    } catch { }
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
      try { (this.opts.savePresets(obj) as any); } catch { }
      return;
    }
    try { localStorage.setItem(this.presetsKey!, JSON.stringify(obj)); } catch { }
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

    const nameRaw = await this.openInputModal({
      title: '保存为预设',
      label: '名称',
      placeholder: '输入预设名称',
      defaultValue: this.currentPresetName || this.lastAppliedPresetName || ''
    });
    const name = (nameRaw || '').trim();
    if (!name) return;
    const existingPreset = presets[name];
    if (existingPreset) {
      const ok = await this.openConfirmModal('同名预设已存在，是否覆盖？');
      if (!ok) return;
    }

    // 同时保存编译后的 SQL,供 ECharts 等其他组件使用
    const compiledSQL = this.safeCompileSqlFromSnapshot(snap);
    const presetWithSQL = {
      ...snap,
      name: name,
      sql: compiledSQL,
      _compiledAt: new Date().toISOString()
    };

    const mergedPreset = (existingPreset && typeof existingPreset === 'object')
      ? { ...existingPreset, ...presetWithSQL }
      : presetWithSQL;
    // 保留旧预设里自定义的额外字段（如模板、定时器配置等），仅覆盖当前筛选相关数据。
    presets[name] = mergedPreset;
    await (this.opts.savePresets ? this.opts.savePresets(presets) : (async () => this.savePresets(presets))());
    this.toast(existingPreset ? '预设已覆盖保存' : '已保存筛选预设');
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
      const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .filter(n => !q || n.toLowerCase().includes(q));
      if (!names.length) {
        listEl.innerHTML = `<div class="vsb-item"><div class="vsb-item-name" style="color: var(--vsb-muted)">暂无预设</div></div>`;
        if (countEl) countEl.textContent = '0';
        return;
      }
      if (countEl) countEl.textContent = String(names.length);
      listEl.innerHTML = names.map(n => {
        const sql = this.escapeHtml(this.safeCompileSqlFromSnapshot(presets[n]));
        return `
        <div class="vsb-item" data-name="${this.escapeHtml(n)}">
          <div class="vsb-item__main">
            <div class="vsb-item-name">${this.escapeHtml(n)}</div>
            <pre class="vsb-item-sql">${sql || '（无 SQL 或生成失败）'}</pre>
          </div>
          <div class="vsb-item-actions">
            <button class="vsb-btn" data-apply>应用</button>
            <button class="vsb-btn" data-rename>重命名</button>
            <button class="vsb-btn vsb-btn--danger" data-delete>删除</button>
          </div>
        </div>`;
      }).join('');
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
  .vsb-modal .vsb-item{display:flex; align-items:flex-start; justify-content:space-between; gap:10px; border:1px solid var(--b3-border-color); border-radius:8px; padding:8px 10px; background: var(--b3-theme-background); transition: background .15s, border-color .15s}
  .vsb-modal .vsb-item__main{flex:1; min-width:0}
        .vsb-modal .vsb-item:hover{background: var(--b3-list-hover)}
        .vsb-modal .vsb-item-name{font-size:13px; font-weight:500}
  .vsb-modal .vsb-item-sql{margin:6px 0 0; padding:6px 8px; border:1px solid var(--b3-border-color); border-radius:6px; background: var(--b3-protyle-code-background, var(--b3-theme-background)); color: var(--b3-theme-on-surface); max-height:120px; overflow:auto; white-space:pre-wrap; word-break:break-word; font-family: var(--b3-font-family-code, ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace); font-size:11px}
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

  // ===== 下拉多选交互 =====
  private initMultiSelectDropdowns() {
    const wrappers = Array.from(this.container.querySelectorAll('.vsb-multi')) as HTMLElement[];
    wrappers.forEach(w => this.setupOneMulti(w));
    // 外部点击收起
    this.multiOutsideCloser = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const openList = Array.from(this.container.querySelectorAll('.vsb-multi.is-open')) as HTMLElement[];
      openList.forEach(w => { if (!w.contains(t)) this.setMultiOpen(w, false); });
    };
    document.addEventListener('click', this.multiOutsideCloser);
  }

  private setupOneMulti(wrap: HTMLElement) {
    const btn = wrap.querySelector('[data-multi-btn]') as HTMLButtonElement | null;
    const panel = wrap.querySelector('.vsb-multi__panel') as HTMLElement | null;
    if (!btn || !panel) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !wrap.classList.contains('is-open');
      this.setMultiOpen(wrap, open);
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
    // 清空
    const clearBtn = panel.querySelector('[data-multi-clear]') as HTMLButtonElement | null;
    clearBtn?.addEventListener('click', () => {
      const inputs = Array.from(panel.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
      let changed = false;
      inputs.forEach(i => { if (i.checked) { i.checked = false; changed = true; i.dispatchEvent(new Event('change', { bubbles: true })); } });
      this.updateMultiSummary(wrap);
      if (changed) this.rebuildSql();
    });
    // 完成
    const okBtn = panel.querySelector('[data-multi-ok]') as HTMLButtonElement | null;
    okBtn?.addEventListener('click', () => this.setMultiOpen(wrap, false));
    // 勾选变化更新文案
    panel.querySelectorAll('input[type="checkbox"]').forEach(inp => {
      inp.addEventListener('change', () => this.updateMultiSummary(wrap));
    });
    // 初始
    this.updateMultiSummary(wrap);
  }

  private setMultiOpen(wrap: HTMLElement, open: boolean) {
    const btn = wrap.querySelector('[data-multi-btn]') as HTMLButtonElement | null;
    if (open) wrap.classList.add('is-open'); else wrap.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  private updateMultiSummary(wrap: HTMLElement) {
    const btn = wrap.querySelector('[data-multi-btn]') as HTMLButtonElement | null;
    if (!btn) return;
    const checks = Array.from(wrap.querySelectorAll('.vsb-multi__panel input[type="checkbox"]')) as HTMLInputElement[];
    const labels = checks.filter(i => i.checked).map(i => {
      const lab = i.closest('label.vsb-chip');
      const span = lab?.querySelector('span');
      return (span?.textContent || '').trim();
    }).filter(Boolean);
    if (!labels.length) {
      const kind = wrap.getAttribute('data-multi');
      btn.textContent = kind === 'type' ? '选择类型' : kind === 'subtype' ? '选择子类型' : kind === 'box' ? '选择笔记本' : '请选择';
      btn.title = '';
      return;
    }
    const show = labels.slice(0, 3).join('、');
    const more = labels.length > 3 ? ` 等${labels.length}项` : '';
    btn.textContent = `${show}${more}`;
    btn.title = labels.join('、');
  }

  private updateAllMultiSummaries() {
    const wrappers = Array.from(this.container.querySelectorAll('.vsb-multi')) as HTMLElement[];
    wrappers.forEach(w => this.updateMultiSummary(w));
  }

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