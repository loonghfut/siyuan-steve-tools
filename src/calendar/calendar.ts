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
import kanban, { refreshKanban, thisCalendars } from './kanban';
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
export let viewName = "全部视图";
// export const Calendars_pro:{Calendar:Calendar,id:string}[] = []; //TODO:后面优化时用



export async function run(
    id: string,
    initialView = 'dayGridMonth',
    S_viewID = "",
    cleft = 'prev,next today viewFilter',
    cright = 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridThreeDays,timeGridDay,weekkanban,kanban,yearkanban',
    ccenter = 'title',
) {
    filterViewId = S_viewID;
    const calendarEl = document.getElementById(`calendar-${id}`)!;
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
            // console.log('eventClick', info);
            if (settingdata["cal-create-way"] === "1") {
                await myF.showEvent(info.event.extendedProps.blockId, info.event.extendedProps.rootid);
                return;
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
                await myF.showEvent(info.event.extendedProps.blockId, info.event.extendedProps.rootid);
            }
        },
        select: function (info) {//TODO: 选择处理
            // console.log('select', info);
        },
        // 日期点击处理
        //// 双击触发(可选)
        dateClick: async function (info) {
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
            if (info.event._def.extendedProps.isRecurring) {
                showMessage("重复事件不支持拖动哦");
                //撤回拖动
                info.revert();
                return;
            }
            myF.updateEventInDatabase(info, calendar, viewValue);

        },
        eventResize: async function (info) {
            // console.log("事件调整大小", info.event.startStr, info.event.endStr);
            if (info.event._def.extendedProps.isRecurring) {
                showMessage("重复事件不支持修改哦");
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
                text: '',
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
        events: async function (info, successCallback, failureCallback) {
            //刷新视图按钮
            // const buttons = document.querySelectorAll('.fc-viewFilter-button');
            // buttons.forEach(btn => btn.textContent = viewName);
            try {
                steveTools.outlog('Fetching calendar events...::::::::::::::::::::::::::');
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
                // 5. 回调成功
                successCallback(events);
            } catch (error) {
                console.error('Error fetching calendar events:', error);
                failureCallback?.(error);
                successCallback([]); // 失败时返回空数组
            }
        },

        eventDidMount: function (info) {
            //修改按钮文本
            const buttons = document.querySelectorAll('.fc-viewFilter-button');
            buttons.forEach(btn => btn.textContent = viewName);
            // 设置样式
            ////完成样式

            if (info.event.extendedProps.status === '完成') {
                // 应用样式到整个事件元素
                info.el.style.textDecoration = 'line-through';

                // 找到并应用样式到标题元素
                const titleEl = info.el.querySelector('.fc-event-title');
                if (titleEl) {
                    (titleEl as HTMLElement).style.textDecoration = 'line-through';
                }

                // 找到并应用样式到时间元素
                const timeEl = info.el.querySelector('.fc-event-time');
                if (timeEl) {
                    (timeEl as HTMLElement).style.textDecoration = 'line-through';
                }
                // 添加自定义CSS类
                info.el.classList.add('event-completed');
            }


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



            // steveTools.outlog(info);

            // 添加提示框
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
                            <p><span class="event-tooltip__label">状态:</span> ${info.event.extendedProps.status || "未设置"}</p>
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
    thisCalendars.push(calendar);
    console.log("thisCalendars", thisCalendars);
    // Calendars_pro.push({Calendar:calendar,id:id});
    OUTcalendar = calendar;
    calendar.render();
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

