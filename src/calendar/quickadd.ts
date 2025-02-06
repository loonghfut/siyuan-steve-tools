import dayjs from 'dayjs';
import { IProtyle, showMessage, subMenu } from 'siyuan';
import { handleAddButtonClick } from './kanban';

interface BlockNode {
    id: string;
    type: string;
    children: BlockNode[];
}

interface BlockTreeResult {
    tree: BlockNode;
    paragraphs: Array<{
        id: string,
        type: string,
        BlockNodeChildren: string[]
    }>;
    listItems: Array<{
        id: string,
        type: string,
        BlockNodeChildren: string[]
    }>;
}

function extractBlockTree(element: HTMLElement): BlockTreeResult {
    const paragraphs: Array<{ id: string, type: string, BlockNodeChildren: string[] }> = [];
    const listItems: Array<{ id: string, type: string, BlockNodeChildren: string[] }> = [];

    function buildTree(element: HTMLElement): BlockNode {
        const result: BlockNode = {
            id: element.dataset.nodeId || '',
            type: element.dataset.type || '',
            children: []
        };

        // 收集指定类型的子节点ID
        const collectTypeChildIds = (node: HTMLElement, nodeType: string): string[] => {
            const ids: string[] = [];
            Array.from(node.children).forEach(child => {
                const childElement = child as HTMLElement;
                if (childElement.dataset.nodeId && childElement.dataset.type === nodeType) {
                    ids.push(childElement.dataset.nodeId);
                }
                ids.push(...collectTypeChildIds(childElement, nodeType));
            });
            return ids;
        };

        if (result.type === 'NodeParagraph') {
            paragraphs.push({
                id: result.id,
                type: result.type,
                BlockNodeChildren: collectTypeChildIds(element, 'NodeParagraph')
            });
        } else if (result.type === 'NodeListItem') {
            listItems.push({
                id: result.id,
                type: result.type,
                BlockNodeChildren: collectTypeChildIds(element, 'NodeListItem')
            });
        }

        const children = element.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i] as HTMLElement;
            if (child.dataset.nodeId) {
                result.children.push(buildTree(child));
            }
        }

        return result;
    }

    return {
        tree: buildTree(element),
        paragraphs,
        listItems
    };
}

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
    if (content === '') {
        return null;
    }
    const datePattern = /(明天|后天|今天|下周|下月|(\d{1,2})月(\d{1,2})号|(\d{1,2})号)/;
    // 时间匹配模式
    const timePattern = /(\d{1,2})点(?:(\d{1,2})分)?|(\d{1,2})[:|：](\d{1,2})/;

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
            // 处理 "X点X分" 格式
            const hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0; // 如果有分钟则解析，否则默认0
            targetDate = targetDate.hour(hours).minute(minutes);
        } else {
            // 处理 "XX:XX" 格式
            const hours = parseInt(timeMatch[3]);
            const minutes = parseInt(timeMatch[4]);
            targetDate = targetDate.hour(hours).minute(minutes);
        }
    } else {
        // 如果没有指定时间，默认设置为当天 08:00
        targetDate = targetDate.hour(8).minute(0);
    }

    return targetDate.format('YYYY-MM-DDTHH:mm');
}


export function quickadd_event_more(event: CustomEvent<{
    menu: subMenu;
    protyle: IProtyle;
    blockElements: HTMLElement[];
}>) {
    const menu = event.detail.menu;
    // console.log('quickadd_event_more', menu);
    menu.addItem({
        icon: 'iconCalendar',
        label: '添加日程pro',
        type: "submenu",
        click: async () => {
            const blockElement = event.detail.blockElements[0];
            const result = extractBlockTree(blockElement);
            // console.log('完整树结构:', result.tree);
            // console.log('段落列表:', result.paragraphs);
            console.log('列表项列表:', result.listItems);
            const listItemsdata = result.listItems;
            await quickadd_event_more_main(listItemsdata);

        },
    })
}

async function quickadd_event_more_main(listItemsdata: BlockTreeResult['listItems']) {
    // 检查输入参数是否有效
    if (!listItemsdata || listItemsdata.length === 0) {
        showMessage("此功能只支持列表类块")
        return;
    }

    // 遍历所有列表项
    for (const item of listItemsdata) {
        if (item.id) {
            // 对每个项目调用 handleAddButtonClick
            // 传入空字符串作为第一个参数，并设置 directid 和 isdirect
            await handleAddButtonClick("", {
                directid: item.id,
                isdirect: true
            });
        }
    }
}