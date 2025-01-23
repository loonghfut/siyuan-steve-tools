import { createPlugin } from '@fullcalendar/core';

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
            <div class="kanban-container">
                <div class="kanban-column" data-status="待办">
                    <h3>待办</h3>
                   <div class="kanban-list">
                        ${columns.todo.map(event => renderEvent(event)).join('')}
                    </div>
                </div>
                
                <div class="kanban-column" data-status="进行中">
                    <h3>进行中</h3>
                    <div class="kanban-list">
                        ${columns.inProgress.map(event => `
                            <div class="kanban-item" 
                                draggable="true"
                                data-id="${event.id}">
                                <div class="event-title">${event.title}</div>
                                <div class="event-category">${event.extendedProps.category}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="kanban-column" data-status="已完成">
                    <h3>已完成</h3>
                    <div class="kanban-list">
                        ${columns.done.map(event => `
                            <div class="kanban-item"
                                draggable="true"
                                data-id="${event.id}">
                                <div class="event-title">${event.title}</div>
                                <div class="event-category">${event.extendedProps.category}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        return { html: html }
    },

    didMount: function (props) {
        console.log('custom view now loaded', props);
        const container = document.querySelector('.kanban-container') as HTMLElement;
        if (container) {
            initDragAndDrop(container);
            initExpandCollapse(container);
        }
    },

    willUnmount: function (props) {
        console.log('about to change away from custom view', props);
    }
}

function initExpandCollapse(container: HTMLElement) {
    container.addEventListener('click', (e) => {
        const toggle = (e.target as HTMLElement).closest('.expand-toggle');
        if (toggle) {
            const item = toggle.closest('.kanban-item');
            const children = item.querySelector('.event-children') as HTMLElement;
            if (children) {
                const isExpanded = children.style.display !== 'none';
                children.style.display = isExpanded ? 'none' : 'block';
                toggle.textContent = isExpanded ? '▶' : '▼';
            }
        }
    });
}


function convertToArray(data: Record<string, any>): any[] {
    return Object.values(data);
}

function initDragAndDrop(container: HTMLElement) {
    let draggedItem: HTMLElement | null = null;

    container.addEventListener('dragstart', (e) => {
        const item = e.target as HTMLElement;
        if (item.classList.contains('kanban-item')) {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.setData('text/plain', item.dataset.id);
            e.dataTransfer.effectAllowed = 'move';
            
            // 延迟设置透明度，提升视觉体验
            setTimeout(() => {
                item.style.opacity = '0.5';
            }, 0);
        }
    });

    container.addEventListener('dragend', (e) => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem.style.opacity = '1';
            draggedItem = null;
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const column = (e.target as HTMLElement).closest('.kanban-column');
        if (column) {
            e.dataTransfer.dropEffect = 'move';
            // 移除所有列的hover状态
            container.querySelectorAll('.kanban-column').forEach(col => {
                col.classList.remove('drag-over');
            });
            column.classList.add('drag-over');
        }
    });

    container.addEventListener('dragleave', (e) => {
        const column = (e.target as HTMLElement).closest('.kanban-column');
        if (column) {
            column.classList.remove('drag-over');
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const itemId = e.dataTransfer.getData('text/plain');
        const column = (e.target as HTMLElement).closest('.kanban-column');
        
        if (column) {
            column.classList.remove('drag-over');
            const status = (column as HTMLElement).dataset.status;
            
            // 动画过渡到新位置
            if (draggedItem) {
                const list = column.querySelector('.kanban-list');
                if (list) {
                    list.appendChild(draggedItem);
                    draggedItem.style.animation = 'drop-in 0.3s ease-out';
                }
            }
            
            console.log(`将事件 ${itemId} 状态更新为 ${status}`);
        }
    });
}


function renderEvent(event: any): string {
    const hasChildren = event.children?.length > 0;
    return `
        <div class="kanban-item ${hasChildren ? 'parent-item' : ''}" 
            draggable="true"
            data-id="${event.id}">
            <div class="event-header">
                ${hasChildren ? '<span class="expand-toggle">▶</span>' : ''}
                <div class="event-title">${event.title}</div>
                ${event.category ? `<div class="event-category">${event.category}</div>` : ''}
            </div>
            ${hasChildren ? `
                <div class="event-children" style="display: none;">
                    ${event.children.map(child => `
                        <div class="kanban-item child-item" 
                            draggable="true"
                            data-id="${child.id}"
                            data-parent-id="${event.id}">
                            <div class="event-title">${child.title}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}
export default createPlugin({
    name: 'custom-view',
    views: {
        kanban: CustomViewConfig
    }
});