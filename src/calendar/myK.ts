import { NestedKBCalendarEvent } from "./interface";

export async function getsubevents(evt) {
    console.log("getsubevents", evt);
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