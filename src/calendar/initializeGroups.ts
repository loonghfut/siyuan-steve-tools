import { moduleInstances } from '..';
import { av_ids } from './calendar';

// 分组配置接口
export interface ViewGroup {
    id: string;
    name: string;
    icon?: string;
    viewIds: string[];
    isExpanded?: boolean;
}
// 默认分组配置
export let userGroups: ViewGroup[] = [];
const defaultGroups: ViewGroup[] = [
    {
        id: 'external',
        name: '外部日历',
        icon: '📅',
        viewIds: ['qqcalendar', 'icsSubscription'],
        isExpanded: true
    },
    {
        id: 'special',
        name: '特殊功能',
        icon: '⚡',
        viewIds: ['lifelog'],
        isExpanded: true
    }
];

// 分组管理函数
function loadUserGroups(): ViewGroup[] {
    try {
        const saved = moduleInstances['M_calendar'].calConfig.get("userGroups");
        return saved ? JSON.parse(saved as string) : [];
    } catch (error) {
        console.error('加载用户分组失败:', error);
        return [];
    }
}
export function saveUserGroups(groups: ViewGroup[]) {
    try {
        moduleInstances['M_calendar'].calConfig.set("userGroups", JSON.stringify(groups));
        moduleInstances['M_calendar'].calConfig.save();
        userGroups = [...groups];
    } catch (error) {
        console.error('保存用户分组失败:', error);
    }
}
export function initializeGroups() {
    userGroups = loadUserGroups();
    // 如果没有用户分组，使用默认分组
    if (userGroups.length === 0) {
        userGroups = [...defaultGroups];
        saveUserGroups(userGroups);
    }
}
export function createNewGroup(name: string, icon: string = '📁'): ViewGroup {
    const newGroup: ViewGroup = {
        id: Date.now().toString(),
        name,
        icon,
        viewIds: [],
        isExpanded: true
    };
    return newGroup;
}
export function addViewToGroup(groupId: string, viewId: string) {
    const group = userGroups.find(g => g.id === groupId);
    if (group && !group.viewIds.includes(viewId)) {
        group.viewIds.push(viewId);
        saveUserGroups(userGroups);
    }
}
export function removeViewFromGroup(groupId: string, viewId: string) {
    const group = userGroups.find(g => g.id === groupId);
    if (group) {
        group.viewIds = group.viewIds.filter(id => id !== viewId);
        saveUserGroups(userGroups);
    }
}
export function deleteGroup(groupId: string) {
    userGroups = userGroups.filter(g => g.id !== groupId);
    saveUserGroups(userGroups);
}
export function getUngroupedViews(allViewIds: string[]): string[] {
    const groupedViewIds = new Set();
    userGroups.forEach(group => {
        group.viewIds.forEach(id => groupedViewIds.add(id));
    });
    return allViewIds.filter(id => !groupedViewIds.has(id));
}

// 创建视图筛选菜单
export async function createViewFilterMenu(
    calendarEl: HTMLElement,
    myF: any,
    calendar: any,
    filterViewId: string[],
    setFilterViewId: (ids: string[]) => void,
    refreshKanban: () => void,
    lastSavedLifelogSlotDuration: string
) {
    const button = calendarEl.querySelector('.fc-viewFilter-button');
    if (!button) return;

    const viewIDs = await myF.getViewId(av_ids);

    // 创建下拉菜单
    const menu = document.createElement('div');
    menu.className = 'view-filter-menu';

    // 创建菜单头部
    const menuHeader = document.createElement('div');
    menuHeader.className = 'view-filter-header';

    // 添加全选/清空按钮
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'b3-button view-filter-select-all';
    selectAllBtn.textContent = '全选';
    selectAllBtn.onclick = (e) => {
        e.stopPropagation();
        // 选择所有视图
        let newFilterViewId = ['qqcalendar', 'icsSubscription', 'lifelog'];
        viewIDs.forEach(view => {
            if (!newFilterViewId.includes(view.viewId)) {
                newFilterViewId.push(view.viewId);
            }
        });
        setFilterViewId(newFilterViewId);
        updateAllCheckboxes(menu, true);
        saveFilterConfig(newFilterViewId);
        refreshFiltersDisplay(newFilterViewId, viewIDs);
    };

    const clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'b3-button view-filter-clear-all';
    clearAllBtn.textContent = '清空';
    clearAllBtn.onclick = (e) => {
        e.stopPropagation();
        setFilterViewId([]);
        updateAllCheckboxes(menu, false);
        saveFilterConfig([]);
        refreshFiltersDisplay([], viewIDs);
    };

    // 添加分组管理按钮
    const manageGroupsBtn = document.createElement('button');
    manageGroupsBtn.className = 'b3-button view-filter-manage-groups';
    manageGroupsBtn.textContent = '分组管理';
    manageGroupsBtn.onclick = (e) => {
        e.stopPropagation();
        showGroupManagementDialog(viewIDs);
    };

    menuHeader.appendChild(selectAllBtn);
    menuHeader.appendChild(clearAllBtn);
    menuHeader.appendChild(manageGroupsBtn);
    menu.appendChild(menuHeader);

    // 创建可滚动的视图列表容器
    const menuContent = document.createElement('div');
    menuContent.className = 'view-filter-content';

    // 获取所有视图ID（包括特殊视图）
    const allSpecialViewIds = ['qqcalendar', 'icsSubscription', 'lifelog'];
    const allSiyuanViewIds = viewIDs.map(v => v.viewId);
    const allViewIds = [...allSpecialViewIds, ...allSiyuanViewIds];

    // 渲染分组
    userGroups.forEach(group => {
        createGroupSection(group, menuContent, viewIDs, allViewIds, filterViewId, setFilterViewId, calendar, lastSavedLifelogSlotDuration);
    });

    // 渲染未分组的视图
    const ungroupedViewIds = getUngroupedViews(allViewIds);
    if (ungroupedViewIds.length > 0) {
        const ungroupedItems = [];
        ungroupedViewIds.forEach(viewId => {
            const item = createViewItemElement(viewId, viewIDs, filterViewId, setFilterViewId, calendar, lastSavedLifelogSlotDuration);
            if (item) ungroupedItems.push(item);
        });
        
        if (ungroupedItems.length > 0) {
            createViewGroup('📁 未分组', ungroupedItems, menuContent);
        }
    }

    menu.appendChild(menuContent);

    // 创建底部按钮容器
    const menuFooter = document.createElement('div');
    menuFooter.className = 'view-filter-footer';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'b3-button';
    confirmBtn.textContent = '确定';
    confirmBtn.onclick = () => {
        refreshKanban();
        menu.remove();
    };
    menuFooter.appendChild(confirmBtn);
    menu.appendChild(menuFooter);

    // 定位并显示菜单
    const rect = button.getBoundingClientRect();
    
    // 获取窗口尺寸
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 获取菜单尺寸（需要先添加到DOM中才能获取）
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    
    // 计算垂直位置
    let top = rect.bottom;
    if (top + menuRect.height > windowHeight) {
        // 如果下方空间不够，显示在按钮上方
        top = rect.top - menuRect.height;
        // 如果上方也不够，则贴着窗口底部
        if (top < 0) {
            top = windowHeight - menuRect.height - 10;
        }
    }
    
    // 计算水平位置
    let left = rect.left;
    if (left + menuRect.width > windowWidth) {
        // 如果右侧空间不够，右对齐到按钮右边
        left = rect.right - menuRect.width;
        // 如果还是超出，则贴着窗口右边
        if (left < 0) {
            left = windowWidth - menuRect.width - 10;
        }
    }
    
    // 应用计算后的位置
    menu.style.top = Math.max(10, top) + 'px';
    menu.style.left = Math.max(10, left) + 'px';
    menu.style.visibility = 'visible';

    // 点击外部关闭菜单
    document.addEventListener('click', function closeMenu(e) {
        const target = e.target as Node;
        if (!menu.contains(target) && target !== button) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    });

    // 辅助函数
    function createGroupSection(group: ViewGroup, container: HTMLElement, viewIDs: any[], _allViewIds: string[], filterViewId: string[], setFilterViewId: (ids: string[]) => void, calendar: any, lastSavedLifelogSlotDuration: string) {
        const groupContainer = document.createElement('div');
        groupContainer.className = 'view-filter-group';
        groupContainer.dataset.groupId = group.id;

        const groupHeader = document.createElement('div');
        groupHeader.className = 'view-filter-group-header';
        
        const headerText = document.createElement('span');
        headerText.textContent = `${group.icon || '📁'} ${group.name}`;
        groupHeader.appendChild(headerText);

        // 添加分组操作按钮
        const groupActions = document.createElement('div');
        groupActions.className = 'view-filter-group-actions';

        // 全选分组按钮
        const selectGroupBtn = document.createElement('button');
        selectGroupBtn.className = 'view-filter-group-select-btn';
        selectGroupBtn.textContent = '全选';
        selectGroupBtn.title = '选择此分组的所有视图';
        selectGroupBtn.onclick = (e) => {
            e.stopPropagation();
            let newFilterViewId = [...filterViewId];
            group.viewIds.forEach(viewId => {
                if (!newFilterViewId.includes(viewId)) {
                    newFilterViewId.push(viewId);
                }
            });
            setFilterViewId(newFilterViewId);
            updateGroupCheckboxes(groupContainer, true);
            saveFilterConfig(newFilterViewId);
            refreshFiltersDisplay(newFilterViewId, viewIDs);
        };

        // 取消分组按钮
        const deselectGroupBtn = document.createElement('button');
        deselectGroupBtn.className = 'view-filter-group-deselect-btn';
        deselectGroupBtn.textContent = '取消';
        deselectGroupBtn.title = '取消选择此分组的所有视图';
        deselectGroupBtn.onclick = (e) => {
            e.stopPropagation();
            let newFilterViewId = filterViewId.filter(id => !group.viewIds.includes(id));
            setFilterViewId(newFilterViewId);
            updateGroupCheckboxes(groupContainer, false);
            saveFilterConfig(newFilterViewId);
            refreshFiltersDisplay(newFilterViewId, viewIDs);
        };

        // 展开/折叠按钮
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'view-filter-toggle-icon';
        toggleIcon.textContent = group.isExpanded !== false ? '▼' : '▶';

        groupActions.appendChild(selectGroupBtn);
        groupActions.appendChild(deselectGroupBtn);
        groupActions.appendChild(toggleIcon);
        groupHeader.appendChild(groupActions);

        groupContainer.appendChild(groupHeader);

        const groupItems = document.createElement('div');
        groupItems.className = 'view-filter-group-items';
        groupItems.style.display = group.isExpanded !== false ? 'block' : 'none';

        // 添加分组中的视图项
        group.viewIds.forEach(viewId => {
            const item = createViewItemElement(viewId, viewIDs, filterViewId, setFilterViewId, calendar, lastSavedLifelogSlotDuration);
            if (item) {
                groupItems.appendChild(item);
            }
        });

        groupContainer.appendChild(groupItems);

        // 点击展开/折叠
        groupHeader.onclick = (e) => {
            if ((e.target as Element).closest('.view-filter-group-actions')) {
                return; // 如果点击的是操作按钮，不处理展开/折叠
            }
            e.stopPropagation();
            const isExpanded = groupItems.style.display !== 'none';
            groupItems.style.display = isExpanded ? 'none' : 'block';
            toggleIcon.textContent = isExpanded ? '▶' : '▼';
            
            // 保存展开状态
            group.isExpanded = !isExpanded;
            saveUserGroups(userGroups);
        };

        container.appendChild(groupContainer);
    }

    function createViewGroup(groupTitle: string, items: HTMLElement[], container: HTMLElement) {
        if (items.length === 0) return;

        const groupContainer = document.createElement('div');
        groupContainer.className = 'view-filter-group';

        const groupHeader = document.createElement('div');
        groupHeader.className = 'view-filter-group-header';
        groupHeader.textContent = groupTitle;

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'view-filter-toggle-icon';
        toggleIcon.textContent = '▼';
        groupHeader.appendChild(toggleIcon);

        groupContainer.appendChild(groupHeader);

        const groupItems = document.createElement('div');
        groupItems.className = 'view-filter-group-items';

        items.forEach(item => {
            groupItems.appendChild(item);
        });

        groupContainer.appendChild(groupItems);

        // 点击展开/折叠
        groupHeader.onclick = (e) => {
            e.stopPropagation();
            const isExpanded = groupItems.style.display !== 'none';
            groupItems.style.display = isExpanded ? 'none' : 'block';
            toggleIcon.textContent = isExpanded ? '▶' : '▼';
        };

        container.appendChild(groupContainer);
    }

    function createViewItemElement(viewId: string, viewIDs: any[], filterViewId: string[], setFilterViewId: (ids: string[]) => void, calendar: any, lastSavedLifelogSlotDuration: string): HTMLElement | null {
        let label = '';
        let isSpecial = false;

        // 判断是否为特殊视图
        switch (viewId) {
            case 'qqcalendar':
                label = 'QQ邮箱日历';
                isSpecial = true;
                break;
            case 'icsSubscription':
                label = 'ICS订阅日历';
                isSpecial = true;
                break;
            case 'lifelog':
                label = 'Lifelog 记录';
                isSpecial = true;
                break;
            default:
                const view = viewIDs.find(v => v.viewId === viewId);
                if (view) {
                    label = view.name;
                } else {
                    return null; // 视图不存在
                }
        }

        const item = document.createElement('div');
        item.className = 'view-filter-item';
        item.dataset.viewId = viewId;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = filterViewId.includes(viewId);
        checkbox.className = 'view-filter-checkbox';

        const labelElement = document.createElement('span');
        labelElement.textContent = label;
        labelElement.className = 'view-filter-label';

        item.appendChild(checkbox);
        item.appendChild(labelElement);

        item.onclick = (e) => {
            e.stopPropagation();
            if (isSpecial && viewId === 'lifelog') {
                // 特殊处理 lifelog
                let newFilterViewId;
                if (filterViewId.includes('lifelog')) {
                    newFilterViewId = filterViewId.filter(id => id !== 'lifelog');
                    calendar.setOption('slotDuration', lastSavedLifelogSlotDuration);
                } else {
                    newFilterViewId = [...filterViewId, 'lifelog'];
                    calendar.setOption('slotDuration', '00:10:00');
                }
                setFilterViewId(newFilterViewId);
                checkbox.checked = newFilterViewId.includes('lifelog');
                saveFilterConfig(newFilterViewId);
                refreshFiltersDisplay(newFilterViewId, viewIDs);
                calendar.refetchEvents();
            } else {
                toggleViewSelection(viewId, checkbox, filterViewId, setFilterViewId, viewIDs);
            }
        };

        return item;
    }

    function updateAllCheckboxes(container: HTMLElement, checked: boolean) {
        container.querySelectorAll('.view-filter-checkbox').forEach((checkbox: HTMLInputElement) => {
            checkbox.checked = checked;
        });
    }

    function updateGroupCheckboxes(groupContainer: HTMLElement, checked: boolean) {
        groupContainer.querySelectorAll('.view-filter-checkbox').forEach((checkbox: HTMLInputElement) => {
            checkbox.checked = checked;
        });
    }

    function toggleViewSelection(viewId: string, checkbox: HTMLInputElement, filterViewId: string[], setFilterViewId: (ids: string[]) => void, viewIDs: any[]) {
        let newFilterViewId;
        if (filterViewId.includes(viewId)) {
            newFilterViewId = filterViewId.filter(id => id !== viewId);
        } else {
            newFilterViewId = [...filterViewId, viewId];
        }
        setFilterViewId(newFilterViewId);
        checkbox.checked = newFilterViewId.includes(viewId);
        saveFilterConfig(newFilterViewId);
        refreshFiltersDisplay(newFilterViewId, viewIDs);
    }

    function saveFilterConfig(filterViewId: string[]) {
        moduleInstances['M_calendar'].calConfig.set("viewId", filterViewId.join(','));
        moduleInstances['M_calendar'].calConfig.set("viewName", "多视图");
        moduleInstances['M_calendar'].calConfig.save();
    }

    function refreshFiltersDisplay(filterViewId: string[], _viewIDs: any[]) {
        // 这里可能需要设置一个全局变量或回调来更新视图名称
        // 暂时不实现具体逻辑，因为这个函数主要用于更新UI状态
        console.log('refreshFiltersDisplay called with:', filterViewId.length, 'views');
    }

    function showGroupManagementDialog(viewIDs: any[]) {
        menu.remove(); // 关闭筛选菜单
        
        // 创建分组管理对话框
        const dialog = document.createElement('div');
        dialog.className = 'group-management-dialog';
        
        const dialogContent = document.createElement('div');
        dialogContent.className = 'group-management-content';
        
        const header = document.createElement('div');
        header.className = 'group-management-header';
        header.innerHTML = `
            <h3>分组管理</h3>
            <button class="b3-button group-management-close">×</button>
        `;
        
        const body = document.createElement('div');
        body.className = 'group-management-body';
        
        // 创建新分组表单
        const createGroupForm = document.createElement('div');
        createGroupForm.className = 'create-group-form';
        createGroupForm.innerHTML = `
            <h4>创建新分组</h4>
            <div class="form-row">
                <input type="text" class="group-name-input" placeholder="分组名称" />
                <input type="text" class="group-icon-input" placeholder="图标 (如: 📁)" maxlength="2" />
                <button class="b3-button create-group-btn">创建</button>
            </div>
        `;
        
        // 现有分组列表
        const groupsList = document.createElement('div');
        groupsList.className = 'groups-list';
        groupsList.innerHTML = '<h4>现有分组</h4>';
        
        // 渲染现有分组
        userGroups.forEach(group => {
            const groupItem = document.createElement('div');
            groupItem.className = 'group-management-item';
            
            const groupInfo = document.createElement('div');
            groupInfo.className = 'group-info';
            groupInfo.innerHTML = `
                <span class="group-icon">${group.icon || '📁'}</span>
                <span class="group-name">${group.name}</span>
                <span class="group-count">(${group.viewIds.length}个视图)</span>
            `;
            
            const groupActions = document.createElement('div');
            groupActions.className = 'group-actions';
            
            if (!['external', 'special'].includes(group.id)) { // 不允许删除默认分组
                const editBtn = document.createElement('button');
                editBtn.className = 'b3-button group-edit-btn';
                editBtn.textContent = '编辑';
                editBtn.onclick = () => editGroup(group);
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'b3-button group-delete-btn';
                deleteBtn.textContent = '删除';
                deleteBtn.onclick = () => {
                    if (confirm(`确定删除分组 "${group.name}" 吗？`)) {
                        deleteGroup(group.id);
                        renderGroupsList();
                    }
                };
                
                groupActions.appendChild(editBtn);
                groupActions.appendChild(deleteBtn);
            }
            
            groupItem.appendChild(groupInfo);
            groupItem.appendChild(groupActions);
            groupsList.appendChild(groupItem);
        });
        
        function renderGroupsList() {
            // 重新渲染分组列表
            const existingGroupsList = body.querySelector('.groups-list');
            if (existingGroupsList) {
                existingGroupsList.remove();
            }
            
            const newGroupsList = document.createElement('div');
            newGroupsList.className = 'groups-list';
            newGroupsList.innerHTML = '<h4>现有分组</h4>';
            
            userGroups.forEach(group => {
                const groupItem = document.createElement('div');
                groupItem.className = 'group-management-item';
                
                const groupInfo = document.createElement('div');
                groupInfo.className = 'group-info';
                groupInfo.innerHTML = `
                    <span class="group-icon">${group.icon || '📁'}</span>
                    <span class="group-name">${group.name}</span>
                    <span class="group-count">(${group.viewIds.length}个视图)</span>
                `;
                
                const groupActions = document.createElement('div');
                groupActions.className = 'group-actions';
                
                if (!['external', 'special'].includes(group.id)) {
                    const editBtn = document.createElement('button');
                    editBtn.className = 'b3-button group-edit-btn';
                    editBtn.textContent = '编辑';
                    editBtn.onclick = () => editGroup(group);
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'b3-button group-delete-btn';
                    deleteBtn.textContent = '删除';
                    deleteBtn.onclick = () => {
                        if (confirm(`确定删除分组 "${group.name}" 吗？`)) {
                            deleteGroup(group.id);
                            renderGroupsList();
                        }
                    };
                    
                    groupActions.appendChild(editBtn);
                    groupActions.appendChild(deleteBtn);
                }
                
                groupItem.appendChild(groupInfo);
                groupItem.appendChild(groupActions);
                newGroupsList.appendChild(groupItem);
            });
            
            body.appendChild(newGroupsList);
        }
        
        function editGroup(group: ViewGroup) {
            // 创建编辑分组的界面
            showGroupEditDialog(group, renderGroupsList, viewIDs);
        }
        
        body.appendChild(createGroupForm);
        body.appendChild(groupsList);
        
        dialogContent.appendChild(header);
        dialogContent.appendChild(body);
        dialog.appendChild(dialogContent);
        
        // 事件绑定
        const closeBtn = header.querySelector('.group-management-close') as HTMLButtonElement;
        closeBtn.onclick = () => dialog.remove();
        
        const createBtn = createGroupForm.querySelector('.create-group-btn') as HTMLButtonElement;
        const nameInput = createGroupForm.querySelector('.group-name-input') as HTMLInputElement;
        const iconInput = createGroupForm.querySelector('.group-icon-input') as HTMLInputElement;
        
        createBtn.onclick = () => {
            const name = nameInput.value.trim();
            const icon = iconInput.value.trim() || '📁';
            
            if (name) {
                const newGroup = createNewGroup(name, icon);
                userGroups.push(newGroup);
                saveUserGroups(userGroups);
                
                nameInput.value = '';
                iconInput.value = '';
                renderGroupsList();
            }
        };
        
        // 显示对话框
        document.body.appendChild(dialog);
        
        // 点击外部关闭
        dialog.onclick = (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        };
    }

    function showGroupEditDialog(group: ViewGroup, onComplete: () => void, viewIDs: any[]) {
        const editDialog = document.createElement('div');
        editDialog.className = 'group-edit-dialog';
        
        const editContent = document.createElement('div');
        editContent.className = 'group-edit-content';
        
        editContent.innerHTML = `
            <div class="group-edit-header">
                <h3>编辑分组: ${group.name}</h3>
                <button class="b3-button group-edit-close">×</button>
            </div>
            <div class="group-edit-body">
                <div class="form-row">
                    <label>分组名称:</label>
                    <input type="text" class="edit-group-name" value="${group.name}" />
                </div>
                <div class="form-row">
                    <label>图标:</label>
                    <input type="text" class="edit-group-icon" value="${group.icon || '📁'}" maxlength="2" />
                </div>
                <div class="group-views-section">
                    <h4>分组中的视图</h4>
                    <div class="group-views-list"></div>
                </div>
                <div class="available-views-section">
                    <h4>可添加的视图</h4>
                    <div class="available-views-list"></div>
                </div>
                <div class="group-edit-actions">
                    <button class="b3-button save-group-btn">保存</button>
                    <button class="b3-button cancel-group-btn">取消</button>
                </div>
            </div>
        `;
        
        editDialog.appendChild(editContent);
        
        // 渲染分组中的视图
        const groupViewsList = editContent.querySelector('.group-views-list') as HTMLElement;
        group.viewIds.forEach(viewId => {
            const viewItem = createEditViewItem(viewId, viewIDs, () => {
                removeViewFromGroup(group.id, viewId);
                renderEditDialog();
            });
            if (viewItem) groupViewsList.appendChild(viewItem);
        });
        
        // 渲染可添加的视图
        const availableViewsList = editContent.querySelector('.available-views-list') as HTMLElement;
        const allViewIds = ['qqcalendar', 'icsSubscription', 'lifelog', ...viewIDs.map(v => v.viewId)];
        const availableViewIds = allViewIds.filter(id => !group.viewIds.includes(id));
        
        availableViewIds.forEach(viewId => {
            const viewItem = createEditViewItem(viewId, viewIDs, () => {
                addViewToGroup(group.id, viewId);
                renderEditDialog();
            }, true);
            if (viewItem) availableViewsList.appendChild(viewItem);
        });
        
        function renderEditDialog() {
            // 重新渲染对话框内容
            groupViewsList.innerHTML = '';
            availableViewsList.innerHTML = '';
            
            group.viewIds.forEach(viewId => {
                const viewItem = createEditViewItem(viewId, viewIDs, () => {
                    removeViewFromGroup(group.id, viewId);
                    renderEditDialog();
                });
                if (viewItem) groupViewsList.appendChild(viewItem);
            });
            
            const updatedAvailableViewIds = allViewIds.filter(id => !group.viewIds.includes(id));
            updatedAvailableViewIds.forEach(viewId => {
                const viewItem = createEditViewItem(viewId, viewIDs, () => {
                    addViewToGroup(group.id, viewId);
                    renderEditDialog();
                }, true);
                if (viewItem) availableViewsList.appendChild(viewItem);
            });
        }
        
        function createEditViewItem(viewId: string, viewIDs: any[], onAction: () => void, isAdd: boolean = false): HTMLElement | null {
            let label = '';
            switch (viewId) {
                case 'qqcalendar':
                    label = 'QQ邮箱日历';
                    break;
                case 'icsSubscription':
                    label = 'ICS订阅日历';
                    break;
                case 'lifelog':
                    label = 'Lifelog 记录';
                    break;
                default:
                    const view = viewIDs.find(v => v.viewId === viewId);
                    if (view) {
                        label = view.name;
                    } else {
                        return null;
                    }
            }
            
            const item = document.createElement('div');
            item.className = 'edit-view-item';
            
            const labelElement = document.createElement('span');
            labelElement.textContent = label;
            
            const actionBtn = document.createElement('button');
            actionBtn.className = 'b3-button';
            actionBtn.textContent = isAdd ? '添加' : '移除';
            actionBtn.onclick = onAction;
            
            item.appendChild(labelElement);
            item.appendChild(actionBtn);
            
            return item;
        }
        
        // 事件绑定
        const closeBtn = editContent.querySelector('.group-edit-close') as HTMLButtonElement;
        const saveBtn = editContent.querySelector('.save-group-btn') as HTMLButtonElement;
        const cancelBtn = editContent.querySelector('.cancel-group-btn') as HTMLButtonElement;
        const nameInput = editContent.querySelector('.edit-group-name') as HTMLInputElement;
        const iconInput = editContent.querySelector('.edit-group-icon') as HTMLInputElement;
        
        closeBtn.onclick = cancelBtn.onclick = () => editDialog.remove();
        
        saveBtn.onclick = () => {
            const newName = nameInput.value.trim();
            const newIcon = iconInput.value.trim();
            
            if (newName) {
                group.name = newName;
                group.icon = newIcon || '📁';
                saveUserGroups(userGroups);
                editDialog.remove();
                onComplete();
            }
        };
        
        document.body.appendChild(editDialog);
        
        editDialog.onclick = (e) => {
            if (e.target === editDialog) {
                editDialog.remove();
            }
        };
    }
}
