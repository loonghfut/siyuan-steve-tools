import { Calendar } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import multiMonthPlugin from '@fullcalendar/multimonth'
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import tippy from 'tippy.js';
// import 'tippy.js/dist/tippy.css';
import ICAL from 'ical.js';
import solarLunar from 'solarlunar';
import { ToEventNote } from './myF';
import { ScheduleItem } from "./myF";

let calendar: Calendar;




export async function run(scheduleData: ScheduleItem[], id: string, initialView = 'dayGridMonth') {
    const calendarEl = document.getElementById(`calendar-${id}`)!;
    const calendar = new Calendar(calendarEl, {
        plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin],
        initialView: initialView,
        navLinks: true,
        dayMaxEvents: true,
        locale: zhCnLocale,
        slotDuration: '01:00:00',
        editable: true,

        // 事件点击处理
        eventClick: function (info) {
            ToEventNote(info);
        },

        // 日期点击处理
        dateClick: async function (info) {
            // 这里可以添加创建新思源事件的逻辑
            console.log('Date clicked:', info.dateStr);
        },

        // 事件拖放处理
        eventDrop: async function (info) {
            if (!confirm('确定要移动这个事件吗?')) {
                info.revert();
                return;
            }
            // 更新思源数据库中的时间
            // TODO: 实现更新逻辑
        },

        views: {
            timeGridThreeDays: {
                type: 'timeGrid',
                duration: { days: 14 },
                buttonText: '14日'
            },
            timeGridFiveDays: {
                type: 'timeGrid',
                duration: { days: 5 },
                buttonText: '5日'
            }
        },

        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridThreeDays,timeGridFiveDays,timeGridDay'
        },

        // 从思源数据转换事件
        events: scheduleData.map(item => ({
            id: item.id,
            title: item.event,
            start: new Date(item.startTime),
            end: new Date(item.endTime),
            description: item.description,
            backgroundColor: item.status === '完成' ? '#4CAF50' : '#ff9800',
            textColor: '#ffffff',
            extendedProps: {
                status: item.status,
                blockId: item.id
            }
        })),

        eventDidMount: function (info) {
            // 设置样式
            if (info.event.extendedProps.status === '完成') {
                info.el.style.textDecoration = 'line-through';
            }

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
                            <p><span class="event-tooltip__label">结束:</span> ${info.event.end?.toLocaleString()}</p>
                            <p><span class="event-tooltip__label">状态:</span> ${info.event.extendedProps.status}</p>
                            ${info.event.extendedProps.description ?
                        `<p><span class="event-tooltip__label">描述:</span> ${info.event.extendedProps.description}</p>`
                        : ''
                    }
                        </div>
                    </div>
                `,
                allowHTML: true,
                placement: 'top',
                interactive: true,
                theme: 'light',
                delay: [200, 0]
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

