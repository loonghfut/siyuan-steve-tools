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

export interface KBCalendarEvent {
    title: string;
    publicId: string;
    extendedProps: {
        blockId: string;
        status: string;
        priority: string;
        category: string;
        rootid: string;
        description: string;
        sub?: {
            contents: Array<{
                block: {
                    id: string;
                    content: string;
                }
            }>;
            ids: string[];
        };
        order: number;
    };
}