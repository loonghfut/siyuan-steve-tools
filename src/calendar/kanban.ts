import { createPlugin } from '@fullcalendar/core';
import * as way from './kanban_way';
// 添加分类相关数据
// let categories = [];
// let currentView = 'tab'; // 'tab' 或 'kanban'
// let currentCategory = 'all';
// let tasks = [];
// let draggedItem = null;
// let currentTaskId = null;
// let currentSort = ''; // 当前排序方式
// let hideCompletedTasks = false; // 添加隐藏已完成任务状态
// let currentEditingTaskId = null;

//测试数据
// const taskData = [
//     {
//         id: "task1",
//         title: "项目规划",
//         status: "doing",
//         parentId: null,
//         order: 1,
//         priority: "high",
//         category: '', // 新增category字段
//         timeType: null, // 'deadline' or 'period'
//         deadlineTime: null,
//         startTime: null,
//         endTime: null
//     },
//     {
//         id: "task2",
//         title: "需求分析",
//         status: "done",
//         parentId: "task1",
//         order: 1,
//         priority: "medium",
//         category: '', // 新增category字段
//         timeType: null, // 'deadline' or 'period'
//         deadlineTime: null,
//         startTime: null,
//         endTime: null
//     }
// ];
const CustomViewConfig = {
    classNames: ['custom-view'],

    content: function (props) {
        // console.log('custom view props', props);
        const allEvents = props.eventStore.defs;
        console.log('custom view allEvents', allEvents);
        const dataArray = convertToArray(allEvents);
        console.log('custom view dataArray', dataArray);
        const columns = {
            todo: dataArray.filter(e => e.extendedProps.status === '未完成'),
            inProgress: dataArray.filter(e => e.extendedProps.status === '进行中'),
            done: dataArray.filter(e => e.extendedProps.status === '完成')
        };
        // let segs = sliceEvents(props, true); // allDay=true
        // console.log('custom view segs', segs);
        const html = `
<div class="container">
        <!-- 添加视图切换按钮 -->
        <div class="view-switch">
            <button class="view-switch-btn active" data-view="tab">列表视图</button>
            <button class="view-switch-btn" data-view="kanban">看板视图</button>
        </div>
        
        <!-- 列表视图 -->
        <div id="tabView">
            <div class="tab-container">
                <div class="tab-item active" data-category="all">全部</div>
                <div class="tab-item" data-category="none">未分类</div>
                <!-- 动态添加分类标签 -->
                <button class="add-category-btn">
                    <span>+</span>
                </button>
                <div class="hide-done-toggle">
                    <input type="checkbox" id="hideDoneToggleTab">
                    <label for="hideDoneToggleTab">隐藏已完成任务</label>
                </div>
            </div>
            <div class="task-input-container">
                <input type="text" id="newTaskInput" class="task-input" placeholder="添加新任务...">
                <button id="addTaskBtn" class="task-add-btn">添加</button>
            </div>
            <div class="sort-container">
                <button class="sort-btn" data-sort="status">按状态</button>
                <button class="sort-btn" data-sort="priority">按优先级</button>
                <button class="sort-btn" data-sort="title">按标题</button>
            </div>
            <div class="task-tree" id="taskTree">
                <!-- 动态添加任务列表 -->
            </div>
        </div>

        <!-- 看板视图 -->
        <div id="kanbanView" style="display: none;">
            <div class="tab-container">
                <div class="tab-item active" data-category="all">全部</div>
                <div class="tab-item" data-category="none">未分类</div>
                <!-- 动态添加分类标签 -->
                <button class="add-category-btn">
                    <span>+</span>
                </button>
                <div class="hide-done-toggle">
                    <input type="checkbox" id="hideDoneToggle">
                    <label for="hideDoneToggle">隐藏已完成任务</label>
                </div>
            </div>
            <div class="kanban-container">
                <div class="kanban-view">
                    <!-- 动态添加状态列 -->
                </div>
            </div>
        </div>
    </div>

    <!-- 修改后的右键菜单 -->
    <div id="contextMenu" class="context-menu">
        <div class="menu-header">任务操作</div>
        <div class="menu-item" data-action="addSubtask">
            <span>添加子任务</span>
        </div>
        <div class="menu-item delete" data-action="delete">
            <span>删除任务</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="setTime">
            <span>设置时间</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-subtitle">任务状态</div>
        <div class="menu-item" data-action="status" data-value="todo">
            <span class="status-tag status-todo">待处理</span>
        </div>
        <div class="menu-item" data-action="status" data-value="doing">
            <span class="status-tag status-doing">进行中</span>
        </div>
        <div class="menu-item" data-action="status" data-value="done">
            <span class="status-tag status-done">已完成</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-subtitle">优先级</div>
        <div class="menu-item" data-action="priority" data-value="high">
            <span class="priority-tag priority-high">优先级：高</span>
        </div>
        <div class="menu-item" data-action="priority" data-value="medium">
            <span class="priority-tag priority-medium">优先级：中</span>
        </div>
        <div class="menu-item" data-action="priority" data-value="low">
            <span class="priority-tag priority-low">优先级：低</span>
        </div>
        <div class="menu-item" data-action="priority" data-value="none">
            <span class="priority-tag priority-none">优先级：无</span>
        </div>
        <div class="menu-separator"></div>
        <div class="menu-subtitle">分类</div>
        <div class="menu-item" data-action="setCategory" data-value="">
            <span>设置分类...</span>
        </div>
    </div>

    <!-- 添加分类右键菜单 -->
    <div id="categoryContextMenu" class="category-context-menu">
        <div class="category-menu-item" data-action="rename">重命名分类</div>
        <div class="category-menu-item delete" data-action="delete">删除分类</div>
    </div>

    <!-- 添加时间选择弹窗 -->
    <div id="timePickerModal" class="time-picker-modal" style="display: none;">
        <div class="time-picker-form">
            <div>
                <label>任务类型</label>
                <select id="timeType">
                    <option value="deadline">截止日期</option>
                    <option value="period">时间段</option>
                </select>
            </div>
            <div id="deadlineInputs">
                <div>
                    <label>截止日期时间</label>
                    <input type="datetime-local" id="deadlineTime">
                </div>
            </div>
            <div id="periodInputs" style="display: none;">
                <div>
                    <label>开始时间</label>
                    <input type="datetime-local" id="startTime">
                </div>
                <div>
                    <label>结束时间</label>
                    <input type="datetime-local" id="endTime">
                </div>
            </div>
            <div class="time-picker-actions">
                <button class="cancel" onclick="closeTimePicker()">取消</button>
                <button class="confirm" onclick="confirmTimePicker()">确定</button>
            </div>
        </div>
    </div>
    <div id="modalOverlay" class="modal-overlay" style="display: none;"></div>
        `;

        return { html: html }
    },

    didMount: function (props) {
        console.log('custom view now loaded', props);
        const container = document.querySelector('.container') as HTMLElement;
        if (container) {
            way.initKanban();
        }
    },

    willUnmount: function (props) {
        console.log('about to change away from custom view', props);
    }
}



function convertToArray(data: Record<string, any>): any[] {
    return Object.values(data);
}

export default createPlugin({
    name: 'custom-view',
    views: {
        kanban: CustomViewConfig
    }
});