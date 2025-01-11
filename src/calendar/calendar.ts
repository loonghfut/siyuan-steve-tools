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

let calendar: Calendar;

export async function run(blob: Blob, id: string, initialView = 'dayGridMonth') {
    const calendarEl = document.getElementById(`calendar-${id}`)!;
    calendar = new Calendar(calendarEl, {
        plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin],
        initialView: initialView,
        navLinks: true,
        dayMaxEvents: true,
        locale: zhCnLocale, // 设置语言为中文
        slotDuration: '01:00:00', // 设置时间槽的间隔为1小时
        // 添加暗色主题支持
        dayCellDidMount: function(arg) {
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
                lunarEl.setAttribute('data-navlink', '');
                lunarEl.tabIndex = 0;
                
                // 设置农历文本和标题
                let lunarText = '';
                if (!lunar.dayCn) {
                    lunarText = '数据异常';
                } else {
                    lunarText = lunar.dayCn ;
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
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay,timeGridThreeDays,timeGridFiveDays,listMonth'
        },
        events: function (fetchInfo, successCallback, failureCallback) {
            console.log('Fetching events from ICS file');
            const reader = new FileReader();
            reader.onload = function (event) {
                const icsData = event.target?.result as string;
                const jcalData = ICAL.parse(icsData);
                const comp = new ICAL.Component(jcalData);
                const vevents = comp.getAllSubcomponents('vevent');
                let allEvents: any[] = [];

                vevents.forEach((vevent, index) => {
                    const event = new ICAL.Event(vevent);
                    const [backgroundColor, textColor] = getColors(index);
                    const completed = vevent.getFirstPropertyValue('status') === 'CONFIRMED';

                    if (event.isRecurring()) {
                        // 处理重复事件
                        const expand = new ICAL.RecurExpansion({
                            component: vevent,
                            dtstart: event.startDate
                        });

                        // 设置展开范围（如：往前后各展开一年）
                        const rangeStart = ICAL.Time.now();
                        rangeStart.addDuration(new ICAL.Duration({ days: -365 }));
                        const rangeEnd = ICAL.Time.now();
                        rangeEnd.addDuration(new ICAL.Duration({ days: 365 }));

                        let next;
                        while ((next = expand.next()) && next.compare(rangeEnd) < 0) {
                            if (next.compare(rangeStart) < 0) continue;

                            const duration = event.duration;
                            const endDate = next.clone();
                            endDate.addDuration(duration);

                            allEvents.push({
                                title: `${event.summary} ${completed ? '(已完成)' : ''}`,
                                start: next.toJSDate(),
                                end: endDate.toJSDate(),
                                location: event.location,
                                description: `${event.description} ${completed ? '已完成' : ''}`,
                                backgroundColor,
                                textColor,
                                completed,
                                recurring: true
                            });
                        }
                    } else {
                        // 处理单次事件
                        allEvents.push({
                            title: `${event.summary} ${completed ? '(已完成)' : ''}`,
                            start: event.startDate.toJSDate(),
                            end: event.endDate.toJSDate(),
                            location: event.location,
                            description: `${event.description} ${completed ? '已完成' : '未完成'}`,
                            backgroundColor,
                            textColor,
                            completed,
                            recurring: false
                        });
                    }
                });

                successCallback(allEvents);
            };

            reader.onerror = function () {
                failureCallback(new Error('Failed to read ICS file'));
            };
            reader.readAsText(blob);
        },
        eventDidMount: function (info) {
            info.el.style.backgroundColor = info.event.extendedProps.backgroundColor;
            info.el.style.color = info.event.extendedProps.textColor;
            if (info.event.extendedProps.completed) {
                info.el.style.textDecoration = 'line-through'; // 已完成的事件添加删除线
            }
            tippy(info.el, {
                zIndex: 99999,
                appendTo: document.body,
                content: `
    <div class="event-tooltip">
        <h4>${info.event.title}</h4>
        <div class="event-tooltip__content">
            <p>
                <span class="event-tooltip__label">开始时间:</span> 
                ${info.event.start?.toLocaleString()}
            </p>
            <p>
                <span class="event-tooltip__label">结束时间:</span>
                ${info.event.end?.toLocaleString()}
            </p>
            ${info.event.extendedProps.description 
                ? `<p>
                    <span class="event-tooltip__label">描述:</span>
                    ${info.event.extendedProps.description}
                   </p>` 
                : ''
            }
        </div>
    </div>
                `,
                allowHTML: true,
                placement: 'top',
                interactive: true,
                theme: 'light',
                delay: [200, 0] // 显示延迟200ms，隐藏无延迟
            });
        },
        

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