import { Calendar, createPlugin, sliceEvents } from '@fullcalendar/core';
import Sortable from 'sortablejs';
import * as myK from './myK';
import { NestedKBCalendarEvent, KBCalendarEvent, ISelectOption, ScrollState } from "./interface";
import { av_ids, filterViewId, OUTcalendar } from './calendar'; // 移除未使用 isEventCompleted, viewName
import { showMessage } from 'siyuan';
import { settingdata } from '..';
import { changestatus_for_zq, createEventInDatabase, getViewId, getViewValue, showEvent } from './myF'; // resolveAttrTargetId 暂未直接使用
import { runblockdata_for_sub } from './quickadd';
let sortableInstances: Sortable[] = []; // 存储所有Sortable实例
export let allKBEvents: NestedKBCalendarEvent[] = [];

export let thisCalendars: Calendar[] = []; // 初始化thisCalendars数组
let isFilter = true;//OK:解决回调问题
// let id = '';//渲染protyle用

export function update_thisCalendars() {
    thisCalendars = thisCalendars.filter(calendar => document.body.contains(calendar.el));
}


const CATEGORY_MAP = {
    'todo': '未完成',
    'inProgress': '进行中',
    'done': '完成'
} as const;


function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return function (...args: Parameters<T>) {
        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            func.apply(this, args);
            timeout = null;
        }, wait);
    };
}


let dataArray: NestedKBCalendarEvent[] = [];
const CustomViewConfig = {
    classNames: ['custom-view'],
    content: function (props) {
        // console.debug('custom view content！！！！！！！！！！！！1');
        const allEvents = props.eventStore.defs;
        dataArray = convertToArray(allEvents) as KBCalendarEvent[];
        allKBEvents = dataArray;//重要
        // console.debug("allKBEvents::::::::", allKBEvents);
        ///
        if (isFilter) {
            //带日期筛选的数据
            // console.debug("OUTcalendar::::::::",);
            const filterEvents = sliceEvents(props, false);
            const Tevent = myK.transformEventData_fr_filter(filterEvents) as KBCalendarEvent[];
            // 先处理事件的嵌套结构
            dataArray = convertEventsToNested(Tevent, settingdata["cal-show-ref-event"]);

            // 然后再过滤周期事件
            if (!settingdata["cal-show-zq-done"]) {
                dataArray = myK.filterRecurringEvents(dataArray, {
                    futureOccurrences: 1,
                    pastOccurrences: 1,
                    excludeStatuses: ['完成'],
                });
            } else {
                dataArray = myK.filterRecurringEvents(dataArray, {
                    futureOccurrences: 1,
                    pastOccurrences: 1,
                    excludeStatuses: [],
                });
            }
        }
        ///
        // console.debug("处理前数据", dataArray);


        // console.debug("处理后数据allKBEvents", allKBEvents);
        // console.debug("处理后数据", dataArray);

        const columns = {
            todo: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '未完成')),
            inProgress: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '进行中')),
            done: myK.sortEvents(dataArray.filter(e => e.extendedProps.status === '完成'))
        };
        // console.debug(columns);

        // 在createCard函数中添加环形进度统计
        const createCard = (event: NestedKBCalendarEvent) => {
            const childCards = event.children?.map(createCard).join('') || '';
            // const starttime = new Date(event.extendedProps.Kstart).toLocaleString(); // 未使用，注释
            let endtime = '';
            let nowToEndTime;
            // console.debug('event.extendedProps.priority:', event);
            //周期事件处理
            const isRecurring = event.extendedProps?.isRecurring;
            // const recurringPattern = event.extendedProps?.recurringPattern;


            if (event.range.end) {
                endtime = '' + new Date(event.range.end).toLocaleString();
                nowToEndTime = myK.getDaysFromNow(event.range.end, event.extendedProps.status);
            } else {
                nowToEndTime = myK.getDaysFromNow(event.extendedProps.Kstart, event.extendedProps.status);
            }

            // 计算子任务完成进度
            const totalSubtasks = event.children?.length || 0;
            const completedSubtasks = event.children?.filter(child =>
                child.extendedProps.status === '完成'
            ).length || 0;
            const progressPercent = totalSubtasks ? (completedSubtasks / totalSubtasks) * 100 : 0;

            // 添加新的子事件完成进度计算
            const blockSubEvents = runblockdata_for_sub(event.extendedProps.kramdown || '');
            const totalBlockSubs = blockSubEvents.length;
            const completedBlockSubs = blockSubEvents.filter(sub => sub.completed).length;
            const blockProgressPercent = totalBlockSubs ? (completedBlockSubs / totalBlockSubs) * 100 : 0;
            // 根据块内子事件完成情况自动更新事件状态（用户需求）///////////
            if (settingdata["cal-auto-update-status"]) {
                if (totalBlockSubs > 0) {
                    let newStatus = '';
                    if (completedBlockSubs === totalBlockSubs) {
                        newStatus = '完成';
                    } else if (completedBlockSubs > 0) {
                        newStatus = '进行中';
                    } else {
                        newStatus = '未完成';
                    }

                    // 只有当状态不同时才更新
                    if (event.extendedProps.status !== newStatus) {
                        // 使用已有的状态更改函数，传入新状态
                        const selectdata: ISelectOption[] = [{ content: newStatus }];
                        // 异步更新状态，不阻塞渲染
                        setTimeout(() => {
                            myK.run_changestatus(event, selectdata)
                                .then(() => console.debug(`自动更新事件状态: ${event.title} -> ${newStatus}`))
                                .catch(err => console.error('自动更新状态失败:', err));
                        }, 100);
                    }
                }
            }
            //////////////////////////////////////
            // 生成SVG环形进度图
            const progressCircle = totalSubtasks ? `
    <div class="progress-container">
        <svg class="progress-ring" width="20" height="20" viewBox="0 0 20 20">
            <circle class="progress-ring-bg" r="8" cx="10" cy="10" />
            <circle class="progress-ring-circle" 
                r="8" 
                cx="10" 
                cy="10"
                style="stroke-dasharray: ${2 * Math.PI * 8};
                       stroke-dashoffset: ${2 * Math.PI * 8 * (1 - progressPercent / 100)}"
            />
        </svg>
        <span class="progress-percentage">${completedSubtasks}/${totalSubtasks}</span>
    </div>
            ` : '';

            // 生成新的块内子事件进度环形图
            const blockProgressCircle = totalBlockSubs ? `
    <div class="progress-container block-progress" title="块内子事件完成进度">
        <svg class="progress-ring" width="20" height="20" viewBox="0 0 20 20">
            <circle class="progress-ring-bg" r="8" cx="10" cy="10" />
            <circle class="progress-ring-circle block-progress-circle" 
                r="8" 
                cx="10" 
                cy="10"
                style="stroke-dasharray: ${2 * Math.PI * 8};
                       stroke-dashoffset: ${2 * Math.PI * 8 * (1 - blockProgressPercent / 100)}"
            />
        </svg>
        <span class="progress-percentage">${completedBlockSubs}/${totalBlockSubs}</span>
    </div>
` : '';

            return `
                <div class="kanban-card ${isRecurring ? 'recurring-event no-drag' : ''}" 
                data-id="${event.publicId}" 
                data-block-id="${event.extendedProps.blockId}"
                data-item-id="${event.extendedProps.itemID || ''}" 
                data-start-date="${event.range.start instanceof Date ? event.range.start.toISOString().split('T')[0] : ''}"
                ${isRecurring ? 'data-recurring="true"' : ''}>
                    <div class="kanban-card-header">
                        <h3>${isRecurring ?
                    `<span>${event.title}</span>` :
                    `<span class="st-ref" data-type="block-ref" data-id="${event.extendedProps.blockId}" data-subtype="d">${event.title}</span>`
                }
                         ${isRecurring ? '<span class="recurring-icon" title="周期事件">🔄</span>' : ''}
                         </h3>
                        <div class="kanban-card-meta">
                            <span class="kanban-nowToEndTime">${nowToEndTime}</span>
                            <span class="kanban-status-${event.extendedProps.status}">${event.extendedProps.status}</span>
                            ${event.extendedProps.category !== "无" ? `<span class="category">${event.extendedProps.category}</span>` : ''}
                            ${event.extendedProps.priority && event.extendedProps.priority !== "无" ?
                    `<span class="badge priority-${event.extendedProps.priority.toLowerCase()}">${event.extendedProps.priority}</span>`
                    : ''}
                        </div>
                    </div>
                    <div class="kanban-card-content">
                        <div class="time-progress-container">
                            ${endtime}
                            ${blockProgressCircle}
                            ${progressCircle}
                        </div>
                    </div>
                    <div class="kanban-subcards">
                        ${childCards}
                    </div>
                    <div class="kanban-card-content">
                        ${event.extendedProps.description ? `<p class="description">${event.extendedProps.description}</p>` : ''}
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
            ${columns.todo.length ? createColumn('未完成', columns.todo, 'todo') : createColumn('未完成', columns.todo, 'todo')}
            ${columns.inProgress.length ? createColumn('进行中', columns.inProgress, 'inProgress') : createColumn('进行中', columns.inProgress, 'inProgress')}
            ${columns.done.length ? createColumn('完成', columns.done, 'done') : createColumn('完成', columns.done, 'done')}
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

        Promise.resolve().then(() => {
            requestAnimationFrame(async () => {
                await initializeSortableKanban();
                // console.debug('初始化完成');
            });
        });

        return { html: html }
    },

    // didMount: function (props) {
    // },
    // datesSet: function (info) {
    // },
    // willUnmount: function (props) {
    //     console.debug('：：：：：：：：：：about to change away from custom view', props);
    // },
}

export async function handleAddButtonClick(status = "", direct = { isdirect: false, directid: "" }, isrefresh = true) {
    // 防抖：短时间多次点击只触发一次创建
    if (!((handleAddButtonClick as any)._state)) {
        (handleAddButtonClick as any)._state = {
            lastTime: 0,
            inFlight: null as Promise<any> | null,
            delay: 1000 // ms，可按需调整或做成设置项
        };
    }
    const st = (handleAddButtonClick as any)._state as { lastTime: number; inFlight: Promise<any> | null; delay: number };
    const nowTs = Date.now();
    // 若已有进行中的创建且仍在防抖时间窗口内，复用同一个 Promise
    if (st.inFlight && (nowTs - st.lastTime) < st.delay) {
        showMessage('操作过快，已阻止重复创建', 2000, 'info');
        return st.inFlight;
    }
    st.lastTime = nowTs;
    const run = async () => {
        const now = new Date();
        const fnow = myK.formatDateTime(now);
        const viewIDs = await getViewId(av_ids);
        const viewValue = await getViewValue(viewIDs);
        const rootid = viewIDs.find(v => filterViewId.includes(v.viewId))?.rootid;
        return await createEventInDatabase(fnow, OUTcalendar, viewValue, rootid, status, direct, isrefresh);
    };
    st.inFlight = run().finally(() => {
        // 释放引用，允许下一次创建
        setTimeout(() => { st.inFlight = null; }, st.delay);
    });
    return st.inFlight;
}

export async function handleAddButtonClick_Independent(status = "", direct = { isdirect: false, directid: "" }, isrefresh = true) {
    // console.debug('添加事件按钮被点击');
    const now = new Date()
    // console.debug('当前时间:', now);
    const fnow = myK.formatDateTime(now);
    // console.debug('格式化时间:', fnow);

    const viewIDs = await getViewId([settingdata["cal-db-id"]])
    const viewValue = await getViewValue(viewIDs);
    const rootid = viewIDs.find(v => filterViewId.includes(v.viewId))?.rootid;
    return await createEventInDatabase(fnow, OUTcalendar, viewValue, rootid, status, direct, isrefresh);
}


async function handleKanbanClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // console.debug('点击事件:1');
    // 处理 st-ref 点击
    if (target.matches('.st-ref')) {
        e.preventDefault();
        e.stopPropagation();
        const blockId = target.getAttribute('data-id');
        if (blockId) {
            showEvent(blockId, "", false, true);
        }
    }

    // 处理周期事件图标点击
    if (target.matches('.recurring-icon')) {
        e.preventDefault();
        e.stopPropagation();
        const card = target.closest('.kanban-card');
        if (card) {
            const blockId = card.getAttribute('data-block-id');
            const startDate = card.getAttribute('data-start-date');
            const eventData = dataArray.find(e => e.extendedProps.blockId === blockId);
            if (eventData) {
                changestatus_for_zq(eventData.extendedProps, startDate);
            }
        }
    }
    // 处理添加按钮点击
    if (target.matches('.kanban-add-button')) {
        e.preventDefault();
        e.stopPropagation();
        const status = target.getAttribute('status') || "";
        await handleAddButtonClick(status);
    }
}


export async function initializeSortableKanban() {
    await destroyAllSortables();
    // setTimeout(() => {
    console.debug('initializing sortable kanban');
    const containers = document.querySelectorAll('.kanban-board');
    // console.debug('containers:', containers);
    if (!containers.length) return;

    // Remove click handlers from all containers
    containers.forEach(container => {
        container.removeEventListener('click', handleKanbanClick);
        container.addEventListener('click', handleKanbanClick);
    });
    //打印containers的监听数量

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
            scroll: true, // 启用滚动
            scrollSensitivity: 10, // 滚动敏感度
            scrollSpeed: 10, // 滚动速度
            //移动端适配
            delayOnTouchOnly: true, // 仅在触摸设备上启用延迟
            delay: 750, // 设置长按延迟时间为750毫秒
            touchStartThreshold: 15, // 触摸移动阈值，防止轻微移动触发拖拽
            filter: '.no-drag', // 添加过滤器，禁止拖动带有 no-drag 类的元素
            onMove: function (evt) {
                // 检查是否为周期事件
                const draggedItem = evt.dragged;
                if (draggedItem.classList.contains('recurring-event')) {
                    showMessage('周期事件不可拖动', 3000,);
                    return false;
                }

                // 检查目标是否为周期事件的子级容器
                const targetParent = evt.to.closest('.kanban-card');
                if (targetParent?.getAttribute('data-recurring') === 'true') {
                    showMessage('周期事件不能包含子事件', 3000,);
                    return false;
                }

                return true;
            },
            onStart: function () {
                isDragging = true; // 开始拖拽时设置标志
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
                    // console.debug('onunChoose', evt);
                    await myK.runclick(evt);
                }


            },
            // onChoose: function (evt) {
            //     console.debug('onchoose', evt);
            // },
            onEnd: async function (evt) {
                try {
                    isDragging = false;
                    clicks = 0;
                    const itemEl = evt.item;
                    const parentEl = evt.to;
                    const itemId = itemEl.getAttribute('data-id');

                    // 检查是否需要处理
                    // console.debug('onEnd', evt);
                    if (evt.to?.attributes[1]?.nodeValue === evt.from?.attributes[1]?.nodeValue) {
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

                    // await refreshKanban();//TODO:观察：是否需要刷新

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
    // }, 1000); // 添加100ms延迟
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

function convertEventsToNested(events: KBCalendarEvent[], includeReferencedEvents: boolean = true): NestedKBCalendarEvent[] {
    const eventMap = new Map<string, NestedKBCalendarEvent>();
    const visited = new Set<string>();
    const maxDepth = 10; // 防止过深递归
    const circularRefs = new Set<string>(); // 记录循环引用的事件ID
    const referencedEvents = new Set<string>(); // 记录被引用的事件ID

    // 初始化事件映射，同时包含 allKBEvents 中的事件

    const allEvents = [...events, ...allKBEvents];
    allEvents.forEach(event => {
        if (!eventMap.has(event.extendedProps.blockId)) {
            eventMap.set(event.extendedProps.blockId, { ...event });
        }
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

        // 创建深拷贝
        const clonedEvent = {
            ...event,
            extendedProps: { ...event.extendedProps },
            range: { ...event.range },
        };

        visited.add(clonedEvent.extendedProps.blockId);
        parentIds.add(clonedEvent.extendedProps.blockId);

        // 处理周期事件状态
        if (clonedEvent.extendedProps?.isRecurring && clonedEvent.extendedProps.source !== 'qqcalendar') {
            const okday = clonedEvent.extendedProps.okday;
            if (okday) {
                const completedDates = okday.split(',').map(d => d.trim());
                const currentDateStr = clonedEvent.range.start.toISOString().split('T')[0];
                const newStatus = completedDates.includes(currentDateStr) ? '完成' : '未完成';
                clonedEvent.extendedProps.status = newStatus;
                // console.debug('Status updated:', {
                //     id: clonedEvent.extendedProps.blockId,
                //     date: currentDateStr,
                //     okday: okday,
                //     newStatus: newStatus
                // });
            } else {
                clonedEvent.extendedProps.status = '未完成';
            }
        }

        if (clonedEvent.extendedProps.sub?.ids) {
            clonedEvent.children = clonedEvent.extendedProps.sub.ids
                .map(id => {
                    const nestedEvent = eventMap.get(id) ||
                        allKBEvents.find(e => e.extendedProps.blockId === id);
                    return nestedEvent ? { ...nestedEvent } : undefined;
                })
                .filter((e): e is NestedKBCalendarEvent => e !== undefined)
                .map(e => buildNested(e, new Set(parentIds), depth + 1))
                .filter((e): e is NestedKBCalendarEvent => e !== null);
        }

        visited.delete(clonedEvent.extendedProps.blockId);
        parentIds.delete(clonedEvent.extendedProps.blockId);

        return clonedEvent;
    }
    // 先构建所有事件的引用关系
    allEvents.forEach(event => {
        if (event.extendedProps.sub?.ids) {
            event.extendedProps.sub.ids.forEach(id => {
                referencedEvents.add(id);
            });
        }
    });

    // 获取所有顶层事件（未被引用的事件）
    const topLevelEvents = events.filter(event => {
        const isReferenced = referencedEvents.has(event.extendedProps.blockId);
        return includeReferencedEvents || !isReferenced;
    });

    const nestedEvents = topLevelEvents
        .map(event => buildNested(event, new Set(), 0))
        .filter((e): e is NestedKBCalendarEvent => e !== null);

    // console.debug('被引用的事件:', Array.from(referencedEvents));
    // console.debug('过滤前事件数:', events.length);
    // console.debug('顶层事件数:', topLevelEvents.length);
    // console.debug('过滤后事件数:', nestedEvents.length);
    return myK.sortEvents(nestedEvents);
}

export async function destroyAllSortables() {
    sortableInstances.forEach(instance => {
        // Remove all event listeners and destroy sortable instance
        if (instance.el) {
            const clonedEl = instance.el.cloneNode(true);
            instance.el.parentNode?.replaceChild(clonedEl, instance.el);
        }
        instance.destroy();
    });
    sortableInstances = [];
}

// 创建防抖后的 refreshKanban
const _refreshKanban = async () => {
    thisCalendars = thisCalendars.filter(calendar => document.body.contains(calendar.el));
    // console.debug("++++",thisCalendars);
    if (!thisCalendars.length) return;
    // 记录所有日历的滚动位置
    thisCalendars.forEach(calendar => {
        try {
            const scrollContainer = calendar.el.querySelector<HTMLElement>('.kanban-board');
            if (!scrollContainer) return;
            calendar['_scrollState'] = {
                top: scrollContainer.scrollTop,
                left: scrollContainer.scrollLeft
            };
        } catch (err) {
            console.error('保存滚动位置失败:', err);
        }
    });


    // 设置加载状态
    const kanbanCards = document.querySelectorAll('.kanban-card');
    kanbanCards.forEach(card => {
        destroyAllSortables();
        (card as HTMLElement).style.cursor = 'wait';
    });
    // console.debug('ST开始依次刷新日历');
    // 依次刷新每个日历
    for (const calendar of thisCalendars) {
        await new Promise<void>(resolve => {
            calendar.refetchEvents();
            calendar.on('eventsSet', () => {
                // 恢复当前日历的滚动位置
                try {
                    const scrollState = calendar['_scrollState'] as ScrollState;
                    const scrollContainer = calendar.el.querySelector<HTMLElement>('.kanban-board');
                    if (scrollContainer && scrollState) {
                        scrollContainer.scrollTo({
                            top: scrollState.top,
                            left: scrollState.left,
                        });
                    }
                } catch (err) {
                    console.error('恢复滚动位置失败:', err);
                }
                resolve();
            });
        });
        // console.debug(`日历 ${calendar.el.id} 刷新完成`);
    }
    kanbanCards.forEach(card => {
        (card as HTMLElement).style.cursor = '';
    });
    // 重新初始化拖拽
    await initializeSortableKanban();
};
export const refreshKanban = debounce(_refreshKanban, 500);

const logDebug = (message: string, ...args: any[]) => {
    console.debug(`[Kanban] ${message}`, ...args);
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
        showMessage("无法跨数据库关联", 3000, "error");
        const targetElement = evt.to.querySelector(`.kanban-card[data-id="${Fr_event.extendedProps.blockId}"]`); // 获取要移除的元素
        if (targetElement) {
            evt.to.removeChild(targetElement);
        }
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


