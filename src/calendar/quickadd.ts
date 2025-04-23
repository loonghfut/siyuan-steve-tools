import dayjs from 'dayjs';
import { IProtyle, showMessage, subMenu } from 'siyuan';
import { allKBEvents, handleAddButtonClick } from './kanban';
import { updateAttrViewCell_pro } from '@/api';
import { findEventByPublicId, run_getsubevents } from './myK';

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
    if (content === '') {
        return null;
    }
    // 支持“下午4点”“今天下午4点”等描述
    const datePattern = /(明天|后天|今天|下周|下月|(\d{1,2})月(\d{1,2})号|(\d{1,2})号)?/;
    // 支持“下午4点”“4点”“16:00”等
    const timePattern = /(上午|下午|中午|晚上)?\s*(\d{1,2})点(?:\s*(\d{1,2})分)?|(\d{1,2})[:|：](\d{1,2})/;

    const dateMatch = content.match(datePattern);
    const timeMatch = content.match(timePattern);

    if (!dateMatch) return null;

    let targetDate = dayjs();

    // 处理日期部分
    if (dateMatch[1]) {
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
    }

    // 处理时间部分
    if (timeMatch) {
        let hours = 8, minutes = 0;
        if (timeMatch[2]) {
            hours = parseInt(timeMatch[2]);
            minutes = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
            // 处理上午/下午/中午/晚上
            const period = timeMatch[1];
            if (period === '下午' || period === '晚上') {
                if (hours < 12) hours += 12;
            } else if (period === '中午') {
                if (hours < 11) hours += 12;
            }
        } else if (timeMatch[4] && timeMatch[5]) {
            hours = parseInt(timeMatch[4]);
            minutes = parseInt(timeMatch[5]);
        }
        targetDate = targetDate.hour(hours).minute(minutes);
    } else {
        // 如果没有指定时间，默认设置为当天 08:00
        targetDate = targetDate.hour(8).minute(0);
    }

    return targetDate.format('YYYY-MM-DDTHH:mm');
}

export function runblockdata_for_sub(content: string): { subevent: string, completed: boolean }[] {
    // 使用正则表达式全局匹配所有 [X] 或 [ ] 及后面的事件内容，考虑markdown列表格式
    const taskRegex = /^\s*\*\s*\{:[^}]*\}\s*\[(X| )\]\s*(.+?)(?=\s*\{:|$)/gm;
    const results: { subevent: string, completed: boolean }[] = [];
    
    let match;
    while ((match = taskRegex.exec(content)) !== null) {
        results.push({
            subevent: match[2].trim(),
            completed: match[1] === 'X'
        });
    }
    
    return results;
}












////////////////////////////////////////目前无法实现（短时间内多次添加事件，会导致事件数据丢失）////////////////////////////////////////
export function quickadd_event_more(event: CustomEvent<{//无法实现（短时间内多次添加事件，会导致事件数据丢失）
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
            await quickadd_event_more_sub(listItemsdata);
        },
    })
}

async function quickadd_event_more_main(listItemsdata: BlockTreeResult['listItems']) {
    // 检查输入参数是否有效
    if (!listItemsdata || listItemsdata.length === 0) {
        showMessage("此功能只支持列表类块")
        return;
    }
    let isok = false;
    // 遍历所有列表项
    for (const item of listItemsdata) {
        if (item.id) {
            try {
                 isok = await handleAddButtonClick("", {
                    directid: item.id,
                    isdirect: true
                });
                //延时处理
                await new Promise<void>((resolve) => {
                    setTimeout(() => {
                        resolve(void 0);
                    }, 1000);
                });
                if(isok){
                    isok=false;
                    showMessage(`成功处理列表项 ${item.id}`);
                    continue;
                }
                if (!isok) {
                    console.warn(`Failed to process item ${item.id}`);
                    continue;
                }
            } catch (error) {
                console.error(`Error processing item ${item.id}:`, error);
                continue;
            }
        }
    }
}

export async function quickadd_event_more_sub(listItemsdata: BlockTreeResult['listItems']) {
    // 检查输入是否有效
    if (!listItemsdata || listItemsdata.length === 0) {
        showMessage("没有找到列表项");
        return;
    }

    // 遍历列表项，处理每个项的子项关联
    for (const item of listItemsdata) {
        // 获取当前项的子项 IDs
        const childIds = item.BlockNodeChildren || [];

        if (childIds.length > 0) {
            // 查找父事件
            const parentEvent = await findEventByPublicId(allKBEvents, item.id);
            if (!parentEvent) {
                console.warn(`未找到父事件: ${item.id}`);
                continue;
            }

            // 对每个子项进行处理
            for (const childId of childIds) {
                // 查找子事件
                const childEvent = await findEventByPublicId(allKBEvents, childId);
                if (!childEvent) {
                    console.warn(`未找到子事件: ${childId}`);
                    continue;
                }

                // 建立关联关系
                try {
                    const result = await run_getsubevents(childEvent, parentEvent);
                    //延时处理
                    await new Promise<void>((resolve) => {
                        setTimeout(() => {
                            resolve(void 0);
                        }, 1000);
                    });
                    if (!result) {
                        console.warn(`关联失败: ${childId} -> ${item.id}`);
                    }
                } catch (error) {
                    console.error(`建立关联时出错: ${error}`);
                }
            }
        }
    }
}


