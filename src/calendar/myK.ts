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
            }
        },
        "relation");
    console.log("done-updateAttrViewCell_pro");

}
////删除子级
export async function run_delsubevents(Fr_event: NestedKBCalendarEvent, To_event: NestedKBCalendarEvent) {

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