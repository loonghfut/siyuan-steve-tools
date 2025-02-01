import { showMessage } from "siyuan";
import { NestedKBCalendarEvent } from "./interface";
import * as api from "@/api";
import { allKBEvents } from "./kanban";
import { showEvent } from "./myF";
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
        newstatus,
        "select");
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


export function getDaysFromNow(time: string | Date, status: string): string {
    if (status === '完成') {
        return '';
    }
    const targetDate = new Date(time);
    const now = new Date();
    const diffTime = targetDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
        return `<span style="color: green">还有${diffDays}天</span>`;
    } else if (diffDays < 0) {
        return `<span style="color: red">超期${Math.abs(diffDays)}天</span>`;
    } else {
        return '<span style="color: orange">今天</span>';
    }
}

export function transformEventData_fr_filter(events: any[]): any[] {
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
            extendedProps
        };
    });
}

export async function runclick(evt) {
    // console.log("click", evt);
    try {
        const eventId = evt.item.dataset.id;
        const eventData = await findEventByPublicId(allKBEvents, eventId);
        showEvent(eventData.extendedProps.blockId, eventData.extendedProps.rootid);
        if (!eventData) {
            throw new Error("Event not found");
        }
        console.log('data', eventData);
    } catch (error) {
        console.error("Error processing event click:", error);
        showMessage("处理事件点击时出错: " + error.message, -1, "error");
    }

}