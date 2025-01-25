import { createPlugin } from '@fullcalendar/core';
import Sortable from 'sortablejs';
import * as myK from './myK';

let sortableInstances: Sortable[] = []; // 存储所有Sortable实例


interface KBCalendarEvent {
    title: string;
    publicId: string;
    extendedProps: {
        blockId: string;
        status: string;
        statusid: string;
        priority: string;
        priorityid: string;
        category: string;
        categoryid: string;
        rootid: string;
        description: string;
        descriptionid: string;
        hasCircularRef: boolean;
        sub?: {
            ids: string[];
        };
        subid: string;
        order: number;
    };
}

// interface KBCalendarEvent_OK {

// }


const CustomViewConfig = {
    classNames: ['custom-view'],

    content: function (props) {
        const allEvents = props.eventStore.defs;
        let dataArray = convertToArray(allEvents) as KBCalendarEvent[];
        console.log("处理前数据", dataArray);
        dataArray = convertEventsToNested(dataArray);
        console.log("处理后数据", dataArray);
        const columns = {
            todo: dataArray.filter(e => e.extendedProps.status === '未完成'),
            inProgress: dataArray.filter(e => e.extendedProps.status === '进行中'),
            done: dataArray.filter(e => e.extendedProps.status === '完成')
        };
        console.log(columns);

        const createCard = (event: NestedKBCalendarEvent) => {
            const childCards = event.children?.map(createCard).join('') || '';

            return `
                <div class="kanban-card" data-id="${event.publicId}" data-block-id="${event.extendedProps.blockId}">
                    <div class="kanban-card-header">
                        <h3>${event.title} ${event.extendedProps.hasCircularRef} </h3>
                        <span class="badge priority-${event.extendedProps.priority.toLowerCase()}">${event.extendedProps.priority}</span>
                    </div>
                    <div class="kanban-card-content">
                        <p class="description">${event.extendedProps.description || ''}</p>
                        <div class="kanban-card-meta">
                            <span class="category">${event.extendedProps.category}</span>
                        </div>
                    </div>
                    <div class="kanban-subcards">
                        ${childCards}
                    </div>
                </div>
            `;
        };

        const createColumn = (title: string, events: KBCalendarEvent[]) => `
            <div class="kanban-column-${title}">
                <div class="kanban-column-header">
                    <h2>${title}</h2>
                </div>
                <div class="kanban-cards">
                    ${events.map(createCard).join('')}
                </div>
            </div>
        `;

        const html = `
            <div class="kanban-board">
                ${createColumn('未完成', columns.todo)}
                ${createColumn('进行中', columns.inProgress)}
                ${createColumn('完成', columns.done)}
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
    if (container) {
        const columns = container.querySelectorAll('.kanban-cards');
        columns.forEach(column => {
            const sortable = Sortable.create(column as HTMLElement, {
                group: 'kanban',
                animation: 150,
                fallbackOnBody: true,
                swapThreshold: 0.65,
                onEnd: function (evt) {
                    const itemEl = evt.item;
                    const parentEl = evt.to;
                    const newParentId = parentEl.closest('.kanban-card')?.getAttribute('data-id') || null;

                    if (newParentId) {
                        // 将事件变为子事件
                        myK.getsubevents(evt);
                        console.log(`Item ${itemEl.getAttribute('data-id')} moved to be a child of ${newParentId}`);
                    } else {
                        // 将子事件变为主事件
                        console.log(`Item ${itemEl.getAttribute('data-id')} moved to be a main event`);
                    }
                }
            });
            sortableInstances.push(sortable);
        });

        const cards = container.querySelectorAll('.kanban-card');
        cards.forEach(card => {
            const subcards = card.querySelector('.kanban-subcards');
            if (subcards) {
                const sortable = Sortable.create(subcards as HTMLElement, {
                    group: 'kanban',
                    animation: 150,
                    fallbackOnBody: true,
                    swapThreshold: 0.65,
                    onEnd: function (evt) {
                        const itemEl = evt.item;
                        const subEl = evt.to;
                        const newParentId = subEl.closest('.kanban-card')?.getAttribute('data-id') || null;

                        if (newParentId) {
                            // 将事件变为子事件
                            myK.getsubevents(evt);
                            console.log(`Item ${itemEl.getAttribute('data-id')} moved to be a child of ${newParentId}`);
                        } else {
                            // 将子事件变为主事件
                            console.log(`Item ${itemEl.getAttribute('data-id')} moved to be a main event`);
                        }
                    }
                });
                sortableInstances.push(sortable);
            }
        });
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


interface NestedKBCalendarEvent extends KBCalendarEvent {
    children?: NestedKBCalendarEvent[];
}

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

    // 直接处理所有事件
    return events
        .map(event => buildNested(event, new Set(), 0))
        .filter((e): e is NestedKBCalendarEvent => e !== null);
}

export function destroyAllSortables() {
    sortableInstances.forEach(instance => {
        instance.destroy();
    });
    sortableInstances = [];
}