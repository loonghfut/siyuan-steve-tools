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
import kanban from './kanban';
// import 'tippy.js/dist/tippy.css';
import { moduleInstances } from '@/index';
// import ICAL from 'ical.js';
// import solarLunar from 'solarlunar';
import * as myF from './myF';
import { showMessage } from 'siyuan';


let calendar: Calendar;
let clicks = 0;
let viewValue: any;
let viewValue_zq: any;




export async function run(id: string, initialView = 'dayGridMonth') {
    const calendarEl = document.getElementById(`calendar-${id}`)!;
    const calendar = new Calendar(calendarEl, {
        plugins: [
            interactionPlugin,
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            multiMonthPlugin,
            rrule,
            kanban
        ],
        initialView: initialView,
        navLinks: true,
        dayMaxEvents: true,
        locale: zhCnLocale,
        slotDuration: '01:00:00',
        editable: true,
        //看板视图


        // selectable: true,
        // eventDurationEditable: true,
        // 事件点击处理
        eventClick: function (info) {
            // // ToEventNote(info);
            // steveTools.outlog("事件点击", info);
            //TODO: 事件点击处理
        },
        select: function (info) {//TODO: 选择处理
            // console.log('select', info);
        },
        // 日期点击处理
        //// 双击触发
        dateClick: async function (info) {
            let clickTimeout: NodeJS.Timeout;
            clicks++;
            if (clicks === 1) {
                clickTimeout = setTimeout(() => {
                    clicks = 0;
                }, 500);
            } else if (clicks === 2) {
                clearTimeout(clickTimeout);
                clicks = 0;
                steveTools.outlog("创建事件", info);
                const eventId = await myF.createEventInDatabase(info.dateStr, calendar, viewValue);
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
            steveTools.outlog("事件调整大小", info.event.startStr, info.event.endStr);
            if (info.event._def.extendedProps.isRecurring) {
                showMessage("重复事件不支持修改哦");
                info.revert();
                return;
            }
            myF.updateEventInDatabase(info, calendar, viewValue);
        },

        views: {
            timeGridThreeDays: {
                type: 'timeGrid',
                duration: { days: 14 },
                buttonText: '14日'
            },
            statusBoard: {
                type: 'kanban',
                buttonText: '看板'
            }

        },

        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridThreeDays,timeGridDay,statusBoard'
        },

        // 从思源数据转换事件
        events: async function (info, successCallback, failureCallback) {
            try {
                steveTools.outlog('Fetching calendar events...::::::::::::::::::::::::::');
                // 1. 获取引用ID
                const av_ids = await moduleInstances['M_calendar'].getAVreferenceid();
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
                steveTools.outlog("View data:", viewValue);

                // 4. 转换事件数据
                const events = await myF.convertToFullCalendarEvents(viewValue, viewValue_zq);
                steveTools.outlog('Fetched calendar events:', events);
                // 5. 回调成功
                successCallback(events);
            } catch (error) {
                console.error('Error fetching calendar events:', error);
                failureCallback?.(error);
                successCallback([]); // 失败时返回空数组
            }
        },

        eventDidMount: function (info) {
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
                delay: [300, 0]
            });
        }
    });

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

