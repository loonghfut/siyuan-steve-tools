import { Calendar } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';

import listPlugin from '@fullcalendar/list';
import multiMonthPlugin from '@fullcalendar/multimonth'
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';

import ICAL from 'ical.js';
// import 'bootstrap/dist/css/bootstrap.css';
// import 'bootstrap-icons/font/bootstrap-icons.css'; // webpack uses file-loader to handle font files
// import './index.css';


let calendar: Calendar;
let fileList: HTMLElement;





// function enableSpinner() {
//     if (spinner.classList.contains('show')) return;
//     spinner.classList.add('show');
// }

// function disableSpinner() {
//     if (spinner.classList.contains('show')) {
//         spinner.classList.remove('show');
//     }
// }

// function showLoadingError() {
//     if (errorElement.classList.contains('show')) return;
//     errorElement.classList.add('show');
// }

// function hideLoadingError() {
//     if (errorElement.classList.contains('show')) errorElement.classList.remove('show');
// }

function addFile(fileName: string, backgroundColor: string, textColor: string) {
    fileList.insertAdjacentHTML('beforeend', `<div class="rounded" style="background-color: ${backgroundColor}; color: ${textColor};">${fileName}</div>`);
}

function clearListElements() {
    while (fileList.hasChildNodes()) {
        fileList.removeChild(fileList.firstChild!);
    }
}

 export async function run(blob: Blob) {
    const calendarEl = document.getElementById('calendar')!;
    calendar = new Calendar(calendarEl, {
        plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin],
        themeSystem: 'bootstrap5',
        navLinks: true,
        dayMaxEvents: true,
        height: 'parent', // 使日历高度适应父元素
        locale: zhCnLocale, // 设置语言为中文
        // 添加暗色主题支持
        // 添加暗色主题支持
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
            right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay,listMonth'
        },
        events: function(fetchInfo, successCallback, failureCallback) {
            console.log('Fetching events from ICS file');
            const reader = new FileReader();
            reader.onload = function(event) {
                const icsData = event.target?.result as string;
                const jcalData = ICAL.parse(icsData);
                const comp = new ICAL.Component(jcalData);
                const vevents = comp.getAllSubcomponents('vevent');
                const events = vevents.map(vevent => {
                    const event = new ICAL.Event(vevent);
                    return {
                        title: event.summary,
                        start: event.startDate.toJSDate(),
                        end: event.endDate.toJSDate(),
                        location: event.location,
                        description: event.description,
                    };
                });
                successCallback(events);
            };
            reader.onerror = function() {
                failureCallback(new Error('Failed to read ICS file'));
            };
            reader.readAsText(blob); 
        }
    });

    calendar.render();
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