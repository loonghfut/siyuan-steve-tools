import dayjs from 'dayjs';

export function getCursorElement() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        // 获取光标所在的元素
        const cursorElement = getCursorElementRecursive(range.startContainer);
        return cursorElement;
    }
    return null;
}
function getCursorElementRecursive(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        // 如果是文本节点，返回其父元素节点
        return node.parentElement;
    } else {
        // 如果是元素节点，直接返回
        return node;
    }
}

export function runblockdata_for_time(content: string): string | null {
    // 日期匹配模式
    const datePattern = /(明天|后天|今天|下周|下月|(\d{1,2})月(\d{1,2})号|(\d{1,2})号)/;
    // 时间匹配模式
    const timePattern = /(\d{1,2})点|(\d{1,2})[:|：](\d{1,2})/;

    const dateMatch = content.match(datePattern);
    const timeMatch = content.match(timePattern);

    if (!dateMatch) return null;

    let targetDate = dayjs();

    // 处理日期部分
    switch (dateMatch[1]) {
        case '今天':
            break;
        case '明天':
            targetDate = targetDate.add(1, 'day');
            break;
        case '后天':
            targetDate = targetDate.add(2, 'day');
            break;
        case '下周':
            targetDate = targetDate.add(1, 'week');
            break;
        case '下月':
            targetDate = targetDate.add(1, 'month');
            break;
        default:
            if (dateMatch[2] && dateMatch[3]) {
                // 处理 "X月X号" 格式
                const month = parseInt(dateMatch[2]);
                const day = parseInt(dateMatch[3]);
                targetDate = targetDate.month(month - 1).date(day);
            } else if (dateMatch[4]) {
                // 处理 "X号" 格式
                const day = parseInt(dateMatch[4]);
                targetDate = targetDate.date(day);
            }
    }

    // 处理时间部分
    if (timeMatch) {
        if (timeMatch[1]) {
            // 处理 "X点" 格式
            targetDate = targetDate.hour(parseInt(timeMatch[1])).minute(0);
        } else if (timeMatch[2] && timeMatch[3]) {
            // 处理 "XX:XX" 格式
            targetDate = targetDate.hour(parseInt(timeMatch[2])).minute(parseInt(timeMatch[3]));
        }
    } else {
        // 如果没有指定时间，默认设置为当天 00:00
        targetDate = targetDate.hour(0).minute(0);
    }

    return targetDate.format('YYYY-MM-DDTHH:mm');
}