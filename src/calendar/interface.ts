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

