import { Calendar, createPlugin, sliceEvents } from '@fullcalendar/core';
import Sortable from 'sortablejs';
import * as myK from './myK';
import { NestedKBCalendarEvent, KBCalendarEvent, ISelectOption } from "./interface";
import { av_ids, filterViewId, OUTcalendar } from './calendar';
import { showMessage, Protyle } from 'siyuan';
import { settingdata } from '..';
import { createEventInDatabase, getViewId, getViewValue } from './myF';
let sortableInstances: Sortable[] = []; // 存储所有Sortable实例
export let allKBEvents: NestedKBCalendarEvent[] = [];

let thisCalendars: Calendar[] = []; // 初始化thisCalendars数组
let isFilter = true;//OK:解决回调问题
// let id = '';//渲染protyle用

const REFRESH_DELAY = 500;
const INIT_DELAY = 1000;
const CATEGORY_MAP = {
    'todo': '未完成',
    'inProgress': '进行中',
    'done': '完成'
} as const;


const CustomViewConfig = {
    classNames: ['custom-view'],

    content: function (props) {
        // 带日期筛选的数据
        if (!thisCalendars.some(calendar => calendar.el === OUTcalendar.el)) {
            thisCalendars.push(OUTcalendar);
        }
        // console.log("OUTcalendar::::::::", thisCalendars);
        // 视图全部数据
        const allEvents = props.eventStore.defs;
        let dataArray = convertToArray(allEvents) as KBCalendarEvent[];
        allKBEvents = dataArray;//重要
        ///
        if (isFilter) {
            //带日期筛选的数据
            // console.log("OUTcalendar::::::::",);
            const filterEvents = sliceEvents(props, false);
            const Tevent = myK.transformEventData_fr_filter(filterEvents) as KBCalendarEvent[];
            dataArray = Tevent;
        }
        ///
        // console.log("处理前数据", dataArray);
        dataArray = convertEventsToNested(dataArray);

        // console.log("处理后数据allKBEvents", allKBEvents);
        // console.log("处理后数据", dataArray);
        const columns = {
            todo: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '未完成')),
            inProgress: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '进行中')),
            done: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '完成'))
        };
        // console.log(columns);

        const createCard = (event: NestedKBCalendarEvent) => {
            const childCards = event.children?.map(createCard).join('') || '';
            const starttime = new Date(event.extendedProps.Kstart).toLocaleString();
            let endtime = '';
            let nowToEndTime;
            if (event.extendedProps.Kend) {
                endtime = '-' + new Date(event.extendedProps.Kend).toLocaleString();
                nowToEndTime = myK.getDaysFromNow(event.extendedProps.Kend, event.extendedProps.status);
            } else {
                nowToEndTime = myK.getDaysFromNow(event.extendedProps.Kstart, event.extendedProps.status);
            }
            return `
                <div class="kanban-card" data-id="${event.publicId}" data-block-id="${event.extendedProps.blockId}">
                    <div class="kanban-card-header">
                        <h3><span class="st-ref" data-type="block-ref" data-id="${event.extendedProps.blockId}" data-subtype="d">${event.title}</span></h3>
                        <div class="kanban-card-meta">
                            <span class="kanban-nowToEndTime">${nowToEndTime}</span>
                            <span class="kanban-status-${event.extendedProps.status}">${event.extendedProps.status}</span>
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
                    <h2>${title}</h2><button class="kanban-add-button" status="${title}" >+</button>
                </div>
                <div class="kanban-cards" data-category="${category}">
                    ${events.map(createCard).join('')}
                </div>
            </div>
        `;

        const html = `
            <div class="kanban-container">
            <div class="kanban-board">
            ${columns.todo.length ? createColumn('未完成', columns.todo, 'todo') : ''}
            ${columns.inProgress.length ? createColumn('进行中', columns.inProgress, 'inProgress') : ''}
            ${columns.done.length ? createColumn('完成', columns.done, 'done') : ''}
            ${!columns.todo.length && !columns.inProgress.length && !columns.done.length ?
                `
                <div class="kanban-column-empty">无事件
                <button class="kanban-add-button">添加事件</button>
                </div>
                `
                : ''}
            </div>
            </div>
        `;
        return { html: html }
    },

    didMount: function (props) {
        // console.log('custom view mounted', props);
        // initializeSortableKanban();
        // console.log('custom view mounted  didMount didMount didMount didMount');
    },
    datesSet: function (info) {
        // 重新加载事件数据
        // console.log('datesSet:::::::::::AAAAAAAA:::::::::::::');
        initializeSortableKanban();
    },

    willUnmount: function (props) {
        // console.log('：：：：：：：：：：about to change away from custom view', props);
    }
}

export function initializeSortableKanban() {
    destroyAllSortables();
    console.log('initializing sortable kanban');
    const containers = document.querySelectorAll('.kanban-board');
    if (!containers.length) return;

    // 添加按钮点击监听

    const addButton = document.querySelectorAll('.kanban-add-button');
    if (addButton) {
        // console.log(addButton);
        addButton.forEach(button => {
            const status = button.getAttribute('status'); // 获取status属性值
            // console.log('Button status:', status);

            const newButton = button.cloneNode(true);

            button.parentNode.replaceChild(newButton, button);
            newButton.addEventListener('click', () => handleAddButtonClick(status));
        });
    }


    async function handleAddButtonClick(status: string) {
        console.log('添加事件按钮被点击');
        const now = new Date()
        // console.log('当前时间:', now);
        const fnow = myK.formatDateTime(now);
        // console.log('格式化时间:', fnow);
        
        const viewIDs = await getViewId(av_ids)
        const viewValue = await getViewValue(viewIDs);
        const rootid = viewIDs.find(v => v.viewId === filterViewId)?.rootid;
        await createEventInDatabase(fnow, OUTcalendar, viewValue, rootid, status);
    }



    const createSortableInstance = (element: HTMLElement) => {
        let clicks = 0;
        let isDragging = false; // 新增拖拽标志
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
            onStart: function (evt) {
                isDragging = true; // 开始拖拽时设置标志
                // console.log('onStart', evt);
            },
            onUnchoose: async function (evt) {
                let clickTimeout: NodeJS.Timeout;
                clicks++;
                if (!isDragging && clicks === 1) {
                    if (settingdata["cal-create-way"] === "1") {
                        await myK.runclick(evt);
                        return;
                    }
                    clickTimeout = setTimeout(async () => {
                        clicks = 0;
                    }, 400);
                } else if (!isDragging && clicks === 2) {
                    clearTimeout(clickTimeout);
                    clicks = 0;
                    // console.log('onunChoose', evt);
                    await myK.runclick(evt);
                }


            },
            // onChoose: function (evt) {
            //     console.log('onchoose', evt);
            // },
            onEnd: async function (evt) {
                try {
                    isDragging = false;
                    clicks = 0;
                    const itemEl = evt.item;
                    const parentEl = evt.to;
                    const itemId = itemEl.getAttribute('data-id');

                    // 检查是否需要处理
                    console.log('onEnd', evt);
                    if (evt.to.attributes[1].nodeValue === evt.from.attributes[1].nodeValue) {
                        if (evt.oldIndex === evt.newIndex && evt.from === evt.to) {
                            logDebug('相同位置，无需处理');
                            return;
                        }
                        logDebug('不同位置，相同列');
                        evt.item.remove();
                        return;
                    }

                    const oldParentId = evt.from.closest('.kanban-card')?.getAttribute('data-id') || null;
                    const newParentId = parentEl.closest('.kanban-card')?.getAttribute('data-id') || null;

                    // 处理自身拖拽到自身的情况
                    if (itemId === newParentId) {
                        logDebug('拖拽到自身，移除克隆元素');
                        evt.item.remove();
                        return;
                    }

                    const Fr_event = await myK.findEventByPublicId(allKBEvents, itemId);
                    if (!Fr_event) {
                        throw new Error(`未找到事件: ${itemId}`);
                    }

                    // 处理不同拖拽场景
                    if (oldParentId && !newParentId) {
                        await handleMoveToTopLevel(Fr_event, oldParentId, parentEl);
                    } else if (newParentId) {
                        await handleMoveToSubLevel(Fr_event, newParentId, evt);
                    } else {
                        await handleStatusChange(Fr_event, parentEl);
                    }

                    await refreshKanban();

                } catch (error) {
                    console.error('[Kanban Error]', error);
                    showMessage(`操作失败: ${error.message}`, 3000, "error");
                }
            },
        });
        sortableInstances.push(sortable);
    };

    // Initialize columns
    containers.forEach(container => {
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
    // events.forEach(event => {
    //     event.extendedProps.hasCircularRef = false;
    // });

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

        // if (circularRefs.has(event.extendedProps.blockId)) {
        //     event.extendedProps.hasCircularRef = true;
        // }

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

export const refreshKanban = async () => {
    thisCalendars = thisCalendars.filter(calendar => document.body.contains(calendar.el));
    // console.log('刷新日历', thisCalendars);
    if (!thisCalendars.length) {
        return;
    }
    // 刷新日历
    showMessage('[ST]请稍等', -1, "info", "kanban-update");
    await new Promise(resolve => setTimeout(resolve, REFRESH_DELAY));


    thisCalendars.forEach(calendar => calendar.refetchEvents());

    // 重新初始化拖拽
    await new Promise(resolve => setTimeout(resolve, INIT_DELAY - REFRESH_DELAY));
    initializeSortableKanban();
    showMessage('', 1, "info", "kanban-update");
};

const logDebug = (message: string, ...args: any[]) => {
    console.log(`[Kanban] ${message}`, ...args);
};



// 处理移动到顶层
async function handleMoveToTopLevel(Fr_event, oldParentId, parentEl) {
    const Old_event = await myK.findEventByPublicId(allKBEvents, oldParentId);
    const is_run_ok = await myK.run_delsubevents(Fr_event, Old_event);

    if (!is_run_ok) {
        logDebug('取消关联失败');
    }

    const newcategory = parentEl.closest('.kanban-cards')?.getAttribute('data-category') || null;
    logDebug(`${Fr_event.title} 从 ${Old_event.title} 移动到顶层 ${newcategory}`);
}

// 处理移动到子层级
async function handleMoveToSubLevel(Fr_event, newParentId, evt) {
    const To_event = await myK.findEventByPublicId(allKBEvents, newParentId);

    if (To_event.extendedProps.rootid !== Fr_event.extendedProps.rootid) {
        // showMessage("无法跨数据库关联", 3000, "error");
        evt.to.remove();
        return false;
    }

    const is_run_ok = await myK.run_getsubevents(Fr_event, To_event);
    if (!is_run_ok) {
        logDebug("关联子级失败");
        evt.to.remove();
        return false;
    }

    logDebug(`${Fr_event.title}(${Fr_event.publicId}) 移动到 ${newParentId} 下级`);
    return true;
}

// 处理状态变更
async function handleStatusChange(Fr_event, parentEl) {
    const newcategory = parentEl.closest('.kanban-cards')?.getAttribute('data-category') || null;
    const newcategory_cn = CATEGORY_MAP[newcategory];

    if (!newcategory_cn) {
        throw new Error(`未知状态: ${newcategory}`);
    }

    const selectdata: ISelectOption[] = [{ content: newcategory_cn }];
    await myK.run_changestatus(Fr_event, selectdata);
    logDebug(`${Fr_event.title} 状态更改为 ${newcategory}`);
}


