export interface ViewItem {
    viewId: string;
    name: string;
    rootid: string; // Using optional property if rootID might not always be present
    /** 数据库块 ID（type='av'）；思源 3.8 起用于解析当前视图与块级上下文筛选。 */
    blockId?: string;
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
