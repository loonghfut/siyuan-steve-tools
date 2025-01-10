import { Calendar } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import multiMonthPlugin from '@fullcalendar/multimonth'
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';

import ICAL from 'ical.js';

let calendar: Calendar;

export async function run(blob: Blob, id: string) {
    const calendarEl = document.getElementById(`calendar-${id}`)!;
    calendar = new Calendar(calendarEl, {
        plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin],
        themeSystem: 'bootstrap5',
        navLinks: true,
        dayMaxEvents: true,
        locale: zhCnLocale, // 设置语言为中文
        slotDuration: '01:00:00', // 设置时间槽的间隔为1小时
        // 添加暗色主题支持
        views: {
            timeGridThreeDays: {
                type: 'timeGrid',
                duration: { days: 3 },
                buttonText: '3天'
            },
            timeGridFiveDays: {
                type: 'timeGrid',
                duration: { days: 5 },
                buttonText: '5天'
            }
        },
        bootstrapFontAwesome: {
            close: 'fa-times',
            prev: 'fa-chevron-left',
            next: 'fa-chevron-right',
            prevYear: 'fa-angle-double-left',
            nextYear: 'fa-angle-double-right'
        },
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridThreeDays,timeGridFiveDays,listMonth'
        },
        events: function (fetchInfo, successCallback, failureCallback) {
            console.log('Fetching events from ICS file');
            const reader = new FileReader();
            reader.onload = function (event) {
                const icsData = event.target?.result as string;
                const jcalData = ICAL.parse(icsData);
                const comp = new ICAL.Component(jcalData);
                const vevents = comp.getAllSubcomponents('vevent');
                const events = vevents.map((vevent, index) => {
                    const event = new ICAL.Event(vevent);
                    const [backgroundColor, textColor] = getColors(index);
                    const completed = vevent.getFirstPropertyValue('status') === 'COMPLETED'; // 假设 ICS 文件中的状态为 'COMPLETED' 表示已完成
                    return {
                        title: `${event.summary} ${completed ? '(已完成)' : ''}`, // 在标题中显示是否已完成
                        start: event.startDate.toJSDate(),
                        end: event.endDate.toJSDate(),
                        location: event.location,
                        description: `${event.description} ${completed ? '已完成' : '未完成'}`, // 在描述中显示是否已完成
                        backgroundColor,
                        textColor,
                        completed
                    };
                });
                successCallback(events);
            };
            reader.onerror = function () {
                failureCallback(new Error('Failed to read ICS file'));
            };
            reader.readAsText(blob);
            // 添加窗口resize事件处理
        },
        eventDidMount: function (info) {
            info.el.style.backgroundColor = info.event.extendedProps.backgroundColor;
            info.el.style.color = info.event.extendedProps.textColor;
            if (info.event.extendedProps.completed) {
                info.el.style.textDecoration = 'line-through'; // 已完成的事件添加删除线
            }
        }
    });

    calendar.render();
    return calendar;
};

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