import dayjs from 'dayjs';
import { IProtyle, showMessage, subMenu } from 'siyuan';
import { allKBEvents, handleAddButtonClick } from './kanban';
import { updateAttrViewCell_pro } from '@/api';
import { findEventByPublicId, run_getsubevents } from './myK';
import { api } from '@frostime/siyuan-plugin-kits';

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
    // console.log('runblockdata_for_time', content);
    // 支持“下午4点”“今天下午4点”等描述
    const datePattern = /(明天|后天|今天|下周|下月|(\d{1,2})月(\d{1,2})号|(\d{1,2})号)/;
    // 支持“下午4点”“4点”“16:00”等
    // 排除 HH:MM:SS, :MM:SS, 以及部分匹配如 00:32:32 中的 32:32
    // (?<![:\d]) 确保 HH:MM 前面不是冒号或数字
    // (?![:|：|\d]) 确保 HH:MM 后面不是冒号或数字
    const timePattern = /(上午|下午|中午|晚上)?\s*(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分)?|(?<![:\d])(\d{1,2})\s*[:|：]\s*(\d{1,2})(?![:|：|\d])/;

    const dateMatch = content.match(datePattern);
    const timeMatch = content.match(timePattern);
    // console.log('dateMatch', dateMatch);
    // console.log('timeMatch', timeMatch);
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
        // 注意：由于在 HH:MM 前面加了 lookbehind，捕获组的索引可能需要调整
        // 检查 timeMatch 数组的内容来确定正确的索引
        // 假设 "X点X分" 仍然是 1, 2, 3
        // 假设 "HH:MM" 现在是 4, 5 (因为 lookbehind 不计入捕获组)
        if (timeMatch[2]) { // 匹配 "X点X分" 格式
            hours = parseInt(timeMatch[2]);
            minutes = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
            const period = timeMatch[1];
            if (period === '下午' || period === '晚上') {
                if (hours < 12) hours += 12;
            } else if (period === '中午') {
                if (hours < 11) hours += 12;
                else if (hours === 12) hours = 12;
            } else if (period === '上午') {
                if (hours === 12) hours = 0;
            }
        } else if (timeMatch[4] && timeMatch[5]) { // 匹配 "HH:MM" 格式
            hours = parseInt(timeMatch[4]);
            minutes = parseInt(timeMatch[5]);
        }
        // 确保小时和分钟在有效范围内
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            targetDate = targetDate.hour(hours).minute(minutes).second(0).millisecond(0); // 清除秒和毫秒
        } else {
            console.warn(`无效的时间格式: ${timeMatch[0]}`);
            return null;
        }

    } else {
        // 如果没有指定时间，返回 null
        return null;
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

/**
 * 从内容中提取分类信息，支持 #分类名# 或 分类: 分类名
 * 返回第一个匹配的分类名字符串，未匹配返回空字符串
 */
export function runblockdata_for_category(content: string): string {
    // 匹配 #分类名#
    const hashPattern = /#([\u4e00-\u9fa5\w\-]+)#/; // Changed pattern
    const hashMatch = content.match(hashPattern);
    if (hashMatch) {
        return hashMatch[1];
    }
    // 匹配 分类: 分类名
    const colonPattern = /分类[:：]\s*([\u4e00-\u9fa5\w\-]+)/;
    const colonMatch = content.match(colonPattern);
    if (colonMatch) {
        return colonMatch[1];
    }
    return '';
}

export function runblockdata_for_note(content: string): string {
    // 匹配包含"@描述"的文本行
    const notePattern = /([^\n]+)@描述/;
    const noteMatch = content.match(notePattern);
    
    if (noteMatch && noteMatch[1]) {
        // 返回删除了"@描述"的文本内容，并去除首尾空格
        return noteMatch[1].trim();
    }
    
    return '';
}

export function runblockdata_for_title(content: string): string {
    // 匹配包含"@描述"的文本行
    const notePattern = /([^\n]+)@日程/;
    const noteMatch = content.match(notePattern);
    
    if (noteMatch && noteMatch[1]) {
        // 返回删除了"@描述"的文本内容，并去除首尾空格
        return noteMatch[1].trim();
    }
    
    return '';
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
                if (isok) {
                    isok = false;
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

export async function addquikaddButton(e) {
    const breadcrumb = e.detail.protyle.element.querySelector('.protyle-breadcrumb');
    if (breadcrumb) {
        // Check if the button container already exists
        const existingButtonContainer = breadcrumb.querySelector('.quikadd-container');
        if (!existingButtonContainer) {
            // Find the "more" button to insert before
            const moreButton = breadcrumb.querySelector('button[data-type="more"]');

            // Create a container for the icon, using a span or div instead of button
            const iconContainer = document.createElement('span'); // Use span or div as a non-button container
            iconContainer.className = 'quikadd-container'; // Add a class for identification
            // Use an <i> tag for the icon, assuming 'iconSelect' is a valid icon class
            iconContainer.innerHTML = `<div class="protyle-breadcrumb block__icon ariaLabel quikadd" aria-label="点击 <span class='ft__on-surface'>一键识别日程</span>">
    <svg><use xlink:href="#iconCalendar"></use></svg>
</div>`;

            // Find the clickable element (the div with class 'quikadd')
            const clickableIcon = iconContainer.querySelector('.quikadd');

            if (clickableIcon) {
                // Add click event listener to the icon div
                clickableIcon.addEventListener('click', async () => {
                    let ChildBlocks = await api.getChildBlocks(e.detail.protyle.block.rootID);
                    // console.log('ChildBlocks', ChildBlocks);
                    const idsWithSchedule = ChildBlocks
                        .filter(block => block.content && block.content.includes('@日程'))
                        .map(block => block.id);

                    console.log('包含"@日程"的块ID:', idsWithSchedule);
                    if (idsWithSchedule.length === 0) {
                        showMessage('未找到包含"@日程"的块。');
                        return;
                    }

                    // showMessage(`开始处理 ${idsWithSchedule.length} 个包含"@日程"的块...`);

                    for (const blockId of idsWithSchedule) {
                        try {
                            // console.log(`Processing block: ${blockId}`);
                            showMessage(`正在处理块 ${blockId}`,-1, 'info','@日程');
                            // Call handleAddButtonClick for the current block ID
                            const success = await handleAddButtonClick('', { isdirect: true, directid: blockId });
                            if (success) {
                                // showMessage(`成功处理块 ${blockId}`);
                                showMessage(`成功处理块 ${blockId}`,-1, 'info','@日程');
                            } else {
                                // Assuming handleAddButtonClick returns false or similar on non-success without throwing an error
                                showMessage(`处理块 ${blockId} 未标记为成功`, 3000, 'info');
                            }
                            // Add a delay to prevent potential issues with rapid processing, similar to quickadd_event_more_main
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            console.error(`处理块 ${blockId} 时出错:`, error);
                            showMessage(`处理块 ${blockId} 时出错: ${error.message || error}`, 5000, 'error');
                            // Optional: Add a delay even after an error before processing the next one
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }

                    showMessage('所有包含"@日程"的块处理完毕。',3000, 'info','@日程');
                });
            } else {
                console.error("Could not find the clickable icon element.");
            }

            // Insert the icon container before the "more" button if it exists, otherwise append to breadcrumb
            if (moreButton) {
                breadcrumb.insertBefore(iconContainer, moreButton);
            } else {
                breadcrumb.appendChild(iconContainer); // Fallback if "more" button isn't found
            }
        }
    }
}

