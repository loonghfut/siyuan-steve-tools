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
    publicId: string;
    extendedProps: {
        blockId: string;
        status: string;
        statusid: string;
        priority: string;
        priorityid: string;
        category: string;
        categoryid: string;
        rootid: string;
        description: string;
        descriptionid: string;
        hasCircularRef: boolean;
        sub?: {
            ids: [];
            contents: [];
        };
        subid: string;
        order: number;
        Kend: any;
        Kstart: any;
    };
}
