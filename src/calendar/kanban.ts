import { createPlugin } from '@fullcalendar/core';
import Sortable from 'sortablejs';
import * as myK from './myK';
import { NestedKBCalendarEvent, KBCalendarEvent, ISelectOption } from "./interface";
import { OUTcalendar } from './calendar';
import { showMessage } from 'siyuan';
let sortableInstances: Sortable[] = []; // 存储所有Sortable实例
let allKBEvents: NestedKBCalendarEvent[] = [];




const CustomViewConfig = {
    classNames: ['custom-view'],

    content: function (props) {
        const allEvents = props.eventStore.defs;
        let dataArray = convertToArray(allEvents) as KBCalendarEvent[];
        console.log("处理前数据", dataArray);
        dataArray = convertEventsToNested(dataArray);
        allKBEvents = dataArray;
        console.log("处理后数据allKBEvents", allKBEvents);
        console.log("处理后数据", dataArray);
        const columns = {
            todo: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '未完成')),
            inProgress: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '进行中')),
            done: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '完成'))
        };
        console.log(columns);

        const createCard = (event: NestedKBCalendarEvent) => {
            const childCards = event.children?.map(createCard).join('') || '';
            const starttime = new Date(event.extendedProps.Kstart).toLocaleString();
            const endtime =(event.extendedProps.Kend? "-"+(new Date(event.extendedProps.Kend).toLocaleString()):'');
            return `
                <div class="kanban-card" data-id="${event.publicId}" data-block-id="${event.extendedProps.blockId}">
                    <div class="kanban-card-header">
                        <h3>${event.title}</h3>
                        <div class="kanban-card-meta">
                            <span class="category">${event.extendedProps.category}</span>
                            <span class="badge priority-${event.extendedProps.priority.toLowerCase()}">${event.extendedProps.priority}</span>
                        </div>
                    </div>
                    <div class="kanban-card-content">
                    <div>${starttime}${endtime}</div>
                        <p class="description">${event.extendedProps.description || ''}</p>
                    </div>
                    <div class="kanban-subcards">
                        ${childCards}
                    </div>
                </div>
            `;
        };

        const createColumn = (title: string, events: KBCalendarEvent[], category) => `
            <div class="kanban-column-${title}">
                <div class="kanban-column-header">
                    <h2>${title}</h2>
                </div>
                <div class="kanban-cards" data-category="${category}">
                    ${events.map(createCard).join('')}
                </div>
            </div>
        `;

        const html = `
            <div class="kanban-board">
                ${createColumn('未完成', columns.todo, 'todo')}
                ${createColumn('进行中', columns.inProgress, 'inProgress')}
                ${createColumn('完成', columns.done, 'done')}
            </div>
        `;
        return { html: html }
    },

    didMount: function (props) {
        console.log('custom view mounted', props);
        initializeSortableKanban();
    },

    willUnmount: function (props) {
        // console.log('：：：：：：：：：：about to change away from custom view', props);
    }
}

export function initializeSortableKanban() {
    destroyAllSortables();
    console.log('initializing sortable kanban');
    const container = document.querySelector('.kanban-board') as HTMLElement;
    if (!container) return;

    const createSortableInstance = (element: HTMLElement) => {
        const sortable = Sortable.create(element, {
            group: {
                name: 'kanban',
                pull: 'clone',
                put: true
            },
            sort: false,
            animation: 150,
            fallbackOnBody: true,
            swapThreshold: 0.65,
            onEnd: function (evt) {
                const itemEl = evt.item;
                const parentEl = evt.to;
                const itemId = itemEl.getAttribute('data-id');
                // If the old index and new index are the same, and from/to containers are the same, do nothing
                if (evt.oldIndex === evt.newIndex && evt.from === evt.to) {
                    return;
                }

                const oldParentId = evt.from.closest('.kanban-card')?.getAttribute('data-id') || null;
                const newParentId = parentEl.closest('.kanban-card')?.getAttribute('data-id') || null;
                if (itemId === newParentId) {
                    console.log('same parent, do nothing');
                    // 特殊情况：移除克隆的元素
                    evt.to.remove();
                    // OUTcalendar.render();
                    return;
                }

                const Fr_event = myK.findEventByPublicId(allKBEvents, itemId);
                //取消关联
                if (oldParentId && !newParentId) {
                    // Moving from sub-level to top-level
                    const Old_event = myK.findEventByPublicId(allKBEvents, oldParentId);
                    myK.run_delsubevents(Fr_event, Old_event);
                    const newcategory = parentEl.closest('.kanban-cards')?.getAttribute('data-category') || null;
                    console.log(`${Fr_event.title} moved from ${Old_event.title} to top-level ${newcategory}`);
                }
                //关联到子级
                else if (newParentId) {
                    // Moving to a sub-level (either from top or another sub)
                    const To_event = myK.findEventByPublicId(allKBEvents, newParentId);
                    myK.run_getsubevents(Fr_event, To_event);
                    console.log(`${Fr_event.title}${Fr_event.publicId} moved to sub-level under ${newParentId}`);
                }
                //切换状态
                else {
                    // Moving between top-level columns
                    const newcategory = parentEl.closest('.kanban-cards')?.getAttribute('data-category') || null;
                    const categoryMap = {
                        'todo': '未完成',
                        'inProgress': '进行中',
                        'done': '完成'
                    };
                    const newcategory_cn = categoryMap[newcategory];

                    const selectdata: ISelectOption[] = [{ content: newcategory_cn }];
                    console.log("selectdata", selectdata);
                    myK.run_changestatus(Fr_event, selectdata);
                    // myK.
                    console.log(`${Fr_event.title} moved between top-level columns to ${newcategory}`);
                }

                showMessage('请稍等', -1, "info", "kanban-update");
                setTimeout(() => { OUTcalendar.refetchEvents() }, 500);//TODO需要优化

                setTimeout(() => {
                    initializeSortableKanban()
                    showMessage('', 1, "info", "kanban-update");
                }, 1000);//TODO需要优化
            }
        });
        sortableInstances.push(sortable);
    };

    // Initialize columns
    container.querySelectorAll('.kanban-cards').forEach(column => {
        createSortableInstance(column as HTMLElement);
    });

    // Initialize subcards
    container.querySelectorAll('.kanban-card').forEach(card => {
        const subcards = card.querySelector('.kanban-subcards');
        if (subcards) {
            createSortableInstance(subcards as HTMLElement);
        }
    });
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




function convertEventsToNested(events: KBCalendarEvent[]): NestedKBCalendarEvent[] {
    const eventMap = new Map<string, NestedKBCalendarEvent>();
    const visited = new Set<string>();
    const maxDepth = 10; // 防止过深递归
    const circularRefs = new Set<string>(); // 记录循环引用的事件ID

    // 初始化事件映射
    events.forEach(event => {
        eventMap.set(event.extendedProps.blockId, { ...event });
    });

    // 重置所有事件的循环引用标记
    events.forEach(event => {
        event.extendedProps.hasCircularRef = false;
    });

    // 递归构建嵌套结构
    function buildNested(event: NestedKBCalendarEvent, parentIds: Set<string>, depth: number): NestedKBCalendarEvent | null {
        if (depth > maxDepth) return null; // 深度限制
        if (visited.has(event.extendedProps.blockId)) return null; // 防止循环引用
        if (parentIds.has(event.extendedProps.blockId)) {
            circularRefs.add(event.extendedProps.blockId); // 标记循环引用
            console.warn(`Circular reference detected: ${[...parentIds, event.extendedProps.blockId].join(' -> ')}`);
            return null;
        }

        visited.add(event.extendedProps.blockId);
        parentIds.add(event.extendedProps.blockId);

        if (event.extendedProps.sub?.ids) {
            event.children = event.extendedProps.sub.ids
                .map(id => eventMap.get(id))
                .filter((e): e is NestedKBCalendarEvent => e !== undefined)
                .map(e => buildNested(e, parentIds, depth + 1))
                .filter((e): e is NestedKBCalendarEvent => e !== null);
        }

        visited.delete(event.extendedProps.blockId);
        parentIds.delete(event.extendedProps.blockId);

        if (circularRefs.has(event.extendedProps.blockId)) {
            event.extendedProps.hasCircularRef = true;
        }

        return event;
    }

    const nestedEvents = events
        .map(event => buildNested(event, new Set(), 0))
        .filter((e): e is NestedKBCalendarEvent => e !== null);
    return myK.sortEvents(nestedEvents);
}

export function destroyAllSortables() {
    sortableInstances.forEach(instance => {
        instance.destroy();
    });
    sortableInstances = [];
}