import { showMessage, openWindow, Protyle } from "siyuan";
import { KBCalendarEvent, NestedKBCalendarEvent } from "./interface";
import * as api from "@/api/api";
import { allKBEvents } from "./kanban";
import { showEvent } from "./myF";
import { settingdata } from '@/index';
//更新子级
////添加子级
export async function run_getsubevents(Fr_event: NestedKBCalendarEvent, To_event: NestedKBCalendarEvent) {
    // console.log("run_getsubevents", "F:", Fr_event, "T:", To_event);
    if (!To_event.extendedProps.subid) {
        showMessage("目标数据库未设置关联自身的列", -1, "error");
        return false;
    }
    await api.updateAttrViewCell_pro(
        To_event.publicId,
        To_event.extendedProps.rootid,
        To_event.extendedProps.subid,
        To_event.extendedProps.itemID,
        {
            blockID: Fr_event.publicId,
            content: Fr_event.title,
            oldrelation: {
                ids: To_event.extendedProps?.sub?.ids || [],
                contents: To_event.extendedProps?.sub?.contents || []
            },
            action: "add"
        },
        "relation");
    console.log("done-updateAttrViewCell_pro-add");
    return true;
}
////删除子级
export async function run_delsubevents(Fr_event: NestedKBCalendarEvent, To_event: NestedKBCalendarEvent) {
    if (!To_event.extendedProps.subid) {
        showMessage("目标数据库未设置关联自身的列", -1, "error");
        return false;
    }
    await api.updateAttrViewCell_pro(
        To_event.publicId,
        To_event.extendedProps.rootid,
        To_event.extendedProps.subid,
        To_event.extendedProps.itemID,
        {
            blockID: Fr_event.publicId,
            content: Fr_event.title,
            oldrelation: {
                ids: To_event.extendedProps?.sub?.ids || [],
                contents: To_event.extendedProps?.sub?.contents || []
            },
            action: "remove"
        },
        "relation");
    console.log("done-updateAttrViewCell_pro-remove");
    return true;
}

export async function run_changestatus(Fr_event: NestedKBCalendarEvent, newstatus) {
    if (!Fr_event.extendedProps.statusid) {
        showMessage("目标数据库未设置状态列", -1, "error");
        return false;
    }
    await api.updateAttrViewCell_pro(
        Fr_event.publicId,
        Fr_event.extendedProps.rootid,
        Fr_event.extendedProps.statusid,
        Fr_event.extendedProps.itemID,
        newstatus,
        "select");

    api.handleDidaListEvent(Fr_event.extendedProps.rootid, Fr_event.publicId, Fr_event.extendedProps.itemID);
    console.log("done-updateAttrViewCell_pro-select");
    return true;
}



export async function findEventByPublicId(
    events: NestedKBCalendarEvent[],
    targetId: string
): Promise<NestedKBCalendarEvent | null> {
    for (const event of events) {
        // 检查当前事件
        if (event.publicId === targetId) {
            return event;
        }
    }
    return null;
}


const PRIORITY_MAP = {
    '高': 3,
    '中': 2,
    '低': 1
};




export function sortEvents(events: NestedKBCalendarEvent[]): NestedKBCalendarEvent[] {
    return events.sort((a, b) => {
        // 已完成事件排在后面
        const statusA = a.extendedProps.status || '未完成';
        const statusB = b.extendedProps.status || '未完成';
        const isDoneA = statusA === '完成';
        const isDoneB = statusB === '完成';

        if (isDoneA !== isDoneB) {
            return isDoneA ? 1 : -1; // 已完成在后
        }

        // 未完成/进行中事件按时间升序
        const timeA = new Date(a.range?.end || a.range?.start || a.extendedProps.Kstart).getTime();
        const timeB = new Date(b.range?.end || b.range?.start || b.extendedProps.Kstart).getTime();
        return timeA - timeB;
    }).map(event => {
        if (event.children && event.children.length > 0) {
            event.children = sortEvents(event.children);
        }
        return event;
    });
}

export function getDaysFromNow(time: string | Date, status: string): string {
    if (status === '完成' || !time) return '';
    const targetDate = new Date(time);
    if (isNaN(targetDate.getTime())) return '';
    const now = new Date();

    const msHour = 1000 * 60 * 60;
    const msDay = msHour * 24;

    // 基于日期（去掉时分秒）计算纯天数差，避免今天晚些时候被算成还剩1天
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.floor((startOf(targetDate) - startOf(now)) / msDay);
    const diffTime = targetDate.getTime() - now.getTime();

    if (dayDiff === 0) { // 同一天内，精确到小时
        const hourDiffRaw = diffTime / msHour;
        if (hourDiffRaw > 1) {
            const hours = Math.ceil(hourDiffRaw); // 还有 x.x 小时向上取整
            return `<span style="color: orange">只有${hours}小时</span>`;
        } else if (hourDiffRaw > 0) {
            return `<span style="color: orange">不足1小时</span>`;
        } else if (hourDiffRaw > -1) { // 已经过期但不满1小时
            return `<span style="color: red">超期不足1小时</span>`;
        } else {
            const overdueHours = Math.floor(Math.abs(hourDiffRaw));
            return `<span style="color: red">超期${overdueHours}小时</span>`;
        }
    }

    if (dayDiff > 0) {
        return `<span style="color: green">还有${dayDiff}天</span>`;
    } else { // dayDiff < 0
        return `<span style="color: red">超期${Math.abs(dayDiff)}天</span>`;
    }
}

export function transformEventData_fr_filter(events: any[]): any[] {
    // console.log("transformEventData_fr_filter", events);
    return events.map(event => {
        // 从 def 中提取所需属性
        const {
            title,
            groupId,
            publicId,
            url,
            recurringDef,
            defId,
            sourceId,
            allDay,
            hasEnd,
            ui,
            extendedProps
        } = event.def;


        // Adjust range times by subtracting 8 hours
        const range = {
            start: new Date(event.range.start.getTime() - 8 * 60 * 60 * 1000),
            end: new Date(event.range.end.getTime() - 8 * 60 * 60 * 1000)
        };

        // 返回新的扁平化对象
        return {
            title,
            groupId,
            publicId,
            url,
            recurringDef,
            defId,
            sourceId,
            allDay,
            hasEnd,
            ui,
            extendedProps,
            range
        };
    });
}

export async function runclick(evt) {
    // console.log("click", evt);
    try {
        const eventId = evt.item.dataset.id;
        const eventData = await findEventByPublicId(allKBEvents, eventId);
        await showEvent(eventData.extendedProps.blockId, eventData.extendedProps.rootid);
        if (!eventData) {
            throw new Error("Event not found");
        }
        // console.log('data', eventData);
    } catch (error) {
        console.error("Error processing event click:", error);
        showMessage("处理事件点击时出错: " + error.message, -1, "error");
    }

}

export function formatDateTime(date: Date) {
    const adjustedDate = new Date(date.getTime() + 8 * 60 * 60 * 1000); // 加8个小时
    return adjustedDate.toISOString().slice(0, 16); // 格式化为 YYYY-MM-DDTHH:mm
}


let win: any = null;//TODO后面有时间再用此方式
export async function globalOpen() {
    if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
        return;
    }
    const { BrowserWindow } = require('@electron/remote');
    win = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        // titleBarStyle: 'default',
        alwaysOnTop: false, // Changed to true to enable window always on top
        skipTaskbar: false,
        // backgroundColor: '#000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webSecurity: false,
        },
        autoHideMenuBar: true,
        fullscreenable: true,
        maximizable: true,
        show: true
    });
    // Load the URL and pass required parameters
    win.loadURL(`${window.location.protocol}//${window.location.host}/stage/build/app/window.html`);

    // Inject main window's context
    win.webContents.executeJavaScript(`
        setTimeout(() => {
            window.siyuan = window.opener.siyuan;
            console.log("window.siyuan", window.siyuan);
        }, 1000);
    `);

    // 窗口关闭时清理引用
    win.on('closed', () => {
        win = null;
    });
}

export async function globalOpen2() {
    if (!settingdata["cal-create-pos"] || !settingdata["cal-db-id"]) {
        showMessage('请先设置日程创建位置和日程创建数据库');
        return;
    }
    const daynote_id = await api.createDailyNote(window.siyuan.ws.app.appId, settingdata["cal-create-pos"]);
    const idid = await api.generateSiyuanID();
    const iddata = await api.appendBlock("dom", `<div data-node-id="${idid}" data-type="NodeSuperBlock" class="sb" data-sb-layout="row"><div data-node-id="${await api.generateSiyuanID()}" data-type="NodeParagraph" class="p" updated="20250121094434"><div contenteditable="true" spellcheck="false"></div><div class="protyle-attr" contenteditable="false">​</div></div><div data-node-id="${await api.generateSiyuanID()}" data-type="NodeParagraph" class="p" updated="20250121094435"><div contenteditable="true" spellcheck="false"></div><div class="protyle-attr" contenteditable="false">​</div></div><div class="protyle-attr" contenteditable="false">​</div></div>`, daynote_id.id);
    const id = idid;
    openWindow({
        height: 500,
        width: 400,
        doc: {
            id: id as string,
        }
    });

}


// 新增过滤周期事件的函数
export function filterRecurringEvents(events: KBCalendarEvent[], 
    options = { 
        futureOccurrences: 3,  // Show 3 future occurrences by default
        pastOccurrences: 1,    // Show 1 past occurrence by default
        excludeStatuses: []     // 需要过滤掉的状态数组，例如 ['完成']
    }): KBCalendarEvent[] {
    const now = new Date();
    const processedEvents = new Set<string>();
    const filteredEvents: KBCalendarEvent[] = [];
    const recurringEventMap = new Map<string, KBCalendarEvent[]>();

    // 首先处理非周期事件 - 直接添加到结果中
    events.forEach(event => {
        if (!event.extendedProps?.isRecurring) {
            // 非周期事件直接添加，不做任何处理
            filteredEvents.push(event);
        } else {
            // 周期事件进行分类处理
            const blockId = event.extendedProps.blockId;
            if (!recurringEventMap.has(blockId)) {
                recurringEventMap.set(blockId, []);
            }
            recurringEventMap.get(blockId)!.push(event);
        }
    });

    // 处理周期事件
    recurringEventMap.forEach((events, blockId) => {
        const sortedEvents = events
            .filter(event => !options.excludeStatuses?.includes(event.extendedProps?.status))
            .sort((a, b) => a.range.start.getTime() - b.range.start.getTime());
        
        // 找到当前位置
        const currentIndex = sortedEvents.findIndex(e => e.range.start > now);
        const validCurrentIndex = currentIndex === -1 ? sortedEvents.length : currentIndex;
        
        // 在指定范围内选择事件
        const startIndex = Math.max(validCurrentIndex - options.pastOccurrences, 0);
        const endIndex = Math.min(validCurrentIndex + options.futureOccurrences, sortedEvents.length);
        
        // 添加筛选后的周期事件
        sortedEvents.slice(startIndex, endIndex).forEach(e => {
            if (!processedEvents.has(e.publicId)) {
                filteredEvents.push(e);
                processedEvents.add(e.publicId);
            }
        });
    });

    return filteredEvents;
}

export async function run_changepriority(Fr_event: NestedKBCalendarEvent, newPriority: string) {
    if (!Fr_event.extendedProps.priorityid) {
        showMessage("目标数据库未设置优先级列", -1, "error");
        return false;
    }
    await api.updateAttrViewCell_pro(
        Fr_event.publicId,
        Fr_event.extendedProps.rootid,
        Fr_event.extendedProps.priorityid,
        Fr_event.extendedProps.itemID,
        [{ content: newPriority }],
        "select"
    );
    api.handleDidaListEvent(Fr_event.extendedProps.rootid, Fr_event.publicId, Fr_event.extendedProps.itemID);
    console.log("done-updateAttrViewCell_pro-select-priority");
    return true;
}
