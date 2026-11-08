export function getCursorContainer(): Element | null {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;
    const node = selection.getRangeAt(0).startContainer;
    return node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
}

export function parseTaskList(content: string): { subevent: string; completed: boolean }[] {
    const taskRegex = /^\s*\-\s*\{:[^}]*\}\s*\[(X| )\]\s*(.+?)(?=\s*\{:|$)/gm;
    const tasks: { subevent: string; completed: boolean }[] = [];
    let match: RegExpExecArray | null;
    while ((match = taskRegex.exec(content)) !== null) {
        tasks.push({ subevent: match[2].trim(), completed: match[1] === 'X' });
    }
    return tasks;
}

export function parseTags(content: string): string[] {
    return Array.from(content.matchAll(/#([\u4e00-\u9fa5\w\-]+)#/g), match => match[1]);
}

export function parseCategory(content: string): string {
    return content.match(/#@([\u4e00-\u9fa5\w\-]+)#/)?.[1]
        ?? content.match(/分类[:：]\s*([\u4e00-\u9fa5\w\-]+)/)?.[1]
        ?? '';
}

export function parseDescription(content: string): string {
    return content.match(/([^\n]+)@描述/)?.[1]?.trim() ?? '';
}

export function parseTitle(content: string): string {
    return content.match(/([^\n]+)@日程/)?.[1]?.trim() ?? '';
}
