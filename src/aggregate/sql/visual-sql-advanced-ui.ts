// 高阶可视化 SQL 生成器（独立页面/组件）
import { getalltages } from '@/api/api3';
// 现已支持嵌套分组，实现 AND/OR 自由组合；保留规则级 NOT 与字段/运算符联动

export type AdvGroup = 'AND' | 'OR';

export interface AdvRuleState {
    field: string;
    op: string;
    value?: string;
}

type SavedNode = { type: 'group'; op: AdvGroup; children: SavedNode[]; collapsed?: boolean } | { type: 'rule'; state: AdvRuleState };

export interface VisualSqlAdvancedUIOptions {
    persistKey?: string;
    onChangeSql?: (sqlFragment: string) => void;
}

export class VisualSqlAdvancedUI {
    private container: HTMLElement;
    private opts: VisualSqlAdvancedUIOptions;
    private storageKey?: string;
    private rootGroupEl!: HTMLElement; // 根分组容器
    private tagsCache?: string[];
    private tagsLoading?: Promise<string[]>;
    private recentTagsKey = 'siyuan-steve-tools:recent-tags';
    // 字段类型与枚举
    private readonly enumTypeOptions = [
        { v: 'd', n: '文档(d)' },
        { v: 'h', n: '标题(h)' },
        { v: 'm', n: '数学公式(m)' },
        { v: 'c', n: '代码块(c)' },
        { v: 't', n: '表格块(t)' },
        { v: 'l', n: '列表块(l)' },
        { v: 'b', n: '引述块(b)' },
        { v: 's', n: '超级块(s)' },
        { v: 'p', n: '段落块(p)' },
        { v: 'av', n: '数据库(av)' },
    ];
    private readonly enumSubtypeOptions = [
        { v: 'h1', n: 'H1' },
        { v: 'h2', n: 'H2' },
        { v: 'h3', n: 'H3' },
        { v: 'h4', n: 'H4' },
        { v: 'h5', n: 'H5' },
        { v: 'h6', n: 'H6' },
        { v: 'u', n: '无序列表(u)' },
        { v: 't', n: '任务项(t)' },
        { v: 'o', n: '有序列表(o)' },
    ];
    private readonly timestampFields = new Set(['created', 'updated']);
    private readonly numericFields = new Set(['length', 'sort']);
    private readonly enumFields = new Set(['type', 'subtype', 'box']);
    // 其余视为字符串型字段

    constructor(container: HTMLElement, options?: VisualSqlAdvancedUIOptions) {
        this.container = container;
        this.opts = options || {};
        this.storageKey = this.opts.persistKey ?? 'siyuan-steve-tools:visual-sql-advanced-ui';
        this.render();
        this.restoreState();
        this.emitSql();
    }

    private html(strings: TemplateStringsArray, ...values: any[]) {
        return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
    }

    private render() {
        this.injectStyles();
        this.container.innerHTML = this.html`
      <div class="vsb-adv-wrap">
        <div data-root-group></div>
      </div>
    `;
        const mount = this.container.querySelector('[data-root-group]') as HTMLElement;
        this.rootGroupEl = this.createGroup(true, 'AND');
        mount.appendChild(this.rootGroupEl);
    }

    // 创建分组
    private createGroup(isRoot = false, initOp: AdvGroup = 'AND'): HTMLElement {
        const group = document.createElement('div');
        group.className = 'vsb-adv-group';
        group.setAttribute('data-group', '');

        const header = document.createElement('div');
        header.className = 'vsb-adv-header';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '8px';
        header.style.margin = '6px 0';

        // AND/OR 切换
        const seg = document.createElement('div');
        seg.className = 'vsb-seg';
        seg.style.alignItems = 'center';
        const name = `gp_${Math.random().toString(36).slice(2, 8)}`;
        seg.innerHTML = `
      <span style="padding:6px 0 6px 6px; color:var(--vsb-muted)">组合方式</span>
      <label class="vsb-seg-item"><input type="radio" name="${name}" value="AND" ${initOp === 'AND' ? 'checked' : ''}/><span>AND</span></label>
      <label class="vsb-seg-item"><input type="radio" name="${name}" value="OR" ${initOp === 'OR' ? 'checked' : ''}/><span>OR</span></label>
    `;

    // 操作按钮：添加条件 / 添加分组 / 删除分组（根分组不显示删除）/ 折叠
        const btnAddRule = document.createElement('button');
        btnAddRule.className = 'vsb-btn';
        btnAddRule.textContent = '添加条件';
        const btnAddGroup = document.createElement('button');
        btnAddGroup.className = 'vsb-btn';
        btnAddGroup.textContent = '添加分组';
        const btnClear = document.createElement('button');
        btnClear.className = 'vsb-btn vsb-ghost';
        btnClear.textContent = '清空';
        const btnDel = document.createElement('button');
        btnDel.className = 'vsb-btn vsb-ghost';
        btnDel.textContent = '删除分组';
        if (isRoot) btnDel.style.display = 'none';

    const btnToggle = document.createElement('button');
    btnToggle.className = 'vsb-btn vsb-ghost';
    btnToggle.setAttribute('data-collapse-btn', '');
    btnToggle.textContent = '折叠';

    // 预览
    const preview = document.createElement('div');
    preview.className = 'vsb-preview';
    preview.setAttribute('data-preview', '');
    preview.style.display = 'none';

        header.appendChild(seg);
        header.appendChild(btnAddRule);
        header.appendChild(btnAddGroup);
        header.appendChild(btnClear);
        header.appendChild(btnDel);
    header.appendChild(btnToggle);

        const children = document.createElement('div');
        children.className = 'vsb-adv-children';
        children.setAttribute('data-children', '');
        children.style.display = 'grid';
        children.style.gap = '6px';
        children.style.paddingLeft = isRoot ? '0' : '10px';
        children.style.borderLeft = isRoot ? 'none' : '1px dashed var(--b3-border-color)';

        // 事件
        seg.querySelectorAll('input[type="radio"]').forEach(el => el.addEventListener('change', () => this.emitSql()));
        btnAddRule.addEventListener('click', () => {
            // 添加条目时自动展开当前分组（禁用动画，避免抖动）
            this.setGroupCollapsed(group, false, false);
            // 在“规则区域”内的开头插入（保持分组在前、规则在后）
            const row = this.addRule(children, undefined, true);
            this.reorderChildren(children);
            // 确保新增项可见
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            this.emitSql();
        });
        btnAddGroup.addEventListener('click', () => {
            // 添加分组时自动展开当前分组（禁用动画，避免抖动）
            this.setGroupCollapsed(group, false, false);
            // 将新分组插入到规则区域之前（保持所有分组集中在一起）
            const newGroup = this.createGroup(false, 'AND');
            const firstRule = Array.from(children.children).find(el => el.classList.contains('vsb-adv-row')) as HTMLElement | undefined;
            if (firstRule) children.insertBefore(newGroup, firstRule);
            else children.appendChild(newGroup);
            this.reorderChildren(children);
            // 确保新增分组可见
            newGroup.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            this.emitSql();
        });
        btnClear.addEventListener('click', () => { children.innerHTML = ''; this.emitSql(); });
        btnDel.addEventListener('click', () => { group.remove(); this.emitSql(); });

        // 折叠/展开
        btnToggle.addEventListener('click', () => {
            const collapsed = !group.classList.contains('vsb-collapsed');
            this.setGroupCollapsed(group, collapsed);
            this.emitSql(); // 触发预览刷新与持久化
        });

    group.appendChild(header);
    group.appendChild(children);
    group.appendChild(preview);
        return group;
    }

    private getGroupOp(groupEl: HTMLElement): AdvGroup {
        const radio = groupEl.querySelector('.vsb-seg input[type="radio"]:checked') as HTMLInputElement | null;
        return (radio?.value === 'OR' ? 'OR' : 'AND');
    }

    private addRule(parentChildrenEl: HTMLElement, init?: AdvRuleState, insertAtStart: boolean = false): HTMLElement {
        const row = document.createElement('div');
        row.className = 'vsb-adv-row';
        row.style.cssText = 'display:grid; grid-template-columns: 1.2fr 1fr 1.8fr auto; gap:6px; align-items:center;';

        const fieldSel = document.createElement('select');
        fieldSel.className = 'vsb-input';
        fieldSel.setAttribute('data-field', '');
        const fields = ['id', 'type', 'subtype', 'box', 'root_id', 'parent_id', 'path', 'markdown', 'content', 'hpath', 'ial', 'tag', 'created', 'updated', 'sort', 'length'];
        fieldSel.innerHTML = fields.map(f => `<option value="${f}">${f}</option>`).join('');

        const opSel = document.createElement('select');
        opSel.className = 'vsb-input';
        opSel.setAttribute('data-op', '');
        const opsAll = ['=', '!=', '>', '<', '>=', '<=', 'like', 'not like', 'in', 'not in', 'between', 'is null', 'is not null'];
        opSel.innerHTML = opsAll.map(o => `<option value="${o}">${o}</option>`).join('');

        // 值区域：根据字段/操作符渲染专用控件，并把聚合值写入隐藏域 data-value
        const valueWrap = document.createElement('div');
        valueWrap.setAttribute('data-value-wrap', '');
        const valHidden = document.createElement('input');
        valHidden.type = 'hidden';
        valHidden.setAttribute('data-value', '');

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'vsb-btn vsb-ghost';
        delBtn.textContent = '删除';

        // 初始化
        if (init?.field) fieldSel.value = init.field;
        if (init?.op) opSel.value = init.op;
        if (init?.value !== undefined) valHidden.value = init.value ?? '';

        // 字段/运算符联动
        const syncOpByField = () => {
            const f = fieldSel.value;
            if (f === 'tag' && (opSel.value === '=' || !opSel.value)) {
                opSel.value = 'like';
            }
            if ((f === 'created' || f === 'updated') && (opSel.value === '' || opSel.value === 'like')) {
                opSel.value = '>=';
            }
        };
        // 根据字段切换可用运算符
        const setOpsForField = () => {
            const f = fieldSel.value;
            let ops: string[];
            if (f === 'tag') {
                // tag 仅允许 like/not like 及空判断
                ops = ['like', 'not like', 'is null', 'is not null'];
            } else if (this.timestampFields.has(f)) {
                ops = ['=', '!=', '>', '>=', '<', '<=', 'between', 'is null', 'is not null'];
            } else if (this.enumFields.has(f)) {
                ops = ['=', '!=', 'in', 'not in', 'is null', 'is not null'];
            } else if (this.numericFields.has(f)) {
                ops = ['=', '!=', '>', '>=', '<', '<=', 'between', 'in', 'not in', 'is null', 'is not null'];
            } else {
                ops = ['=', '!=', 'like', 'not like', 'in', 'not in', 'is null', 'is not null'];
            }
            const cur = opSel.value;
            opSel.innerHTML = ops.map(o => `<option value="${o}">${o}</option>`).join('');
            if (ops.includes(cur)) opSel.value = cur; else opSel.value = ops[0];
        };

        // 渲染值控件并把结果聚合到 valHidden
        const rebuildValueControl = () => {
            const f = fieldSel.value;
            const op = opSel.value;
            const disable = (op === 'is null' || op === 'is not null');
            valueWrap.innerHTML = '';

            // 辅助：创建多选 select
            const mkSelect = (multiple: boolean, options: Array<{ v: string, n: string }>) => {
                const sel = document.createElement('select');
                sel.className = 'vsb-input';
                if (multiple) sel.multiple = true;
                sel.style.minWidth = multiple ? '220px' : '160px';
                sel.innerHTML = options.map(o => `<option value="${o.v}">${o.n}</option>`).join('');
                return sel;
            };
            const setHidden = (v: string) => { valHidden.value = v; this.emitSql(); };

            if (disable) { setHidden(''); return; }

            if (f === 'tag') {
                // 单一输入 + datalist。值规范化为不带 #
                const combo = document.createElement('input');
                combo.type = 'text';
                combo.className = 'vsb-input';
                combo.placeholder = '选择或搜索标签';
                combo.style.minWidth = '220px';
                const listId = `vsb-tags-${Math.random().toString(36).slice(2, 8)}`;
                combo.setAttribute('list', listId);
                const datalist = document.createElement('datalist');
                datalist.id = listId;
                valueWrap.appendChild(combo);
                valueWrap.appendChild(datalist);

                const applyOptions = (tags: string[]) => {
                    datalist.innerHTML = '';
                    for (const t of tags) {
                        const opt = document.createElement('option');
                        opt.value = t;
                        datalist.appendChild(opt);
                    }
                    if (valHidden.value) combo.value = valHidden.value;
                };

                (async () => {
                    const tags = await this.getTags();
                    applyOptions(this.orderTagsWithRecents(tags));
                })();

                combo.addEventListener('change', () => {
                    const raw = combo.value.trim();
                    const norm = raw.replace(/^#+/, '');
                    combo.value = norm;
                    setHidden(norm);
                    if (norm) this.pushRecentTags([norm]);
                });
                return;
            }

            if (this.enumFields.has(f)) {
                // enum: type/subtype/box
                let opts: Array<{ v: string, n: string }> = [];
                if (f === 'type') opts = this.enumTypeOptions;
                else if (f === 'subtype') opts = this.enumSubtypeOptions;
                else if (f === 'box') {
                    const nbs = (window as any)?.siyuan?.notebooks || [];
                    if (Array.isArray(nbs)) opts = nbs.map((n: any) => ({ v: n.id, n: n.name || n.id }));
                }
                if (op === 'in' || op === 'not in') {
                    const sel = mkSelect(true, opts);
                    // 初始值
                    if (valHidden.value) {
                        const set = new Set(valHidden.value.split(',').filter(Boolean));
                        Array.from(sel.options).forEach(o => o.selected = set.has(o.value));
                    }
                    sel.addEventListener('change', () => {
                        const vals = Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
                        setHidden(vals.join(','));
                    });
                    valueWrap.appendChild(sel);
                } else {
                    const sel = mkSelect(false, opts);
                    if (valHidden.value) sel.value = valHidden.value;
                    sel.addEventListener('change', () => setHidden(sel.value));
                    valueWrap.appendChild(sel);
                }
                return;
            }

            if (this.timestampFields.has(f)) {
                const toTS = (s: string) => this.datetimeLocalToTS(s);
                if (op === 'between') {
                    const a = document.createElement('input');
                    a.type = 'datetime-local';
                    a.className = 'vsb-input';
                    const b = document.createElement('input');
                    b.type = 'datetime-local';
                    b.className = 'vsb-input';
                    a.style.width = '140px'; b.style.width = '140px';
                    // 还原初值（逗号分隔的两端）
                    if (valHidden.value) {
                        const [v1, v2] = valHidden.value.split(',');
                        if (v1) a.value = this.tsToDatetimeLocal(v1);
                        if (v2) b.value = this.tsToDatetimeLocal(v2);
                    }
                    const upd = () => {
                        const v1 = a.value ? toTS(a.value) : '';
                        const v2 = b.value ? toTS(b.value) : '';
                        setHidden([v1, v2].filter(Boolean).join(','));
                    };
                    a.addEventListener('change', upd); b.addEventListener('change', upd);
                    const rowA = document.createElement('div'); rowA.style.display = 'flex'; rowA.style.gap = '6px'; rowA.appendChild(a);
                    const rowB = document.createElement('div'); rowB.style.display = 'flex'; rowB.style.gap = '6px'; rowB.appendChild(b);
                    valueWrap.appendChild(rowA); valueWrap.appendChild(rowB);
                } else {
                    const a = document.createElement('input');
                    a.type = 'datetime-local';
                    a.className = 'vsb-input';
                    a.style.width = '140px';
                    if (valHidden.value) a.value = this.tsToDatetimeLocal(valHidden.value);
                    a.addEventListener('change', () => setHidden(a.value ? toTS(a.value) : ''));
                    const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '6px'; row.appendChild(a);
                    valueWrap.appendChild(row);
                }
                return;
            }

            if (this.numericFields.has(f)) {
                if (op === 'between') {
                    const a = document.createElement('input'); a.type = 'number'; a.className = 'vsb-input'; a.style.minWidth = '120px';
                    const b = document.createElement('input'); b.type = 'number'; b.className = 'vsb-input'; b.style.minWidth = '120px';
                    if (valHidden.value) { const [v1, v2] = valHidden.value.split(','); a.value = v1 || ''; b.value = v2 || ''; }
                    const upd = () => setHidden([a.value, b.value].filter(v => v !== '').join(','));
                    a.addEventListener('change', upd); b.addEventListener('change', upd);
                    valueWrap.appendChild(a); valueWrap.appendChild(b);
                } else {
                    const a = document.createElement('input'); a.type = 'number'; a.className = 'vsb-input'; a.style.minWidth = '140px';
                    if (valHidden.value) a.value = valHidden.value;
                    a.addEventListener('change', () => setHidden(a.value));
                    valueWrap.appendChild(a);
                }
                return;
            }

            // 其他文本型：like 等
            const a = document.createElement('input');
            a.type = 'text';
            a.className = 'vsb-input';
            a.placeholder = (op.includes('like') ? '%关键字%' : '值，in/between 用逗号分隔');
            if (valHidden.value) a.value = valHidden.value;
            a.addEventListener('change', () => setHidden(a.value));
            valueWrap.appendChild(a);
        };

        // 初始化：设置可用运算符、默认运算符与值控件
        const initControls = () => {
            setOpsForField();
            syncOpByField(); rebuildValueControl();
        };
        initControls();

        // 事件
        fieldSel.addEventListener('change', () => {
            // 字段切换：刷新可用运算符，应用默认运算符；清空值，并重建值控件
            setOpsForField();
            syncOpByField();
            valHidden.value = '';
            rebuildValueControl();
            this.emitSql();
        });
        opSel.addEventListener('change', () => {
            // 切换到 tag 时确保没有 in/not in
            if (fieldSel.value === 'tag') {
                const allowed = ['like', 'not like', 'is null', 'is not null'];
                if (!allowed.includes(opSel.value)) {
                    opSel.value = 'like';
                }
            }
            rebuildValueControl(); this.emitSql();
        });
        delBtn.addEventListener('click', () => { row.remove(); this.emitSql(); });

        row.appendChild(fieldSel);
        row.appendChild(opSel);
        row.appendChild(valueWrap);
        row.appendChild(valHidden);
        row.appendChild(delBtn);
        // 插入规则时：保持“分组在前、规则在后”的分区
        const nodes = Array.from(parentChildrenEl.children) as HTMLElement[];
        const ruleNodes = nodes.filter(n => n.classList.contains('vsb-adv-row'));
        if (insertAtStart) {
            // 插入到规则分区开头（即第一个规则之前；若没有规则，则追加到末尾）
            const firstRule = ruleNodes[0];
            if (firstRule) parentChildrenEl.insertBefore(row, firstRule);
            else parentChildrenEl.appendChild(row);
        } else {
            // 插入到规则分区末尾（即最后一个规则之后；若没有规则，则追加到末尾）
            const lastRule = ruleNodes[ruleNodes.length - 1];
            if (lastRule && lastRule.nextSibling) parentChildrenEl.insertBefore(row, lastRule.nextSibling);
            else parentChildrenEl.appendChild(row);
        }

        // 初始 value 恢复后，再渲染一次值控件以匹配
        if (init?.value) {
            rebuildValueControl();
        }
        return row;
    }

    // 对外：获取 SQL 片段（仅 where 条件表达式，不带 WHERE）
    public getSqlFragment(): string {
        const frag = this.compileGroup(this.rootGroupEl);
        return frag ? `(${frag})` : '';
    }

    private compileGroup(groupEl: HTMLElement): string {
        const op = this.getGroupOp(groupEl);
        const childrenWrap = groupEl.querySelector(':scope > [data-children]') as HTMLElement | null;
        const children = childrenWrap ? (Array.from(childrenWrap.children) as HTMLElement[]) : [];
        const pieces: string[] = [];
        for (const el of children) {
            if (el.matches('.vsb-adv-row')) {
                const expr = this.compileRule(el);
                if (expr) pieces.push(expr);
            } else if (el.matches('.vsb-adv-group')) {
                const g = this.compileGroup(el);
                if (g) pieces.push(`(${g})`);
            }
        }
        if (!pieces.length) return '';
        return pieces.join(` ${op} `);
    }

    private compileRule(row: HTMLElement): string {
        const Q = (v: any) => {
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return String(v);
            return `'${String(v).replace(/'/g, "''")}'`;
        };
        const smartLike = (val: string | undefined | null) => {
            const s = (val ?? '').trim();
            if (!s) return undefined;
            if (/[%_]/.test(s)) return s;
            return `%${s}%`;
        };

        const field = (row.querySelector('[data-field]') as HTMLSelectElement)?.value?.trim();
        const op = (row.querySelector('[data-op]') as HTMLSelectElement)?.value?.trim().toLowerCase();
        const rawVal = (row.querySelector('[data-value]') as HTMLInputElement)?.value ?? '';
        if (!field || !op) return '';

        let expr = '';
        if (op === 'is null' || op === 'is not null') {
            expr = `${field} ${op.toUpperCase()}`;
        } else if (op === 'between') {
            const parts = (rawVal || '').split(',').map(s => s.trim()).filter(Boolean);
            if (parts.length === 2) expr = `${field} BETWEEN ${Q(parts[0])} AND ${Q(parts[1])}`;
        } else if (op === 'in' || op === 'not in') {
            let parts = (rawVal || '').split(',').map(s => s.trim()).filter(Boolean);
            if (field === 'tag') parts = parts.map(x => x.startsWith('#') ? x : `#${x}`);
            if (parts.length) expr = `${field} ${op.toUpperCase()} (${parts.map(Q).join(', ')})`;
        } else if (op === 'like' || op === 'not like') {
            const v0 = smartLike(rawVal) ?? '';
            const v = (field === 'tag' && v0 && !v0.includes('#')) ? v0.replace('%', '%#') : v0;
            if (v) expr = `${field} ${op.toUpperCase()} ${Q(v)}`;
        } else {
            if (rawVal !== '') expr = `${field} ${op.toUpperCase()} ${Q(rawVal)}`;
        }

        if (!expr) return '';
        return `(${expr})`;
    }

    // ===== 工具：时间戳与 datetime-local 互转 =====
    private tsToDatetimeLocal(ts: string): string {
        const s = (ts || '').trim();
        if (!/^\d{14}$/.test(s)) return '';
        const y = s.slice(0, 4), mo = s.slice(4, 6), d = s.slice(6, 8), h = s.slice(8, 10), mi = s.slice(10, 12);
        // 去掉秒数，仅显示到分钟
        return `${y}-${mo}-${d}T${h}:${mi}`;
    }
    private datetimeLocalToTS(v: string): string {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (!m) return '';
        const [_, y, mo, d, h, mi, se] = m;
        return `${y}${mo}${d}${h}${mi}${se ?? '00'}`;
    }

    private emitSql() {
        const frag = this.getSqlFragment();
        this.saveState();
    // 刷新所有折叠组的预览
    this.updateAllGroupPreviews();
        this.opts.onChangeSql?.(frag);
    }

    // ===== 持久化：序列化/反序列化树 =====
    private saveState() {
        if (!this.storageKey) return;
        try {
            const saved = this.serializeGroup(this.rootGroupEl);
            localStorage.setItem(this.storageKey, JSON.stringify(saved));
        } catch { }
    }

    private restoreState() {
        if (!this.storageKey) return;
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return;
            const saved = JSON.parse(raw) as SavedNode;
            const mount = this.container.querySelector('[data-root-group]') as HTMLElement;
            mount.innerHTML = '';
            this.rootGroupEl = this.createGroup(true, 'AND');
            mount.appendChild(this.rootGroupEl);
            this.hydrateGroup(this.rootGroupEl, saved as any);
        } catch { }
    }

    private serializeGroup(groupEl: HTMLElement): SavedNode {
        const op = this.getGroupOp(groupEl);
        const childrenWrap = groupEl.querySelector(':scope > [data-children]') as HTMLElement;
        const children: SavedNode[] = [];
        for (const el of Array.from(childrenWrap.children) as HTMLElement[]) {
            if (el.matches('.vsb-adv-row')) {
                const state: AdvRuleState = {
                    field: (el.querySelector('[data-field]') as HTMLSelectElement)?.value,
                    op: (el.querySelector('[data-op]') as HTMLSelectElement)?.value,
                    value: (el.querySelector('[data-value]') as HTMLInputElement)?.value,
                };
                children.push({ type: 'rule', state });
            } else if (el.matches('.vsb-adv-group')) {
                children.push(this.serializeGroup(el));
            }
        }
        const collapsed = groupEl.classList.contains('vsb-collapsed');
        return { type: 'group', op, children, collapsed };
    }

    private hydrateGroup(groupEl: HTMLElement, saved: SavedNode) {
        // 设置组操作符
        if (saved && saved.type === 'group') {
            const seg = groupEl.querySelector(':scope > .vsb-adv-header .vsb-seg') as HTMLElement;
            const opVal = (saved.op === 'OR' ? 'OR' : 'AND');
            const inputs = Array.from(seg.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
            inputs.forEach(i => i.checked = (i.value === opVal));
            const childrenWrap = groupEl.querySelector(':scope > [data-children]') as HTMLElement;
            childrenWrap.innerHTML = '';
            for (const child of (saved.children || [])) {
                if (child.type === 'rule') {
                    this.addRule(childrenWrap, child.state);
                } else if (child.type === 'group') {
                    const sub = this.createGroup(false, child.op);
                    childrenWrap.appendChild(sub);
                    this.hydrateGroup(sub, child);
                }
            }
            // 恢复后做一次归并排序：分组在前、规则在后
            this.reorderChildren(childrenWrap);
            // 恢复折叠状态
            if ((saved as any).collapsed) {
                this.setGroupCollapsed(groupEl, true, false);
            } else {
                this.setGroupCollapsed(groupEl, false, false);
            }
        } else if (saved && saved.type === 'rule') {
            const wrap = groupEl.querySelector(':scope > [data-children]') as HTMLElement;
            this.addRule(wrap, saved.state);
        }
    }

    // ===== 折叠与预览 =====
    private setGroupCollapsed(groupEl: HTMLElement, collapsed: boolean, animate: boolean = true) {
    const children = groupEl.querySelector(':scope > [data-children]') as HTMLElement | null;
    const preview = groupEl.querySelector(':scope > [data-preview]') as HTMLElement | null;
    const header = groupEl.querySelector(':scope > .vsb-adv-header') as HTMLElement | null;
    const toggleBtn = header?.querySelector('[data-collapse-btn]') as HTMLButtonElement | null;
        if (collapsed) {
            groupEl.classList.add('vsb-collapsed');
            if (children) {
                if (animate) this.animateHeight(children, false); else { children.style.display = 'none'; }
            }
            if (preview) {
                preview.textContent = this.getGroupPreviewSql(groupEl);
                preview.style.display = '';
                if (animate) this.animateFade(preview, true); else { preview.style.opacity = '1'; }
            }
            if (toggleBtn) toggleBtn.textContent = '展开';
        } else {
            groupEl.classList.remove('vsb-collapsed');
            if (children) {
                // 先确保显示，再做动画，避免和上一状态的预览动画竞争
                children.style.display = 'grid';
                if (animate) this.animateHeight(children, true);
            }
            if (preview) {
                // 立即隐藏预览，避免重入时误判
                preview.style.display = 'none';
                preview.style.opacity = '';
            }
            if (toggleBtn) toggleBtn.textContent = '折叠';
        }
    }

    private animateHeight(el: HTMLElement, show: boolean) {
        const duration = 220; // ms
        const transition = `height ${duration}ms ease`;
        const clear = () => {
            el.classList.remove('is-animating');
            el.style.transition = '';
            el.style.height = '';
            el.style.overflow = '';
        };
        const onEnd = (ev: TransitionEvent) => {
            if (ev.target !== el || ev.propertyName !== 'height') return;
            el.removeEventListener('transitionend', onEnd);
            if (!show) el.style.display = 'none';
            clear();
        };
        el.removeEventListener('transitionend', onEnd);

        el.classList.add('is-animating');
        el.style.transition = transition;
        el.style.overflow = 'hidden';
        if (show) {
            // 准备展开
            el.style.display = 'grid';
            el.style.height = '0px';
            // 强制回流后设置到目标高度
            const target = el.scrollHeight;
            requestAnimationFrame(() => {
                el.addEventListener('transitionend', onEnd);
                el.style.height = `${target}px`;
            });
        } else {
            // 准备收起
            const start = el.scrollHeight;
            el.style.height = `${start}px`;
            requestAnimationFrame(() => {
                el.addEventListener('transitionend', onEnd);
                el.style.height = '0px';
            });
        }
    }

    private animateFade(el: HTMLElement, show: boolean) {
        const duration = 180; // ms
        const prop = 'opacity';
        const onEnd = (ev: TransitionEvent) => {
            if (ev.target !== el || ev.propertyName !== prop) return;
            el.removeEventListener('transitionend', onEnd);
            if (!show) {
                el.style.display = 'none';
                el.style.opacity = '';
                el.style.transition = '';
            }
        };
        el.removeEventListener('transitionend', onEnd);
        el.addEventListener('transitionend', onEnd);
        el.style.transition = `${prop} ${duration}ms ease`;
        if (show) {
            el.style.display = '';
            el.style.opacity = '0';
            requestAnimationFrame(() => { el.style.opacity = '1'; });
        } else {
            requestAnimationFrame(() => { el.style.opacity = '0'; });
        }
    }

    private getGroupPreviewSql(groupEl: HTMLElement): string {
        const body = this.compileGroup(groupEl);
        if (!body) return '(空)';
        return `(${body})`;
    }

    private updateAllGroupPreviews() {
        const groups = Array.from(this.container.querySelectorAll('.vsb-adv-group.vsb-collapsed')) as HTMLElement[];
        for (const g of groups) {
            const preview = g.querySelector('[data-preview]') as HTMLElement | null;
            if (preview) preview.textContent = this.getGroupPreviewSql(g);
        }
    }

    // ===== 子项归并排序：分组在前、规则在后（稳定相对顺序）=====
    private reorderChildren(childrenWrap: HTMLElement) {
        const nodes = Array.from(childrenWrap.children) as HTMLElement[];
        const groups: HTMLElement[] = [];
        const rules: HTMLElement[] = [];
        for (const n of nodes) {
            if (n.classList.contains('vsb-adv-group')) groups.push(n);
            else if (n.classList.contains('vsb-adv-row')) rules.push(n);
        }
        const desired = [...groups, ...rules];
        // 稳定重排：逐位对齐，不清空容器，避免抖动
        for (let i = 0; i < desired.length; i++) {
            const want = desired[i];
            if (childrenWrap.children[i] !== want) {
                childrenWrap.insertBefore(want, childrenWrap.children[i] || null);
            }
        }
    }

    private injectStyles() {
        const STYLE_ID = 'visual-sql-advanced-ui-style';
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
      .vsb-adv-wrap{ color: var(--b3-theme-on-background); font-family: var(--b3-font-family); font-size: var(--b3-font-size); }
    .vsb-adv-group{ border:2px solid var(--b3-border-color); border-left-width:4px; border-left-color: var(--b3-theme-primary); border-radius:8px; padding:8px; background: var(--b3-theme-surface); }
    .vsb-adv-group + .vsb-adv-group{ margin-top:8px; }
    /* 折叠不改变背景色阶，保持层级可视性 */
    .vsb-adv-group.vsb-collapsed{ background: inherit; }
    /* 层级背景色阶（使用主题常见变量，按层级轻微变化） */
    .vsb-adv-group{ background: var(--b3-theme-surface); }
    .vsb-adv-group .vsb-adv-group{ background: var(--b3-theme-background); }
    .vsb-adv-group .vsb-adv-group .vsb-adv-group{ background: var(--b3-theme-background-light); }
    .vsb-adv-group .vsb-adv-group .vsb-adv-group .vsb-adv-group{ background: var(--b3-theme-surface); }
    .vsb-adv-group .vsb-adv-group .vsb-adv-group .vsb-adv-group .vsb-adv-group{ background: var(--b3-theme-background); }
    /* 更多层级将循环上述色阶 */
    .vsb-adv-group .vsb-preview{ margin-top:6px; padding:6px 8px; border-radius:6px; background: var(--b3-theme-background-light); color: var(--b3-theme-on-background); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; border:1px dashed var(--b3-border-color); white-space: normal; overflow-wrap: anywhere; word-break: break-word; transition: opacity .18s ease; }
    /* 动画时避免抖动 */
    .vsb-adv-children.is-animating{ will-change: height; }
    /* 嵌套层级左侧强调条微调（仅在嵌套的组中改变色调） */
    .vsb-adv-group .vsb-adv-group{ border-left-color: var(--b3-theme-primary-lighter, var(--b3-theme-primary)); }
    .vsb-adv-group .vsb-adv-group .vsb-adv-group{ border-left-color: var(--b3-theme-secondary, var(--b3-theme-primary)); }
      .vsb-seg{display:flex; gap:6px; background: var(--b3-theme-background-light); padding:4px; border-radius:10px; border:1px solid var(--b3-border-color)}
      .vsb-seg-item{position:relative}
      .vsb-seg-item input{position:absolute; opacity:0; pointer-events:none}
      .vsb-seg-item span{display:inline-block; padding:6px 10px; border-radius:8px; cursor:pointer}
      .vsb-seg-item input:checked + span{background: var(--b3-theme-primary); color: var(--b3-theme-on-primary)}
      .vsb-btn{appearance:none; border:1px solid var(--b3-border-color); background: var(--b3-theme-background); color: var(--b3-theme-on-background); padding:6px 10px; line-height:1; border-radius:6px; cursor:pointer; transition:.15s}
      .vsb-btn:hover{background: var(--b3-list-hover)}
      .vsb-btn.vsb-ghost{background:transparent}
      .vsb-input{appearance:none; border:1px solid var(--b3-border-color); background: var(--b3-theme-background); color: var(--b3-theme-on-background); border-radius:6px; padding:6px 8px; outline:none}
      .vsb-input:focus{border-color: var(--b3-theme-primary); box-shadow:0 0 0 2px var(--b3-theme-primary-light)}
  /* Tag 搜索输入（datalist 绑定）配色适配 */
  .vsb-adv-wrap input.vsb-input[list^="vsb-tags-"]{ background: var(--b3-theme-background); color: var(--b3-theme-on-background); caret-color: var(--b3-theme-primary); }
  .vsb-adv-wrap input.vsb-input[list^="vsb-tags-"]::placeholder{ color: var(--b3-theme-on-surface-light); }
    /* 统一日期输入宽度，避免与其他控件互相干涉 */
        .vsb-adv-wrap input[type="datetime-local"].vsb-input{ width:140px; }
    /* 日期面板（按钮已移除，保留样式以备将来复用） */
    .vsb-date-panel{ position:fixed; z-index:99999; background: var(--b3-theme-surface); color: var(--b3-theme-on-background); border:1px solid var(--b3-border-color); border-radius:8px; box-shadow: 0 8px 24px rgba(0,0,0,.2); width: 248px; }
    .vsb-date-panel header{ display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-bottom:1px solid var(--b3-border-color) }
    .vsb-date-panel header button{ border:none; background:transparent; color:inherit; cursor:pointer; padding:4px }
    .vsb-date-panel .grid{ display:grid; grid-template-columns: repeat(7, 1fr); gap:2px; padding:6px }
    .vsb-date-panel .cell{ text-align:center; padding:6px 0; border-radius:6px; cursor:pointer }
    .vsb-date-panel .cell:hover{ background: var(--b3-list-hover) }
    .vsb-date-panel .dow{ font-size:11px; color: var(--b3-theme-on-surface); cursor:default }
    `;
        document.head.appendChild(style);
    }

    // openDatePanel 已移除（不再使用）

    // parseInputDate 已移除（不再使用）

    private async getTags(): Promise<string[]> {
        if (this.tagsCache) return this.tagsCache;
        if (this.tagsLoading) return this.tagsLoading;
        this.tagsLoading = (async () => {
            try {
                const arr = await getalltages();
                this.tagsCache = Array.isArray(arr) ? arr : [];
                return this.tagsCache;
            } catch {
                this.tagsCache = [];
                return this.tagsCache;
            } finally {
                this.tagsLoading = undefined;
            }
        })();
        return this.tagsLoading;
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
        const merged = [...tags, ...cur].filter(t => {
            if (set.has(t)) return false; set.add(t); return true;
        });
        localStorage.setItem(this.recentTagsKey, JSON.stringify(merged.slice(0, 20)));
    }
    private orderTagsWithRecents(all: string[]): string[] {
        const rec = this.getRecentTags();
        const inAll = rec.filter(r => all.includes(r));
        const rest = all.filter(a => !inAll.includes(a));
        return [...inAll, ...rest];
    }
}
