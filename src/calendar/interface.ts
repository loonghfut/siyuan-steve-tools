export interface ViewItem {
    viewId: string;
    name: string;
    rootid: string; // Using optional property if rootID might not always be present
    isfilters?: boolean;
}

export interface ViewValueItem {
    id: string;
    name: string;
    rootid: string;
}

export interface ISelectOption {
    color?: string;
    content: string;
}



export interface NestedKBCalendarEvent extends KBCalendarEvent {
    children?: NestedKBCalendarEvent[];
}
export interface KBCalendarEvent {
    title: string;
    publicId?: string;
    extendedProps: {
        blockId: string;
        // AttributeView 行 ID（用于属性写入，优先于 blockId）
        itemID: string;
        kramdown: string;
        status: string;
        statusid: string;
        priority: string;
        priorityid: string;
        category: string;
        categoryid: string;
        tags?: string[]; // 多标签
        rootid: string;
        description: string;
        descriptionid: string;
        allDayId?: string;
        hasCircularRef: boolean;
        sub?: {
            ids: [];
            contents: [];
        };
        subid: string;
        order: number;
        Kend: any;
        Kstart: any;
        recurringPattern: any;
        isRecurring: boolean;
        source: string;
        okday: string;
        okdayid: string;
    };
    range: {
        start: Date;
        end: Date;
    };
}

export interface ScrollState {
    top: number;
    left: number;
}