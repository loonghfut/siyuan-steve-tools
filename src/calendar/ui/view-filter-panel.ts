import { moduleInstances } from '@/index';
import { av_ids } from './calendar-view';
import {
    ViewGroup,
    userGroups,
    saveUserGroups,
    createNewGroup,
    addViewToGroup,
    removeViewFromGroup,
    deleteGroup,
    toggleGroupVisibility,
    toggleUngroupedVisibility,
    isUngroupedVisible,
    isUngroupedHiddenState,
    reorderGroups,
    safeGroupIcon,
    getUngroupedViews,
    getAllViewIds,
    getViewLabel,
} from './view-groups';

// ============== 小工具 ==============
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
const ICON_CHEVRON = '<svg class="vf-chevron-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const ICON_DRAG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
const ICON_EYE_OPEN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.6 19.6 0 0 1 4.06-5.06"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a19.6 19.6 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// ============== 主入口 ==============
export async function createViewFilterMenu(
    calendarEl: HTMLElement,
    myF: any,
    calendar: any,
    filterViewId: string[],
    setFilterViewId: (ids: string[]) => void,
    refreshCalendar: () => void,
    lastSavedLifelogSlotDuration: string
) {
    const button = calendarEl.querySelector('.fc-viewFilter-button') as HTMLElement | null;
    if (!button) return;

    // 同步 UI 状态与配置
    const configViewIds = moduleInstances['M_calendar'].calConfig.getViewIds();
    if (JSON.stringify(configViewIds.sort()) !== JSON.stringify(filterViewId.sort())) {
        setFilterViewId(configViewIds);
        filterViewId = configViewIds;
    }

    const viewIDs = await myF.getViewId(av_ids);
    const allViewIds = getAllViewIds(viewIDs);

    // ---- 菜单容器 ----
    const menu = el('div', 'view-filter-menu');
    menu.setAttribute('role', 'dialog');

    // ---- 头部 ----
    const header = el('div', 'vf-header');

    const titleRow = el('div', 'vf-title-row');
    const title = el('span', 'vf-title', '视图筛选');
    const countBadge = el('span', 'vf-count-badge');
    titleRow.appendChild(title);
    titleRow.appendChild(countBadge);
    header.appendChild(titleRow);

    // 搜索框
    const searchWrap = el('div', 'vf-search');
    const searchIcon = el('span', 'vf-search-icon');
    searchIcon.innerHTML = ICON_SEARCH;
    const searchInput = el('input', 'vf-search-input') as HTMLInputElement;
    searchInput.type = 'text';
    searchInput.placeholder = '搜索视图...';
    searchInput.spellcheck = false;
    searchInput.autocomplete = 'off';
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);
    header.appendChild(searchWrap);

    // 顶部操作条
    const actions = el('div', 'vf-actions');
    const selectAllBtn = el('button', 'vf-action-btn vf-action-primary', '全选');
    const clearAllBtn = el('button', 'vf-action-btn', '清空');
    const manageBtn = el('button', 'vf-action-btn vf-action-ghost', '管理分组');
    actions.appendChild(selectAllBtn);
    actions.appendChild(clearAllBtn);
    actions.appendChild(manageBtn);
    header.appendChild(actions);

    menu.appendChild(header);

    // ---- 内容 ----
    const content = el('div', 'vf-content');
    menu.appendChild(content);

    // ---- 底部 ----
    const footer = el('div', 'vf-footer');
    const confirmBtn = el('button', 'vf-confirm-btn', '应用筛选');
    footer.appendChild(confirmBtn);
    menu.appendChild(footer);

    // ---- 渲染列表 ----
    /** 重新渲染整个视图列表（保留搜索状态） */
    function renderList() {
        content.innerHTML = '';
        const q = searchInput.value.trim().toLowerCase();

        userGroups.forEach(group => {
            if (group.isHidden) return;
            const sec = renderGroupSection(group, viewIDs, q);
            if (sec) content.appendChild(sec);
        });

        const ungroupedViewIds = getUngroupedViews(allViewIds);
        if (ungroupedViewIds.length > 0 && isUngroupedVisible()) {
            const virtualGroup: ViewGroup = {
                id: '__ungrouped__',
                name: '未分组',
                icon: '',
                viewIds: ungroupedViewIds,
                isExpanded: true,
                isHidden: false,
            };
            const sec = renderGroupSection(virtualGroup, viewIDs, q, true);
            if (sec) content.appendChild(sec);
        }

        updateCountBadge();

        // 搜索无命中时显示空态
        if (q && !content.querySelector('.vf-item')) {
            const empty = el('div', 'vf-empty', `没有匹配 "${searchInput.value}" 的视图`);
            content.appendChild(empty);
        }
    }

    function renderGroupSection(group: ViewGroup, viewIDs: any[], filterText: string, isUngrouped = false): HTMLElement | null {
        const items: HTMLElement[] = [];
        let selectedCount = 0;
        const currentViewIds = moduleInstances['M_calendar'].calConfig.getViewIds();

        group.viewIds.forEach(viewId => {
            const label = getViewLabel(viewId, viewIDs);
            if (!label) return;
            const checked = currentViewIds.includes(viewId);
            if (checked) selectedCount++;
            if (filterText && !label.toLowerCase().includes(filterText)) return;
            items.push(buildViewItem(viewId, label, checked));
        });

        // 搜索状态下，分组内无命中则不渲染该分组
        if (filterText && items.length === 0) return null;

        const section = el('div', 'vf-group');
        section.dataset.groupId = group.id;

        // ---- 分组标题 ----
        const groupHeader = el('div', 'vf-group-header');

        const groupTitle = el('div', 'vf-group-title');
        const iconText = safeGroupIcon(group.icon);
        if (iconText) {
            const iconEl = el('span', 'vf-group-icon', iconText);
            groupTitle.appendChild(iconEl);
        }
        const nameEl = el('span', 'vf-group-name', group.name);
        groupTitle.appendChild(nameEl);

        const totalCount = group.viewIds.length;
        const countEl = el('span', 'vf-group-count', `${selectedCount}/${totalCount}`);
        if (selectedCount === totalCount && totalCount > 0) countEl.classList.add('vf-group-count--all');
        else if (selectedCount === 0) countEl.classList.add('vf-group-count--none');
        groupTitle.appendChild(countEl);

        const groupActions = el('div', 'vf-group-actions');
        const selectGroupBtn = el('button', 'vf-pill vf-pill-select', '全选');
        selectGroupBtn.title = '选择此分组的所有视图';
        const deselectGroupBtn = el('button', 'vf-pill vf-pill-clear', '清空');
        deselectGroupBtn.title = '取消此分组的所有选择';
        const chevron = el('span', 'vf-chevron');
        chevron.innerHTML = ICON_CHEVRON;
        const expanded = filterText ? true : (group.isExpanded !== false);
        if (!expanded) chevron.classList.add('vf-chevron--collapsed');
        groupActions.appendChild(selectGroupBtn);
        groupActions.appendChild(deselectGroupBtn);
        groupActions.appendChild(chevron);

        groupHeader.appendChild(groupTitle);
        groupHeader.appendChild(groupActions);
        section.appendChild(groupHeader);

        // ---- 分组列表 ----
        const list = el('div', 'vf-group-items');
        if (!expanded) list.classList.add('vf-group-items--collapsed');
        items.forEach(i => list.appendChild(i));
        section.appendChild(list);

        // ---- 交互 ----
        selectGroupBtn.onclick = e => {
            e.stopPropagation();
            const latest = moduleInstances['M_calendar'].calConfig.getViewIds();
            const next = [...latest];
            group.viewIds.forEach(id => { if (!next.includes(id)) next.push(id); });
            commitFilter(next);
        };
        deselectGroupBtn.onclick = e => {
            e.stopPropagation();
            const latest = moduleInstances['M_calendar'].calConfig.getViewIds();
            const next = latest.filter(id => !group.viewIds.includes(id));
            commitFilter(next);
        };
        groupHeader.onclick = e => {
            if ((e.target as Element).closest('.vf-group-actions')) return;
            e.stopPropagation();
            const collapsed = list.classList.toggle('vf-group-items--collapsed');
            chevron.classList.toggle('vf-chevron--collapsed', collapsed);
            if (!isUngrouped) {
                group.isExpanded = !collapsed;
                saveUserGroups(userGroups);
            }
        };

        return section;
    }

    function buildViewItem(viewId: string, label: string, checked: boolean): HTMLElement {
        const item = el('div', 'vf-item');
        item.dataset.viewId = viewId;
        if (checked) item.classList.add('vf-item--checked');

        const box = el('span', 'vf-checkbox');
        if (checked) box.classList.add('vf-checkbox--checked');
        const labelEl = el('span', 'vf-item-label', label);

        item.appendChild(box);
        item.appendChild(labelEl);

        item.onclick = e => {
            e.stopPropagation();
            handleToggleView(viewId);
        };
        return item;
    }

    function handleToggleView(viewId: string) {
        if (viewId === 'lifelog') {
            const cur = moduleInstances['M_calendar'].calConfig.getViewIds();
            const willCheck = !cur.includes('lifelog');
            const next = willCheck ? [...cur, 'lifelog'] : cur.filter(id => id !== 'lifelog');
            calendar.setOption('slotDuration', willCheck ? '00:10:00' : lastSavedLifelogSlotDuration);
            moduleInstances['M_calendar'].calConfig.setViewIds(next);
            moduleInstances['M_calendar'].calConfig.set('viewName', '多视图');
            moduleInstances['M_calendar'].calConfig.save();
            setFilterViewId(next);
            calendar.refetchEvents();
        } else {
            moduleInstances['M_calendar'].calConfig.toggleViewId(viewId);
            moduleInstances['M_calendar'].calConfig.set('viewName', '多视图');
            moduleInstances['M_calendar'].calConfig.save();
            const latest = moduleInstances['M_calendar'].calConfig.getViewIds();
            setFilterViewId(latest);
        }
        renderList();
    }

    function commitFilter(ids: string[]) {
        moduleInstances['M_calendar'].calConfig.setViewIds(ids);
        moduleInstances['M_calendar'].calConfig.set('viewName', '多视图');
        moduleInstances['M_calendar'].calConfig.save();
        setFilterViewId(ids);
        renderList();
    }

    function updateCountBadge() {
        const selected = moduleInstances['M_calendar'].calConfig.getViewIds().length;
        const total = allViewIds.length;
        countBadge.textContent = `${selected}/${total}`;
        countBadge.classList.toggle('vf-count-badge--full', selected === total && total > 0);
        countBadge.classList.toggle('vf-count-badge--empty', selected === 0);
    }

    // ---- 头部交互 ----
    selectAllBtn.onclick = e => {
        e.stopPropagation();
        commitFilter(allViewIds.slice());
    };
    clearAllBtn.onclick = e => {
        e.stopPropagation();
        commitFilter([]);
    };
    manageBtn.onclick = e => {
        e.stopPropagation();
        showGroupManagementDialog(viewIDs, () => {
            renderList();
        });
    };
    confirmBtn.onclick = () => {
        refreshCalendar();
        closeMenu();
    };

    // 搜索（debounce）
    let searchTimer: number | null = null;
    searchInput.addEventListener('input', () => {
        if (searchTimer) window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => renderList(), 90);
    });
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (searchInput.value) {
                searchInput.value = '';
                renderList();
            } else {
                closeMenu();
            }
        }
    });

    // ---- 定位并显示 ----
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    requestAnimationFrame(() => positionMenu(menu, button));

    // 进入动画
    menu.classList.add('vf-enter');
    requestAnimationFrame(() => {
        menu.style.visibility = 'visible';
        menu.classList.add('vf-enter-active');
    });

    renderList();
    setTimeout(() => searchInput.focus(), 60);

    // ---- 关闭逻辑 ----
    function closeMenu() {
        menu.classList.add('vf-leave');
        setTimeout(() => menu.remove(), 140);
        document.removeEventListener('mousedown', onDocMouseDown, true);
    }
    function onDocMouseDown(e: MouseEvent) {
        const target = e.target as Node;
        if (!menu.contains(target) && target !== button && !button.contains(target)) {
            // 若分组管理对话框已打开，让它自己处理
            if ((target as Element).closest?.('.vf-dialog-root')) return;
            closeMenu();
        }
    }
    document.addEventListener('mousedown', onDocMouseDown, true);
}

function positionMenu(menu: HTMLElement, button: HTMLElement) {
    const rect = button.getBoundingClientRect();
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const mr = menu.getBoundingClientRect();

    let top = rect.bottom + 6;
    if (top + mr.height > wh - 8) {
        top = rect.top - mr.height - 6;
        if (top < 8) top = wh - mr.height - 10;
    }

    let left = rect.left;
    if (left + mr.width > ww - 8) left = rect.right - mr.width;
    if (left < 8) left = 8;

    menu.style.top = Math.max(8, top) + 'px';
    menu.style.left = Math.max(8, left) + 'px';
}

// ============== 分组管理对话框 ==============
function showGroupManagementDialog(viewIDs: any[], onClose: () => void) {
    const root = el('div', 'vf-dialog-root vf-dialog-root--manage');
    const card = el('div', 'vf-dialog vf-dialog--manage');

    // 头部
    const header = el('div', 'vf-dialog-header');
    const title = el('h3', 'vf-dialog-title', '分组管理');
    const closeBtn = el('button', 'vf-icon-btn');
    closeBtn.title = '关闭';
    closeBtn.innerHTML = ICON_CLOSE;
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = el('div', 'vf-dialog-body');

    // 创建分组
    const createCard = el('div', 'vf-create-card');
    createCard.innerHTML = `
        <div class="vf-create-card-title">新建分组</div>
        <div class="vf-create-card-row">
            <input type="text" class="vf-input vf-create-name" placeholder="分组名称" />
            <input type="text" class="vf-input vf-create-icon" placeholder="标识" maxlength="2" />
            <button class="vf-action-btn vf-action-primary vf-create-btn">创建</button>
        </div>
    `;

    // 现有分组
    const listSection = el('div', 'vf-manage-section');
    const listSectionTitle = el('div', 'vf-section-title');
    const listHeading = el('span', '', '现有分组');
    listSectionTitle.appendChild(listHeading);
    const hint = el('span', 'vf-section-hint', '拖动重新排序');
    listSectionTitle.appendChild(hint);
    listSection.appendChild(listSectionTitle);
    const groupsList = el('div', 'vf-manage-list');
    listSection.appendChild(groupsList);

    // 未分组管理
    const ungroupedSection = el('div', 'vf-manage-section');
    const ungroupedTitle = el('div', 'vf-section-title', '未分组');
    ungroupedSection.appendChild(ungroupedTitle);
    const ungroupedHost = el('div', 'vf-manage-list');
    ungroupedSection.appendChild(ungroupedHost);

    body.appendChild(createCard);
    body.appendChild(listSection);
    body.appendChild(ungroupedSection);

    card.appendChild(header);
    card.appendChild(body);
    root.appendChild(card);
    document.body.appendChild(root);

    requestAnimationFrame(() => root.classList.add('vf-dialog-root--in'));

    // ---- 渲染 ----
    function renderGroupsList() {
        groupsList.innerHTML = '';
        const hiddenCount = userGroups.filter(g => g.isHidden).length;
        listHeading.textContent = hiddenCount > 0
            ? `现有分组 · ${userGroups.length} 个（${hiddenCount} 个已隐藏）`
            : `现有分组 · ${userGroups.length} 个`;

        userGroups.forEach(group => {
            const allIds = getAllViewIds(viewIDs);
            const item = buildManageItem(group, viewIDs, allIds);
            groupsList.appendChild(item);
        });

        attachDragSort(groupsList);
        renderUngroupedManagement();
    }

    function renderUngroupedManagement() {
        ungroupedHost.innerHTML = '';
        const allIds = getAllViewIds(viewIDs);
        const ungroupedIds = getUngroupedViews(allIds);
        const hidden = isUngroupedHiddenState();

        const row = el('div', `vf-manage-item ${hidden ? 'vf-manage-item--hidden' : ''}`);
        const info = el('div', 'vf-manage-info');
        const nameEl = el('span', 'vf-manage-name', '未分组');
        const meta = el('span', 'vf-manage-meta', `${ungroupedIds.length} 个视图${hidden ? ' · 已隐藏' : ''}`);
        info.appendChild(nameEl);
        info.appendChild(meta);

        const actions = el('div', 'vf-manage-actions');
        const toggleBtn = el('button', 'vf-icon-btn');
        toggleBtn.title = hidden ? '显示此分组' : '隐藏此分组';
        toggleBtn.innerHTML = hidden ? ICON_EYE_OFF : ICON_EYE_OPEN;
        toggleBtn.onclick = () => {
            toggleUngroupedVisibility();
            renderUngroupedManagement();
        };
        actions.appendChild(toggleBtn);

        row.appendChild(info);
        row.appendChild(actions);
        ungroupedHost.appendChild(row);
    }

    function buildManageItem(group: ViewGroup, viewIDs: any[], allIds: string[]): HTMLElement {
        const isDefault = ['external', 'special'].includes(group.id);
        const item = el('div', `vf-manage-item ${group.isHidden ? 'vf-manage-item--hidden' : ''}`);
        item.dataset.groupId = group.id;
        item.draggable = true;

        const handle = el('span', 'vf-drag-handle');
        handle.title = '拖动以重新排序';
        handle.innerHTML = ICON_DRAG;
        item.appendChild(handle);

        const info = el('div', 'vf-manage-info');
        const iconText = safeGroupIcon(group.icon);
        if (iconText) {
            const iconEl = el('span', 'vf-group-icon', iconText);
            info.appendChild(iconEl);
        }
        const nameEl = el('span', 'vf-manage-name', group.name);
        info.appendChild(nameEl);
        const validIds = group.viewIds.filter(id => allIds.includes(id));
        const meta = el('span', 'vf-manage-meta', `${validIds.length} 个视图${group.isHidden ? ' · 已隐藏' : ''}`);
        info.appendChild(meta);

        const actions = el('div', 'vf-manage-actions');

        const toggleBtn = el('button', 'vf-icon-btn');
        toggleBtn.title = group.isHidden ? '显示此分组' : '隐藏此分组';
        toggleBtn.innerHTML = group.isHidden ? ICON_EYE_OFF : ICON_EYE_OPEN;
        toggleBtn.onclick = () => {
            toggleGroupVisibility(group.id);
            renderGroupsList();
        };
        actions.appendChild(toggleBtn);

        if (!isDefault) {
            const editBtn = el('button', 'vf-action-btn vf-action-ghost', '编辑');
            editBtn.onclick = () => showGroupEditDialog(group, () => renderGroupsList(), viewIDs);
            const deleteBtn = el('button', 'vf-action-btn vf-action-danger', '删除');
            deleteBtn.onclick = () => {
                if (confirm(`确定删除分组 "${group.name}" 吗？`)) {
                    deleteGroup(group.id);
                    renderGroupsList();
                }
            };
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
        }

        item.appendChild(info);
        item.appendChild(actions);
        return item;
    }

    /** HTML5 拖拽排序：在 mouseover 时根据中点位置插入占位 */
    function attachDragSort(container: HTMLElement) {
        let dragging: HTMLElement | null = null;

        container.querySelectorAll('.vf-manage-item').forEach(node => {
            const item = node as HTMLElement;
            item.addEventListener('dragstart', e => {
                dragging = item;
                item.classList.add('vf-manage-item--dragging');
                e.dataTransfer?.setData('text/plain', item.dataset.groupId || '');
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', () => {
                if (dragging) dragging.classList.remove('vf-manage-item--dragging');
                dragging = null;
                container.querySelectorAll('.vf-manage-item--drop-target')
                    .forEach(n => n.classList.remove('vf-manage-item--drop-target'));
                // 提交新顺序
                const orderedIds: string[] = [];
                container.querySelectorAll('.vf-manage-item').forEach(n => {
                    const id = (n as HTMLElement).dataset.groupId;
                    if (id) orderedIds.push(id);
                });
                reorderGroups(orderedIds);
            });
        });

        container.ondragover = (e: DragEvent) => {
            e.preventDefault();
            if (!dragging) return;
            const target = (e.target as HTMLElement).closest('.vf-manage-item') as HTMLElement | null;
            if (!target || target === dragging) return;
            const rect = target.getBoundingClientRect();
            const before = (e.clientY - rect.top) < rect.height / 2;
            container.querySelectorAll('.vf-manage-item--drop-target')
                .forEach(n => n.classList.remove('vf-manage-item--drop-target'));
            target.classList.add('vf-manage-item--drop-target');
            if (before) container.insertBefore(dragging, target);
            else container.insertBefore(dragging, target.nextSibling);
        };
    }

    renderGroupsList();

    // ---- 交互 ----
    closeBtn.onclick = closeDialog;
    root.addEventListener('mousedown', e => {
        if (e.target === root) closeDialog();
    });

    const nameInput = createCard.querySelector('.vf-create-name') as HTMLInputElement;
    const iconInput = createCard.querySelector('.vf-create-icon') as HTMLInputElement;
    const createBtn = createCard.querySelector('.vf-create-btn') as HTMLButtonElement;
    const doCreate = () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.classList.add('vf-input--error');
            setTimeout(() => nameInput.classList.remove('vf-input--error'), 600);
            nameInput.focus();
            return;
        }
        const icon = safeGroupIcon(iconInput.value.trim());
        const next = createNewGroup(name, icon);
        userGroups.push(next);
        saveUserGroups(userGroups);
        nameInput.value = '';
        iconInput.value = '';
        renderGroupsList();
    };
    createBtn.onclick = doCreate;
    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') doCreate();
    });

    function closeDialog() {
        root.classList.remove('vf-dialog-root--in');
        root.classList.add('vf-dialog-root--out');
        setTimeout(() => {
            root.remove();
            onClose();
        }, 160);
    }
}

// ============== 分组编辑对话框 ==============
function showGroupEditDialog(group: ViewGroup, onComplete: () => void, viewIDs: any[]) {
    const root = el('div', 'vf-dialog-root vf-dialog-root--edit');
    const card = el('div', 'vf-dialog vf-dialog--edit');

    // header
    const header = el('div', 'vf-dialog-header');
    const titleWrap = el('div', 'vf-dialog-title-wrap');
    const subLabel = el('span', 'vf-dialog-subtitle', '编辑分组');
    const titleEl = el('h3', 'vf-dialog-title', group.name);
    titleWrap.appendChild(subLabel);
    titleWrap.appendChild(titleEl);
    const closeBtn = el('button', 'vf-icon-btn');
    closeBtn.innerHTML = ICON_CLOSE;
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    // body
    const body = el('div', 'vf-dialog-body');

    const form = el('div', 'vf-edit-form');
    form.innerHTML = `
        <div class="vf-edit-field">
            <label>分组名称</label>
            <input type="text" class="vf-input vf-edit-name" value="${escapeHtml(group.name)}" />
        </div>
        <div class="vf-edit-field">
            <label>标识</label>
            <input type="text" class="vf-input vf-edit-icon" value="${escapeHtml(safeGroupIcon(group.icon))}" maxlength="2" />
        </div>
    `;

    // 两个视图清单
    const twoCol = el('div', 'vf-edit-twocol');

    const inSection = el('div', 'vf-edit-col');
    const inTitle = el('div', 'vf-section-title', '分组中的视图');
    const inList = el('div', 'vf-edit-list');
    inSection.appendChild(inTitle);
    inSection.appendChild(inList);

    const outSection = el('div', 'vf-edit-col');
    const outTitle = el('div', 'vf-section-title', '可添加的视图');
    const outList = el('div', 'vf-edit-list');
    outSection.appendChild(outTitle);
    outSection.appendChild(outList);

    twoCol.appendChild(inSection);
    twoCol.appendChild(outSection);

    body.appendChild(form);
    body.appendChild(twoCol);

    // footer
    const footer = el('div', 'vf-dialog-footer');
    const cancelBtn = el('button', 'vf-action-btn vf-action-ghost', '取消');
    const saveBtn = el('button', 'vf-action-btn vf-action-primary', '保存');
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    root.appendChild(card);
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('vf-dialog-root--in'));

    function render() {
        inList.innerHTML = '';
        outList.innerHTML = '';
        const allIds = getAllViewIds(viewIDs);

        group.viewIds.forEach(id => {
            const label = getViewLabel(id, viewIDs);
            if (!label) return;
            inList.appendChild(buildEditRow(id, label, false, () => {
                removeViewFromGroup(group.id, id);
                render();
            }));
        });
        if (group.viewIds.length === 0) {
            const empty = el('div', 'vf-edit-empty', '此分组还没有视图');
            inList.appendChild(empty);
        }

        const candidates = allIds.filter(id => !group.viewIds.includes(id));
        candidates.forEach(id => {
            const label = getViewLabel(id, viewIDs);
            if (!label) return;
            outList.appendChild(buildEditRow(id, label, true, () => {
                addViewToGroup(group.id, id);
                render();
            }));
        });
        if (candidates.length === 0) {
            const empty = el('div', 'vf-edit-empty', '没有可添加的视图');
            outList.appendChild(empty);
        }
    }

    function buildEditRow(_viewId: string, label: string, isAdd: boolean, onAction: () => void) {
        const row = el('div', 'vf-edit-row');
        const text = el('span', 'vf-edit-row-label', label);
        const btn = el('button', `vf-action-btn ${isAdd ? 'vf-action-primary' : 'vf-action-ghost'}`, isAdd ? '＋ 添加' : '移除');
        btn.onclick = onAction;
        row.appendChild(text);
        row.appendChild(btn);
        return row;
    }

    render();

    const nameInput = form.querySelector('.vf-edit-name') as HTMLInputElement;
    const iconInput = form.querySelector('.vf-edit-icon') as HTMLInputElement;

    const close = () => {
        root.classList.remove('vf-dialog-root--in');
        root.classList.add('vf-dialog-root--out');
        setTimeout(() => root.remove(), 160);
    };
    closeBtn.onclick = cancelBtn.onclick = close;
    root.addEventListener('mousedown', e => {
        if (e.target === root) close();
    });

    saveBtn.onclick = () => {
        const newName = nameInput.value.trim();
        if (!newName) {
            nameInput.classList.add('vf-input--error');
            setTimeout(() => nameInput.classList.remove('vf-input--error'), 600);
            return;
        }
        group.name = newName;
        group.icon = safeGroupIcon(iconInput.value.trim());
        saveUserGroups(userGroups);
        close();
        onComplete();
    };
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
