import dayjs from 'dayjs';
import { IProtyle, showMessage, subMenu } from 'siyuan';
import { allKBEvents, handleAddButtonClick } from './kanban';
import { updateAttrViewCell_pro } from '@/api/api';
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



export function runblockdata_for_sub(content: string): { subevent: string, completed: boolean }[] {
    // 使用正则表达式全局匹配所有 [X] 或 [ ] 及后面的事件内容，考虑markdown列表格式
    const taskRegex = /^\s*\-\s*\{:[^}]*\}\s*\[(X| )\]\s*(.+?)(?=\s*\{:|$)/gm;
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
        // Check if the button already exists
        const existingButton = breadcrumb.querySelector('.quikadd-button'); // Changed selector
        if (!existingButton) {
            // Find the "more" button to insert before
            const moreButton = breadcrumb.querySelector('button[data-type="more"]');

            // Create the button element
            const button = document.createElement('button');
            button.className = 'block__icon fn__flex-center ariaLabel quikadd-button'; // Mimic class structure and add identifier
            button.setAttribute('aria-label', '一键识别日程'); // Set aria-label
            button.innerHTML = '<svg class="item__graphic"><use xlink:href="#iconCalendar"></use></svg>'; // Set SVG icon

            // Add click event listener to the button
            button.addEventListener('click', async () => {
                let ChildBlocks = await api.getChildBlocks(e.detail.protyle.block.rootID);
                const idsWithSchedule = ChildBlocks
                    .filter(block => block.content && block.content.includes('@日程'))
                    .map(block => block.id);

                console.log('包含"@日程"的块ID:', idsWithSchedule);
                if (idsWithSchedule.length === 0) {
                    showMessage('未找到包含"@日程"的块。');
                    return;
                }

                for (const blockId of idsWithSchedule) {
                    try {
                        showMessage(`正在处理块 ${blockId}`, -1, 'info', '@日程');
                        const success = await handleAddButtonClick('', { isdirect: true, directid: blockId });
                        if (success) {
                            showMessage(`成功处理块 ${blockId}`, -1, 'info', '@日程');
                        } else {
                            showMessage(`处理块 ${blockId} 未标记为成功`, 3000, 'info');
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                        console.error(`处理块 ${blockId} 时出错:`, error);
                        showMessage(`处理块 ${blockId} 时出错: ${error.message || error}`, 5000, 'error');
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                showMessage('所有包含"@日程"的块处理完毕。', 3000, 'info', '@日程');
            });

            // Insert the button before the "more" button if it exists, otherwise append to breadcrumb
            if (moreButton) {
                breadcrumb.insertBefore(button, moreButton);
            } else {
                breadcrumb.appendChild(button); // Fallback if "more" button isn't found
            }
        }
    }
}




//////////////时间解析/////////////
function mapDayCharToJsDay(dayChar: string): number {
    // ...existing code...
    switch (dayChar) {
        case '一': return 1; // Monday
        case '二': return 2; // Tuesday
        case '三': return 3; // Wednesday
        case '四': return 4; // Thursday
        case '五': return 5; // Friday
        case '六': return 6; // Saturday
        case '日': case '天': return 0; // Sunday
        default: return -1; // Invalid
    }
}

function parseDateFromString(dateMatch: RegExpMatchArray | null, initialDate: dayjs.Dayjs): dayjs.Dayjs {
    let targetDate = initialDate;
    if (!dateMatch) return targetDate;

    // Group 1: Relative keywords (今天, 明天, 下周 (general), 下月, etc.)
    if (dateMatch[1]) {
        const keyword = dateMatch[1];
        switch (keyword) {
            case '今天':
            case '本日':
                break;
            case '明天':
            case '明日':
                targetDate = targetDate.add(1, 'day');
                break;
            case '后天':
            case '大后天':
                targetDate = targetDate.add(2, 'day');
                break;
            case '昨天':
            case '昨日':
                targetDate = targetDate.subtract(1, 'day');
                break;
            case '前天':
                targetDate = targetDate.subtract(2, 'day');
                break;
            case '下周':
            case '下星期':
            case '下个星期':
                targetDate = targetDate.add(1, 'week');
                break;
            case '上周':
            case '上星期':
            case '上个星期':
                targetDate = targetDate.subtract(1, 'week');
                break;
            case '下月':
            case '下个月':
                targetDate = targetDate.add(1, 'month');
                break;
            case '上月':
            case '上个月':
                targetDate = targetDate.subtract(1, 'month');
                break;
        }
    }
    // Group 2 & 3: X月X日
    else if (dateMatch[2] && dateMatch[3]) {
        const month = parseInt(dateMatch[2]);
        const day = parseInt(dateMatch[3]);
        targetDate = targetDate.month(month - 1).date(day);
    }
    // NEW Group 4 & 5: X.Y日 (e.g., 6.15日)
    else if (dateMatch[4] && dateMatch[5]) {
        const month = parseInt(dateMatch[4]);
        const day = parseInt(dateMatch[5]);
        targetDate = targetDate.month(month - 1).date(day);
    }
    // OLD G4 -> NEW Group 6: X日
    else if (dateMatch[6]) {
        const day = parseInt(dateMatch[6]);
        targetDate = targetDate.date(day);
    }
    // OLD G5 & G6 -> NEW Group 7 & 8: (本周|下周|上周)(周|星期)?([一二三四五六日天])
    else if (dateMatch[7] && dateMatch[8]) {
        const weekPrefix = dateMatch[7]; // "本周", "下周", "上周"
        const dayChar = dateMatch[8];
        const dayOfWeekJs = mapDayCharToJsDay(dayChar);

        if (dayOfWeekJs === -1) {
            console.warn(`无法识别的星期字符: ${dayChar}`);
            return initialDate;
        }

        let tempTargetDate = initialDate;
        if (weekPrefix === '下周') {
            tempTargetDate = tempTargetDate.add(1, 'week');
        } else if (weekPrefix === '上周') {
            tempTargetDate = tempTargetDate.subtract(1, 'week');
        }
        targetDate = tempTargetDate.day(dayOfWeekJs);
    }
    // OLD G7 & G8 -> NEW Group 9 & 10: (周|星期)([一二三四五六日天])
    else if (dateMatch[9] && dateMatch[10]) {
        const dayChar = dateMatch[10];
        const dayOfWeekJs = mapDayCharToJsDay(dayChar);

        if (dayOfWeekJs === -1) {
            console.warn(`无法识别的星期字符: ${dayChar}`);
            return initialDate;
        }
        let tempDate = initialDate.day(dayOfWeekJs);
        if (tempDate.isBefore(initialDate.startOf('day'))) {
            tempDate = tempDate.add(7, 'days');
        }
        targetDate = tempDate;
    }

    // NEW Group 11,12,13: YYYYMMDD (e.g., 20250809)
    else if (dateMatch[11] && dateMatch[12] && dateMatch[13]) {
        const year = parseInt(dateMatch[11], 10);
        const month = parseInt(dateMatch[12], 10);
        const day = parseInt(dateMatch[13], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            targetDate = targetDate.year(year).month(month - 1).date(day);
        }
    }
    // NEW Group 14 & 15: M-D or M/D (e.g., 8-9, 08-09, 8/9)
    else if (dateMatch[14] && dateMatch[15]) {
        const month = parseInt(dateMatch[14], 10);
        const day = parseInt(dateMatch[15], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            targetDate = targetDate.month(month - 1).date(day);
        }
    }
    // NEW Group 16 & 17: MMDD compact (e.g., 0809)
    else if (dateMatch[16] && dateMatch[17]) {
        const month = parseInt(dateMatch[16], 10);
        const day = parseInt(dateMatch[17], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            targetDate = targetDate.month(month - 1).date(day);
        }
    }

    return targetDate;
}

/**
 * Converts Chinese numeral string (for time, 0-59) to an integer.
 * e.g., "七" -> 7, "十五" -> 15, "二十三" -> 23, "零五" -> 5
 */
function chineseToInteger(chineseNumStr: string): number {
    if (!chineseNumStr) return NaN;

    const numMap: { [key: string]: number } = {
        '零': 0, '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    };

    // Handle single characters "一" through "十" and "零"
    if (chineseNumStr.length === 1) {
        return numMap[chineseNumStr] !== undefined ? numMap[chineseNumStr] : NaN;
    }

    let val = 0;
    if (chineseNumStr.startsWith('十')) { // "十", "十一" to "十九"
        val = 10;
        if (chineseNumStr.length === 2) { // "十一" to "十九"
            const onesDigit = numMap[chineseNumStr[1]];
            if (onesDigit !== undefined && onesDigit > 0 && onesDigit < 10) {
                val += onesDigit;
            } else { return NaN; } // Invalid like "十〇" or "十十"
        } else if (chineseNumStr.length > 2) { return NaN; } // Invalid like "十二三"
        // If length is 1, it's "十", val is 10.
    } else if (chineseNumStr.endsWith('十')) { // "二十", "三十", ..., "五十" (up to "九十")
        if (chineseNumStr.length === 2) {
            const tensDigit = numMap[chineseNumStr[0]];
            if (tensDigit !== undefined && tensDigit > 0 && tensDigit < 10) {
                val = tensDigit * 10;
            } else { return NaN; } // Invalid like "〇十" or "十十"
        } else { return NaN; } // Invalid like "一百十"
    } else if (chineseNumStr.includes('十')) { // "二十一", "三十五", etc.
        const parts = chineseNumStr.split('十');
        if (parts.length === 2 && parts[0] && parts[1]) {
            const tensDigit = numMap[parts[0]];
            const onesDigit = numMap[parts[1]];
            if (tensDigit !== undefined && tensDigit > 0 && tensDigit < 10 &&
                onesDigit !== undefined && onesDigit > 0 && onesDigit < 10) {
                val = tensDigit * 10 + onesDigit;
            } else { return NaN; }
        } else { return NaN; } // Malformed
    } else if ((chineseNumStr.startsWith('零') || chineseNumStr.startsWith('〇')) && chineseNumStr.length === 2) { // "零五"
        const onesDigit = numMap[chineseNumStr[1]];
        if (onesDigit !== undefined && onesDigit > 0 && onesDigit < 10) {
            val = onesDigit;
        } else { return NaN; }
    } else {
        return NaN; // Not a recognized Chinese numeral for time
    }
    return val;
}

function parseTimeFromString(timeMatch: RegExpMatchArray | null, initialDate: dayjs.Dayjs): dayjs.Dayjs | null {
    let targetDate = initialDate;
    if (timeMatch) {
        let hours: number | undefined = undefined;
        let minutes: number | undefined = undefined;

        const period = timeMatch[1];        // Capture Group 1: (上午|下午|中午|晚上)

        // Time format: (上午|下午|中午|晚上)? (?:(\d{1,2})|([一二三四五六七八九十]+)) 点 (?:(?:(\d{1,2})|([一二三四五六七八九十零]+))分?|(半))?
        const arabicHourStr = timeMatch[2];   // Capture Group 2: Arabic hour (\d{1,2})
        const chineseHourStr = timeMatch[3];  // Capture Group 3: Chinese hour ([一二三四五六七八九十]+)
        const arabicMinuteStr = timeMatch[4]; // Capture Group 4: Arabic minute (\d{1,2})
        const chineseMinuteStr = timeMatch[5];// Capture Group 5: Chinese minute ([一二三四五六七八九十零]+)
        const halfHourMarker = timeMatch[6];  // Capture Group 6: "半"

        // Time format: HH:MM
        const digitalHourStr = timeMatch[7];  // Capture Group 7: Digital hour (\d{1,2})
        const digitalMinuteStr = timeMatch[8];// Capture Group 8: Digital minute (\d{1,2})

        if (arabicHourStr !== undefined || chineseHourStr !== undefined) { // "X点Y分" or "X点半" format
            if (arabicHourStr !== undefined) {
                hours = parseInt(arabicHourStr, 10);
            } else if (chineseHourStr !== undefined) {
                hours = chineseToInteger(chineseHourStr);
            }

            if (halfHourMarker === '半') {
                minutes = 30;
            } else if (arabicMinuteStr !== undefined) {
                minutes = parseInt(arabicMinuteStr, 10);
            } else if (chineseMinuteStr !== undefined) {
                minutes = chineseToInteger(chineseMinuteStr);
            } else {
                minutes = 0; // Default to 0 minutes if no minute part or "半" (e.g., "七点")
            }
        } else if (digitalHourStr !== undefined && digitalMinuteStr !== undefined) { // "HH:MM" format
            hours = parseInt(digitalHourStr, 10);
            minutes = parseInt(digitalMinuteStr, 10);
        }

        if (hours === undefined || Number.isNaN(hours) || minutes === undefined || Number.isNaN(minutes)) {
            console.warn(`无法解析时间中的数字或时间格式不完整: ${timeMatch[0]}`);
            return null;
        }

        // Adjust hours based on period (上午, 下午, etc.)
        if (period === '下午' || period === '晚上') {
            if (hours < 12) hours += 12;
            if (period === '晚上' && hours === 12) hours = 0; // 晚上12点 is 00:00 (midnight)
            // Note: 下午12点 is 12:00 (noon), no change needed by this block
        } else if (period === '中午') {
            // e.g., 中午1点 (parsed as 1) -> 13. 中午12点 (parsed as 12) -> 12.
            if (hours >= 1 && hours <= 4) { // Typically 中午1点 to 中午4点 implies PM
                if (hours < 12) hours += 12; // Ensure it doesn't affect 12 itself
            } else if (hours < 11 && hours !== 0) { // For other early hours if context implies it, e.g. 中午1点
                hours += 12;
            }
            // 中午12点 is 12:00. No change needed if hours is 12.
        } else if (period === '上午') {
            if (hours === 12) hours = 0; // 上午12点 (12 AM) is 00:00
        }


        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            targetDate = targetDate.hour(hours).minute(minutes).second(0).millisecond(0);
        } else {
            console.warn(`无效的时间值 (超出范围): ${hours}:${minutes} from match ${timeMatch[0]}`);
            return null;
        }

    } else { // No timeMatch found
        targetDate = targetDate.hour(8).minute(0).second(0).millisecond(0); // Default to 8 AM
    }
    return targetDate;
}

export function runblockdata_for_time(content: string): string | null {
    if (content === '') {
        return null;
    }
    const datePattern = new RegExp(
        "(今天|本日|明天|明日|后天|大后天|昨天|昨日|前天|" +
        "下周(?!(?:周|星期)?[一二三四五六日天])|" +
        "下星期(?!(?:周|星期)?[一二三四五六日天])|" +
        "下个星期(?!(?:周|星期)?[一二三四五六日天])|" +
        "上周(?!(?:周|星期)?[一二三四五六日天])|" +
        "上星期(?!(?:周|星期)?[一二三四五六日天])|" +
        "上个星期(?!(?:周|星期)?[一二三四五六日天])|" +
        "下月|下个月|上月|上个月)" +
        "|(?:(\\d{1,2})月(\\d{1,2})[号日])" +
        "|(?:(\\d{1,2})\\.(\\d{1,2})(?:[号日])?)" +
        "|(?:(\\d{1,2})[号日])" +
        "|((?:本周|下周|上周))(?:周|星期)?([一二三四五六日天])" +
        "|((?:周|星期))([一二三四五六日天])" +
        // NEW: YYYYMMDD strictly bounded with valid MM and DD
        "|\\b(\\d{4})((?:0[1-9]|1[0-2]))((?:0[1-9]|[12]\\d|3[01]))\\b" +
        // NEW: M-D or M/D with valid ranges, allow leading zero
    "|\\b((?:0?[1-9]|1[0-2]))[/\\-]((?:0?[1-9]|[12]\\d|3[01]))\\b(?!\\s*(?:点|时|小时|分|am|pm|AM|PM|:|：))" +
        // NEW: MMDD compact with valid ranges (e.g., 0809)
        "|\\b((?:0[1-9]|1[0-2]))((?:0[1-9]|[12]\\d|3[01]))\\b"
    );

    // Updated timePattern to support Chinese numerals and "半"
    // G1: period (上午,下午,中午,晚上)
    // G2: arabicHour (\d{1,2}) from "点" format
    // G3: chineseHour ([一二三四五六七八九十]+) from "点" format
    // G4: arabicMinute (\d{1,2}) from "分" format
    // G5: chineseMinute ([一二三四五六七八九十零]+) from "分" format
    // G6: halfHourMarker (半)
    // G7: digitalHour (\d{1,2}) from HH:MM format
    // G8: digitalMinute (\d{1,2}) from HH:MM format
    const timePattern = /(上午|下午|中午|晚上)?\s*(?:(\d{1,2})|([一二三四五六七八九十]+))\s*点(?:\s*(?:(?:(\d{1,2})|([一二三四五六七八九十零]+))\s*分?|(半)))?|(?<![:\d])(\d{1,2})\s*[:|：]\s*(\d{1,2})(?![:|：|\d])/g;

    const dateMatch = content.match(datePattern);

    const timeMatchesIterator = content.matchAll(timePattern);
    let lastTimeMatch: RegExpMatchArray | null = null;
    for (const match of timeMatchesIterator) {
        lastTimeMatch = match;
    }
    // 如果既没有日期匹配也没有时间匹配，返回 null
    if (!dateMatch && !lastTimeMatch) {
        return null;
    }
    let targetDate = dayjs();

    if (dateMatch) {
        targetDate = parseDateFromString(dateMatch, targetDate);
    }

    const finalDateWithTime = parseTimeFromString(lastTimeMatch, targetDate);

    if (!finalDateWithTime) {
        return null;
    }

    return finalDateWithTime.format('YYYY-MM-DDTHH:mm');
}



export async function runblockdata_for_time_ai(content: string): Promise<string | null> {
    if (content === '') {
        return null;
    }

    const apiKey = window.siyuan.config.ai.openAI.apiKey;

    if (!apiKey) {
        console.error("DeepSeek API key is not set. Please set the DEEPSEEK_API_KEY environment variable.");
        // 回退到原始解析器
        console.warn("Falling back to original parser due to missing DeepSeek API key.");
        return runblockdata_for_time(content);
    }

    const today = dayjs().format('YYYY-MM-DD');
    const prompt = `
You are an AI assistant specialized in extracting date and time information from Chinese text.
The current date is ${today}.
From the user's text, extract the specific date and time.
Interpret relative terms like "明天", "下周三", "后天下午3点".
If only a date is found, use 00:00 for the time.
If only a time is found, assume the date is the current date unless specified otherwise (e.g., "明天下午").
If a period like "下午" or "晚上" is mentioned without a specific hour, use a common representation (e.g., 下午 -> 14:00, 晚上 -> 20:00).
Your response MUST be a single line containing EITHER:
1. The extracted date and time in "YYYY-MM-DDTHH:mm" format.
2. The exact string "null" if no reliable date and time can be extracted.
Do not add any other explanations or text.

User text: "${content}"

Your response:
    `;

    try {
        const response = await fetch(`${window.siyuan.config.ai.openAI.apiBaseURL}`, { // DeepSeek API endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: `${window.siyuan.config.ai.openAI.apiModel}`, // 替换为实际的 DeepSeek 模型名称
                messages: [
                    { role: "system", content: "You are an expert at parsing dates and times from Chinese text and formatting them according to instructions." },
                    { role: "user", content: prompt }
                ],
                temperature: `${window.siyuan.config.ai.openAI.apiTemperature}`,
                max_tokens: `${window.siyuan.config.ai.openAI.apiMaxTokens}`,

            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`DeepSeek API error: ${response.status} ${response.statusText}`, errorBody);
            console.warn(`DeepSeek API error. Falling back to original parser for content: "${content}".`);
            return runblockdata_for_time(content);
        }

        const completion = await response.json();
        const aiResponse = completion.choices[0]?.message?.content?.trim();

        if (aiResponse && aiResponse.toLowerCase() !== "null") {
            const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
            if (dateTimeRegex.test(aiResponse)) {
                return aiResponse;
            } else {
                console.warn(`DeepSeek AI returned a malformed date-time: "${aiResponse}" for content: "${content}". Falling back to original parser.`);
                return runblockdata_for_time(content);
            }
        } else {
            console.log(`DeepSeek AI could not parse date/time from content: "${content}". Falling back to original parser.`);
            return runblockdata_for_time(content);
        }

    } catch (error) {
        console.error("Error calling DeepSeek API:", error);
        console.warn(`DeepSeek API call failed. Falling back to original parser for content: "${content}".`);
        return runblockdata_for_time(content);
    }
}

