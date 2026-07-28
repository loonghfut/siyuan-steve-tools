export interface TaskItemState {
    id: string;
    completed: boolean;
}

// getBlockDOMs returns SiYuan's rendered block HTML. Task state and block ID
// are both present on the NodeListItem opening tag, so parsing its full nested
// DOM tree is unnecessary for task synchronization.
const TASK_LIST_ITEM_TAG_PATTERN = /<div\b(?=[^>]*\bdata-type=(?:"NodeListItem"|'NodeListItem'))(?=[^>]*\bdata-subtype=(?:"t"|'t'))(?=[^>]*\bdata-task=(?:"([^"]*)"|'([^']*)'))(?=[^>]*\bdata-node-id=(?:"([^"]+)"|'([^']+)'))[^>]*>/gi;

/** Extracts every task list item from SiYuan block DOM HTML in document order. */
export function getTaskItemsFromBlockDOM(dom: string): TaskItemState[] {
    const taskItems: TaskItemState[] = [];
    TASK_LIST_ITEM_TAG_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = TASK_LIST_ITEM_TAG_PATTERN.exec(dom)) !== null) {
        const marker = match[1] ?? match[2];
        const id = match[3] ?? match[4];
        if (id) {
            taskItems.push({ id, completed: marker !== ' ' });
        }
    }
    return taskItems;
}
