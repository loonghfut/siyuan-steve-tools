import { NestedKBCalendarEvent } from "./interface";
import * as api from "@/api";

//更新子级
////添加子级
export async function run_getsubevents(Fr_event: NestedKBCalendarEvent, To_event: NestedKBCalendarEvent) {
    console.log("run_getsubevents", "F:", Fr_event, "T:", To_event);
    await api.updateAttrViewCell_pro(
        To_event.publicId,
        To_event.extendedProps.rootid,
        To_event.extendedProps.subid,
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

}
////删除子级
export async function run_delsubevents(Fr_event: NestedKBCalendarEvent, To_event: NestedKBCalendarEvent) {
    await api.updateAttrViewCell_pro(
        To_event.publicId,
        To_event.extendedProps.rootid,
        To_event.extendedProps.subid,
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

}

export async function run_changestatus(Fr_event: NestedKBCalendarEvent, newstatus) {
    await api.updateAttrViewCell_pro(
        Fr_event.publicId,
        Fr_event.extendedProps.rootid,
        Fr_event.extendedProps.statusid,
        newstatus,
        "select");
    console.log("done-updateAttrViewCell_pro-select");
}



export function findEventByPublicId(
    events: NestedKBCalendarEvent[],
    targetId: string
): NestedKBCalendarEvent | null {
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
        // 先按优先级排序
        const priorityA = PRIORITY_MAP[a.extendedProps.priority] || 0;
        const priorityB = PRIORITY_MAP[b.extendedProps.priority] || 0;
        
        if (priorityA !== priorityB) {
            return priorityB - priorityA; // 高优先级在前
        }
        
        // 优先级相同则按创建时间排序
        const timeA = new Date(a.extendedProps.Kstart).getTime();
        const timeB = new Date(b.extendedProps.Kstart).getTime();
        return timeA - timeB;
    }).map(event => {
        if (event.children && event.children.length > 0) {
            event.children = sortEvents(event.children);
        }
        return event;
    });
}