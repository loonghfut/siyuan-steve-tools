/**
 * 筛选器管理模块
 * 用于处理系列数据的可视化筛选功能
 */

export interface FilterCondition {
  field: string;        // 字段名
  operator: string;     // 操作符: '==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith', 'endsWith', 'in', 'notIn'
  value: string;        // 值
  connector?: 'and' | 'or'; // 与下一个条件的连接符
}

/**
 * 操作符配置
 */
export const OPERATOR_OPTIONS = [
  { value: '==', label: '等于' },
  { value: '!=', label: '不等于' },
  { value: '>', label: '大于' },
  { value: '<', label: '小于' },
  { value: '>=', label: '大于等于' },
  { value: '<=', label: '小于等于' },
  { value: 'contains', label: '包含' },
  { value: 'startsWith', label: '开头是' },
  { value: 'endsWith', label: '结尾是' },
  { value: 'in', label: '在列表中' },
  { value: 'notIn', label: '不在列表中' }
];

/**
 * 将可视化筛选条件转换为 JavaScript 表达式
 */
export function buildFilterExpression(filters?: FilterCondition[]): string {
  if (!filters || filters.length === 0) return '';
  
  const parts: string[] = [];
  filters.forEach((f, idx) => {
    if (!f.field || !f.operator) return;
    
    const field = `r[${JSON.stringify(f.field)}]`;
    const value = f.value;
    let condition = '';
    
    switch (f.operator) {
      case '==':
        condition = `${field} == ${JSON.stringify(value)}`;
        break;
      case '!=':
        condition = `${field} != ${JSON.stringify(value)}`;
        break;
      case '>':
        condition = `${field} > ${JSON.stringify(value)}`;
        break;
      case '<':
        condition = `${field} < ${JSON.stringify(value)}`;
        break;
      case '>=':
        condition = `${field} >= ${JSON.stringify(value)}`;
        break;
      case '<=':
        condition = `${field} <= ${JSON.stringify(value)}`;
        break;
      case 'contains':
        condition = `String(${field}).includes(${JSON.stringify(value)})`;
        break;
      case 'startsWith':
        condition = `String(${field}).startsWith(${JSON.stringify(value)})`;
        break;
      case 'endsWith':
        condition = `String(${field}).endsWith(${JSON.stringify(value)})`;
        break;
      case 'in':
        // 值用逗号分隔
        const inValues = value.split(',').map(v => v.trim()).filter(Boolean);
        condition = `[${inValues.map(v => JSON.stringify(v)).join(',')}].includes(${field})`;
        break;
      case 'notIn':
        const notInValues = value.split(',').map(v => v.trim()).filter(Boolean);
        condition = `![${notInValues.map(v => JSON.stringify(v)).join(',')}].includes(${field})`;
        break;
      default:
        condition = `${field} == ${JSON.stringify(value)}`;
    }
    
    if (condition) {
      if (parts.length > 0) {
        const connector = filters[idx - 1]?.connector || 'and';
        parts.push(connector === 'or' ? '||' : '&&');
      }
      parts.push(`(${condition})`);
    }
  });
  
  return parts.length > 0 ? parts.join(' ') : '';
}

/**
 * 渲染筛选器列表 UI
 */
export function renderFilterList(
  container: HTMLElement,
  filters: FilterCondition[],
  availableFields: string[],
  callbacks: {
    onFieldChange: (index: number, value: string) => void;
    onOperatorChange: (index: number, value: string) => void;
    onValueChange: (index: number, value: string) => void;
    onConnectorChange: (index: number, value: 'and' | 'or') => void;
    onDelete: (index: number) => void;
  },
  escapeHtml: (str: any) => string
) {
  if (!filters.length) {
    container.innerHTML = '<div style="font-size:12px; color:var(--b3-theme-on-surface-light); padding:8px 0;">暂无筛选条件</div>';
    return;
  }
  
  container.innerHTML = '';
  filters.forEach((filter, filterIdx) => {
    const filterRow = document.createElement('div');
    filterRow.className = 'veq-filter-row';
    filterRow.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px; padding:8px; background:var(--b3-theme-surface); border-radius:4px;';
    
    filterRow.innerHTML = `
      <select class="veq-input" data-filter-field style="flex:1; font-size:12px;">
        ${availableFields.map(k => `<option value="${escapeHtml(k)}" ${filter.field === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
      </select>
      <select class="veq-input" data-filter-op style="width:100px; font-size:12px;">
        ${OPERATOR_OPTIONS.map(op => `<option value="${op.value}" ${filter.operator === op.value ? 'selected' : ''}>${op.label}</option>`).join('')}
      </select>
      <input class="veq-input" data-filter-value placeholder="值" value="${escapeHtml(filter.value)}" style="flex:1; font-size:12px;"/>
      ${filterIdx < filters.length - 1 ? `
      <select class="veq-input" data-filter-connector style="width:60px; font-size:12px;">
        <option value="and" ${filter.connector === 'and' ? 'selected' : ''}>且</option>
        <option value="or" ${filter.connector === 'or' ? 'selected' : ''}>或</option>
      </select>` : ''}
      <button class="veq-btn veq-ghost veq-small" data-filter-del type="button" title="删除">×</button>
    `;
    
    // 字段选择
    const fieldSel = filterRow.querySelector('[data-filter-field]') as HTMLSelectElement;
    fieldSel.addEventListener('change', () => callbacks.onFieldChange(filterIdx, fieldSel.value));
    
    // 操作符选择
    const opSel = filterRow.querySelector('[data-filter-op]') as HTMLSelectElement;
    opSel.addEventListener('change', () => callbacks.onOperatorChange(filterIdx, opSel.value));
    
    // 值输入
    const valInput = filterRow.querySelector('[data-filter-value]') as HTMLInputElement;
    valInput.addEventListener('input', () => callbacks.onValueChange(filterIdx, valInput.value));
    
    // 连接符选择
    const connectorSel = filterRow.querySelector('[data-filter-connector]') as HTMLSelectElement | null;
    if (connectorSel) {
      connectorSel.addEventListener('change', () => callbacks.onConnectorChange(filterIdx, connectorSel.value as 'and' | 'or'));
    }
    
    // 删除按钮
    const delBtn = filterRow.querySelector('[data-filter-del]') as HTMLButtonElement;
    delBtn.addEventListener('click', () => callbacks.onDelete(filterIdx));
    
    container.appendChild(filterRow);
  });
}

/**
 * 创建一个新的空筛选条件
 */
export function createEmptyFilter(defaultField: string): FilterCondition {
  return {
    field: defaultField,
    operator: '==',
    value: '',
    connector: 'and'
  };
}
