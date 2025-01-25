import { NestedKBCalendarEvent } from "./interface";
import * as api from "@/api";

export async function run_getsubevents(Fr_event: NestedKBCalendarEvent, To_event: NestedKBCalendarEvent) {
    console.log("run_getsubevents", "F:", Fr_event, "T:", To_event);
    await api.updateAttrViewCell_pro(
        To_event.publicId,
        To_event.extendedProps.rootid,
        To_event.extendedProps.subid,
        {
            blockID: Fr_event.publicId,
            content: Fr_event.title
        },
        "relation");
    console.log("done-updateAttrViewCell_pro");

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