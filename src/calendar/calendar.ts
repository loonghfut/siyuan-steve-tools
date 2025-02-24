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

export let isFilter = true;
export let OUTcalendar: Calendar;
let clicks1 = 0;
let clicks2 = 0;
export let viewValue: any;
let viewValue_zq: any;
export let filterViewId: string;
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
}


export async function run(
    id: string,
    initialView = 'dayGridMonth',
    S_viewID = "",
    cleft = 'prev,next today viewFilter',
    cright = 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridThreeDays,timeGridDay,weekkanban,kanban,yearkanban',
    ccenter = 'title',
) {
    filterViewId = S_viewID || viewId;
    let calendarEl: HTMLElement;
    if (id === "") {
        // 查找包含calendar的protyle-html元素
        const protyleHtml = document.querySelector('protyle-html[data-content*="calendar"]');
        if (!protyleHtml) return;

        // 获取protyle-html元素的位置和尺寸
        const htmlRect = protyleHtml.getBoundingClientRect();
        
        // 查找最近的.protyle-content父元素
        const protyleContent = document.querySelector('.protyle-content');
        if (!protyleContent) return;

        // 清除之前可能存在的日历元素
        const existingCalendar = protyleContent.querySelector('.calendar-wrapper');
        if (existingCalendar) {
            existingCalendar.remove();
        }

        // 创建日历容器
        interface ExtendedHTMLDivElement extends HTMLDivElement {
            cleanup?: () => void;
        }
        const wrapper = document.createElement('div') as ExtendedHTMLDivElement;
        wrapper.className = 'calendar-wrapper';
        wrapper.style.cssText = `
            width: ${htmlRect.width}px;
            height: 600px;
            position: fixed;
            top: ${htmlRect.top}px;
            left: ${htmlRect.left}px;
            z-index: 0; 
            border: 1px solid var(--b3-border-color);
            border-radius: 4px;
            overflow: hidden;
            background: var(--b3-theme-background);
        `;

        // 创建观察器，监听protyle-html元素位置变化
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const rect = entry.boundingClientRect;
                wrapper.style.top = `${rect.top}px`;
                wrapper.style.left = `${rect.left}px`;
                wrapper.style.width = `${rect.width}px`;
            });
        }, {
            threshold: 1.0
        });

        observer.observe(protyleHtml);

        // 监听滚动事件
        const handleScroll = () => {
            const rect = protyleHtml.getBoundingClientRect();
            wrapper.style.top = `${rect.top}px`;
            wrapper.style.left = `${rect.left}px`;
        };
        window.addEventListener('scroll', handleScroll, true);

        const div = document.createElement('div');
        div.style.cssText = `
            width: 100%;
            height: 100%;
        `;
        div.id = 'calendar_in-';

        wrapper.appendChild(div);
        protyleContent.appendChild(wrapper);
        calendarEl = div;

        // 清理函数
        const cleanup = () => {
            observer.disconnect();
            window.removeEventListener('scroll', handleScroll, true);
        };

        // 添加清理逻辑
        wrapper.cleanup = cleanup;

    } else {
        calendarEl = document.getElementById(`calendar-${id}`)!;
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
            // listPlugin
        ],
        initialView: initialView,
        navLinks: true,
        dayMaxEvents: true,
        locale: zhCnLocale,
        slotDuration: '01:00:00',
        editable: true,
        nowIndicator: true,
        // selectable: true,
        // eventDurationEditable: true,
        // 事件点击处理
        eventClick: async function (info) {

            if (settingdata["cal-create-way"] === "1") {
                if (info.event._def.extendedProps.isRecurring) {
                    if (info.event._def.extendedProps.source === 'qqcalendar') {
                        showMessage("不支持修改哦");
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
                        showMessage("不支持修改哦");
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
            const rootid = viewIDs.find(v => v.viewId === filterViewId)?.rootid;
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
            if (info.event._def.extendedProps.isRecurring || info.event.extendedProps.source === 'qqcalendar') {
                showMessage("不支持拖动哦");
                //撤回拖动
                info.revert();
                return;
            }
            myF.updateEventInDatabase(info, calendar, viewValue);

        },
        eventResize: async function (info) {
            // console.log("事件调整大小", info.event.startStr, info.event.endStr);
            if (info.event._def.extendedProps.isRecurring || info.event.extendedProps.source === 'qqcalendar') {
                showMessage("不支持修改哦");
                info.revert();
                return;
            }
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
                text: '#',
                click: async function () {
                    // 获取按钮元素位置
                    const viewIDs = await myF.getViewId(av_ids)
                    // console.log("viewIDs", viewIDs);
                    const button = calendarEl.querySelector('.fc-viewFilter-button');//TODO:待优化的地方 
                    if (!button) return;
                    // 创建下拉菜单
                    const menu = document.createElement('div');
                    menu.className = 'view-filter-menu ';

                    // 添加视图选项
                    const views = [
                        { id: '', text: '全部视图' },
                        ...viewIDs.map(v => ({
                            id: v.viewId,
                            text: v.name
                        }))
                    ];

                    views.forEach(view => {
                        const item = document.createElement('div');
                        item.className = 'view-filter-item';
                        item.textContent = view.text;

                        item.onclick = async () => {
                            filterViewId = view.id;
                            // 更新日历数据
                            menu.remove();
                            // 更新所有按钮文本
                            // const buttons = document.querySelectorAll('.fc-viewFilter-button');
                            // buttons.forEach(btn => btn.textContent = view.text);
                            viewName = view.text;
                            viewId = view.id;
                            moduleInstances['M_calendar'].calConfig.set("viewId", viewId);
                            moduleInstances['M_calendar'].calConfig.set("viewName", viewName);
                            moduleInstances['M_calendar'].calConfig.save();
                            // 刷新日历
                            refreshKanban();

                        };
                        menu.appendChild(item);
                    });

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
                            allEvents = allEvents.concat(qqEvents);
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

            if (info.event.extendedProps.isRecurring&&info.event.extendedProps.source !== 'qqcalendar') {
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
            //修改按钮文本
            const buttons = document.querySelectorAll('.fc-viewFilter-button');
            buttons.forEach(btn => btn.textContent = viewName);
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