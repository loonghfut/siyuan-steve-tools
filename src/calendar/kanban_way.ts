
export let categories = [];
export let currentView = 'tab'; // 'tab' 或 'kanban'
export let currentCategory = 'all';
export let tasks = [];
export let draggedItem = null;
export let currentTaskId = null;
export let currentSort = ''; // 当前排序方式
export let hideCompletedTasks = false; // 添加隐藏已完成任务状态
export let currentEditingTaskId = null;
export let currentCategoryElement: HTMLElement | null = null;


//测试数据
export const taskData = [
    {
        id: "task1",
        title: "项目规划",
        status: "doing",
        parentId: null,
        order: 1,
        priority: "high",
        category: '', // 新增category字段
        timeType: null, // 'deadline' or 'period'
        deadlineTime: null,
        startTime: null,
        endTime: null
    },
    {
        id: "task2",
        title: "需求分析",
        status: "done",
        parentId: "task1",
        order: 1,
        priority: "medium",
        category: '', // 新增category字段
        timeType: null, // 'deadline' or 'period'
        deadlineTime: null,
        startTime: null,
        endTime: null
    }
];



export function initKanban() {
    console.log('init kanban');
    loadTasks();
    loadCategories();

    // 视图切换按钮事件
    const viewSwitchBtns = document.querySelectorAll('.view-switch-btn');
    viewSwitchBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = (e.target as HTMLElement).dataset.view;
            switchView(view);
        });
    });

    // 分类标签点击事件
    const tabContainer = document.querySelector('.tab-container');
    if (tabContainer) {
        tabContainer.addEventListener('click', (e) => {
            const tab = (e.target as HTMLElement).closest('.tab-item');
            if (tab) {
                document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentCategory = (tab as HTMLElement).dataset.category;
                renderCategories();
            }
        });
    }

    // 添加分类按钮事件
    document.querySelectorAll('.add-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = prompt('请输入分类名称：');
            if (name) addCategory(name.trim());
        });
    });

    // 时间类型选择事件
    const timeTypeSelect = document.getElementById('timeType');
    if (timeTypeSelect) {
        timeTypeSelect.addEventListener('change', toggleTimeInputs);
    }

    // 隐藏已完成任务切换事件
    const hideDoneToggle = document.getElementById('hideDoneToggle');
    const hideDoneToggleTab = document.getElementById('hideDoneToggleTab') as HTMLInputElement;

    if (hideDoneToggle) {
        hideDoneToggle.addEventListener('change', (e) => {
            hideCompletedTasks = (e.target as HTMLInputElement).checked;
            if (hideDoneToggleTab) hideDoneToggleTab.checked = (e.target as HTMLInputElement).checked;
            if (currentView === 'kanban') {
                renderKanbanView();
            } else {
                renderCategories();
            }
        });
    }

    if (hideDoneToggleTab) {
        hideDoneToggleTab.addEventListener('change', (e) => {
            hideCompletedTasks = (e.target as HTMLInputElement).checked;
            if (hideDoneToggle) (hideDoneToggle as HTMLInputElement).checked = (e.target as HTMLInputElement).checked;
            renderCategories();
        });
    }

    // 初始化视图
    renderCategories();
}


function loadTasks() {
    tasks = [...taskData];
    console.log('load tasks', tasks);
}

function saveTasks() {
    console.log('save tasks', tasks);
}

function loadCategories() {
    categories = [];
    console.log('load categories', categories);
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-switch-btn').forEach((btn) => {
        btn.classList.toggle('active', (btn as HTMLElement).dataset.view === view);
    });

    const tabView = document.getElementById('tabView');
    const kanbanView = document.getElementById('kanbanView');

    if (view === 'kanban') {
        tabView.style.display = 'none';
        kanbanView.style.display = 'block';
        // 在切换到看板视图时更新分类标签
        updateCategoryTabs();
        renderKanbanView();
    } else {
        tabView.style.display = 'block';
        kanbanView.style.display = 'none';
        renderCategories();
    }

    // 绑定分类标签点击事件
    document.querySelectorAll('.tab-container .tab-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const category = (e.target as HTMLInputElement).dataset.category;
            if (category) {
                currentCategory = category;
                document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
                (e.target as HTMLInputElement).classList.add('active');
                if (currentView === 'kanban') {
                    renderKanbanView();
                } else {
                    renderCategories();
                }
            }
        });
    });

    // 同步隐藏已完成任务状态
    (document.getElementById('hideDoneToggle') as HTMLInputElement).checked = hideCompletedTasks;
    (document.getElementById('hideDoneToggleTab') as HTMLInputElement).checked = hideCompletedTasks;
}


function renderCategories() {
    if (currentView === 'tab') {
        // 更新分类标签
        const tabContainer = document.querySelector('.tab-container');
        const addCategoryBtn = tabContainer.querySelector('.add-category-btn');
        const hideDoneToggle = tabContainer.querySelector('.hide-done-toggle');

        // 清空现有标签，保留添加按钮和隐藏开关
        Array.from(tabContainer.children).forEach(child => {
            if (!child.classList.contains('add-category-btn') &&
                !child.classList.contains('hide-done-toggle')) {
                child.remove();
            }
        });

        // 添加"全部"和"未分类"标签
        const allTab = document.createElement('div');
        allTab.className = `tab-item${currentCategory === 'all' ? ' active' : ''}`;
        allTab.dataset.category = 'all';
        allTab.textContent = '全部';

        const noneTab = document.createElement('div');
        noneTab.className = `tab-item${currentCategory === 'none' ? ' active' : ''}`;
        noneTab.dataset.category = 'none';
        noneTab.textContent = '未分类';

        // 插入标签到添加按钮前
        tabContainer.insertBefore(allTab, addCategoryBtn);
        tabContainer.insertBefore(noneTab, addCategoryBtn);

        // 添加其他分类标签
        categories.forEach(category => {
            const tab = document.createElement('div');
            tab.className = `tab-item${currentCategory === category ? ' active' : ''}`;
            tab.dataset.category = category;
            tab.textContent = category;

            // 添加右键菜单监听
            tab.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                currentCategoryElement = tab;
                showCategoryContextMenu(e.clientX, e.clientY);
            });

            tabContainer.insertBefore(tab, addCategoryBtn);
        });

        // 重新渲染任务列表
        renderTasks();
    } else {
        // 原有的看板视图渲染代码
        const kanbanView = document.querySelector('.kanban-view');
        kanbanView.innerHTML = '';

        // 定义状态列
        const statuses = [
            { key: 'todo', text: '待处理', class: 'status-todo' },
            { key: 'doing', text: '进行中', class: 'status-doing' },
            { key: 'done', text: '已完成', class: 'status-done' }
        ];

        // 过滤任务
        let filteredTasks = tasks;
        if (currentCategory !== 'all') {
            filteredTasks = filteredTasks.filter(t =>
                currentCategory === 'none' ? !t.category : t.category === currentCategory
            );
        }
        if (hideCompletedTasks) {
            filteredTasks = filteredTasks.filter(t => t.status !== 'done');
        }

        // 获取实际要显示的列数
        let visibleColumns = hideCompletedTasks ? 2 : 3;

        // 设置列宽
        const columnWidth = `${100 / visibleColumns}%`;

        // 创建状态列
        statuses.forEach(status => {
            // 如果隐藏已完成任务且是已完成状态，则跳过
            if (hideCompletedTasks && status.key === 'done') return;

            const column = document.createElement('div');
            column.className = 'kanban-column';
            column.style.width = columnWidth; // 设置列宽
            column.style.flexGrow = '1'; // 允许列伸展

            const tasksInStatus = filteredTasks
                .filter(t => t.status === status.key && !t.parentId)
                .sort((a, b) => a.order - b.order);

            column.innerHTML = `
                <div class="kanban-status-header">
                    <span class="status-tag ${status.class}">${status.text}</span>
                    <span class="kanban-status-count">${tasksInStatus.length}</span>
                </div>
                <div class="kanban-quick-add">
                    <input type="text" placeholder="添加新任务..." data-status="${status.key}">
                    <button onclick="quickAddTask(this)">添加</button>
                </div>
                <ul class="task-tree" data-status="${status.key}"></ul>
            `;

            kanbanView.appendChild(column);

            const taskList = column.querySelector('.task-tree');
            tasksInStatus.forEach(task => {
                renderKanbanTask(task, taskList);
            });
        });

        addDragListeners();
    }
}

function addCategory(name) {
    if (name && !categories.includes(name)) {
        categories.push(name);
        saveCategories();
        updateCategoryTabs();
        // 如果在看板视图，重新渲染
        if (currentView === 'kanban') {
            renderKanbanView();
        }
    }
}

function toggleTimeInputs() {
    const timeType = (document.getElementById('timeType') as HTMLSelectElement).value;
    document.getElementById('deadlineInputs').style.display =
        timeType === 'deadline' ? 'block' : 'none';
    document.getElementById('periodInputs').style.display =
        timeType === 'period' ? 'block' : 'none';
}

function renderKanbanView() {
    const kanbanView = document.querySelector('.kanban-view');
    kanbanView.innerHTML = '';

    // 定义状态列
    const statuses = [
        { key: 'todo', text: '待处理', class: 'status-todo' },
        { key: 'doing', text: '进行中', class: 'status-doing' },
        { key: 'done', text: '已完成', class: 'status-done' }
    ];

    // 过滤任务
    let filteredTasks = tasks;
    if (currentCategory !== 'all') {
        filteredTasks = filteredTasks.filter(t =>
            currentCategory === 'none' ? !t.category : t.category === currentCategory
        );
    }
    if (hideCompletedTasks) {
        filteredTasks = filteredTasks.filter(t => t.status !== 'done');
    }

    // 获取实际要显示的列数
    let visibleColumns = hideCompletedTasks ? 2 : 3;

    // 设置列宽
    const columnWidth = `${100 / visibleColumns}%`;

    // 创建状态列
    statuses.forEach(status => {
        // 如果隐藏已完成任务且是已完成状态，则跳过
        if (hideCompletedTasks && status.key === 'done') return;

        const column = document.createElement('div');
        column.className = 'kanban-column';
        column.style.width = columnWidth; // 设置列宽
        column.style.flexGrow = '1'; // 允许列伸展

        const tasksInStatus = filteredTasks
            .filter(t => t.status === status.key && !t.parentId)
            .sort((a, b) => a.order - b.order);

        column.innerHTML = `
            <div class="kanban-status-header">
                <span class="status-tag ${status.class}">${status.text}</span>
                <span class="kanban-status-count">${tasksInStatus.length}</span>
            </div>
            <div class="kanban-quick-add">
                <input type="text" placeholder="添加新任务..." data-status="${status.key}">
                <button onclick="quickAddTask(this)">添加</button>
            </div>
            <ul class="task-tree" data-status="${status.key}"></ul>
        `;

        kanbanView.appendChild(column);

        const taskList = column.querySelector('.task-tree');
        tasksInStatus.forEach(task => {
            renderKanbanTask(task, taskList);
        });
    });

    addDragListeners();
}

function updateCategoryTabs() {
    const tabContainers = document.querySelectorAll('.tab-container');
    tabContainers.forEach(tabContainer => {
        const addCategoryBtn = tabContainer.querySelector('.add-category-btn');
        const hideDoneToggle = tabContainer.querySelector('.hide-done-toggle');

        // 清空现有标签
        Array.from(tabContainer.children).forEach(child => {
            if (!child.classList.contains('add-category-btn') &&
                !child.classList.contains('hide-done-toggle')) {
                child.remove();
            }
        });

        // 添加基本标签
        const allTab = createTabElement('全部', 'all');
        const noneTab = createTabElement('未分类', 'none');

        tabContainer.insertBefore(allTab, addCategoryBtn);
        tabContainer.insertBefore(noneTab, addCategoryBtn);

        // 添加分类标签
        categories.forEach(category => {
            const tab = createTabElement(category, category);
            // 为自定义分类添加右键菜单
            if (category !== 'all' && category !== 'none') {
                tab.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    currentCategoryElement = tab;
                    showCategoryContextMenu(e.clientX, e.clientY);
                });
            }
            tabContainer.insertBefore(tab, addCategoryBtn);
        });
    });
}

function showCategoryContextMenu(x, y) {
    const menu = document.getElementById('categoryContextMenu');
    menu.style.display = 'block';

    // 调整菜单位置
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const menuRect = menu.getBoundingClientRect();

    x = Math.min(x, winWidth - menuRect.width);
    y = Math.min(y, winHeight - menuRect.height);

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // 添加菜单项点击事件
    menu.querySelectorAll('.category-menu-item').forEach(item => {
        item.removeEventListener('click', handleCategoryMenuClick);
        item.addEventListener('click', handleCategoryMenuClick);
    });
}

function renderTasks() {
    const container = document.getElementById('taskTree');
    if (!container) return; // 添加空检查

    container.innerHTML = '';
    buildTaskTree(container, null);
    addDragListeners();
}

// 新增看板任务渲染函数
function renderKanbanTask(task, container) {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.draggable = true;
    li.dataset.id = task.id;

    const content = document.createElement('div');
    content.className = 'task-item-content';
    content.innerHTML = renderTaskContent(task);
    li.appendChild(content);

    // 渲染子任务
    const children = tasks
        .filter(t => t.parentId === task.id)
        .sort((a, b) => a.order - b.order);
    if (children.length > 0) {
        const subList = document.createElement('ul');
        subList.className = 'subtasks';
        children.forEach(child => renderKanbanTask(child, subList));
        li.appendChild(subList);
    }

    container.appendChild(li);
}

function addDragListeners() {
    document.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('drop', handleDrop);
    });
}


// 保存分类数据
function saveCategories() {
    console.log('save categories', categories);
}

function createTabElement(text, category) {
    const tab = document.createElement('div');
    tab.className = `tab-item${currentCategory === category ? ' active' : ''}`;
    tab.dataset.category = category;
    tab.textContent = text;
    return tab;
}

// 处理分类菜单点击事件
function handleCategoryMenuClick(e) {
    const action = e.currentTarget.dataset.action;
    const category = currentCategoryElement.dataset.category;

    switch (action) {
        case 'rename':
            const newName = prompt('请输入新的分类名称：', category);
            if (newName && newName.trim() && newName !== category) {
                // 更新分类名称
                const index = categories.indexOf(category);
                if (index !== -1) {
                    categories[index] = newName;
                    // 更新所有使用该分类的任务
                    tasks.forEach(task => {
                        if (task.category === category) {
                            task.category = newName;
                        }
                    });
                    saveCategories();
                    saveTasks();
                    renderCategories();
                    if (currentView === 'kanban') {
                        renderKanbanView();
                    } else {
                        renderTasks();
                    }
                }
            }
            break;
        case 'delete':
            if (confirm(`确定要删除分类"${category}"吗？\n该分类下的任务将变为未分类。`)) {
                // 删除分类
                const index = categories.indexOf(category);
                if (index !== -1) {
                    categories.splice(index, 1);
                    // 将该分类下的任务设为未分类
                    tasks.forEach(task => {
                        if (task.category === category) {
                            task.category = '';
                        }
                    });
                    saveCategories();
                    saveTasks();
                    // 如果当前显示的是被删除的分类，切换到"全部"
                    if (currentCategory === category) {
                        currentCategory = 'all';
                    }
                    renderCategories();
                    if (currentView === 'kanban') {
                        renderKanbanView();
                    } else {
                        renderTasks();
                    }
                }
            }
            break;
    }

    hideCategoryContextMenu();
}

function buildTaskTree(container, parentId) {
    let filtered = tasks.filter(t => t.parentId === parentId);

    // 根据当前分类过滤
    if (currentView === 'tab' && currentCategory !== 'all') {
        filtered = filtered.filter(t =>
            currentCategory === 'none' ? !t.category : t.category === currentCategory
        );
    }

    // 隐藏已完成任务
    if (hideCompletedTasks) {
        filtered = filtered.filter(t => t.status !== 'done');
    }

    // 根据当前排序方式对任务进行排序
    if (currentSort) {
        filtered.sort((a, b) => {
            switch (currentSort) {
                case 'priority':
                    const priorityOrder = { high: 1, medium: 2, low: 3, none: 4 };
                    return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
                case 'status':
                    const statusOrder = { doing: 1, todo: 2, done: 3 };
                    return statusOrder[a.status] - statusOrder[b.status];
                case 'title':
                    return a.title.localeCompare(b.title);
                default:
                    return a.order - b.order;
            }
        });
    } else {
        filtered.sort((a, b) => a.order - b.order);
    }

    filtered.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.draggable = true;
        li.dataset.id = task.id;

        const content = document.createElement('div');
        content.className = 'task-item-content';
        content.innerHTML = renderTaskContent(task);
        li.appendChild(content);

        const hasChildren = tasks.some(t => t.parentId === task.id);
        if (hasChildren) {
            const subList = document.createElement('ul');
            subList.className = 'subtasks';
            li.appendChild(subList);
            buildTaskTree(subList, task.id);
        }

        container.appendChild(li);
    });
}

// 修改任务渲染函数，添加时间显示
function renderTaskContent(task) {
    const timeHtml = getTaskTimeHtml(task);
    const categoryHtml = task.category && currentCategory === 'all' ?
        `<div class="task-category">分类：${task.category}</div>` : '';

    return `
        <div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="status-tag status-${task.status}">${getStatusText(task.status)}</span>
                <span class="title">${task.title}</span>
                ${timeHtml}
                ${task.priority && task.priority !== 'none' ?
            `<span class="priority-tag priority-${task.priority}">${getPriorityText(task.priority)}</span>` : ''}
            </div>
            ${categoryHtml}
        </div>
    `;
}

function handleDragStart(e) {
    draggedItem = e.target.closest('.task-item');
    draggedItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    if (!draggedItem) return;

    const targetItem = e.target.closest('.task-item');
    if (!targetItem || targetItem === draggedItem) return;

    const rect = targetItem.getBoundingClientRect();
    const mouseY = e.clientY;
    const mouseX = e.clientX;

    // 定义拖拽区域
    const topThreshold = rect.top + rect.height * 0.25;
    const bottomThreshold = rect.bottom - rect.height * 0.25;
    const middleZone = mouseY > topThreshold && mouseY < bottomThreshold;

    // 水平方向判断
    const leftEdge = rect.left;
    const horizontalThreshold = 50; // 向左拖动50px时取消父子关系
    const shouldBeSibling = mouseX < leftEdge - horizontalThreshold;

    // 清除所有临时样式
    document.querySelectorAll('.task-item').forEach((item: Element) => {
        (item as HTMLElement).style.borderTop = '';
        (item as HTMLElement).style.borderBottom = '';
        (item as HTMLElement).style.backgroundColor = '';
    });

    const currentList = targetItem.parentElement;
    const isDifferentList = draggedItem.parentElement !== currentList;

    if (middleZone && !shouldBeSibling && !isDifferentList) {
        // 在中间区域且不满足向左拖动条件时，表示将成为子任务
        targetItem.style.backgroundColor = '#f0f9ff';

        let subtasksList = targetItem.querySelector('.subtasks');
        if (!subtasksList) {
            subtasksList = document.createElement('ul');
            subtasksList.className = 'subtasks';
            targetItem.appendChild(subtasksList);
        }

        const afterElement = getInsertPosition(subtasksList, mouseY);
        if (afterElement) {
            subtasksList.insertBefore(draggedItem, afterElement);
        } else {
            subtasksList.appendChild(draggedItem);
        }
    } else {
        // 如果是在同一列表中移动，先从原位置移除
        if (!isDifferentList) {
            draggedItem.parentNode.removeChild(draggedItem);
        }

        // 在上下区域或满足向左拖动条件时，作为同级任务插入
        const parentList = shouldBeSibling ? targetItem.parentElement.parentElement : targetItem.parentElement;
        if (mouseY < rect.top + rect.height / 2) {
            targetItem.style.borderTop = '2px solid #3b82f6';
            parentList.insertBefore(draggedItem, targetItem);
        } else {
            targetItem.style.borderBottom = '2px solid #3b82f6';
            parentList.insertBefore(draggedItem, targetItem.nextSibling);
        }

        if (shouldBeSibling) {
            targetItem.style.backgroundColor = '#f1f5f9';
        }
    }

    e.stopPropagation();
}

function handleDragEnd(e) {
    // 清除所有临时样式
    document.querySelectorAll('.task-item').forEach((item: Element) => {
        (item as HTMLElement).style.borderTop = '';
        (item as HTMLElement).style.borderBottom = '';
        (item as HTMLElement).style.backgroundColor = '';
    });

    draggedItem.classList.remove('dragging');

    // 在看板视图中更新任务状态
    if (currentView === 'kanban') {
        const taskId = draggedItem.dataset.id;
        const task = tasks.find(t => t.id === taskId);
        const newStatusColumn = draggedItem.closest('.task-tree');

        if (task && newStatusColumn) {
            const newStatus = newStatusColumn.dataset.status;
            if (newStatus && task.status !== newStatus) {
                task.status = newStatus;
                saveTasks();
            }
        }
    }

    updateTaskOrders();
    saveTasks();
    if (currentView === 'kanban') {
        renderKanbanView();
    } else {
        renderTasks();
    }
}

function handleDrop(e) {
    e.preventDefault();
}

// 隐藏分类右键菜单
function hideCategoryContextMenu() {
    const menu = document.getElementById('categoryContextMenu');
    menu.style.display = 'none';
    currentCategoryElement = null;
}


function getTaskTimeHtml(task) {
    if (!task.timeType) return '';
    
    const now = new Date();
    let isOverdue = false;
    let timeText = '';
    
    if (task.timeType === 'deadline') {
        const deadline = new Date(task.deadlineTime);
        isOverdue = now > deadline && task.status !== 'done';
        timeText = formatRelativeDateTime(deadline, isOverdue);
    } else if (task.timeType === 'period') {
        const start = new Date(task.startTime);
        const end = new Date(task.endTime);
        isOverdue = now > end && task.status !== 'done';
        timeText = `${formatRelativeDateTime(start)} - ${formatRelativeDateTime(end, isOverdue)}`;
    }
    
    return `<span class="task-time ${isOverdue ? 'overdue' : ''}">${timeText}</span>`;
}

function getStatusText(status) {
    return {
        todo: '待处理',
        doing: '进行中',
        done: '已完成'
    }[status] || '未知状态';
}

function getPriorityText(priority) {
    return `优先级：${priority}`;
}

function getInsertPosition(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}


function updateTaskOrders() {
    if (!currentSort) {
        // 只在没有自定义排序时更新order
        document.querySelectorAll('.task-item').forEach((item, index) => {
            const parentList = item.parentElement;
            const parentItem = parentList.closest('.task-item');
            const task = tasks.find(t => t.id === (item as HTMLElement).dataset.id);

            if (task) {
                task.order = index + 1;
                task.parentId = parentItem ? (parentItem as HTMLElement).dataset.id : null;
            }
        });
    } else {
        // 在排序模式下只更新父子关系
        document.querySelectorAll('.task-item').forEach((item) => {
            const parentList = item.parentElement;
            const parentItem = parentList.closest('.task-item');
            const task = tasks.find(t => t.id === (item as HTMLElement).dataset.id);

            if (task) {
                task.parentId = parentItem ? (parentItem as HTMLElement).dataset.id : null;
            }
        });
    }
}

function formatRelativeDateTime(date, isOverdue = false) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    let timeStr = date.toLocaleString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });

    if (isOverdue) {
        // 检查是否是同一天但是时间已过
        if (diffDays === 0) {
            const nowTime = now.getTime();
            const targetTime = date.getTime();
            if (targetTime < nowTime) {
                return `已过期 ${formatTime(date)}`;
            }
        }
        const overdueDays = Math.abs(diffDays);
        return `已过期${overdueDays}天`;
    }

    // 相对日期显示
    if (diffDays === 0) {
        return `今天 ${formatTime(date)}`;
    } else if (diffDays === 1) {
        return `明天 ${formatTime(date)}`;
    } else if (diffDays === -1) {
        return `昨天 ${formatTime(date)}`;
    }
    
    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
function formatTime(date) {
    return date.toLocaleString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}
