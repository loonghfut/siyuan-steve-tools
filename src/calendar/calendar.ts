import { Calendar } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import multiMonthPlugin from '@fullcalendar/multimonth'
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import rrule from '@fullcalendar/rrule';
import tippy from 'tippy.js';
import steveTools from "@/index";
import kanban, { refreshKanban, thisCalendars, update_thisCalendars } from './kanban';
import { settingdata } from '@/index';
// import 'tippy.js/dist/tippy.css';
import { moduleInstances } from '@/index';
// import ICAL from 'ical.js';
import solarLunar from 'solarlunar';
import * as myF from './myF';
import { showMessage } from 'siyuan';
import { createFloatingCalendar } from './createFloatingCalendar';

export let isFilter = true;
export let OUTcalendar: Calendar;
let clicks1 = 0;
let clicks2 = 0;
export let viewValue: any;
let viewValue_zq: any;
export let filterViewId: string[] = [];
export let av_ids: string[] = [];
export let viewName = "";
export let viewId = "";
// export const Calendars_pro:{Calendar:Calendar,id:string}[] = []; //TODO:后面优化时用
// let ishandrefetchEvents = true;
export async function update_av_ids() {
    av_ids = await moduleInstances['M_calendar'].getAVreferenceid();
}

export async function init_viewValue(data: { viewId: string, viewName: string }) {
    viewId = data.viewId;
    viewName = data.viewName;
    // 将逗号分隔的视图ID解析为数组
    filterViewId = data.viewId ? data.viewId.split(',') : [];
}


export async function run(
    id: string,
    initialView = 'dayGridMonth',
    S_viewID = "",
    cleft = 'prev,next today viewFilter',
    cright = 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridThreeDays,timeGridDay,weekkanban,kanban,yearkanban',
    ccenter = 'title',
) {
    filterViewId = S_viewID ? [S_viewID] : (viewId ? viewId.split(',') : []);
    let calendarEl: HTMLElement;
    if (id === "1") {
        // 创建悬浮容器
        const Fcalendar = createFloatingCalendar(calendarEl);
        calendarEl = Fcalendar.element;
    } else {
        calendarEl = document.getElementById(`calendar-${id}`)!;
    }
    if (!calendarEl) {
        console.error('Calendar container not found');
        return;
    }
    const calendar = new Calendar(calendarEl, {
        plugins: [
            interactionPlugin,
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            multiMonthPlugin,
            rrule,
            kanban,
        ],
        initialView: initialView,
        navLinks: true,
        dayMaxEvents: true,
        locale: zhCnLocale,
        editable: true,
        nowIndicator: true,
        slotDuration: validateTimeFormat(settingdata["cal-slot-duration"], '01:00:00'),
        slotMinTime: validateTimeFormat(settingdata["cal-slot-min-time"], '00:00:00'),
        slotMaxTime: validateTimeFormat(settingdata["cal-slot-max-time"], '24:00:00'),
        snapDuration: validateTimeFormat(settingdata["cal-snap-duration"], '00:15:00'),
        eventResizableFromStart: true, // 允许从事件开始处调整大小
        slotLabelInterval: '00:05:00', // 时间标签
        slotLabelFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        },
        // selectable: true,
        // eventDurationEditable: true,
        // 事件点击处理
        eventClick: async function (info) {

            if (settingdata["cal-create-way"] === "1") {
                if (info.event._def.extendedProps.isRecurring) {
                    if (info.event._def.extendedProps.source === 'qqcalendar') {
                        myF.updataqqcalendar(info);
                        return;
                    }
                    // console.log('周期事件点击日期:', info.event.start.toLocaleDateString());
                    myF.changestatus_for_zq(info.event.extendedProps, info.event.start.toISOString().split('T')[0]);
                    return;
                } else {
                    await myF.showEvent(info.event.extendedProps.blockId, info.event.extendedProps.rootid);
                    return;
                }
            }
            let clickTimeout: NodeJS.Timeout;
            clicks2++;
            if (clicks2 === 1) {
                clickTimeout = setTimeout(() => {
                    clicks2 = 0;
                }, 400);
            } else if (clicks2 === 2) {
                clearTimeout(clickTimeout);
                clicks2 = 0;
                if (info.event._def.extendedProps.isRecurring) {
                    if (info.event._def.extendedProps.source === 'qqcalendar') {
                        console.log("qqcalendar", info.event.id);
                        myF.updataqqcalendar(info);
                        return;
                    }
                    // console.log('周期事件点击日期:', info.event.start.toLocaleDateString());
                    myF.changestatus_for_zq(info.event.extendedProps, info.event.start.toISOString().split('T')[0]);
                    return;
                } else {
                    await myF.showEvent(info.event.extendedProps.blockId, info.event.extendedProps.rootid);
                    return;
                }
            }
        },
        select: function (info) {//TODO: 选择处理
            // console.log('select', info);
        },
        // 日期点击处理
        //// 双击触发(可选)
        dateClick: async function (info) {
            // console.log('dateClick', info);
            const viewIDs = await myF.getViewId(av_ids)
            let rootid;
            if (filterViewId.includes('qqcalendar') && (!filterViewId.some(id => id !== 'qqcalendar'))) {
                rootid = 'qqcalendar'; // 特殊标识，用于在createEventInDatabase中区分
            } else {
                rootid = viewIDs.find(v => filterViewId.includes(v.viewId))?.rootid;
            }
            if (settingdata["cal-create-way"] === "1") {
                const eventId = await myF.createEventInDatabase(info.dateStr, calendar, viewValue, rootid);
                return;
            }
            let clickTimeout: NodeJS.Timeout;
            clicks1++;
            if (clicks1 === 1) {
                clickTimeout = setTimeout(() => {
                    clicks1 = 0;
                }, 400);
            } else if (clicks1 === 2) {
                clearTimeout(clickTimeout);
                clicks1 = 0;
                steveTools.outlog("创建事件", info);
                const eventId = await myF.createEventInDatabase(info.dateStr, calendar, viewValue, rootid);
            }
        },
        // 农历显示
        dayCellDidMount: function (arg) {
            try {
                // 获取日期
                const date = arg.date;
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const day = date.getDate();

                // 调试输出
                // console.log('Solar date:', year, month, day);

                // 转换为农历
                const lunar = solarLunar.solar2lunar(year, month, day);
                // console.log('Lunar result:', lunar);

                // 添加空值检查
                if (!lunar) {
                    console.error('农历转换失败');
                    return;
                }

                // 创建农历显示元素
                const lunarEl = document.createElement('a');
                lunarEl.className = 'fc-daygrid-day-lunar fc-daygrid-day-number';
                lunarEl.style.fontSize = '1em';
                lunarEl.style.color = '#666';
                // lunarEl.setAttribute('data-navlink', '');
                lunarEl.tabIndex = 0;

                // 设置农历文本和标题
                let lunarText = '';
                if (!lunar.dayCn) {
                    lunarText = '数据异常';
                } else {
                    lunarText = lunar.dayCn;
                    lunarEl.title = `${lunar.yearCn}${lunar.monthCn}${lunar.dayCn}`;
                }

                lunarEl.innerHTML = lunarText;

                // 将农历元素添加到日期单元格中
                const numberEl = arg.el.querySelector('.fc-daygrid-day-number');
                if (numberEl) {
                    numberEl.after(lunarEl);
                }
            } catch (error) {
                console.error('农历显示错误:', error);
            }
        },

        // 事件拖放处理
        eventDrop: async function (info) {
            steveTools.outlog("事件拖动shijian", info.event.startStr, info.event.endStr);
            // 检查是否是QQ日历事件
            if (info.event.extendedProps.source === 'qqcalendar') {
                showDropTimeIndicator(info);

                try {
                    const calendarId = settingdata['cal-qq-calendar-url'];
                    const success = await moduleInstances['M_calendar'].QQCalDAVClient.updateEvent(
                        calendarId,
                        info.event.id,
                        {
                            title: info.event.title,
                            start: info.event.start,
                            end: info.event.end || new Date(info.event.start.getTime() + 60 * 60 * 1000),
                            description: info.event.extendedProps.description || '',
                        }
                    );

                    if (success) {
                        setTimeout(() => {
                            moduleInstances['M_calendar'].updateEventsFromQQCalDAV().then(() => {
                                calendar.refetchEvents();
                                showMessage('QQ日历事件已更新', 3000);
                            });
                        }, 1000);
                    } else {
                        info.revert();
                    }
                } catch (error) {
                    console.error('更新QQ日历事件失败:', error);
                    showMessage('更新事件失败', -1, 'error');
                    info.revert();
                }

                return;
            }

            if (info.event._def.extendedProps.isRecurring) {
                showMessage("不支持拖动哦");
                //撤回拖动
                info.revert();
                return;
            }
            showDropTimeIndicator(info);
            myF.updateEventInDatabase(info, calendar, viewValue);

        },

        eventResizeStart: function (info) {
            // 创建半透明的时间指示器跟随鼠标
            const timeGhost = document.createElement('div');
            timeGhost.id = 'fc-time-ghost';
            timeGhost.style.cssText = `
                position: fixed;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                pointer-events: none;
                z-index: 10001;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(timeGhost);
            // 监听鼠标移动
            document.addEventListener('mousemove', updateTimeGhost);
        },

        eventResizeStop: function () {
            // 移除时间指示器和事件监听器
            const timeGhost = document.getElementById('fc-time-ghost');
            if (timeGhost) {
                timeGhost.remove();
            }
            document.removeEventListener('mousemove', updateTimeGhost);
        },

        eventResize: async function (info) {
            // 检查是否是QQ日历事件
            if (info.event.extendedProps.source === 'qqcalendar') {
                showResizeTimeIndicator(info);

                try {
                    const calendarId = settingdata['cal-qq-calendar-url'];
                    const success = await moduleInstances['M_calendar'].QQCalDAVClient.updateEvent(
                        calendarId,
                        info.event.id,
                        {
                            title: info.event.title,
                            start: info.event.start,
                            end: info.event.end,
                            description: info.event.extendedProps.description || '',
                        }
                    );

                    if (success) {
                        setTimeout(() => {
                            moduleInstances['M_calendar'].updateEventsFromQQCalDAV().then(() => {
                                calendar.refetchEvents();
                                showMessage('QQ日历事件已更新', 3000);
                            });
                        }, 1000);
                    } else {
                        info.revert();
                    }
                } catch (error) {
                    console.error('更新QQ日历事件失败:', error);
                    showMessage('更新事件失败', -1, 'error');
                    info.revert();
                }

                return;
            }

            if (info.event._def.extendedProps.isRecurring) {
                showMessage("不支持修改哦");
                info.revert();
                return;
            }
            // 显示时间刻度线
            showResizeTimeIndicator(info);
            myF.updateEventInDatabase(info, calendar, viewValue, true);
        },

        views: {
            timeGridThreeDays: {
                type: 'timeGrid',
                duration: { weeks: 2 },
                buttonText: '两周'
            },
            kanban: {
                type: 'kanban',
                buttonText: '月板',
                duration: { months: 1 },
                // customParams: {
                //     calendarEl: calendarEl,
                // },
            },
            yearkanban: {
                type: 'kanban',
                buttonText: '年板',
                duration: { years: 1 },
            },
            weekkanban: {
                type: 'kanban',
                buttonText: '周板',
                duration: { weeks: 1 },
            },

        },
        customButtons: {
            viewFilter: {
                text: '视图选择',
                click: async function () {
                    const viewIDs = await myF.getViewId(av_ids)
                    const button = calendarEl.querySelector('.fc-viewFilter-button');
                    if (!button) return;

                    // 创建下拉菜单
                    // 修改创建菜单的代码
                    const menu = document.createElement('div');
                    menu.className = 'view-filter-menu';

                    // 创建菜单头部（包含"全部视图"选项）
                    const menuHeader = document.createElement('div');
                    menuHeader.className = 'view-filter-header';

                    // 添加全选/全不选选项
                    menu.appendChild(menuHeader);

                    // 创建可滚动的视图列表容器
                    const menuContent = document.createElement('div');
                    menuContent.className = 'view-filter-content';

                    // 添加QQ日历选项
                    if (moduleInstances['M_calendar']?.QQCalDAVClient) {
                        const qqItem = document.createElement('div');
                        qqItem.className = 'view-filter-item';

                        // 创建复选框
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = filterViewId.includes('qqcalendar');
                        checkbox.className = 'view-filter-checkbox';

                        // 创建标签
                        const label = document.createElement('span');
                        label.textContent = 'QQ邮箱日历';
                        label.className = 'view-filter-label';

                        qqItem.appendChild(checkbox);
                        qqItem.appendChild(label);

                        qqItem.onclick = (e) => {
                            e.stopPropagation();
                            if (filterViewId.includes('qqcalendar')) {
                                filterViewId = filterViewId.filter(id => id !== 'qqcalendar');
                            } else {
                                filterViewId.push('qqcalendar');
                            }
                            checkbox.checked = filterViewId.includes('qqcalendar');

                            // 保存配置
                            moduleInstances['M_calendar'].calConfig.set("viewId", filterViewId.join(','));
                            moduleInstances['M_calendar'].calConfig.set("viewName", "多视图");
                            moduleInstances['M_calendar'].calConfig.save();
                        };

                        menuContent.appendChild(qqItem);
                    }
                    // 添加视图选项
                    viewIDs.forEach(view => {
                        const item = document.createElement('div');
                        item.className = 'view-filter-item';

                        // 创建复选框
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = filterViewId.includes(view.viewId);
                        checkbox.className = 'view-filter-checkbox';

                        // 创建标签
                        const label = document.createElement('span');
                        label.textContent = view.name;
                        label.className = 'view-filter-label';

                        item.appendChild(checkbox);
                        item.appendChild(label);

                        item.onclick = (e) => {
                            // 防止冒泡到菜单外
                            e.stopPropagation();

                            // 切换当前视图的选中状态
                            if (filterViewId.includes(view.viewId)) {
                                filterViewId = filterViewId.filter(id => id !== view.viewId);
                            } else {
                                filterViewId.push(view.viewId);
                            }

                            // 更新复选框状态
                            checkbox.checked = filterViewId.includes(view.viewId);

                            // 保存配置并刷新
                            moduleInstances['M_calendar'].calConfig.set("viewId", filterViewId.join(','));
                            moduleInstances['M_calendar'].calConfig.set("viewName", "多视图");
                            moduleInstances['M_calendar'].calConfig.save();

                            // 不关闭菜单，允许多选
                        };
                        menuContent.appendChild(item);
                    });
                    menu.appendChild(menuContent);

                    // 创建固定在底部的按钮容器
                    const menuFooter = document.createElement('div');
                    menuFooter.className = 'view-filter-footer';

                    // 添加确定按钮
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
                    menu.style.top = rect.bottom + 'px';
                    menu.style.left = rect.left + 'px';
                    document.body.appendChild(menu);

                    // 点击外部关闭菜单
                    document.addEventListener('click', function closeMenu(e) {
                        const target = e.target as Node;
                        if (!menu.contains(target) && target !== button) {
                            menu.remove();
                            document.removeEventListener('click', closeMenu);
                        }
                    });

                    // 辅助函数：更新筛选显示
                    function refreshFiltersDisplay() {
                        if (filterViewId.length === 0) {
                            viewName = '全部视图';
                        } else if (filterViewId.length === 1) {
                            const selectedView = viewIDs.find(v => v.viewId === filterViewId[0]);
                            if (selectedView) {
                                viewName = selectedView.name;
                            }
                        } else {
                            viewName = `已选择 ${filterViewId.length} 个视图`;
                        }

                        viewId = filterViewId.join(',');
                    }
                },
            },
        },
        headerToolbar: {
            left: cleft,
            center: ccenter,
            right: cright
        },

        // 从思源数据转换事件
        events: async function (info, successCallback, failureCallback) {//TODO:性能优化
            //刷新视图按钮
            // const buttons = document.querySelectorAll('.fc-viewFilter-button');
            // buttons.forEach(btn => btn.textContent = viewName);
            try {
                let allEvents = [];
                /////////////////////QQ日历////////////////////////
                try {
                    if (moduleInstances['M_calendar']?.QQCalDAVClient) {
                        const qqEvents = moduleInstances["M_calendar"].getEventsFromQQCalDAV();
                        if (qqEvents && Array.isArray(qqEvents)) {
                            // 如果有筛选视图且不是要显示所有视图，检查是否应该显示QQ日历事件
                            const showQQEvents = filterViewId.length === 0 ||
                                filterViewId.includes('qqcalendar'); // 假设'qqcalendar'是QQ日历视图的ID

                            if (showQQEvents) {
                                allEvents = allEvents.concat(qqEvents);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error fetching QQ calendar events:', error);
                    // Continue execution without QQ calendar events
                }

                /////////////////////思源////////////////////////
                // 1. 获取引用ID
                av_ids = await moduleInstances['M_calendar'].getAVreferenceid();
                const av_ids_zq = await moduleInstances['M_calendar'].getAVreferenceid("周期");
                if (!av_ids?.length) {
                    console.warn('No reference IDs found');
                    successCallback([]);
                    return;
                }

                // 2. 获取视图ID
                const viewIDs_zq = await myF.getViewId(av_ids_zq);
                const viewIDs = await myF.getViewId(av_ids);
                if (!viewIDs?.length) {
                    console.warn('No view IDs found');
                    successCallback([]);
                    return;
                }

                // 3. 获取视图数据
                viewValue_zq = await myF.getViewValue(viewIDs_zq, true);
                viewValue = await myF.getViewValue(viewIDs);
                // console.log("View data:", viewValue, "周期", viewValue_zq);

                // 3.5 增加筛选函数
                viewValue = await myF.filterViewValue(viewValue, filterViewId);

                // 4. 转换事件数据
                const events = await myF.convertToFullCalendarEvents(viewValue, viewValue_zq);
                // console.log('Fetched calendar events:', events);
                allEvents = allEvents.concat(events);
                // 5. 回调成功
                successCallback(allEvents);
            } catch (error) {
                showMessage('请重新打开日历视图', -1, 'error');
                console.error('Error fetching calendar events:', error);
                failureCallback?.(error);
                successCallback([]); // 失败时返回空数组
            }
        },

        eventDidMount: async function (info) {
            // 设置样式
            //// 设置随机背景色
            // Use event's ID or title as a unique identifier for color
            const uniqueId = info.event.id || info.event.title;
            // Create a hash of the uniqueId to get a number
            const hash = Array.from(uniqueId).reduce((acc, char) => {
                return char.charCodeAt(0) + ((acc << 5) - acc);
            }, 0);

            // Use hash as index for color and get both background and text colors
            const [backgroundColor, textColor] = getColors(Math.abs(hash));
            info.el.style.backgroundColor = backgroundColor;

            // Also apply text color to child elements
            const timeEl = info.el.querySelector('.fc-event-time');
            const titleEl = info.el.querySelector('.fc-event-title');
            if (timeEl) (timeEl as HTMLElement).style.color = textColor;
            if (titleEl) (titleEl as HTMLElement).style.color = textColor;

            if (info.event.extendedProps.isRecurring && info.event.extendedProps.source !== 'qqcalendar') {
                const isCompleted = isEventCompleted(info.event);
                // 动态更新 status 属性
                // console.log('Before update:', {...info.event.extendedProps}); // 记录更新前的属性
                info.event.setExtendedProp('status', isCompleted ? '完成' : '未完成');
                // console.log('After update:', {...info.event.extendedProps}); // 记录更新后的属性
            }
            // console.log("info.event.extendedProps", info.event.extendedProps);
            ////完成样式
            if (info.event.extendedProps.status === '完成') {
                // 应用完成状态的样式
                info.el.style.textDecoration = 'line-through';

                // 调暗背景色
                const uniqueId = info.event.id || info.event.title;
                const hash = Array.from(uniqueId).reduce((acc, char) => {
                    return char.charCodeAt(0) + ((acc << 5) - acc);
                }, 0);
                const [backgroundColor] = getColors(Math.abs(hash));

                // 将背景色转换为 RGBA 格式并降低不透明度
                info.el.style.backgroundColor = backgroundColor.replace('hsl', 'hsla').replace(')', ', 0.5)');

                // 应用其他样式
                const titleEl = info.el.querySelector('.fc-event-title');
                if (titleEl) {
                    (titleEl as HTMLElement).style.textDecoration = 'line-through';
                }

                const timeEl = info.el.querySelector('.fc-event-time');
                if (timeEl) {
                    (timeEl as HTMLElement).style.textDecoration = 'line-through';
                }

                info.el.classList.add('event-completed');
            }
            // steveTools.outlog(info);
            if (info.event.extendedProps.source === 'qqcalendar') {
                info.el.classList.add('qq-calendar-event');
                // 添加QQ日历图标
                const titleEl = info.el.querySelector('.fc-event-title');
                if (titleEl) {
                    titleEl.insertAdjacentHTML('afterbegin', '<i class="qq-calendar-icon">📅</i> ');
                }
            }
            // 添加提示框
            const isCompleted = info.el.classList.contains('event-completed');
            tippy(info.el, {
                content: `
                    <div class="event-tooltip">
                        <span class="event-tooltip__title"
                            data-type="block-ref" 
                            data-id="${info.event.extendedProps.blockId || ''}" 
                        >
                            ${info.event.title}
                        </span>
                        <div class="event-tooltip__content">
                            <p><span class="event-tooltip__label">开始:</span> ${info.event.start?.toLocaleString()}</p>
                            <p><span class="event-tooltip__label">结束:</span> ${info.event.end?.toLocaleString() || "无"}</p>
                            <p><span class="event-tooltip__label">状态:</span> ${isCompleted ? "完成" : (info.event.extendedProps.status || "未设置")}</p>
                            <p><span class="event-tooltip__label">优先级:</span> ${info.event.extendedProps.priority || "未设置"}</p>
                            ${info.event.extendedProps.description ?
                        `<p><span class="event-tooltip__label">描述:</span> ${info.event.extendedProps.description}</p>`
                        : ''
                    }
                            </div>
                        </div>
                    `,
                allowHTML: true,
                placement: 'auto',
                interactive: true,
                zIndex: window.siyuan.zIndex,
                appendTo: document.body,
                theme: 'light',
                delay: [1000, 0]
            });
        },
    });
    update_thisCalendars();
    thisCalendars.push(calendar);
    console.log("thisCalendars", thisCalendars);
    // Calendars_pro.push({Calendar:calendar,id:id});
    OUTcalendar = calendar;
    calendar.render();
    // // 手动重新获取视图数据 - 只添加一次事件监听器
    // const titleClickHandler = (e: MouseEvent) => {
    //     const target = e.target as HTMLElement;
    //     if (target.classList.contains('fc-toolbar-title')) {
    //         refreshKanban();
    //         console.log('refetchEvents：：AAA');
    //     }
    // };
    // if (ishandrefetchEvents) {
    //     document.addEventListener('click', titleClickHandler);
    //     ishandrefetchEvents = false;
    // }
    return calendar;
}

function getColors(index: number): string[] {
    const hue = index * 137.508; // use golden angle approximation // Copied from https://stackoverflow.com/a/20129594/13231742
    const rgb = hsl2rgb(hue, 0.75, 0.75);

    let textColor: string;

    if (colourIsLight(rgb[0], rgb[1], rgb[2])) {
        textColor = "black";
    } else {
        textColor = "white";
    }

    return [`hsl(${hue},75%,75%)`, textColor];
}

function hsl2rgb(h: number, s: number, l: number): number[] { // Copied from https://stackoverflow.com/a/54014428/13231742
    let a = s * Math.min(l, 1 - l);
    let f = (n: number, k = (n + h / 30) % 12) => l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return [f(0) * 255, f(8) * 255, f(4) * 255];
}

var colourIsLight = function (r: number, g: number, b: number) { // Copied from https://codepen.io/WebSeed/full/pvgqEq/

    // Counting the perceptive luminance
    // human eye favors green color... 
    var a = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return (a < 0.5);
}

// 添加一个独立的辅助函数来检查事件完成状态
export function isEventCompleted(event: any): boolean {
    const okday = event.extendedProps.okday;
    // console.log("okday",okday);
    if (!okday) return false;

    const completedDates = okday.split(',').map(d => d.trim());
    let currentDateStr = event?.start?.toISOString?.()?.split('T')?.[0];
    if (!currentDateStr && event?.range?.start) {
        currentDateStr = event.range.start.toISOString?.()?.split('T')?.[0] || '';
    }
    if (!currentDateStr) return false;
    // console.log("completedDates",completedDates);
    // console.log("currentDateStr",currentDateStr);
    return completedDates.includes(currentDateStr);
}

function validateTimeFormat(timeStr: string, defaultValue: string): string {
    // 正则表达式匹配严格的时间格式: HH:MM:SS (00:00:00 to 24:00:00)
    const timeFormatRegex = /^([01][0-9]|2[0-4]):([0-5][0-9]):([0-5][0-9])$/;

    if (!timeStr || typeof timeStr !== 'string') {
        console.warn(`无效的时间格式: "${timeStr}", 使用默认值: "${defaultValue}"`);
        return defaultValue;
    }

    // 验证时间格式
    if (!timeFormatRegex.test(timeStr)) {
        console.warn(`时间格式不符合要求 (必须为 HH:MM:SS 且小时在00-24之间): "${timeStr}", 使用默认值: "${defaultValue}"`);
        return defaultValue;
    }

    // 处理特殊情况 24:00:00
    if (timeStr === '24:00:00') {
        return timeStr;
    }

    return timeStr;
}


/**
 * 更新跟随鼠标的时间指示器
 * @param e 鼠标事件
 */
function updateTimeGhost(e: MouseEvent) {
    const timeGhost = document.getElementById('fc-time-ghost');
    if (!timeGhost) return;

    // 获取当前鼠标位置对应的时间格子
    const fcGrid = document.querySelector('.fc-timegrid-body');
    if (fcGrid) {
        const rect = fcGrid.getBoundingClientRect();
        const withinGrid =
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;

        if (withinGrid) {
            // 计算鼠标悬停位置对应的时间
            const slots = document.querySelectorAll('.fc-timegrid-slot-label');
            let hoveredTime = '未知时间';

            // 寻找最接近的时间刻度
            let closestSlot = null;
            let minDistance = Infinity;

            slots.forEach(slot => {
                const slotRect = slot.getBoundingClientRect();
                const distance = Math.abs(e.clientY - (slotRect.top + slotRect.height / 2));
                if (distance < minDistance) {
                    minDistance = distance;
                    closestSlot = slot;
                }
            });

            if (closestSlot) {
                hoveredTime = closestSlot.textContent?.trim() || '未知时间';
            }

            timeGhost.textContent = hoveredTime;
            timeGhost.style.display = 'block';
        } else {
            timeGhost.style.display = 'none';
        }
    }

    // 跟随鼠标位置
    timeGhost.style.left = (e.clientX + 10) + 'px';
    timeGhost.style.top = (e.clientY + 10) + 'px';
}
/**
 * 在事件调整大小时显示时间刻度线
 * @param info 事件调整信息
 */
function showResizeTimeIndicator(info: any) {
    const startTime = info.event.start ? formatTime(info.event.start) : '';
    const endTime = info.event.end ? formatTime(info.event.end) : '';

    // 创建或获取时间指示器元素
    let timeIndicator = document.getElementById('fc-time-indicator');
    if (!timeIndicator) {
        timeIndicator = document.createElement('div');
        timeIndicator.id = 'fc-time-indicator';
        timeIndicator.className = 'fc-time-indicator';
        document.body.appendChild(timeIndicator);

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .fc-time-indicator {
                position: fixed;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                pointer-events: none;
                z-index: 10000;
                transition: opacity 0.2s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            .fc-time-indicator::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                margin-left: -5px;
                border-width: 5px;
                border-style: solid;
                border-color: rgba(0, 0, 0, 0.8) transparent transparent transparent;
            }
        `;
        document.head.appendChild(style);
    }

    // 显示时间指示器
    timeIndicator.textContent = `${startTime} → ${endTime}`;

    // 放置在事件元素的上方
    const rect = info.el.getBoundingClientRect();
    timeIndicator.style.top = (rect.top - 30) + 'px';
    timeIndicator.style.left = (rect.left + rect.width / 2 - timeIndicator.offsetWidth / 2) + 'px';
    timeIndicator.style.opacity = '1';

    // 3秒后隐藏
    setTimeout(() => {
        timeIndicator.style.opacity = '0';
    }, 3000);
}

/**
 * 在事件拖动时显示时间刻度线
 * @param info 事件拖动信息
 */
function showDropTimeIndicator(info: any) {
    // 重用调整大小时的指示器函数
    showResizeTimeIndicator(info);
}
// 在 import 语句后添加

/**
 * 格式化时间为24小时制显示
 * @param date Date对象
 * @returns 格式化后的时间字符串 (HH:MM)
 */
function formatTime(date: Date): string {
    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}